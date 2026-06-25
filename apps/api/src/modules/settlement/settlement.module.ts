import { Module } from '@nestjs/common';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { CommissionService } from './commission.service';

@Module({
  controllers: [SettlementController],
  providers: [SettlementService, CommissionService],
})
export class SettlementModule {}
