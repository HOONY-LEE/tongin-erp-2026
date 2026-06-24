import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { LeadService } from '../lead/lead.service';
import { CreateAssignmentDto, CreateWorkOrderDto } from './dto/work-order.dto';

@Injectable()
export class WorkOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly leadService: LeadService,
  ) {}

  findAll(status?: string) {
    return this.prisma.workOrder.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      include: { assignments: true },
    });
    if (!wo) throw new NotFoundException(`작업오더를 찾을 수 없습니다: ${id}`);
    return wo;
  }

  /** 작업토스: 계약(SIGNED)→작업오더 전환 + 리드 CONTRACTED→WORK_TOSS */
  async create(dto: CreateWorkOrderDto) {
    const contract = await this.prisma.contract.findUnique({ where: { id: dto.contractId } });
    if (!contract) throw new BadRequestException('존재하지 않는 계약입니다.');
    if (contract.status !== 'SIGNED')
      throw new BadRequestException('서명완료(SIGNED)된 계약만 작업토스 가능합니다.');
    const dup = await this.prisma.workOrder.findUnique({ where: { contractId: dto.contractId } });
    if (dup) throw new BadRequestException('이미 작업오더가 생성된 계약입니다.');

    const created = await this.prisma.workOrder.create({
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
    await this.leadService.transitionTo(contract.leadId, 'WORK_TOSS');
    await this.eventBus.record({
      aggregateType: 'work_order',
      aggregateId: created.id,
      eventType: 'work_order.created',
      payload: { workNo: created.workNo, contractId: contract.id },
    });
    return created;
  }

  async addAssignment(workOrderId: string, dto: CreateAssignmentDto) {
    await this.findOne(workOrderId);
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
  async start(id: string) {
    const wo = await this.findOne(id);
    if (wo.status !== 'ASSIGNED') throw new BadRequestException(`시작 불가 상태: ${wo.status}`);
    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });
    await this.leadService.transitionTo(wo.leadId, 'IN_PROGRESS');
    await this.emit(id, 'work_order.started', wo.workNo);
    return updated;
  }

  /** 작업 완료 → DONE + 리드 DONE (잔금은 contract payment kind=BALANCE로 처리) */
  async complete(id: string) {
    const wo = await this.findOne(id);
    if (wo.status !== 'IN_PROGRESS') throw new BadRequestException(`완료 불가 상태: ${wo.status}`);
    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: { status: 'DONE' },
    });
    await this.leadService.transitionTo(wo.leadId, 'DONE');
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
