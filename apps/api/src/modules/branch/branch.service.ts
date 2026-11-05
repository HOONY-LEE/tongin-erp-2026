import { Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';

interface BranchOverviewRow {
  orgUnitId: string;
  name: string;
  code: string;
  isActive: boolean;
  sido: string | null;
  sigungu: string | null;
  leadCount: number; // 접수 건수
  contractCount: number; // 계약(서명) 건수
  revenue: number; // 계약 매출(서명 계약 총액 합)
  workActive: number; // 진행중 작업
  workDone: number; // 완료 작업
  employeeCount: number; // 재직 직원수
}

/**
 * 지점관리 — 지점별 매출·작업·직원 현황 집계.
 * 지점 등록·수정도 지점관리에서 하므로 '사용 안 함' 지점까지 돌려준다(빼면 다시 켤 길이 없다).
 */
@Injectable()
export class BranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * from·to(YYYY-MM-DD, 한국 날짜, 포함) — 주면 접수·계약·완료 작업을 그 기간으로 센다.
   * 데이터범위 안 지점만 — 지점 계정(ORG_UNIT.READ)이 다른 지점 매출을 보지 못하게
   */
  async overview(
    from?: string,
    to?: string,
    principal?: AuthPrincipal,
  ): Promise<BranchOverviewRow[]> {
    const scopeIds = await this.scope.orgScopeIds(principal);
    const tsFrom = from ? new Date(`${from}T00:00:00+09:00`) : undefined;
    const tsTo = to ? new Date(Date.parse(`${to}T00:00:00+09:00`) + 86_400_000) : undefined;
    const tsRange =
      tsFrom || tsTo ? { ...(tsFrom && { gte: tsFrom }), ...(tsTo && { lt: tsTo }) } : undefined;
    const dayRange =
      from || to
        ? {
            ...(from && { gte: new Date(`${from}T00:00:00Z`) }),
            ...(to && { lt: new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000) }),
          }
        : undefined;
    const branches = await this.prisma.orgUnit.findMany({
      where: { type: 'BRANCH', ...(scopeIds === null ? {} : { id: { in: scopeIds } }) },
      select: { id: true, name: true, code: true, isActive: true, sido: true, sigungu: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    if (branches.length === 0) return [];
    const ids = branches.map((b) => b.id);

    // 계약(서명) 건수·매출
    const contracts = await this.prisma.contract.groupBy({
      by: ['orgUnitId'],
      where: { orgUnitId: { in: ids }, status: 'SIGNED', ...(tsRange && { signedAt: tsRange }) },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    const leads = await this.prisma.lead.groupBy({
      by: ['orgUnitId'],
      where: { orgUnitId: { in: ids }, ...(tsRange && { createdAt: tsRange }) },
      _count: { _all: true },
    });
    const leadMap = new Map(leads.map((l) => [l.orgUnitId, l._count._all]));
    // 작업 상태별
    const works = await this.prisma.workOrder.groupBy({
      by: ['orgUnitId', 'status'],
      where: { orgUnitId: { in: ids } },
      _count: { _all: true },
    });
    // 재직 직원수
    const emps = await this.prisma.employee.groupBy({
      by: ['orgUnitId'],
      where: { orgUnitId: { in: ids }, isActive: true },
      _count: { _all: true },
    });

    const contractMap = new Map(contracts.map((c) => [c.orgUnitId, c]));
    const empMap = new Map(emps.map((e) => [e.orgUnitId, e._count._all]));
    const workActive = new Map<string, number>();
    const workDone = new Map<string, number>();
    for (const w of works) {
      if (w.status === 'IN_PROGRESS' || w.status === 'ASSIGNED')
        workActive.set(w.orgUnitId, (workActive.get(w.orgUnitId) ?? 0) + w._count._all);
      if (w.status === 'DONE' && !dayRange)
        workDone.set(w.orgUnitId, (workDone.get(w.orgUnitId) ?? 0) + w._count._all);
    }
    // 기간을 주면 완료 작업은 그 기간 작업일 기준
    if (dayRange) {
      const done = await this.prisma.workOrder.groupBy({
        by: ['orgUnitId'],
        where: { orgUnitId: { in: ids }, status: 'DONE', scheduledDate: dayRange },
        _count: { _all: true },
      });
      for (const d of done) workDone.set(d.orgUnitId, d._count._all);
    }

    return branches.map((b) => {
      const c = contractMap.get(b.id);
      return {
        orgUnitId: b.id,
        name: b.name,
        code: b.code,
        isActive: b.isActive,
        sido: b.sido,
        sigungu: b.sigungu,
        leadCount: leadMap.get(b.id) ?? 0,
        contractCount: c?._count._all ?? 0,
        revenue: c?._sum.totalAmount ? Number(c._sum.totalAmount) : 0,
        workActive: workActive.get(b.id) ?? 0,
        workDone: workDone.get(b.id) ?? 0,
        employeeCount: empMap.get(b.id) ?? 0,
      };
    });
  }
}
