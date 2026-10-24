import { Module } from '@nestjs/common';
import { FieldController } from './field.controller';
import { FieldService } from './field.service';
import { WorkPhotoController } from './work-photo.controller';
import { WorkPhotoService } from './work-photo.service';
import { WorkOrderModule } from '../work-order/work-order.module';

/** 현장(태블릿·폰) 전용 조회 + 시작·완료 + 작업 사진. 상태 전이는 작업 모듈 로직을 그대로 쓴다. */
@Module({
  imports: [WorkOrderModule],
  controllers: [FieldController, WorkPhotoController],
  providers: [FieldService, WorkPhotoService],
})
export class FieldModule {}
