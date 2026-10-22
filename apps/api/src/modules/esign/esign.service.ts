import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { EventBusService } from '../../events/event-bus.service';
import { StubNotificationProvider } from '../../notifications/notification.provider';
import { ContractService } from '../contract/contract.service';
import { StubPaymentProvider } from '../contract/payment-provider';
import { EstimateService } from '../estimate/estimate.service';
import { LeadService } from '../lead/lead.service';

const WEB_APP_URL = (process.env.WEB_APP_URL ?? 'http://localhost:3002').replace(/\/$/, '');
const CALL_CENTER = '1899-0123';
/** 서명 링크 유효 기간 */
const LINK_DAYS = 30;

const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const kstDate = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const kstDateTime = (d: Date) =>
  d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * 고객에게 견적서 보내기 → 고객이 링크에서 확인·서명 → 계약금 입금 자동 확인.
 *
 * 보내기 한 번으로: 견적을 '발송'으로, 접수를 '견적완료'로 넘기고, 계약(서명 전)과 계약금 결제(입금 대기)를
 * 만든 뒤 문자 한 통에 견적서·서명 링크와 계약금 계좌를 담아 보낸다. 다시 보내면 금액을 새로 맞춘다
 * (서명 전까지). 문자로는 PDF 파일을 붙일 수 없어서(MMS는 JPG 그림만) 링크로 보내고,
 * 링크 페이지에서 PDF로 저장할 수 있게 한다.
 */
