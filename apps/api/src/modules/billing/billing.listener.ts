import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BillingService } from './billing.service';
import type { DomainEventBundle } from '../../events/event-bus.service';

/**
 * SET-03: 계약 서명 → 기업이전(B2B) 청구서 자동 생성.
 * 이벤트로 붙여 두어 청구서 생성이 실패해도 계약 체결 자체는 영향을 받지 않는다.
 */
@Injectable()
export class BillingListener {
  private readonly logger = new Logger(BillingListener.name);

  constructor(private readonly billing: BillingService) {}

  @OnEvent('contract.signed')
  async onContractSigned(e: DomainEventBundle) {
    try {
      const invoice = await this.billing.createInvoiceFromContract(e.aggregateId);
      if (invoice) {
        this.logger.log(`B2B 청구서 자동 생성: ${invoice.invoiceNo} (계약 ${e.aggregateId})`);
      }
    } catch (err) {
      // 계약은 이미 체결됨 — 청구서는 본사에서 수동 발행할 수 있으므로 로그만 남긴다
      this.logger.error(`B2B 청구서 자동 생성 실패 (계약 ${e.aggregateId})`, err as Error);
    }
  }
}
