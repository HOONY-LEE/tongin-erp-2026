import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingListener } from './billing.listener';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingListener],
})
export class BillingModule {}
