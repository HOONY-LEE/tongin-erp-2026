import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal, CustomerReceivable, MonthlyInflow } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { PaymentQueryDto } from './dto/payment-query.dto';

/**
 * SET-01: 입금/미수금 관리 (레거시 입금-고객입금관리/고객별미수금/월별금액 대체).
 * 기존 결제 자동화(CON-02·OPS-03) 데이터 위의 조회/집계 레이어 — 스키마 변경 없음.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** 입금 현황: 결제 목록(계약·고객 조인) + 필터(상태/종류/고객/기간). 소속 지점 계약만. */
  async payments(q: PaymentQueryDto, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    const where: Prisma.PaymentWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.kind) where.kind = q.kind;
    // 결제는 계약을 통해 지점에 매인다
    if (q.customerId || ids !== null) {
      where.contract = {
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...(ids === null ? {} : { orgUnitId: { in: ids } }),
      };
    }
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const rows = await this.prisma.payment.findMany({
      where,
      include: { contract: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((p) => ({
      id: p.id,
      contractId: p.contractId,
      contractNo: p.contract.contractNo,
      customerId: p.contract.customerId,
      customerName: p.contract.customer.name,
      kind: p.kind,
      method: p.method,
      amount: Number(p.amount),
      status: p.status,
      virtualAccount: p.virtualAccount,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    }));
  }

  /** 고객별 미수금: 청구(SIGNED 계약 총액) − 입금(PAID) = 미수금. */
  async receivables(
    onlyOutstanding = false,
    principal?: AuthPrincipal,
  ): Promise<CustomerReceivable[]> {
    const ids = await this.scope.orgScopeIds(principal);
    const contracts = await this.prisma.contract.findMany({
      where: { status: 'SIGNED', ...(ids === null ? {} : { orgUnitId: { in: ids } }) },
      include: { customer: true, payments: true },
    });
    const map = new Map<string, CustomerReceivable>();
    for (const c of contracts) {
      const r = map.get(c.customerId) ?? {
        customerId: c.customerId,
        customerName: c.customer.name,
        contractCount: 0,
        billed: 0,
        paid: 0,
        outstanding: 0,
      };
      r.contractCount += 1;
      r.billed += Number(c.totalAmount);
      r.paid += c.payments
        .filter((p) => p.status === 'PAID')
        .reduce((s, p) => s + Number(p.amount), 0);
      map.set(c.customerId, r);
    }
    let list = [...map.values()].map((r) => ({
      ...r,
      billed: Math.round(r.billed * 100) / 100,
      paid: Math.round(r.paid * 100) / 100,
      outstanding: Math.round((r.billed - r.paid) * 100) / 100,
    }));
    if (onlyOutstanding) list = list.filter((r) => r.outstanding > 0);
    return list.sort((a, b) => b.outstanding - a.outstanding);
  }

  /** 월별 입금액: PAID 결제의 paidAt 기준 YYYY-MM 집계. */
  async monthlyInflow(year?: number, principal?: AuthPrincipal): Promise<MonthlyInflow[]> {
    const ids = await this.scope.orgScopeIds(principal);
    const where: Prisma.PaymentWhereInput = { status: 'PAID', paidAt: { not: null } };
    if (ids !== null) where.contract = { orgUnitId: { in: ids } };
    if (year) {
      where.paidAt = { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) };
    }
    const rows = await this.prisma.payment.findMany({
      where,
      select: { paidAt: true, amount: true },
    });
    const map = new Map<string, { count: number; total: number }>();
    for (const p of rows) {
      if (!p.paidAt) continue;
      const month = p.paidAt.toISOString().slice(0, 7); // YYYY-MM
      const m = map.get(month) ?? { count: 0, total: 0 };
      m.count += 1;
      m.total += Number(p.amount);
      map.set(month, m);
    }
    return [...map.entries()]
      .map(([month, v]) => ({ month, count: v.count, total: Math.round(v.total * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}
