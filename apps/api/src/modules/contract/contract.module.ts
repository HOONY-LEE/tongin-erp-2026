import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { PaymentController } from './payment.controller';
import { ContractService } from './contract.service';
import { StubPaymentProvider } from './payment-provider';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [LeadModule], // 계약 생성 시 리드 CONTRACTED 전이
  controllers: [ContractController, PaymentController],
  providers: [ContractService, StubPaymentProvider],
  exports: [ContractService], // 작업 모듈이 참조
})
export class ContractModule {}
