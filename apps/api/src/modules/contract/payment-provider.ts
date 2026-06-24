import { Injectable } from '@nestjs/common';

/**
 * 결제 게이트웨이 추상화. 운영은 토스페이먼츠 어댑터로 교체.
 * 지금은 스텁 — 가상계좌를 모사 발급하고, 입금통보(웹훅)는 /payments/:id/confirm 수동 호출로 대체.
 */
export interface PaymentProvider {
  issueVirtualAccount(amount: number): Promise<{ bank: string; account: string; pgRef: string }>;
}

@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  async issueVirtualAccount(_amount: number) {
    const rand = String(Math.floor(Math.random() * 1_000_000_000)).padStart(10, '0');
    return { bank: '가상은행', account: `VA${rand}`, pgRef: `stub_${rand}` };
  }
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
