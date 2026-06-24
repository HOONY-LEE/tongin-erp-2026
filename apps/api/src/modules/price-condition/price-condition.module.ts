import { Module } from '@nestjs/common';
import { PriceConditionController } from './price-condition.controller';
import { PriceConditionService } from './price-condition.service';

@Module({
  controllers: [PriceConditionController],
  providers: [PriceConditionService],
})
export class PriceConditionModule {}
