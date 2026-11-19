import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';

/** 한국 날짜(YYYY-MM-DD) — 오늘에서 offset일 */
export const kDay = (offset = 0) =>
  new Date(Date.now() + 9 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

/** 확인콜 대상 — 계약된 이사 */
const CONFIRM_STATUSES = ['CONTRACT_PENDING', 'CONTRACTED', 'WORK_TOSS', 'IN_PROGRESS'];
/** 해피콜 대상 — 이사를 했거나 하는 중 */
const HAPPY_STATUSES = ['WORK_TOSS', 'DONE'];
export type FollowupKind = 'CONFIRM' | 'HAPPY';

/**
 * 상담 콘솔 운영 — 이사일 마감(지점별)과 이사 확인콜(2일 전)·해피콜(다음 날).
 */
@Injectable()
export class CsOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  // ── 이사일 마감 ──
  /** 기간 안의 마감과 날짜별 이사 건수(취소 제외) */
  async closures(p: AuthPrincipal, from: string, to: string) {
    const ids = await this.scope.orgScopeIds(p);
    const [rows, counts] = await Promise.all([
      this.prisma.moveClosure.findMany({
        where: { date: { gte: asDate(from), lte: asDate(to) } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.lead.groupBy({
        by: ['moveDate'],
        where: {
          moveDate: { gte: asDate(from), lte: asDate(to) },
          status: { not: 'CANCELED' },
          ...(ids !== null && { orgUnitId: { in: ids } }),
        },
        _count: true,
      }),
    ]);
    const orgIds = [...new Set(rows.map((r) => r.orgUnitId).filter((x): x is string => !!x))];
    const orgs = orgIds.length
      ? await this.prisma.orgUnit.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [];
    return {
      closures: rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        orgUnitId: r.orgUnitId,
        orgName: r.orgUnitId ? (orgs.find((o) => o.id === r.orgUnitId)?.name ?? null) : null,
        kind: r.kind,
        memo: r.memo,
      })),
      counts: counts
        .filter((c) => c.moveDate)
        .map((c) => ({ date: c.moveDate!.toISOString().slice(0, 10), leads: c._count })),
    };
  }

  /** 마감 걸기 — 지점은 자기 범위만, 전체(지점 비움)는 범위 제한 없는 사람(본사)만 */
  async addClosure(
    p: AuthPrincipal,
    input: { date: string; orgUnitId?: string | null; memo?: string; kind?: string },
  ) {
    const ids = await this.scope.orgScopeIds(p);
    const orgUnitId = input.orgUnitId || null;
    if (ids !== null && (!orgUnitId || !ids.includes(orgUnitId)))
      throw new ForbiddenException('소속 지점의 날짜만 마감할 수 있습니다.');
    const dup = await this.prisma.moveClosure.findFirst({
      where: { date: asDate(input.date), orgUnitId },
    });
    if (dup) throw new BadRequestException('이미 마감한 날짜입니다.');
    return this.prisma.moveClosure.create({
      data: {
        date: asDate(input.date),
        orgUnitId,
        kind: input.kind === 'SOON' ? 'SOON' : 'CLOSED',
        memo: input.memo?.trim() || null,
        createdBy: p.employeeId ?? null,
      },
    });
  }

  /**
   * 날짜 상태 바꾸기 — 마감(CLOSED)·마감 예정(SOON)·여유(OPEN = 지운다).
   * 지점을 비우면 전체(본사만). 같은 날·같은 지점은 하나만 둔다.
   */
  async setClosureStatus(
    p: AuthPrincipal,
    input: { date: string; orgUnitId?: string | null; status: 'CLOSED' | 'SOON' | 'OPEN' },
  ) {
    const ids = await this.scope.orgScopeIds(p);
    const orgUnitId = input.orgUnitId || null;
    if (ids !== null && (!orgUnitId || !ids.includes(orgUnitId)))
      throw new ForbiddenException('소속 지점의 날짜만 바꿀 수 있습니다.');
    const where = { date: asDate(input.date), orgUnitId };
    if (input.status === 'OPEN') {
      await this.prisma.moveClosure.deleteMany({ where });
      return { ok: true };
    }
    const cur = await this.prisma.moveClosure.findFirst({ where });
    if (cur)
      return this.prisma.moveClosure.update({
        where: { id: cur.id },
        data: { kind: input.status },
      });
    return this.prisma.moveClosure.create({
      data: { ...where, kind: input.status, createdBy: p.employeeId ?? null },
    });
  }

  async removeClosure(p: AuthPrincipal, id: string) {
    const row = await this.prisma.moveClosure.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('마감을 찾을 수 없습니다.');
    const ids = await this.scope.orgScopeIds(p);
    if (ids !== null && (!row.orgUnitId || !ids.includes(row.orgUnitId)))
      throw new ForbiddenException('소속 지점의 마감만 풀 수 있습니다.');
    await this.prisma.moveClosure.delete({ where: { id } });
    return { ok: true };
  }

  // ── 이사 확인콜 · 해피콜 ──
  private defaultDate(kind: FollowupKind) {
    return kind === 'CONFIRM' ? kDay(2) : kDay(-1);
  }

  /** 그날 이사하는(확인콜) / 이사한(해피콜) 접수와 마지막 통화 결과 */
  async followups(p: AuthPrincipal, kind: FollowupKind, date?: string) {
    const day = date || this.defaultDate(kind);
    const ids = await this.scope.orgScopeIds(p);
    const leads = await this.prisma.lead.findMany({
      where: {
        moveDate: asDate(day),
        status: { in: kind === 'CONFIRM' ? CONFIRM_STATUSES : HAPPY_STATUSES },
        ...(ids !== null && { orgUnitId: { in: ids } }),
      },
      include: {
        customer: { select: { id: true, name: true, phonePrimary: true } },
        orgUnit: { select: { name: true } },
        ownerEmp: { select: { name: true } },
        partner: { select: { name: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const logs = leads.length
      ? await this.prisma.csFollowup.findMany({
          where: { leadId: { in: leads.map((l) => l.id) }, kind },
          orderBy: { at: 'desc' },
        })
      : [];
    const empIds = [...new Set(logs.map((l) => l.employeeId).filter((x): x is string => !!x))];
    const emps = empIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: empIds } },
          select: { id: true, name: true },
        })
      : [];
    return {
      date: day,
      rows: leads.map((l) => {
        const mine = logs.filter((x) => x.leadId === l.id);
        const last = mine[0];
        return {
          leadId: l.id,
          leadNo: l.leadNo,
          status: l.status,
          customerId: l.customerId,
          customerName: l.customer?.name ?? null,
          phone: l.customer?.phonePrimary ?? null,
          orgName: l.orgUnit?.name ?? null,
          ownerName: l.ownerEmp?.name ?? null,
          partnerName: l.partner?.name ?? null,
          moveDate: day,
          tries: mine.length,
          result: last?.result ?? null,
          memo: last?.memo ?? null,
          at: last?.at.toISOString() ?? null,
          by: last?.employeeId ? (emps.find((e) => e.id === last.employeeId)?.name ?? null) : null,
        };
      }),
    };
  }

  /** 아직 통화 완료하지 않은 확인콜·해피콜 수(오늘 기준) — 콘솔 탭 숫자 */
  async followupCounts(p: AuthPrincipal) {
    const [c, h] = await Promise.all([this.followups(p, 'CONFIRM'), this.followups(p, 'HAPPY')]);
    return {
      confirm: c.rows.filter((r) => r.result !== 'DONE').length,
      happy: h.rows.filter((r) => r.result !== 'DONE').length,
    };
  }

  async addFollowup(
    p: AuthPrincipal,
    input: { leadId: string; kind: FollowupKind; result: 'DONE' | 'NO_ANSWER'; memo?: string },
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { orgUnitId: true },
    });
    if (!lead) throw new NotFoundException('접수를 찾을 수 없습니다.');
    const ids = await this.scope.orgScopeIds(p);
    if (ids !== null && !ids.includes(lead.orgUnitId))
      throw new ForbiddenException('소속 조직의 접수만 처리할 수 있습니다.');
    return this.prisma.csFollowup.create({
      data: {
        leadId: input.leadId,
        kind: input.kind,
        result: input.result,
        memo: input.memo?.trim() || null,
        employeeId: p.employeeId ?? null,
      },
    });
  }
}
