import { Module } from '@nestjs/common';
import { PaymentConfirmationController } from './payment-confirmation.controller';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { ContractModule } from '../contract/contract.module';

@Module({
  imports: [ContractModule], // ContractService 재사용(계약 생성·서명·결제·확인)
  controllers: [PaymentConfirmationController],
  providers: [PaymentConfirmationService],
})
export class PaymentConfirmationModule {}
