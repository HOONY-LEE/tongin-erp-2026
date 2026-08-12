import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { ContractService } from '../contract/contract.service';

/** 입금확인 상태: 입금전(미계약) → 계약금완료 → 완료 */
export type PayConfirmStatus = 'AWAITING' | 'DEPOSIT_PAID' | 'COMPLETED';

interface PayConfirmRow {
  estimateId: string;
  estimateNo: string;
  contractId: string | null;
  contractNo: string | null;
  customerName: string;
  totalAmount: number | null;
  depositAmount: number | null;
  balanceAmount: number | null;
  depositPaid: boolean;
  balancePaid: boolean;
  status: PayConfirmStatus;
}

/**
 * 입금확인 — 견적서 전달 후 고객의 계약금/잔금 입금을 추적.
 * 견적(QUOTED)이 생기면 목록에 '입금전'으로 나타나고, 계약금 입금 시 계약 성립(계약금완료), 잔금 입금 시 완료.
 * 토스페이먼츠 실연동 시 결제 웹훅이 confirmDeposit/confirmBalance 를 자동 호출하게 된다(현재는 수동/스텁).
 */
@Injectable()
export class PaymentConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly contractService: ContractService,
  ) {}

  /** 소속 조직의 견적인지 검증. */
  private async assertScope(orgUnitId: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(orgUnitId)) {
      throw new ForbiddenException('소속 조직의 견적만 조회할 수 있습니다.');
    }
  }

  /** 견적서가 전달된(QUOTED) 건들의 입금 현황 목록. */
  async list(principal?: AuthPrincipal): Promise<PayConfirmRow[]> {
    const ids = await this.scope.orgScopeIds(principal);
    const estimates = await this.prisma.estimate.findMany({
      where: { status: 'QUOTED', ...(ids === null ? {} : { orgUnitId: { in: ids } }) },
      select: {
        id: true,
        estimateNo: true,
        totalAmount: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const contracts = await this.prisma.contract.findMany({
      where: { estimateId: { in: estimates.map((e) => e.id) } },
      select: {
        id: true,
        contractNo: true,
        estimateId: true,
        totalAmount: true,
        depositAmount: true,
        balanceAmount: true,
        payments: { select: { kind: true, status: true } },
      },
    });
    const byEstimate = new Map(contracts.map((c) => [c.estimateId, c]));

    return estimates.map((e) => {
      const c = byEstimate.get(e.id);
      const depositPaid = !!c?.payments.some((p) => p.kind === 'DEPOSIT' && p.status === 'PAID');
      const balancePaid = !!c?.payments.some((p) => p.kind === 'BALANCE' && p.status === 'PAID');
      const total = c
        ? Number(c.totalAmount)
        : e.totalAmount != null
          ? Number(e.totalAmount)
          : null;
      const deposit = c ? Number(c.depositAmount) : total != null ? Math.round(total * 0.1) : null;
      const balance = c
        ? Number(c.balanceAmount)
        : total != null && deposit != null
          ? total - deposit
          : null;
      const status: PayConfirmStatus = balancePaid
        ? 'COMPLETED'
        : depositPaid
          ? 'DEPOSIT_PAID'
          : 'AWAITING';
      return {
        estimateId: e.id,
        estimateNo: e.estimateNo,
        contractId: c?.id ?? null,
        contractNo: c?.contractNo ?? null,
        customerName: e.customer?.name ?? '-',
        totalAmount: total,
        depositAmount: deposit,
        balanceAmount: balance,
        depositPaid,
        balancePaid,
        status,
      };
    });
  }

  /** 계약금 입금확인 = 계약 성립. 계약 없으면 생성·서명 후 계약금 결제 생성·확인. */
  async confirmDeposit(estimateId: string, totalAmount?: number, principal?: AuthPrincipal) {
    const estimate = await this.prisma.estimate.findUnique({ where: { id: estimateId } });
    if (!estimate) throw new NotFoundException('견적을 찾을 수 없습니다.');
    await this.assertScope(estimate.orgUnitId, principal);

    let contract = await this.prisma.contract.findUnique({ where: { estimateId } });
    if (!contract) {
      const amount =
        totalAmount ?? (estimate.totalAmount != null ? Number(estimate.totalAmount) : undefined);
      if (amount == null) {
        throw new BadRequestException('견적 총액이 없습니다. 총액을 입력해 주세요.');
      }
      contract = await this.contractService.create({
        estimateId,
        totalAmount: amount,
        depositRatio: 0.1,
      });
    }
    if (contract.status === 'DRAFT') {
      await this.contractService.sign(contract.id); // 계약금 입금 = 계약 성립
    }
    await this.confirmPaymentOfKind(contract.id, 'DEPOSIT');
    return { ok: true };
  }

  /** 잔금 입금확인. 계약금 완료 후 가능. */
  async confirmBalance(estimateId: string, principal?: AuthPrincipal) {
    const contract = await this.prisma.contract.findUnique({
      where: { estimateId },
      include: { payments: true },
    });
    if (!contract) throw new BadRequestException('아직 계약(계약금 입금)이 없습니다.');
    await this.assertScope(contract.orgUnitId, principal);
    const depositPaid = contract.payments.some((p) => p.kind === 'DEPOSIT' && p.status === 'PAID');
    if (!depositPaid) throw new BadRequestException('계약금 입금이 먼저 확인되어야 합니다.');
    await this.confirmPaymentOfKind(contract.id, 'BALANCE');
    return { ok: true };
  }

  /** 해당 종류의 결제를 생성(없으면)하고 입금확인(PAID) 처리. */
  private async confirmPaymentOfKind(contractId: string, kind: 'DEPOSIT' | 'BALANCE') {
    const payments = await this.contractService.listPayments(contractId);
    let payment = payments.find((p) => p.kind === kind);
    if (payment?.status === 'PAID') return; // 이미 완료
    if (!payment) {
      payment = await this.contractService.createPayment(contractId, { kind });
    }
    await this.contractService.confirmPayment(payment.id);
  }
}
