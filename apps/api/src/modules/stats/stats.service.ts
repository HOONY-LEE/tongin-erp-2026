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

  /** CRM-01: 대시보드 통계 — 퍼널·KPI·지점별/시도별 실적. 소속 지점 범위로만 집계. */
  async overview(principal?: AuthPrincipal): Promise<StatsOverview> {
    const ids = await this.scope.orgScopeIds(principal);
    const org = ids === null ? {} : { orgUnitId: { in: ids } };
    const [leads, signedContracts, paidAgg, workOrders] = await Promise.all([
      this.prisma.lead.findMany({
        where: org,
        select: { status: true, fromSido: true, orgUnit: { select: { name: true } } },
      }),
      this.prisma.contract.findMany({
        where: { status: 'SIGNED', ...org },
        select: {
          totalAmount: true,
          lead: { select: { fromSido: true, orgUnit: { select: { name: true } } } },
        },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'PAID', ...(ids === null ? {} : { contract: org }) },
        _sum: { amount: true },
      }),
      this.prisma.workOrder.findMany({
        where: org,
        select: {
          status: true,
          lead: { select: { fromSido: true, orgUnit: { select: { name: true } } } },
        },
      }),
    ]);

    const countByStatus = new Map<string, number>();
    for (const l of leads) countByStatus.set(l.status, (countByStatus.get(l.status) ?? 0) + 1);
    const funnel = LEAD_STATUS.map((status) => ({
      status: status as LeadStatus,
      count: countByStatus.get(status) ?? 0,
    }));

    const leadTotal = leads.length;
    const contractCount = signedContracts.length;
    const revenue = signedContracts.reduce((s, c) => s + Number(c.totalAmount), 0);
    const collected = Number(paidAgg._sum.amount ?? 0);
    const doneCount = workOrders.filter((w) => w.status === 'DONE').length;

    // 지점·시도별로 같은 네 칸을 센다
    type Acc = { leadCount: number; contractCount: number; workCount: number; revenue: number };
    const blank = (): Acc => ({ leadCount: 0, contractCount: 0, workCount: 0, revenue: 0 });
    const branch = new Map<string, Acc>();
    const region = new Map<string, Acc>();
    const bump = (m: Map<string, Acc>, key: string | null | undefined, f: (a: Acc) => void) => {
      if (!key) return;
      const a = m.get(key) ?? blank();
      f(a);
      m.set(key, a);
    };
    for (const l of leads) {
      bump(branch, l.orgUnit?.name ?? '(미지정)', (a) => a.leadCount++);
      bump(region, l.fromSido, (a) => a.leadCount++);
    }
    for (const c of signedContracts) {
      const amt = Number(c.totalAmount);
      const add = (a: Acc) => {
        a.contractCount++;
        a.revenue += amt;
      };
      bump(branch, c.lead?.orgUnit?.name ?? '(미지정)', add);
      bump(region, c.lead?.fromSido, add);
    }
    for (const w of workOrders) {
      bump(branch, w.lead?.orgUnit?.name ?? '(미지정)', (a) => a.workCount++);
      bump(region, w.lead?.fromSido, (a) => a.workCount++);
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
        .map(([orgUnitName, v]) => ({ orgUnitName, ...v }))
        .sort((a, b) => b.revenue - a.revenue),
      byRegion: [...region.entries()].map(([sido, v]) => ({ sido, ...v })),
    };
  }
}
