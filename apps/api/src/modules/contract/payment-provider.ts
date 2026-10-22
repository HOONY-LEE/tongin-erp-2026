import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/**
 * 계약금·잔금 입금 계좌 발급.
 * - 토스페이먼츠 키(TOSS_SECRET_KEY)가 있으면 고객마다 가상계좌를 발급한다. 입금되면 토스가
 *   웹훅(DEPOSIT_CALLBACK)으로 알려 주고, 시스템이 그 결제를 자동으로 '입금 완료'로 바꾼다.
 *   테스트 키(test_sk_…)면 실제 돈은 오가지 않고 토스 개발자센터에서 입금을 흉내 낼 수 있다.
 * - 키가 없으면 회사 고정 계좌(DEPOSIT_ACCOUNT)를 안내한다. 이때는 은행이 알려 주지 않으므로
 *   입금확인 화면에서 직접 확인하거나, 시연용 '입금 시뮬레이션'으로 자동 확인 흐름을 보여 준다.
 */
export interface IssuedAccount {
  provider: 'TOSS' | 'MANUAL';
  bank: string;
  account: string;
  holder: string;
  pgRef: string;
  /** 웹훅 진위 확인용(토스) */
  secret: string | null;
  dueAt: Date | null;
}

export interface IssueContext {
  orderId?: string;
  orderName?: string;
  customerName?: string;
  customerPhone?: string | null;
}

/** 토스 은행 코드 → 이름(안내 문자용). 자주 쓰는 곳만 — 없으면 코드 그대로 */
const TOSS_BANKS: Record<string, string> = {
  '02': '산업',
  '03': '기업',
  '06': '국민',
  '07': '수협',
  '11': '농협',
  '20': '우리',
  '23': 'SC제일',
  '27': '씨티',
  '31': '대구',
  '32': '부산',
  '34': '광주',
  '35': '제주',
  '37': '전북',
  '39': '경남',
  '45': '새마을',
  '48': '신협',
  '71': '우체국',
  '81': '하나',
  '88': '신한',
  '89': '케이뱅크',
  '90': '카카오뱅크',
  '92': '토스뱅크',
};

const HOLDER = process.env.DEPOSIT_ACCOUNT_HOLDER ?? '통인익스프레스';

@Injectable()
export class StubPaymentProvider {
  private readonly logger = new Logger('Payment');
  private readonly tossKey = process.env.TOSS_SECRET_KEY;

  /** 토스 가상계좌로 자동 입금 확인이 되는지 */
  get autoConfirm(): boolean {
    return !!this.tossKey;
  }
  get providerName(): 'TOSS' | 'MANUAL' {
    return this.tossKey ? 'TOSS' : 'MANUAL';
  }

  async issueVirtualAccount(amount: number, ctx: IssueContext = {}): Promise<IssuedAccount> {
    const orderId = ctx.orderId ?? `TI-${Date.now()}-${randomBytes(3).toString('hex')}`;
    if (!this.tossKey) return this.manualAccount(orderId);

    const res = await fetch('https://api.tosspayments.com/v1/virtual-accounts', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.tossKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount),
        orderId,
        orderName: (ctx.orderName ?? '이사 계약금').slice(0, 100),
        customerName: (ctx.customerName ?? '고객').slice(0, 100),
        bank: process.env.TOSS_VA_BANK ?? '20',
        validHours: Number(process.env.TOSS_VA_VALID_HOURS ?? 72),
        ...(ctx.customerPhone ? { customerMobilePhone: ctx.customerPhone.replace(/\D/g, '') } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      secret?: string | null;
      virtualAccount?: {
        accountNumber: string;
        bankCode?: string;
        bank?: string;
        dueDate?: string;
      };
    };
    if (!res.ok || !body.virtualAccount) {
      this.logger.error(`[토스 가상계좌] 발급 실패 ${res.status} ${body.message ?? ''}`);
      throw new BadGatewayException(`가상계좌 발급 실패: ${body.message ?? res.status}`);
    }
    const va = body.virtualAccount;
    const code = va.bankCode ?? va.bank ?? '';
    return {
      provider: 'TOSS',
      bank: TOSS_BANKS[code] ?? code,
      account: va.accountNumber,
      holder: HOLDER,
      pgRef: orderId,
      secret: body.secret ?? null,
      // 토스 dueDate는 한국 시각(오프셋 없음)
      dueAt: va.dueDate ? new Date(`${va.dueDate}+09:00`) : null,
    };
  }

  /** 회사 고정 계좌 — DEPOSIT_ACCOUNT="국민 123456-01-234567" */
  private manualAccount(orderId: string): IssuedAccount {
    const fixed = (process.env.DEPOSIT_ACCOUNT ?? '').trim();
    const [bank, ...rest] = fixed.split(/\s+/);
    return {
      provider: 'MANUAL',
      bank: fixed ? bank : '시연은행',
      account: fixed
        ? rest.join(' ')
        : `${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}-01-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
      holder: HOLDER,
      pgRef: orderId,
      secret: null,
      dueAt: null,
    };
  }
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