@Injectable()
export class EsignService {
  private readonly logger = new Logger('Esign');

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly eventBus: EventBusService,
    private readonly sms: StubNotificationProvider,
    private readonly contracts: ContractService,
    private readonly payments: StubPaymentProvider,
    private readonly estimates: EstimateService,
    private readonly leads: LeadService,
  ) {}

  /** 보내기 전에 화면에서 문자 내용·받는 번호를 미리 보여 준다 */
  async preview(estimateId: string, principal?: AuthPrincipal) {
    const ctx = await this.load(estimateId, principal);
    return {
      to: ctx.phone,
      totalAmount: ctx.total,
      depositAmount: ctx.deposit,
      contractStatus: ctx.contract?.status ?? null,
      sentAt: ctx.contract?.sentAt ?? null,
      paymentMode: this.contracts.paymentMode,
      smsVendor: this.sms.smsVendor,
      problems: ctx.problems,
    };
  }

  async send(estimateId: string, principal?: AuthPrincipal) {
    const ctx = await this.load(estimateId, principal);
    if (ctx.problems.length) throw new BadRequestException(ctx.problems.join(' / '));
    const { e, total, deposit } = ctx;
    const balance = round2(total - deposit);
    const expires = new Date(Date.now() + LINK_DAYS * 86_400_000);

    // 1) 견적 발송 표시 + 접수 '견적완료' + 계약(서명 전) 만들기/금액 맞추기 — 한 트랜잭션
    const { contract, transition } = await this.prisma.$transaction(async (tx) => {
      await tx.estimate.update({ where: { id: e.id }, data: { status: 'QUOTED' } });
      const t = await this.leads.advanceInTx(tx, e.leadId, 'QUOTED');
      let c = await tx.contract.findUnique({ where: { estimateId: e.id } });
      if (!c) {
        c = await tx.contract.create({
          data: {
            contractNo: this.genContractNo(),
            estimateId: e.id,
            leadId: e.leadId,
            customerId: e.customerId,
            orgUnitId: e.orgUnitId,
            totalAmount: total,
            depositAmount: deposit,
            balanceAmount: balance,
            depositRatio: Math.round((deposit / total) * 10000) / 10000,
            signToken: randomBytes(18).toString('base64url'),
            signTokenExpiresAt: expires,
          },
        });
      } else if (c.status === 'DRAFT') {
        c = await tx.contract.update({
          where: { id: c.id },
          data: {
            totalAmount: total,
            depositAmount: deposit,
            balanceAmount: balance,
            depositRatio: Math.round((deposit / total) * 10000) / 10000,
            signToken: c.signToken ?? randomBytes(18).toString('base64url'),
            signTokenExpiresAt: expires,
          },
        });
      } else if (c.status === 'CANCELED') {
        throw new BadRequestException('취소된 계약입니다.');
      }
      return { contract: c, transition: t };
    });
    await this.leads.emitTransition(transition, 'QUOTED');

    // 2) 계약금 계좌 — 입금 대기 중인 계약금이 금액이 같으면 그대로, 다르면 새로 발급
    const pays = await this.prisma.payment.findMany({
      where: { contractId: contract.id, kind: 'DEPOSIT' },
      orderBy: { createdAt: 'desc' },
    });
    let pay = pays.find((p) => p.status === 'PAID') ?? null;
    if (!pay) {
      const pending = pays.find((p) => p.status === 'PENDING');
      if (pending && Number(pending.amount) === Number(contract.depositAmount)) {
        pay = pending;
      } else {
        if (pending) {
          await this.prisma.payment.update({
            where: { id: pending.id },
            data: { status: 'CANCELED' },
          });
        }
        pay = await this.contracts.createPayment(
          contract.id,
          { kind: 'DEPOSIT', amount: Number(contract.depositAmount) },
          undefined,
          { customerName: ctx.customerName, customerPhone: ctx.phone },
        );
      }
    }

    // 3) 문자
    const link = `${WEB_APP_URL}/s/${contract.signToken}`;
    const lines = [
      `[통인익스프레스] ${ctx.customerName}님, 요청하신 이사 견적서를 보내드립니다.`,
      '',
      `견적번호 ${e.estimateNo}${ctx.moveDate ? ` · 이사일 ${ctx.moveDate}` : ''}`,
      `총 비용 ${won(total)}${e.vatMode === 'INCLUDED' ? '(부가세 포함)' : '(부가세 별도)'}`,
      `계약금 ${won(deposit)} / 잔금 ${won(balance)}`,
      '',
      '▶ 견적서 확인 · 전자서명',
      link,
    ];
    if (pay.status !== 'PAID') {
      lines.push(
        '',
        '▶ 계약금 입금 계좌',
        `${pay.virtualAccount ?? ''} (예금주 ${process.env.DEPOSIT_ACCOUNT_HOLDER ?? '통인익스프레스'})`,
        ...(pay.dueAt ? [`입금기한 ${kstDateTime(pay.dueAt)}`] : []),
        pay.pgProvider === 'TOSS'
          ? '입금하시면 자동으로 확인되어 계약이 확정됩니다.'
          : '입금 확인 후 계약이 확정됩니다.',
      );
    }
    lines.push('', `문의 ${CALL_CENTER}`);
    const message = lines.join('\n');
    const result = await this.sms.send('SMS', ctx.phone, message, { title: '이사 견적서' });
    await this.prisma.notification.create({
      data: {
        channel: 'SMS',
        eventType: 'estimate.sent',
        recipient: ctx.phone,
        message,
        status: result.ok ? 'SENT' : 'FAILED',
        payload: { estimateId: e.id, contractId: contract.id, reason: result.reason ?? null },
      },
    });
    if (result.ok) {
      await this.prisma.contract.update({
        where: { id: contract.id },
        data: { sentAt: new Date() },
      });
    }
    await this.eventBus.record({
      aggregateType: 'estimate',
      aggregateId: e.id,
      eventType: 'estimate.sent',
      payload: { estimateNo: e.estimateNo, contractNo: contract.contractNo, ok: result.ok },
    });
    return {
      ok: result.ok,
      delivered: result.delivered ?? false,
      reason: result.reason ?? null,
      to: ctx.phone,
      link,
      account: pay.virtualAccount,
      contractId: contract.id,
      message,
    };
  }

  // ── 공개(고객) ──

  private async byToken(token: string) {
    const c = await this.prisma.contract.findUnique({
      where: { signToken: token },
      include: {
        customer: { select: { name: true } },
        estimate: { select: { id: true, estimateNo: true, vatMode: true } },
        payments: { where: { kind: 'DEPOSIT' }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!c) throw new NotFoundException('견적서를 찾을 수 없습니다.');
    if (c.status === 'CANCELED') throw new GoneException('취소된 견적입니다.');
    if (c.status !== 'SIGNED' && c.signTokenExpiresAt && c.signTokenExpiresAt < new Date()) {
      throw new GoneException('링크 유효기간이 지났습니다. 담당자에게 다시 요청해 주세요.');
    }
    return c;
  }

  async publicView(token: string) {
    const c = await this.byToken(token);
    const pay =
      c.payments.find((p) => p.status === 'PAID') ?? c.payments.find((p) => p.status === 'PENDING');
    return {
      customerName: c.customer.name,
      estimateNo: c.estimate.estimateNo,
      contractNo: c.contractNo,
      totalAmount: Number(c.totalAmount),
      depositAmount: Number(c.depositAmount),
      balanceAmount: Number(c.balanceAmount),
      vatIncluded: c.estimate.vatMode === 'INCLUDED',
      signed: c.status === 'SIGNED',
      signedAt: c.signedAt,
      signerName: c.signerName,
      deposit: pay
        ? {
            account: pay.virtualAccount,
            holder: process.env.DEPOSIT_ACCOUNT_HOLDER ?? '통인익스프레스',
            paid: pay.status === 'PAID',
            paidAt: pay.paidAt,
            dueAt: pay.dueAt,
          }
        : null,
    };
  }

  async publicDocument(token: string) {
    const c = await this.byToken(token);
    return this.estimates.document(c.estimate.id);
  }

  async publicSign(token: string, dto: { signature: string; signerName: string; agree: boolean }) {
    const c = await this.byToken(token);
    if (c.status === 'SIGNED') return this.publicView(token);
    if (!dto.agree)
      throw new BadRequestException('이용약관 및 개인정보 수집·활용에 동의해 주세요.');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dto.signature)) {
      throw new BadRequestException('서명 그림이 올바르지 않습니다.');
    }
    if (dto.signature.length > 400_000) throw new BadRequestException('서명 그림이 너무 큽니다.');
    await this.contracts.sign(c.id); // 서명 시점 금액 동결(스냅샷)
    await this.prisma.contract.update({
      where: { id: c.id },
      data: { signatureImage: dto.signature, signerName: dto.signerName.trim().slice(0, 40) },
    });
    const t = await this.prisma.$transaction((tx) =>
      this.leads.advanceInTx(tx, c.leadId, 'CONTRACTED'),
    );
    await this.leads.emitTransition(t, 'CONTRACTED');
    return this.publicView(token);
  }

  // ── 입금 자동 확인 ──

  /** 토스 DEPOSIT_CALLBACK — orderId로 결제를 찾고 secret이 맞을 때만 반영 */
  async tossDepositCallback(body: { orderId?: string; secret?: string; status?: string }) {
    if (!body.orderId) return { ok: true };
    const pay = await this.prisma.payment.findFirst({ where: { pgRef: body.orderId } });
    if (!pay) {
      this.logger.warn(`[토스 웹훅] 모르는 주문 ${body.orderId}`);
      return { ok: true };
    }
    if (!pay.pgSecret || pay.pgSecret !== body.secret) {
      this.logger.warn(`[토스 웹훅] secret 불일치 ${body.orderId}`);
      throw new ForbiddenException('invalid secret');
    }
    if (body.status === 'DONE') await this.contracts.markPaid(pay.id);
    else if (body.status === 'CANCELED' || body.status === 'EXPIRED') {
      if (pay.status === 'PENDING') {
        await this.prisma.payment.update({ where: { id: pay.id }, data: { status: 'CANCELED' } });
      }
    }
    return { ok: true };
  }

  /**
   * 시연용 — 은행 알림이 없는(고정 계좌) 환경에서 '고객이 계좌이체했다'를 흉내 낸다.
   * 실제 웹훅과 같은 처리(markPaid)를 타므로 화면 흐름이 운영과 같다.
   */
  async simulateDeposit(estimateId: string, principal?: AuthPrincipal) {
    if (this.payments.autoConfirm && !(process.env.TOSS_SECRET_KEY ?? '').startsWith('test_')) {
      throw new BadRequestException('운영 결제(토스 실키)에서는 시뮬레이션할 수 없습니다.');
    }
    const ctx = await this.load(estimateId, principal, false);
    const pay = await this.prisma.payment.findFirst({
      where: { contract: { estimateId: ctx.e.id }, kind: 'DEPOSIT', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!pay)
      throw new BadRequestException('입금 대기 중인 계약금이 없습니다. 먼저 견적서를 보내세요.');
    await this.contracts.markPaid(pay.id);
    return { ok: true };
  }

  // ── 내부 ──

  private async load(estimateId: string, principal?: AuthPrincipal, validate = true) {
    const e = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        customer: { select: { name: true, phonePrimary: true } },
        lead: { select: { moveDate: true } },
        contract: true,
        addons: { select: { amount: true } },
      },
    });
    if (!e) throw new NotFoundException('견적을 찾을 수 없습니다.');
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(e.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 견적만 보낼 수 있습니다.');
    }
    // 총비용 — 금액 탭과 같은 규칙(이사비용 + 옵션 + 포함일 때 부가세)
    const options = e.addons.reduce((s, a) => s + Number(a.amount), 0);
    const total =
      e.totalAmount != null
        ? Number(e.totalAmount)
        : Number(e.moveAmount ?? e.baseAmount ?? 0) +
          options +
          (e.vatMode === 'INCLUDED' ? Number(e.vatAmount ?? 0) : 0);
    const deposit = round2(
      e.depositAmount != null ? Number(e.depositAmount) : Math.round(total * 0.1),
    );
    const problems: string[] = [];
    if (validate) {
      if (!(total > 0))
        problems.push('총 비용이 없습니다 — 4단계에서 이사비용을 입력하고 저장하세요');
      if (deposit > total) problems.push('계약금이 총 비용보다 큽니다');
      if (!e.customer?.phonePrimary) problems.push('고객 연락처가 없습니다');
      if (e.contract?.status === 'CANCELED') problems.push('취소된 계약입니다');
    }
    return {
      e,
      contract: e.contract,
      total,
      deposit,
      phone: e.customer?.phonePrimary ?? null,
      customerName: e.customer?.name ?? '고객',
      moveDate: e.lead?.moveDate ? kstDate(e.lead.moveDate) : null,
      problems,
    };
  }

  private genContractNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `CT${ymd}${rand}`;
  }
}
