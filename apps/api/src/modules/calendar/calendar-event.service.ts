import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import {
  CalendarQueryDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar-event.dto';

const WORK_ORDER_COLOR = '#007AFF';
const WORK_STATUS_LABEL: Record<string, string> = {
  ASSIGNED: '배정',
  IN_PROGRESS: '작업중',
  DONE: '완료',
  CANCELED: '취소',
};

/** 캘린더에 표시되는 단일 항목(자체 일정 + 작업오더 통합 뷰). */
export interface CalendarItem {
  id: string;
  /** LOCAL=자체 일정, GOOGLE=구글에서 가져온 일정, WORK_ORDER=작업(읽기전용) */
  source: 'LOCAL' | 'GOOGLE' | 'WORK_ORDER';
  title: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string | null;
  endTime: string | null;
  color: string;
  location: string | null;
  description: string | null;
  visibility: 'PRIVATE' | 'ORG';
  ownerUserId: string | null;
  ownerName: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  /** 현재 사용자가 수정/삭제할 수 있는지 */
  editable: boolean;
  /** 작업오더인 경우 상세 이동용 id */
  refId: string | null;
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'YYYY-MM-DD' → UTC 자정 Date (@db.Date 컬럼은 시간대 영향을 받지 않도록 UTC로 다룬다). */
function toDateOnly(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

function dateColToYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

@Injectable()
export class CalendarEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** 로그인 사용자의 소속 조직(직원 레코드 기준). 없으면 역할 스코프의 조직으로 대체. */
  async myOrgUnitId(principal: AuthPrincipal): Promise<string | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { id: principal.userId },
      select: { employee: { select: { orgUnitId: true } } },
    });
    if (user?.employee?.orgUnitId) return user.employee.orgUnitId;
    return principal.scopes.find((s) => s.orgScopeId)?.orgScopeId ?? null;
  }

  /**
   * 기간 내 캘린더 항목 조회.
   * scope=MINE : 내가 만든 일정만
   * scope=ORG  : 내 일정 + 조직 공유 일정(데이터범위 내) + 작업오더
   */
  async list(query: CalendarQueryDto, principal: AuthPrincipal): Promise<CalendarItem[]> {
    const scopeKind = query.scope ?? 'MINE';
    const from = query.from ? toDateOnly(query.from) : undefined;
    const to = query.to ? toDateOnly(query.to) : undefined;
    const dateFilter = from || to ? { gte: from, lte: to } : undefined;

    const orgIds = await this.scope.orgScopeIds(principal); // null = 무제한

    // ── 자체 일정 ──
    const orConditions: Prisma.CalendarEventWhereInput[] = [{ ownerUserId: principal.userId }];
    if (scopeKind === 'ORG') {
      const orgShared: Prisma.CalendarEventWhereInput = { visibility: 'ORG' };
      if (query.orgUnitId) {
        orgShared.orgUnitId = query.orgUnitId;
      } else if (orgIds !== null) {
        orgShared.orgUnitId = { in: orgIds };
      }
      orConditions.push(orgShared);
    }

    const events = await this.prisma.calendarEvent.findMany({
      where: { date: dateFilter, OR: orConditions },
      include: {
        owner: { select: { loginId: true, employee: { select: { name: true } } } },
        orgUnit: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 2000,
    });

    const items: CalendarItem[] = events.map((e) => ({
      id: e.id,
      source: e.source === 'GOOGLE' ? 'GOOGLE' : 'LOCAL',
      title: e.title,
      date: dateColToYmd(e.date),
      startTime: e.startTime,
      endTime: e.endTime,
      color: e.color,
      location: e.location,
      description: e.description,
      visibility: e.visibility === 'ORG' ? 'ORG' : 'PRIVATE',
      ownerUserId: e.ownerUserId,
      ownerName: e.owner.employee?.name ?? e.owner.loginId,
      orgUnitId: e.orgUnitId,
      orgUnitName: e.orgUnit?.name ?? null,
      editable: e.ownerUserId === principal.userId,
      refId: null,
    }));

    // ── 작업오더(이사 일정) — 조직 뷰에서만, 읽기전용 ──
    if (scopeKind === 'ORG' && query.includeWorkOrders !== false) {
      const where: Prisma.WorkOrderWhereInput = {
        scheduledDate: dateFilter ? { ...dateFilter, not: null } : { not: null },
        status: { not: 'CANCELED' },
      };
      if (query.orgUnitId) where.orgUnitId = query.orgUnitId;
      else if (orgIds !== null) where.orgUnitId = { in: orgIds };

      const orders = await this.prisma.workOrder.findMany({
        where,
        include: {
          orgUnit: { select: { name: true } },
          lead: { select: { fromSigungu: true, toSigungu: true, customer: { select: { name: true } } } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 1000,
      });

      for (const o of orders) {
        const customer = o.lead?.customer?.name ?? '고객';
        const route = [o.lead?.fromSigungu, o.lead?.toSigungu].filter(Boolean).join('→');
        items.push({
          id: `wo-${o.id}`,
          source: 'WORK_ORDER',
          title: `[작업] ${customer}${route ? ` · ${route}` : ''}`,
          date: dateColToYmd(o.scheduledDate as Date),
          startTime: null,
          endTime: null,
          color: WORK_ORDER_COLOR,
          location: null,
          description: `작업번호 ${o.workNo} · ${WORK_STATUS_LABEL[o.status] ?? o.status}`,
          visibility: 'ORG',
          ownerUserId: null,
          ownerName: null,
          orgUnitId: o.orgUnitId,
          orgUnitName: o.orgUnit?.name ?? null,
          editable: false,
          refId: o.id,
        });
      }
    }

    return items;
  }

  async create(dto: CreateCalendarEventDto, principal: AuthPrincipal) {
    const visibility = dto.visibility ?? 'PRIVATE';
    let orgUnitId: string | null = null;
    if (visibility === 'ORG') {
      orgUnitId = dto.orgUnitId ?? (await this.myOrgUnitId(principal));
      if (!orgUnitId) {
        throw new ForbiddenException('소속 조직이 없어 조직 일정을 만들 수 없습니다.');
      }
    }

    return this.prisma.calendarEvent.create({
      data: {
        title: dto.title,
        description: dto.description,
        date: toDateOnly(dto.date),
        startTime: dto.startTime,
        endTime: dto.endTime,
        color: dto.color ?? '#FF3B30',
        location: dto.location,
        visibility,
        orgUnitId,
        ownerUserId: principal.userId,
      },
    });
  }

  async update(id: string, dto: UpdateCalendarEventDto, principal: AuthPrincipal) {
    const found = await this.findOwned(id, principal);

    const visibility = dto.visibility ?? found.visibility;
    let orgUnitId = found.orgUnitId;
    if (visibility === 'ORG') {
      orgUnitId = dto.orgUnitId ?? found.orgUnitId ?? (await this.myOrgUnitId(principal));
      if (!orgUnitId) throw new ForbiddenException('소속 조직이 없어 조직 일정으로 바꿀 수 없습니다.');
    } else {
      orgUnitId = null;
    }

    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        date: dto.date ? toDateOnly(dto.date) : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        color: dto.color,
        location: dto.location,
        visibility,
        orgUnitId,
      },
    });
  }

  async remove(id: string, principal: AuthPrincipal) {
    await this.findOwned(id, principal);
    await this.prisma.calendarEvent.delete({ where: { id } });
  }

  /** 본인이 만든 일정만 수정·삭제 가능. */
  private async findOwned(id: string, principal: AuthPrincipal) {
    const found = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`일정을 찾을 수 없습니다: ${id}`);
    if (found.ownerUserId !== principal.userId) {
      throw new ForbiddenException('본인이 등록한 일정만 수정·삭제할 수 있습니다.');
    }
    return found;
  }

  /** 조직 선택 드롭다운용 — 현재 사용자가 볼 수 있는 조직 목록. */
  async visibleOrgUnits(principal: AuthPrincipal) {
    const orgIds = await this.scope.orgScopeIds(principal);
    return this.prisma.orgUnit.findMany({
      where: orgIds === null ? { isActive: true } : { id: { in: orgIds }, isActive: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
  }
}

export { ymd };
