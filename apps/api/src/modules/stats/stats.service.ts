import { Injectable } from '@nestjs/common';
import {
  LEAD_STATUS,
  type AuthPrincipal,
  type LeadStatus,
  type StatsOverview,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * 집계 원본 — 전 조직을 (조직·시도·상태)별로 묶은 건수·금액만 DB에서 받는다.
   * 예전엔 lead·contract·workOrder 전체 행을 읽어 JS로 셌고, 조직 스코프 사용자는 이걸
   * 두 번(내 범위 + 전체) 읽었다. 이제 한 번 묶어 읽고 내 범위는 메모리에서 거른다.
   *  - 내 범위(퍼널·KPI): 행 자체의 orgUnitId 기준(예전 where 조건과 같다)
   *  - 지점·시도별: 연결된 접수(lead)의 orgUnitId·fromSido 기준(예전과 같다)
   */
  private async load() {
    const [leads, contracts, payments, workOrders, units] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['orgUnitId', 'fromSido', 'status'],
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<
        {
          orgUnitId: string;
          leadOrgUnitId: string;
          fromSido: string | null;
          count: number;
          revenue: number;
        }[]
      >`
        SELECT c.org_unit_id AS "orgUnitId", l.org_unit_id AS "leadOrgUnitId",
               l.from_sido AS "fromSido", count(*)::int AS "count",
               coalesce(sum(c.total_amount), 0)::float8 AS "revenue"
        FROM contract c JOIN "lead" l ON l.id = c.lead_id
        WHERE c.status = 'SIGNED'
        GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<{ orgUnitId: string; amount: number }[]>`
        SELECT c.org_unit_id AS "orgUnitId", coalesce(sum(p.amount), 0)::float8 AS "amount"
        FROM payment p JOIN contract c ON c.id = p.contract_id
        WHERE p.status = 'PAID'
        GROUP BY 1`,
      this.prisma.$queryRaw<
        {
          orgUnitId: string;
          status: string;
          leadOrgUnitId: string;
          fromSido: string | null;
          count: number;
        }[]
      >`
        SELECT w.org_unit_id AS "orgUnitId", w.status AS "status",
               l.org_unit_id AS "leadOrgUnitId", l.from_sido AS "fromSido",
               count(*)::int AS "count"
        FROM work_order w JOIN "lead" l ON l.id = w.lead_id
        GROUP BY 1, 2, 3, 4`,
      // 지점은 실적이 없어도 지도·목록에 나온다
      this.prisma.orgUnit.findMany({
        where: { type: 'BRANCH', isActive: true },
        select: { id: true, name: true, sido: true, lat: true, lng: true },
      }),
    ]);
    return { leads, contracts, payments, workOrders, units };
  }

  /**
   * CRM-01: 대시보드 통계 — 퍼널·KPI는 소속 지점 범위로, 지점별/시도별 실적(지도·순위)은
   * 지점장도 전국 현황을 비교해 볼 수 있게 전 지점으로 집계한다.
   */
  async overview(principal?: AuthPrincipal): Promise<StatsOverview> {
    const [ids, all] = await Promise.all([this.scope.orgScopeIds(principal), this.load()]);
    const allowed = ids === null ? null : new Set(ids);
    const inScope = (orgUnitId: string | null) =>
      allowed === null || (!!orgUnitId && allowed.has(orgUnitId));
    const units = all.units;
    const unitById = new Map(units.map((u) => [u.id, u]));

    const countByStatus = new Map<string, number>();
    let leadTotal = 0;
    for (const l of all.leads) {
      if (!inScope(l.orgUnitId)) continue;
      const n = l._count._all;
      countByStatus.set(l.status, (countByStatus.get(l.status) ?? 0) + n);
      leadTotal += n;
    }
    const funnel = LEAD_STATUS.map((status) => ({
      status: status as LeadStatus,
      count: countByStatus.get(status) ?? 0,
    }));

    let contractCount = 0;
    let revenue = 0;
    for (const c of all.contracts) {
      if (!inScope(c.orgUnitId)) continue;
      contractCount += c.count;
      revenue += Number(c.revenue);
    }
    const collected = all.payments
      .filter((p) => inScope(p.orgUnitId))
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const doneCount = all.workOrders
      .filter((w) => w.status === 'DONE' && inScope(w.orgUnitId))
      .reduce((sum, w) => sum + w.count, 0);

    // 지점·시도별로 같은 네 칸을 센다
    type Acc = { leadCount: number; contractCount: number; workCount: number; revenue: number };
    const blank = (): Acc => ({ leadCount: 0, contractCount: 0, workCount: 0, revenue: 0 });
    const branch = new Map<string, Acc>(units.map((u) => [u.id, blank()]));
    const region = new Map<string, Acc>();
    const bump = (m: Map<string, Acc>, key: string | null | undefined, f: (a: Acc) => void) => {
      if (!key) return;
      const a = m.get(key) ?? blank();
      f(a);
      m.set(key, a);
    };
    for (const l of all.leads) {
      const n = l._count._all;
      bump(branch, l.orgUnitId, (a) => (a.leadCount += n));
      bump(region, l.fromSido, (a) => (a.leadCount += n));
    }
    for (const c of all.contracts) {
      const amt = Number(c.revenue);
      const add = (a: Acc) => {
        a.contractCount += c.count;
        a.revenue += amt;
      };
      bump(branch, c.leadOrgUnitId, add);
      bump(region, c.fromSido, add);
    }
    for (const w of all.workOrders) {
      bump(branch, w.leadOrgUnitId, (a) => (a.workCount += w.count));
      bump(region, w.fromSido, (a) => (a.workCount += w.count));
    }

    return {
      funnel,
      kpi: {
        leadTotal,
        contractCount,
        doneCount,
        revenue,
        collected,
        outstanding: revenue - collected,
        conversionRate: leadTotal ? contractCount / leadTotal : 0,
      },
      byBranch: [...branch.entries()]
        .map(([orgUnitId, v]) => {
          const u = unitById.get(orgUnitId);
          return {
            orgUnitId,
            orgUnitName: u?.name ?? '(다른 조직)',
            sido: u?.sido ?? null,
            lat: u?.lat ?? null,
            lng: u?.lng ?? null,
            ...v,
          };
        })
        .sort((a, b) => b.revenue - a.revenue),
      byRegion: [...region.entries()].map(([sido, v]) => ({ sido, ...v })),
    };
  }
}
