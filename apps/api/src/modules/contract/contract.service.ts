import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { kstYmd } from '../../common/util/kst';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { LeadService } from '../lead/lead.service';
import { StubPaymentProvider, type IssueContext } from './payment-provider';
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
    // 계약금 우선순위: 직접 입력한 금액 → 견적사원이 견적서에 적어 보낸 계약금 → 비율(기본 10%).
    // 견적서로 고객과 합의한 계약금이 계약에서 다른 숫자로 바뀌면 안 되기 때문이다.
    const deposit = round2(
      dto.depositAmount ??
        (dto.depositRatio == null && estimate.depositAmount != null
          ? Number(estimate.depositAmount)
          : total * (dto.depositRatio ?? 0.1)),
    );
    if (deposit > total) throw new BadRequestException('계약금이 총 계약금액보다 큽니다.');
    // 잔금은 언제나 총액 − 계약금. 두 값을 따로 받으면 합이 총액과 어긋날 수 있다.
    const balance = round2(total - deposit);
    const ratio = Math.round((deposit / total) * 10000) / 10000;

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
      const t = await this.leadService.advanceInTx(tx, estimate.leadId, 'CONTRACTED');
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
    // DRAFT일 때만 바꾼다(원자적) — 동시에 두 번 서명해도 contract.signed는 한 번만 나간다
    const { count } = await this.prisma.contract.updateMany({
      where: { id, status: 'DRAFT' },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        esignRef: `stub_sign_${Math.floor(Math.random() * 1_000_000)}`,
        snapshot,
      },
    });
    const updated = await this.prisma.contract.findUniqueOrThrow({ where: { id } });
    if (count !== 1) {
      // 그 사이 다른 요청이 먼저 서명했으면 그 결과를 그대로 돌려준다
      if (updated.status === 'SIGNED') return updated;
      throw new BadRequestException(`서명 불가 상태: ${updated.status}`);
    }
    await this.eventBus.record({
      aggregateType: 'contract',
      aggregateId: id,
      eventType: 'contract.signed',
      payload: { contractNo: c.contractNo },
    });
    return updated;
  }

  async createPayment(
    contractId: string,
    dto: CreatePaymentDto,
    principal?: AuthPrincipal,
    ctx: IssueContext = {},
  ) {
    const c = await this.findOne(contractId, principal);
    // 같은 종류(계약금/잔금) 결제가 입금 대기·완료로 이미 있으면 또 만들지 않는다(계좌 중복 안내 방지)
    const dup = await this.prisma.payment.findFirst({
      where: { contractId, kind: dto.kind, status: { in: ['PENDING', 'PAID'] } },
      select: { status: true },
    });
    if (dup) {
      throw new BadRequestException(
        `${dto.kind === 'DEPOSIT' ? '계약금' : '잔금'} 결제가 이미 ${dup.status === 'PAID' ? '입금 완료' : '입금 대기'} 상태입니다.`,
      );
    }
    if (dto.kind === 'BALANCE') {
      const depositPaid = await this.prisma.payment.count({
        where: { contractId, kind: 'DEPOSIT', status: 'PAID' },
      });
      if (!depositPaid) throw new BadRequestException('계약금 입금이 먼저 확인되어야 합니다.');
    }
    const amount = dto.amount ?? Number(dto.kind === 'DEPOSIT' ? c.depositAmount : c.balanceAmount);
    const va = await this.payments.issueVirtualAccount(amount, {
      orderId: `${c.contractNo}-${dto.kind === 'DEPOSIT' ? 'D' : 'B'}-${Date.now().toString(36)}`,
      orderName: `${dto.kind === 'DEPOSIT' ? '이사 계약금' : '이사 잔금'} ${c.contractNo}`,
      ...ctx,
    });
    const payment = await this.prisma.payment.create({
      data: {
        contractId,
        kind: dto.kind,
        amount,
        method: 'VIRTUAL_ACCOUNT',
        pgProvider: va.provider,
        virtualAccount: `${va.bank} ${va.account}`,
        pgRef: va.pgRef,
        pgSecret: va.secret,
        dueAt: va.dueAt,
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
    // 아직 PAID가 아닐 때만 바꾼다(원자적) — 웹훅과 수동 확인이 겹쳐도 payment.confirmed는 한 번만
    const { count } = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: new Date() },
    });
    const updated = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (count !== 1) return updated;
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

  /**
   * 입금이 확인됐을 때(토스 웹훅·시연 시뮬레이션·수동 확인 공통) — 결제를 PAID로 바꾸고,
   * 계약금이면 접수를 '계약'으로 넘긴다(서명 전이라도 계약금이 들어오면 계약 성립으로 본다).
   * principal을 주면(사람이 직접 확인) 그 사람의 조직 범위 안 계약의 결제인지 먼저 확인한다.
   * 웹훅처럼 사람이 없는 호출은 principal 없이 부른다.
   */
  async markPaid(paymentId: string, principal?: AuthPrincipal) {
    if (principal) {
      const target = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: { contract: { select: { orgUnitId: true } } },
      });
      if (!target) throw new NotFoundException(`결제를 찾을 수 없습니다: ${paymentId}`);
      const ids = await this.scope.orgScopeIds(principal);
      if (ids !== null && !ids.includes(target.contract.orgUnitId)) {
        throw new ForbiddenException('소속 조직 계약의 결제만 입금 확인할 수 있습니다.');
      }
    }
    const payment = await this.confirmPayment(paymentId);
    if (payment.kind === 'DEPOSIT') {
      const c = await this.prisma.contract.findUnique({ where: { id: payment.contractId } });
      if (c) {
        const t = await this.prisma.$transaction((tx) =>
          this.leadService.advanceInTx(tx, c.leadId, 'CONTRACTED'),
        );
        await this.leadService.emitTransition(t, 'CONTRACTED');
      }
    }
    return payment;
  }

  /** 계좌 발급 방식 — 화면 안내용 */
  get paymentMode() {
    return { provider: this.payments.providerName, autoConfirm: this.payments.autoConfirm };
  }

  async listPayments(contractId: string, principal?: AuthPrincipal) {
    await this.findOne(contractId, principal); // 조직 스코프 검증
    return this.prisma.payment.findMany({
      where: { contractId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private genNo(): string {
    const ymd = kstYmd(); // 한국 날짜(서버는 UTC)
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `CT${ymd}${rand}`;
  }
}
