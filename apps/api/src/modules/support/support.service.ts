import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal, SupportTicketStatus } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateTicketDto, UpdateTicketDto } from './dto/support.dto';

// 접수→처리중→해결→종료, 종료 전 어디서든 취소.
const TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  RECEIVED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['RESOLVED', 'CANCELED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELED: [],
};

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  async findAll(kind?: string, status?: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    return this.prisma.supportTicket.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        ...(ids === null ? {} : { orgUnitId: { in: ids } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException(`접수건을 찾을 수 없습니다: ${id}`);
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(ticket.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 접수건만 조회할 수 있습니다.');
    }
    return ticket;
  }

  async create(dto: CreateTicketDto, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(dto.orgUnitId)) {
      throw new ForbiddenException('소속 조직으로만 접수할 수 있습니다.');
    }
    const created = await this.prisma.supportTicket.create({
      data: { ticketNo: this.genNo(dto.kind), ...dto },
    });
    await this.eventBus.record({
      aggregateType: 'support_ticket',
      aggregateId: created.id,
      eventType: 'support.created',
      payload: { kind: created.kind },
    });
    return created;
  }

  async update(id: string, dto: UpdateTicketDto, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    return this.prisma.supportTicket.update({ where: { id }, data: dto });
  }

  async transition(id: string, to: SupportTicketStatus, principal?: AuthPrincipal) {
    const ticket = await this.findOne(id, principal);
    const from = ticket.status as SupportTicketStatus;
    if (!TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`전이 불가: ${from} → ${to}`);
    }
    const updated = await this.prisma.supportTicket.update({ where: { id }, data: { status: to } });
    await this.eventBus.record({
      aggregateType: 'support_ticket',
      aggregateId: id,
      eventType: `support.${to.toLowerCase()}`,
      payload: { from, to },
    });
    return updated;
  }

  private genNo(kind: string): string {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `${kind}${ymd}${rand}`;
  }
}
