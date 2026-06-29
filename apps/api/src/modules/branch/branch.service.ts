import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface BranchOverviewRow {
  orgUnitId: string;
  name: string;
  code: string;
  contractCount: number; // 계약(서명) 건수
  revenue: number; // 계약 매출(서명 계약 총액 합)
  workActive: number; // 진행중 작업
  workDone: number; // 완료 작업
  employeeCount: number; // 재직 직원수
}

/** 지점관리 — 지점별 매출·작업·직원 현황 집계. */
@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<BranchOverviewRow[]> {
    const branches = await this.prisma.orgUnit.findMany({
      where: { type: 'BRANCH', isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    if (branches.length === 0) return [];
    const ids = branches.map((b) => b.id);

    // 계약(서명) 건수·매출
    const contracts = await this.prisma.contract.groupBy({
      by: ['orgUnitId'],
      where: { orgUnitId: { in: ids }, status: 'SIGNED' },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
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
      if (w.status === 'DONE')
        workDone.set(w.orgUnitId, (workDone.get(w.orgUnitId) ?? 0) + w._count._all);
    }

    return branches.map((b) => {
      const c = contractMap.get(b.id);
      return {
        orgUnitId: b.id,
        name: b.name,
        code: b.code,
        contractCount: c?._count._all ?? 0,
        revenue: c?._sum.totalAmount ? Number(c._sum.totalAmount) : 0,
        workActive: workActive.get(b.id) ?? 0,
        workDone: workDone.get(b.id) ?? 0,
        employeeCount: empMap.get(b.id) ?? 0,
      };
    });
  }
}
