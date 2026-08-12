import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canTransition, type AuthPrincipal, type LeadStatus } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

interface LeadFilter {
  status?: string;
  source?: string;
  orgUnitId?: string;
}

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  async findAll(filter: LeadFilter, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    return this.prisma.lead.findMany({
      where: {
        status: filter.status,
        source: filter.source,
        orgUnitId: ids === null ? filter.orgUnitId : { in: ids },
      },
      include: { customer: { select: { id: true, name: true, phonePrimary: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`리드를 찾을 수 없습니다: ${id}`);
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(lead.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 리드만 조회할 수 있습니다.');
    }
    return lead;
  }

  /** 케이스 뷰: 한 접수의 전체 여정(고객 + 견적·계약·결제·작업 문서흐름 + CS·AS 이력)을 한 번에. */
  async caseView(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal); // 존재 + 조직 스코프 검증
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phonePrimary: true } },
        orgUnit: { select: { id: true, name: true } },
        ownerEmp: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true } },
        estimates: {
          select: {
            id: true,
            estimateNo: true,
            status: true,
            totalCbm: true,
            totalAmount: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        contracts: {
          select: {
            id: true,
            contractNo: true,
            status: true,
            totalAmount: true,
            signedAt: true,
            createdAt: true,
            payments: {
              select: { id: true, kind: true, amount: true, status: true, paidAt: true },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        workOrders: {
          select: { id: true, workNo: true, status: true, scheduledDate: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // CS·AS 이력은 고객 기준(접수에 직접 FK 없음)
    const supportTickets = lead?.customerId
      ? await this.prisma.supportTicket.findMany({
          where: { customerId: lead.customerId },
          select: {
            id: true,
            kind: true,
            subject: true,
            status: true,
            priority: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [];
    return { ...lead, supportTickets };
  }

  async create(dto: CreateLeadDto, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(dto.orgUnitId)) {
      throw new ForbiddenException('소속 조직으로만 접수할 수 있습니다.');
    }
    // 신규 접수: 고객명 입력 시 고객 자동 생성·연결(드롭다운 선택은 customerId)
    let customerId = dto.customerId;
    if (!customerId && dto.customerName?.trim()) {
      const customer = await this.prisma.customer.create({
        data: {
          name: dto.customerName.trim(),
          phonePrimary: dto.customerPhone,
          ownerOrgId: dto.orgUnitId,
        },
      });
      customerId = customer.id;
    }
    const data = {
      leadNo: this.genLeadNo(),
      orgUnitId: dto.orgUnitId,
      customerId,
      ownerEmpId: dto.ownerEmpId,
      partnerId: dto.partnerId,
      source: dto.source,
      serviceLine: dto.serviceLine,
      fromZipcode: dto.fromZipcode,
      fromAddr: dto.fromAddr,
      fromAddrDetail: dto.fromAddrDetail,
      fromSido: dto.fromSido,
      fromSigungu: dto.fromSigungu,
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toZipcode: dto.toZipcode,
      toAddr: dto.toAddr,
      toAddrDetail: dto.toAddrDetail,
      toSido: dto.toSido,
      toSigungu: dto.toSigungu,
      toLat: dto.toLat,
      toLng: dto.toLng,
      moveDate: dto.moveDate ? new Date(dto.moveDate) : undefined,
      visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
    };
    try {
      const created = await this.prisma.lead.create({ data });
      await this.eventBus.record({
        aggregateType: 'lead',
        aggregateId: created.id,
        eventType: 'lead.created',
        payload: { leadNo: created.leadNo, source: created.source, orgUnitId: created.orgUnitId },
      });
      return created;
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateLeadDto, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    try {
      return await this.prisma.lead.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          ownerEmpId: dto.ownerEmpId,
          partnerId: dto.partnerId,
          source: dto.source,
          serviceLine: dto.serviceLine,
          // 주소는 생성 때와 동일하게 구조적 필드(상세·시도/시군구·좌표)까지 함께 갱신
          fromZipcode: dto.fromZipcode,
          fromAddr: dto.fromAddr,
          fromAddrDetail: dto.fromAddrDetail,
          fromSido: dto.fromSido,
          fromSigungu: dto.fromSigungu,
          fromLat: dto.fromLat,
          fromLng: dto.fromLng,
          toZipcode: dto.toZipcode,
          toAddr: dto.toAddr,
          toAddrDetail: dto.toAddrDetail,
          toSido: dto.toSido,
          toSigungu: dto.toSigungu,
          toLat: dto.toLat,
          toLng: dto.toLng,
          moveDate: dto.moveDate ? new Date(dto.moveDate) : undefined,
          visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /** 상태 전이(상태머신). 다른 모듈(계약·작업)에서도 호출. */
  async transitionTo(id: string, to: LeadStatus, principal?: AuthPrincipal) {
    const lead = await this.findOne(id, principal);
    const result = await this.transitionInTx(this.prisma, id, to);
    await this.emitTransition(result, to);
    return result.changed ? result.lead : lead;
  }

  /**
   * 트랜잭션 안에서의 상태 전이 — 문서(견적확정·계약·작업오더) 생성과 원자적으로 묶기 위해
   * tx 클라이언트를 받는다. 전이가 막히면 예외로 문서 쓰기까지 함께 롤백된다.
   * 조직 스코프는 호출한 문서 쪽에서 이미 검증된 것으로 본다(같은 조직의 리드).
   * 이벤트 기록은 커밋 후 emitTransition()으로 따로 한다.
   */
  async transitionInTx(tx: Prisma.TransactionClient, id: string, to: LeadStatus) {
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`리드를 찾을 수 없습니다: ${id}`);
    const from = lead.status as LeadStatus;
    if (from === to) return { lead, from, changed: false };
    if (!canTransition(from, to)) {
      throw new BadRequestException(`허용되지 않은 상태 전이: ${from} → ${to}`);
    }
    const updated = await tx.lead.update({ where: { id }, data: { status: to } });
    return { lead: updated, from, changed: true };
  }

  /** transitionInTx 커밋 후 상태변경 이벤트 기록(전이가 실제로 일어났을 때만). */
  async emitTransition(
    result: { lead: { id: string; leadNo: string }; from: LeadStatus; changed: boolean },
    to: LeadStatus,
  ) {
    if (!result.changed) return;
    await this.eventBus.record({
      aggregateType: 'lead',
      aggregateId: result.lead.id,
      eventType: 'lead.status_changed',
      payload: { from: result.from, to, leadNo: result.lead.leadNo },
    });
  }

  async remove(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    return this.prisma.lead.delete({ where: { id } });
  }

  private genLeadNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `R${ymd}${rand}`;
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException('접수번호 충돌 — 다시 시도하세요.');
      if (e.code === 'P2003')
        return new BadRequestException('참조 대상(조직/고객/직원/거래처)이 존재하지 않습니다.');
    }
    return e as Error;
  }
}
