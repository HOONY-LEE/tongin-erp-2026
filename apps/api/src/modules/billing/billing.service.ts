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
  async setOutsourceCost(workOrderId: string, dto: SetOutsourceCostDto, principal?: AuthPrincipal) {
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

  /**
   * 기업이전(B2B) 계약 서명 시 청구서를 계약에서 자동 생성한다.
   * 담당 지점·거래처·금액을 계약에서 그대로 승계 — 지점이 따로 입력할 것이 없다.
   * 기업고객(B2B_CLIENT) 거래처가 붙은 계약만 대상이고, 이미 만들어졌으면 아무것도 하지 않는다.
   */
  async createInvoiceFromContract(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { lead: { include: { partner: true } }, customer: true },
    });
    if (!contract) return null;
    const partner = contract.lead.partner;
    if (!partner || partner.type !== 'B2B_CLIENT') return null; // 개인 이사·전속은 대상 아님

    const existing = await this.prisma.invoice.findFirst({ where: { contractId } });
    if (existing) return existing;

    const created = await this.prisma.invoice.create({
      data: {
        invoiceNo: this.genNo(),
        partnerId: partner.id,
        orgUnitId: contract.orgUnitId, // 담당 지점 = 계약 지점
        contractId,
        title: `${contract.contractNo} ${contract.customer.name} 기업이전`,
        amount: contract.totalAmount,
      },
    });
    await this.eventBus.record({
      aggregateType: 'invoice',
      aggregateId: created.id,
      eventType: 'invoice.created_from_contract',
      payload: {
        invoiceNo: created.invoiceNo,
        contractNo: contract.contractNo,
        partnerId: partner.id,
        amount: Number(contract.totalAmount),
      },
    });
    return created;
  }

  async listInvoices(partnerId?: string, status?: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    const where: Prisma.InvoiceWhereInput = {};
    if (partnerId) where.partnerId = partnerId;
    if (status) where.status = status;
    // 지점은 본인이 담당인 청구서만 볼 수 있다(담당 미지정 건은 본사만)
    if (ids !== null) where.orgUnitId = { in: ids };
    return this.prisma.invoice.findMany({
      where,
      include: { partner: true, receipts: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async createInvoice(dto: CreateInvoiceDto, principal?: AuthPrincipal) {
    await this.assertHeadOffice(principal);
    const partner = await this.prisma.partner.findUnique({ where: { id: dto.partnerId } });
    if (!partner) throw new BadRequestException('존재하지 않는 거래처(partnerId)입니다.');
    this.assertBillablePartner(partner.type);
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
    await this.assertHeadOffice(principal);
    const inv = await this.getInvoice(id);
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
    await this.assertHeadOffice(principal);
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { receipts: true },
    });
    if (!inv) throw new NotFoundException(`청구서를 찾을 수 없습니다: ${invoiceId}`);
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

  /**
   * 청구서 발행·수금은 본사 업무. 지점은 본인이 담당인 청구서를 조회만 한다
   * (세금계산서 번호 체계·거래처 단가·채권 관리를 본사에 모으기 위함).
   */
  private async assertHeadOffice(principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null) {
      throw new ForbiddenException('청구서 발행·수금은 본사에서만 처리합니다.');
    }
  }

  /**
   * 청구 대상은 우리가 돈을 받을 거래처뿐 — 기업고객(B2B_CLIENT)과 제휴사(AFFILIATE).
   * 전속업체(OUTSOURCE)는 우리가 지급하는 쪽이라 작업오더 billedCost(마진)로 관리한다.
   */
  private assertBillablePartner(type: string) {
    if (type === 'OUTSOURCE') {
      throw new BadRequestException(
        '전속업체는 청구 대상이 아닙니다. 전속 원가는 작업오더 전속원가(billedCost)로 관리합니다.',
      );
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
