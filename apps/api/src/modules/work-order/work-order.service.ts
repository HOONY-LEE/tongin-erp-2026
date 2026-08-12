import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { LeadService } from '../lead/lead.service';
import { CreateAssignmentDto, CreateWorkOrderDto } from './dto/work-order.dto';

@Injectable()
export class WorkOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
    private readonly leadService: LeadService,
  ) {}

  /**
   * 조회 가능한 조직 id. 전속업체 사용자는 조직이 아니라 partnerId로 제한되므로 스코프를 적용하지 않는다.
   * null = 제한 없음.
   */
  private async orgIds(principal?: AuthPrincipal): Promise<string[] | null> {
    if (principal?.partnerId) return null;
    return this.scope.orgScopeIds(principal);
  }

  /** 전속업체 사용자(principal.partnerId)는 본인 소속 작업오더만 + 원가(billedCost) 마스킹 (OPS-04). */
  async findAll(status?: string, principal?: AuthPrincipal) {
    const ids = await this.orgIds(principal);
    const rows = await this.prisma.workOrder.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(principal?.partnerId ? { partnerId: principal.partnerId } : {}),
        ...(ids === null ? {} : { orgUnitId: { in: ids } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    if (principal?.partnerId) rows.forEach((r) => this.maskCost(r));
    return rows;
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      include: { assignments: true },
    });
    if (!wo) throw new NotFoundException(`작업오더를 찾을 수 없습니다: ${id}`);
    if (principal?.partnerId && wo.partnerId !== principal.partnerId) {
      throw new ForbiddenException('해당 작업오더에 접근 권한이 없습니다.');
    }
    const ids = await this.orgIds(principal);
    if (ids !== null && !ids.includes(wo.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 작업오더만 조회할 수 있습니다.');
    }
    if (principal?.partnerId) this.maskCost(wo);
    return wo;
  }

  /** 외부 전속업체엔 원가/정산금액(billedCost) 노출 금지 (설계노트: 단가·정산금액 마스킹). */
  private maskCost(wo: { billedCost: unknown }) {
    wo.billedCost = null;
  }

  /** 작업토스: 계약(SIGNED)→작업오더 전환 + 리드 CONTRACTED→WORK_TOSS */
  async create(dto: CreateWorkOrderDto, principal?: AuthPrincipal) {
    const contract = await this.prisma.contract.findUnique({ where: { id: dto.contractId } });
    if (!contract) throw new BadRequestException('존재하지 않는 계약입니다.');
    const ids = await this.orgIds(principal);
    if (ids !== null && !ids.includes(contract.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 계약만 작업토스할 수 있습니다.');
    }
    if (contract.status !== 'SIGNED')
      throw new BadRequestException('서명완료(SIGNED)된 계약만 작업토스 가능합니다.');
    const dup = await this.prisma.workOrder.findUnique({ where: { contractId: dto.contractId } });
    if (dup) throw new BadRequestException('이미 작업오더가 생성된 계약입니다.');

    // 작업오더 생성과 리드 전이는 한 트랜잭션 — 전이가 막히면 작업오더만 남는 일이 없도록
    const { created, transition } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.workOrder.create({
        data: {
          workNo: this.genNo(),
          contractId: contract.id,
          leadId: contract.leadId,
          orgUnitId: contract.orgUnitId,
          partnerId: dto.partnerId,
          scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
          billedCost: dto.billedCost,
        },
      });
      const t = await this.leadService.transitionInTx(tx, contract.leadId, 'WORK_TOSS');
      return { created: row, transition: t };
    });
    await this.leadService.emitTransition(transition, 'WORK_TOSS');
    await this.eventBus.record({
      aggregateType: 'work_order',
      aggregateId: created.id,
      eventType: 'work_order.created',
      payload: { workNo: created.workNo, contractId: contract.id },
    });
    return created;
  }

  async addAssignment(workOrderId: string, dto: CreateAssignmentDto, principal?: AuthPrincipal) {
    await this.findOne(workOrderId, principal);
    return this.prisma.workAssignment.create({
      data: {
        workOrderId,
        employeeId: dto.employeeId,
        resourceType: dto.resourceType,
        resourceRef: dto.resourceRef,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  /** 작업 시작 → IN_PROGRESS + 리드 전이 */
  async start(id: string, principal?: AuthPrincipal) {
    const wo = await this.findOne(id, principal);
    if (wo.status !== 'ASSIGNED') throw new BadRequestException(`시작 불가 상태: ${wo.status}`);
    const { updated, transition } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.workOrder.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
      const t = await this.leadService.transitionInTx(tx, wo.leadId, 'IN_PROGRESS');
      return { updated: row, transition: t };
    });
    await this.leadService.emitTransition(transition, 'IN_PROGRESS');
    await this.emit(id, 'work_order.started', wo.workNo);
    return updated;
  }

  /** 작업 완료 → DONE + 리드 DONE (잔금은 contract payment kind=BALANCE로 처리) */
  async complete(id: string, principal?: AuthPrincipal) {
    const wo = await this.findOne(id, principal);
    if (wo.status !== 'IN_PROGRESS') throw new BadRequestException(`완료 불가 상태: ${wo.status}`);
    const { updated, transition } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.workOrder.update({ where: { id }, data: { status: 'DONE' } });
      const t = await this.leadService.transitionInTx(tx, wo.leadId, 'DONE');
      return { updated: row, transition: t };
    });
    await this.leadService.emitTransition(transition, 'DONE');
    await this.emit(id, 'work_order.completed', wo.workNo);
    return updated;
  }

  private emit(id: string, eventType: string, workNo: string) {
    return this.eventBus.record({
      aggregateType: 'work_order',
      aggregateId: id,
      eventType,
      payload: { workNo },
    });
  }

  private genNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `WO${ymd}${rand}`;
  }
}
