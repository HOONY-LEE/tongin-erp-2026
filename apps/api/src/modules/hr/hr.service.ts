import { Injectable, NotFoundException } from '@nestjs/common';
import {
  HR_METRICS_BRANCH_ONLY,
  type HrMetric,
  type HrPayoutLine,
  type HrPayoutResult,
  type HrPayoutTarget,
  type HrTargetType,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 정책(규칙) CRUD ──
  findAll() {
    return this.prisma.hrPolicy.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
  }

  async findOne(id: string) {
    const p = await this.prisma.hrPolicy.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`정책을 찾을 수 없습니다: ${id}`);
    return p;
  }

  create(dto: CreatePolicyDto) {
    return this.prisma.hrPolicy.create({ data: { ...dto, kind: dto.kind ?? 'INCENTIVE' } });
  }

  async update(id: string, dto: UpdatePolicyDto) {
    await this.findOne(id);
    return this.prisma.hrPolicy.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.hrPolicy.delete({ where: { id } });
  }

  // ── 계산 엔진: 연월×대상유형 실적으로 정책 적용 ──
  async computePayout(
    year: number,
    month: number,
    targetType: HrTargetType,
  ): Promise<HrPayoutResult> {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const byEmp = targetType === 'EMPLOYEE';

    const policies = (
      await this.prisma.hrPolicy.findMany({ where: { isActive: true, targetType } })
    )
      .map((p) => ({ ...p, value: Number(p.value) }))
      // 사원 대상엔 지점전용 지표(완료작업·AS) 적용 불가
      .filter((p) => !(byEmp && HR_METRICS_BRANCH_ONLY.includes(p.metric as HrMetric)));

    const needed = new Set(policies.map((p) => p.metric as HrMetric));
    const base: Record<string, Map<string, number>> = {};
    for (const m of needed) base[m] = await this.metricBase(m, start, end, byEmp);

    const names = byEmp ? await this.empNames() : await this.orgNames();
    const targetIds = new Set<string>();
    for (const m of needed) for (const id of base[m].keys()) targetIds.add(id);

    const targets: HrPayoutTarget[] = [];
    for (const targetId of targetIds) {
      const lines: HrPayoutLine[] = [];
      let incentive = 0;
      let penalty = 0;
      for (const p of policies) {
        if (!byEmp && p.orgScopeId && p.orgScopeId !== targetId) continue; // 지점 한정 규칙
        const baseVal = base[p.metric]?.get(targetId) ?? 0;
        if (!baseVal) continue;
        const raw = Math.round(baseVal * p.value);
        const amount = p.kind === 'PENALTY' ? -raw : raw;
        if (p.kind === 'PENALTY') penalty += raw;
        else incentive += raw;
        lines.push({
          policyId: p.id,
          policyName: p.name,
          kind: p.kind as 'INCENTIVE' | 'PENALTY',
          metric: p.metric as HrMetric,
          base: baseVal,
          value: p.value,
          amount,
        });
      }
      if (lines.length === 0) continue;
      targets.push({
        targetId,
        targetName: names.get(targetId) ?? targetId.slice(0, 8),
        lines,
        incentive,
        penalty,
        net: incentive - penalty,
      });
    }
    targets.sort((a, b) => b.net - a.net);
    return { year, month, targetType, targets };
  }

  /** 지표별 실적을 대상(지점 또는 사원)별로 합산. */
  private async metricBase(
    metric: HrMetric,
    start: Date,
    end: Date,
    byEmp: boolean,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const add = (key: string | null | undefined, v: number) => {
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + v);
    };

    if (metric === 'CONTRACT_REVENUE' || metric === 'CONTRACT_COUNT') {
      const rows = await this.prisma.contract.findMany({
        where: { status: 'SIGNED', signedAt: { gte: start, lt: end } },
        select: {
          orgUnitId: true,
          totalAmount: true,
          estimate: { select: { estimatorEmpId: true } },
        },
      });
      for (const r of rows) {
        const key = byEmp ? r.estimate?.estimatorEmpId : r.orgUnitId;
        add(key, metric === 'CONTRACT_REVENUE' ? Number(r.totalAmount) : 1);
      }
    } else if (metric === 'PAID_REVENUE') {
      const rows = await this.prisma.payment.findMany({
        where: { status: 'PAID', paidAt: { gte: start, lt: end } },
        select: {
          amount: true,
          contract: { select: { orgUnitId: true, estimate: { select: { estimatorEmpId: true } } } },
        },
      });
      for (const r of rows) {
        const key = byEmp ? r.contract?.estimate?.estimatorEmpId : r.contract?.orgUnitId;
        add(key, Number(r.amount));
      }
    } else if (metric === 'DONE_COUNT') {
      const rows = await this.prisma.workOrder.findMany({
        where: { status: 'DONE', scheduledDate: { gte: start, lt: end } },
        select: { orgUnitId: true },
      });
      for (const r of rows) add(r.orgUnitId, 1);
    } else if (metric === 'AS_COUNT') {
      const rows = await this.prisma.supportTicket.findMany({
        where: { kind: 'AS', createdAt: { gte: start, lt: end } },
        select: { orgUnitId: true },
      });
      for (const r of rows) add(r.orgUnitId, 1);
    }
    return map;
  }

  private async orgNames(): Promise<Map<string, string>> {
    const orgs = await this.prisma.orgUnit.findMany({ select: { id: true, name: true } });
    return new Map(orgs.map((o) => [o.id, o.name]));
  }

  private async empNames(): Promise<Map<string, string>> {
    const emps = await this.prisma.employee.findMany({ select: { id: true, name: true } });
    return new Map(emps.map((e) => [e.id, e.name]));
  }
}
