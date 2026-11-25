import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal, SupportTicketStatus } from '@tongin/shared';
import { DocNoService } from '../../prisma/doc-no.service';
import { LIST_LIMIT, listWhere, searchWhere, type ListFilterRules } from '../../common/list-filter';
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

/** 고객A/S 목록 필터(화면 FilterButton key → 칸) */
const LIST_RULES: ListFilterRules = {
  createdAt: { date: { createdAt: ['createdAt', 'ts'] } },
  kind: { in: 'kind' },
  category: { in: 'category' },
  status: { in: 'status' },
  priority: { in: 'priority' },
  channel: { in: 'channel' },
};
/** 접수 유형 공통 코드 묶음 */
export const AS_CATEGORY = 'AS_CATEGORY';

const LIST_INCLUDE = {
  customer: {
    select: { id: true, name: true, phonePrimary: true, ownerOrg: { select: { name: true } } },
  },
  lead: {
    select: { id: true, leadNo: true, orgUnitId: true, orgUnit: { select: { name: true } } },
  },
} satisfies Prisma.SupportTicketInclude;
type TicketRow = Prisma.SupportTicketGetPayload<{ include: typeof LIST_INCLUDE }>;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNo: DocNoService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  /** 데이터 범위 — 옛 건은 담당 지점, 새 건은 관련 접수(견적건)·고객의 지점 */
  private scopeWhere(ids: string[] | null): Prisma.SupportTicketWhereInput {
    if (ids === null) return {};
    return {
      OR: [
        { orgUnitId: { in: ids } },
        { lead: { orgUnitId: { in: ids } } },
        { leadId: null, customer: { ownerOrgId: { in: ids } } },
      ],
    };
  }

  /** 화면에 보낼 모양 — 고객 이름·전화, 관련 접수 번호, 담당 지점(접수 → 고객 → 옛 지점) */
  private view(t: TicketRow) {
    const { customer, lead, ...rest } = t;
    return {
      ...rest,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phonePrimary ?? null,
      leadNo: lead?.leadNo ?? null,
      orgName: lead?.orgUnit?.name ?? customer?.ownerOrg?.name ?? null,
    };
  }

  /** 접수 유형 — 순서대로(안 쓰는 것도 — 옛 접수의 유형 이름을 보여 주려고. 고르기는 active만) */
  categories() {
    return this.prisma.commonCode.findMany({
      where: { codeGroup: AS_CATEGORY },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { code: true, name: true, isActive: true },
    });
  }

  /** 접수 유형 관리 목록(숨긴 것 포함) */
  manageCategories() {
    return this.prisma.commonCode.findMany({
      where: { codeGroup: AS_CATEGORY },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
    });
  }

  async createCategory(dto: { name: string }) {
    const last = await this.prisma.commonCode.aggregate({
      where: { codeGroup: AS_CATEGORY },
      _max: { sortOrder: true },
    });
    return this.prisma.commonCode.create({
      data: {
        codeGroup: AS_CATEGORY,
        // 코드는 안 보이는 값 — 겹치지 않게 시각으로
        code: `C${Date.now().toString(36).toUpperCase()}`,
        name: dto.name.trim(),
        sortOrder: (last._max.sortOrder ?? 0) + 1,
        isActive: true,
      },
      select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
    });
  }

  async updateCategory(id: string, dto: { name?: string; sortOrder?: number; isActive?: boolean }) {
    const found = await this.prisma.commonCode.findFirst({
      where: { id, codeGroup: AS_CATEGORY },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('접수 유형을 찾을 수 없습니다.');
    return this.prisma.commonCode.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
    });
  }

  /** 고객의 접수(견적건) — A/S 접수 창에서 관련 접수로 고른다(최근 순, 취소 건 빼고) */
  async customerLeads(customerId: string, principal?: AuthPrincipal) {
    await this.scope.assertCustomer(customerId, principal);
    const ids = await this.scope.orgScopeIds(principal);
    const rows = await this.prisma.lead.findMany({
      where: {
        customerId,
        status: { not: 'CANCELED' },
        ...(ids !== null && { orgUnitId: { in: ids } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        leadNo: true,
        moveDate: true,
        serviceLine: true,
        orgUnit: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      leadNo: r.leadNo,
      moveDate: r.moveDate ? r.moveDate.toISOString().slice(0, 10) : null,
      serviceLine: r.serviceLine,
      orgName: r.orgUnit?.name ?? null,
    }));
  }

  async findAll(kind?: string, status?: string, principal?: AuthPrincipal, f?: string, q?: string) {
    const ids = await this.scope.orgScopeIds(principal);
    const text = searchWhere(q, ['ticketNo', 'legacyNo', 'subject', 'content']);
    const cust = searchWhere(q, ['name', 'phonePrimary'], ['phonePrimary']);
    const rows = await this.prisma.supportTicket.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        AND: [
          this.scopeWhere(ids),
          ...listWhere(LIST_RULES, f),
          ...(text ? [{ OR: [...text.OR, ...(cust ? [{ customer: cust }] : [])] }] : []),
        ],
      },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map((r) => this.view(r));
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id },
      include: LIST_INCLUDE,
    });
    if (!ticket) throw new NotFoundException(`접수건을 찾을 수 없습니다: ${id}`);
    if (
      ids !== null &&
      !(await this.prisma.supportTicket.count({ where: { id, ...this.scopeWhere(ids) } }))
    ) {
      throw new ForbiddenException('소속 조직의 접수건만 조회할 수 있습니다.');
    }
    return this.view(ticket);
  }

  /** 고객 — 고른 고객, 아니면 같은 전화번호의 고객, 없으면 새로 만든다 */
  private async resolveCustomer(dto: CreateTicketDto, principal?: AuthPrincipal) {
    if (dto.customerId) {
      await this.scope.assertCustomer(dto.customerId, principal);
      return dto.customerId;
    }
    const phone = (dto.customerPhone ?? '').replace(/\D/g, '');
    if (phone.length < 9 || phone.length > 11)
      throw new BadRequestException('고객을 고르거나 전화번호(숫자 9~11자리)를 입력해 주세요.');
    const found = await this.prisma.customer.findFirst({
      where: { phonePrimary: phone },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (found) return found.id;
    const name = dto.customerName?.trim();
    if (!name) throw new BadRequestException('새 고객이면 고객명을 입력해 주세요.');
    const created = await this.prisma.customer.create({
      data: { name, phonePrimary: phone, ownerOrgId: principal?.employeeOrgUnitId ?? undefined },
      select: { id: true },
    });
    return created.id;
  }

  async create(dto: CreateTicketDto, principal?: AuthPrincipal) {
    const category = await this.prisma.commonCode.findFirst({
      where: { codeGroup: AS_CATEGORY, code: dto.category, isActive: true },
    });
    if (!category) throw new BadRequestException('접수 유형을 목록에서 다시 골라 주세요.');
    const customerId = await this.resolveCustomer(dto, principal);
    // 관련 접수(견적건)는 같은 고객의 것만
    if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: dto.leadId },
        select: { customerId: true },
      });
      if (!lead || lead.customerId !== customerId)
        throw new BadRequestException('관련 접수는 이 고객의 접수에서 골라 주세요.');
    }
    await this.scope.assertContract(dto.contractId, principal);
    const kind = dto.kind ?? 'AS';
    const created = await this.prisma.supportTicket.create({
      data: {
        ticketNo: await this.docNo.next(kind),
        kind,
        category: dto.category,
        subject: dto.subject.trim(),
        content: dto.content.trim(),
        customerId,
        leadId: dto.leadId,
        contractId: dto.contractId,
        channel: dto.channel,
        priority: dto.priority ?? 'NORMAL',
        assigneeEmpId: dto.assigneeEmpId,
      },
    });
    await this.eventBus.record({
      aggregateType: 'support_ticket',
      aggregateId: created.id,
      eventType: 'support.created',
      payload: {
        kind: created.kind,
        category: created.category,
        by: principal?.employeeId ?? null,
      },
    });
    return created;
  }

  async update(id: string, dto: UpdateTicketDto, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    await this.scope.assertCustomer(dto.customerId, principal);
    await this.scope.assertContract(dto.contractId, principal);
    // 고객 찾기용 칸(이름·전화)은 저장하지 않는다
    const data = { ...dto };
    delete data.customerName;
    delete data.customerPhone;
    return this.prisma.supportTicket.update({ where: { id }, data });
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
}
