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

  /** CRM-01: 대시보드 통계 — 퍼널·KPI·가맹점별 매출. 소속 지점 범위로만 집계. */
  async overview(principal?: AuthPrincipal): Promise<StatsOverview> {
    const ids = await this.scope.orgScopeIds(principal);
    const org = ids === null ? {} : { orgUnitId: { in: ids } };
    const [leadGroups, signedContracts, paidAgg, doneCount] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['status'], where: org, _count: { _all: true } }),
      this.prisma.contract.findMany({
        where: { status: 'SIGNED', ...org },
        select: { totalAmount: true, lead: { select: { orgUnit: { select: { name: true } } } } },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'PAID', ...(ids === null ? {} : { contract: org }) },
        _sum: { amount: true },
      }),
      this.prisma.workOrder.count({ where: { status: 'DONE', ...org } }),
    ]);

    const countByStatus = new Map(leadGroups.map((g) => [g.status, g._count._all]));
    const funnel = LEAD_STATUS.map((status) => ({
      status: status as LeadStatus,
      count: countByStatus.get(status) ?? 0,
    }));

    const leadTotal = leadGroups.reduce((s, g) => s + g._count._all, 0);
    const contractCount = signedContracts.length;
    const revenue = signedContracts.reduce((s, c) => s + Number(c.totalAmount), 0);
    const collected = Number(paidAgg._sum.amount ?? 0);

    const branchMap = new Map<string, { contractCount: number; revenue: number }>();
    for (const c of signedContracts) {
      const name = c.lead?.orgUnit?.name ?? '(미지정)';
      const cur = branchMap.get(name) ?? { contractCount: 0, revenue: 0 };
      cur.contractCount += 1;
      cur.revenue += Number(c.totalAmount);
      branchMap.set(name, cur);
    }
    const byBranch = [...branchMap.entries()]
      .map(([orgUnitName, v]) => ({ orgUnitName, ...v }))
      .sort((a, b) => b.revenue - a.revenue);

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
      byBranch,
    };
  }
}
