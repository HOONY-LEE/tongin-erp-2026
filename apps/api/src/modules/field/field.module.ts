import { Module } from '@nestjs/common';
import { FieldController } from './field.controller';
import { FieldService } from './field.service';
import { WorkOrderModule } from '../work-order/work-order.module';

/** 현장(태블릿·폰) 전용 조회 + 시작·완료. 상태 전이는 작업 모듈 로직을 그대로 쓴다. */
@Module({
  imports: [WorkOrderModule],
  controllers: [FieldController],
  providers: [FieldService],
})
export class FieldModule {}
