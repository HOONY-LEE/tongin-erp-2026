import { Module } from '@nestjs/common';
import { WorkOrderController } from './work-order.controller';
import { WorkOrderService } from './work-order.service';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [LeadModule], // 작업 단계마다 리드 상태 전이
  controllers: [WorkOrderController],
  providers: [WorkOrderService],
})
export class WorkOrderModule {}
