import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { LeadService } from '../lead/lead.service';
import { StubPaymentProvider } from './payment-provider';
import { CreateContractDto, CreatePaymentDto } from './dto/contract.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
    private readonly leadService: LeadService,
    private readonly payments: StubPaymentProvider,
  ) {}

  async findAll(principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    return this.prisma.contract.findMany({
      where: ids === null ? {} : { orgUnitId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!contract) throw new NotFoundException(`계약을 찾을 수 없습니다: ${id}`);
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && contract.orgUnitId && !ids.includes(contract.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 계약만 조회할 수 있습니다.');
    }
    return contract;
  }

  async create(dto: CreateContractDto, principal?: AuthPrincipal) {
    const estimate = await this.prisma.estimate.findUnique({ where: { id: dto.estimateId } });
    if (!estimate) throw new BadRequestException('존재하지 않는 견적입니다.');
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(estimate.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 견적만 계약할 수 있습니다.');
    }
    if (estimate.status !== 'QUOTED')
      throw new BadRequestException('확정(QUOTED)된 견적만 계약할 수 있습니다.');
    const existing = await this.prisma.contract.findUnique({
      where: { estimateId: dto.estimateId },
    });
    if (existing) throw new BadRequestException('이미 계약된 견적입니다.');

    const total = dto.totalAmount ?? Number(estimate.totalAmount ?? 0);
    if (!total || total <= 0)
      throw new BadRequestException('총 계약금액(totalAmount)이 필요합니다.');
    const ratio = dto.depositRatio ?? 0.1;
    const deposit = round2(total * ratio);
    const balance = round2(total - deposit);

    // 계약 생성과 리드 전이는 한 트랜잭션 — 전이가 막히면 계약만 남는 일이 없도록
    const { created, transition } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contract.create({
        data: {
          contractNo: this.genNo(),
          estimateId: dto.estimateId,
          leadId: estimate.leadId,
          customerId: estimate.customerId,
          orgUnitId: estimate.orgUnitId,
          contractDate: dto.contractDate ? new Date(dto.contractDate) : undefined,
          totalAmount: total,
          depositRatio: ratio,
          depositAmount: deposit,
          balanceAmount: balance,
        },
      });
      const t = await this.leadService.transitionInTx(tx, estimate.leadId, 'CONTRACTED');
      return { created: row, transition: t };
    });
    await this.leadService.emitTransition(transition, 'CONTRACTED');
    await this.eventBus.record({
      aggregateType: 'contract',
      aggregateId: created.id,
      eventType: 'contract.created',
      payload: { contractNo: created.contractNo, total, deposit },
    });
    return created;
  }

  /** 전자서명(스텁) — 서명 시점 데이터 동결(E-0) */
  async sign(id: string, principal?: AuthPrincipal) {
    const c = await this.findOne(id, principal);
    if (c.status === 'SIGNED') return c;
    if (c.status !== 'DRAFT') throw new BadRequestException(`서명 불가 상태: ${c.status}`);
    const snapshot = {
      contractNo: c.contractNo,
      totalAmount: Number(c.totalAmount),
      depositAmount: Number(c.depositAmount),
      balanceAmount: Number(c.balanceAmount),
      frozenAt: new Date().toISOString(),
    };
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        esignRef: `stub_sign_${Math.floor(Math.random() * 1_000_000)}`,
        snapshot,
      },
    });
    await this.eventBus.record({
      aggregateType: 'contract',
      aggregateId: id,
      eventType: 'contract.signed',
      payload: { contractNo: c.contractNo },
    });
    return updated;
  }

  async createPayment(contractId: string, dto: CreatePaymentDto, principal?: AuthPrincipal) {
    const c = await this.findOne(contractId, principal);
    const amount = dto.amount ?? Number(dto.kind === 'DEPOSIT' ? c.depositAmount : c.balanceAmount);
    const va = await this.payments.issueVirtualAccount(amount);
    const payment = await this.prisma.payment.create({
      data: {
        contractId,
        kind: dto.kind,
        amount,
        method: 'VIRTUAL_ACCOUNT',
        virtualAccount: `${va.bank} ${va.account}`,
        pgRef: va.pgRef,
      },
    });
    await this.eventBus.record({
      aggregateType: 'payment',
      aggregateId: payment.id,
      eventType: 'payment.requested',
      payload: { contractId, kind: dto.kind, amount, virtualAccount: payment.virtualAccount },
    });
    return payment;
  }

  /** 입금통보(토스 웹훅) 대체 — 입금 확인 시 자동 PAID 전환 (CON-02) */
  async confirmPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`결제를 찾을 수 없습니다: ${paymentId}`);
    if (payment.status === 'PAID') return payment;
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await this.eventBus.record({
      aggregateType: 'payment',
      aggregateId: paymentId,
      eventType: 'payment.confirmed',
      payload: {
        contractId: payment.contractId,
        kind: payment.kind,
        amount: Number(payment.amount),
      },
    });
    return updated;
  }

  async listPayments(contractId: string, principal?: AuthPrincipal) {
    await this.findOne(contractId, principal); // 조직 스코프 검증
    return this.prisma.payment.findMany({
      where: { contractId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private genNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `CT${ymd}${rand}`;
  }
}
