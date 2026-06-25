import { Module } from '@nestjs/common';
import { MaterialOrderController } from './material-order.controller';
import { MaterialOrderService } from './material-order.service';

@Module({
  controllers: [MaterialOrderController],
  providers: [MaterialOrderService],
})
export class MaterialOrderModule {}
