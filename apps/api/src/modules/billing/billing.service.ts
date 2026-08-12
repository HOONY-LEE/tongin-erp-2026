import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal, ContractMargin, PartnerReceivable } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateInvoiceDto, CreateReceiptDto, SetOutsourceCostDto } from './dto/billing.dto';

/**
 * SET-03: 전속/B2B 청구·수금 + 마진 (설계노트 D-3).
 * 마진 = 매출(계약 총액) − 전속원가(작업오더 billedCost).
 * 청구(Invoice) → 발행(ISSUED) → 수금(Receipt) → 완납 시 COLLECTED. 거래처별 미수금 집계.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  // ── 마진 (D-3) ──

  /** 작업오더 전속원가 입력 → 해당 계약 마진 반환. */
  async setOutsourceCost(
    workOrderId: string,
    dto: SetOutsourceCostDto,
    principal?: AuthPrincipal,
  ) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new NotFoundException(`작업오더를 찾을 수 없습니다: ${workOrderId}`);
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(wo.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 작업오더만 다룰 수 있습니다.');
    }
    await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data: { billedCost: dto.billedCost },
    });
    const contract = await this.prisma.contract.findUnique({ where: { id: wo.contractId } });
    const revenue = Number(contract?.totalAmount ?? 0);
    return {
      workOrderId,
      outsourceCost: dto.billedCost,
      revenue,
      margin: revenue - dto.billedCost,
    };
  }

  /** 계약별 마진(매출−전속원가) 목록 + 합계. */
  async margins(orgUnitId?: string, from?: string, to?: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (orgUnitId && ids !== null && !ids.includes(orgUnitId)) {
      throw new ForbiddenException('소속 지점의 마진만 조회할 수 있습니다.');
    }
    const where: Prisma.ContractWhereInput = { status: 'SIGNED' };
    if (orgUnitId) where.orgUnitId = orgUnitId;
    else if (ids !== null) where.orgUnitId = { in: ids };
    if (from || to) {
      where.signedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    const contracts = await this.prisma.contract.findMany({
      where,
      include: { customer: true, workOrder: true },
      orderBy: { signedAt: 'desc' },
      take: 500,
    });
    const lines: ContractMargin[] = contracts.map((c) => {
      const revenue = Number(c.totalAmount);
      const outsourceCost = Number(c.workOrder?.billedCost ?? 0);
      return {
        contractId: c.id,
        contractNo: c.contractNo,
        customerName: c.customer.name,
        revenue,
        outsourceCost,
        margin: revenue - outsourceCost,
      };
    });
    return {
      count: lines.length,
      revenueTotal: lines.reduce((s, l) => s + l.revenue, 0),
      outsourceCostTotal: lines.reduce((s, l) => s + l.outsourceCost, 0),
      marginTotal: lines.reduce((s, l) => s + l.margin, 0),
      lines,
    };
  }

  // ── 청구·수금 ──

  async listInvoices(partnerId?: string, status?: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    const where: Prisma.InvoiceWhereInput = {};
    if (partnerId) where.partnerId = partnerId;
    if (status) where.status = status;
    // 본사 발행(orgUnitId=null)은 무제한 스코프에게만 보인다
    if (ids !== null) where.orgUnitId = { in: ids };
    return this.prisma.invoice.findMany({
      where,
      include: { partner: true, receipts: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async createInvoice(dto: CreateInvoiceDto, principal?: AuthPrincipal) {
    const partner = await this.prisma.partner.findUnique({ where: { id: dto.partnerId } });
    if (!partner) throw new BadRequestException('존재하지 않는 거래처(partnerId)입니다.');
    await this.assertInvoiceScope(dto.orgUnitId ?? null, principal);
    return this.prisma.invoice.create({
      data: {
        invoiceNo: this.genNo(),
        partnerId: dto.partnerId,
        orgUnitId: dto.orgUnitId,
        title: dto.title,
        amount: dto.amount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        memo: dto.memo,
      },
    });
  }

  async issueInvoice(id: string, principal?: AuthPrincipal) {
    const inv = await this.getInvoice(id);
    await this.assertInvoiceScope(inv.orgUnitId, principal);
    if (inv.status !== 'DRAFT') throw new BadRequestException(`발행 불가 상태: ${inv.status}`);
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'ISSUED', issuedAt: new Date() },
    });
    await this.eventBus.record({
      aggregateType: 'invoice',
      aggregateId: id,
      eventType: 'invoice.issued',
      payload: { invoiceNo: inv.invoiceNo, partnerId: inv.partnerId, amount: Number(inv.amount) },
    });
    return updated;
  }

  async addReceipt(invoiceId: string, dto: CreateReceiptDto, principal?: AuthPrincipal) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { receipts: true },
    });
    if (!inv) throw new NotFoundException(`청구서를 찾을 수 없습니다: ${invoiceId}`);
    await this.assertInvoiceScope(inv.orgUnitId, principal);
    if (inv.status === 'DRAFT')
      throw new BadRequestException('발행(ISSUED)된 청구서만 수금 가능합니다.');
    if (inv.status === 'CANCELED') throw new BadRequestException('취소된 청구서입니다.');

    const receipt = await this.prisma.invoiceReceipt.create({
      data: { invoiceId, amount: dto.amount, method: dto.method ?? 'TRANSFER', memo: dto.memo },
    });

    const collected = inv.receipts.reduce((s, r) => s + Number(r.amount), 0) + dto.amount;
    let status = inv.status;
    if (collected >= Number(inv.amount) && inv.status !== 'COLLECTED') {
      status = 'COLLECTED';
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
      await this.eventBus.record({
        aggregateType: 'invoice',
        aggregateId: invoiceId,
        eventType: 'invoice.collected',
        payload: { invoiceNo: inv.invoiceNo, amount: Number(inv.amount) },
      });
    }
    return { receipt, invoiceStatus: status, collected };
  }

  /** 거래처별 미수금: 청구(ISSUED+COLLECTED) − 수금. */
  async partnerReceivables(principal?: AuthPrincipal): Promise<PartnerReceivable[]> {
    const ids = await this.scope.orgScopeIds(principal);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'COLLECTED'] },
        ...(ids === null ? {} : { orgUnitId: { in: ids } }),
      },
      include: { partner: true, receipts: true },
    });
    const map = new Map<string, PartnerReceivable>();
    for (const inv of invoices) {
      const r = map.get(inv.partnerId) ?? {
        partnerId: inv.partnerId,
        partnerName: inv.partner.name,
        invoiceCount: 0,
        billed: 0,
        collected: 0,
        outstanding: 0,
      };
      r.invoiceCount += 1;
      r.billed += Number(inv.amount);
      r.collected += inv.receipts.reduce((s, x) => s + Number(x.amount), 0);
      map.set(inv.partnerId, r);
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        billed: Math.round(r.billed * 100) / 100,
        collected: Math.round(r.collected * 100) / 100,
        outstanding: Math.round((r.billed - r.collected) * 100) / 100,
      }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }

  /** 청구서는 발행 지점 기준. 본사 발행(null)은 무제한 스코프만 다룰 수 있다. */
  private async assertInvoiceScope(orgUnitId: string | null, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids === null) return;
    if (orgUnitId === null) {
      throw new ForbiddenException('본사 발행 청구서는 본사만 다룰 수 있습니다.');
    }
    if (!ids.includes(orgUnitId)) {
      throw new ForbiddenException('소속 지점의 청구서만 다룰 수 있습니다.');
    }
  }

  private async getInvoice(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException(`청구서를 찾을 수 없습니다: ${id}`);
    return inv;
  }

  private genNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `INV${ymd}${rand}`;
  }
}
