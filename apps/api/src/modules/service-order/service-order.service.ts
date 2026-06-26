import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal, ServiceOrderStatus } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';

// 상태 전이: 요청→일정확정→완료, 종료 전 어디서든 취소.
const TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  REQUESTED: ['SCHEDULED', 'CANCELED'],
  SCHEDULED: ['DONE', 'CANCELED'],
  DONE: [],
  CANCELED: [],
};

@Injectable()
export class ServiceOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  async findAll(serviceLine?: string, status?: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    return this.prisma.serviceOrder.findMany({
      where: {
        ...(serviceLine ? { serviceLine } : {}),
        ...(status ? { status } : {}),
        ...(ids === null ? {} : { orgUnitId: { in: ids } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const order = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`서비스 주문을 찾을 수 없습니다: ${id}`);
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(order.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 서비스 주문만 조회할 수 있습니다.');
    }
    return order;
  }

  async create(dto: CreateServiceOrderDto, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(dto.orgUnitId)) {
      throw new ForbiddenException('소속 조직으로만 등록할 수 있습니다.');
    }
    const created = await this.prisma.serviceOrder.create({
      data: {
        orderNo: this.genNo(),
        serviceLine: dto.serviceLine,
        orgUnitId: dto.orgUnitId,
        productId: dto.productId,
        customerId: dto.customerId,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        address: dto.address,
        amount: dto.amount,
        note: dto.note,
        assignedEmpId: dto.assignedEmpId,
      },
    });
    await this.eventBus.record({
      aggregateType: 'service_order',
      aggregateId: created.id,
      eventType: 'service_order.created',
      payload: { serviceLine: created.serviceLine },
    });
    return created;
  }

  async update(id: string, dto: UpdateServiceOrderDto, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    return this.prisma.serviceOrder.update({
      where: { id },
      data: {
        ...dto,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
      },
    });
  }

  /** 상태 전이(요청→일정확정→완료/취소). */
  async transition(id: string, to: ServiceOrderStatus, principal?: AuthPrincipal) {
    const order = await this.findOne(id, principal);
    const from = order.status as ServiceOrderStatus;
    if (!TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`전이 불가: ${from} → ${to}`);
    }
    const updated = await this.prisma.serviceOrder.update({ where: { id }, data: { status: to } });
    await this.eventBus.record({
      aggregateType: 'service_order',
      aggregateId: id,
      eventType: `service_order.${to.toLowerCase()}`,
      payload: { from, to },
    });
    return updated;
  }

  private genNo(): string {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `SV${ymd}${rand}`;
  }
}
