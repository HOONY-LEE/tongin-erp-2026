import { Module } from '@nestjs/common';
import { EstimateController } from './estimate.controller';
import { EstimateService } from './estimate.service';
import { EstimateB2bService } from './estimate-b2b.service';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [LeadModule], // 견적 확정 시 리드 상태 전이
  controllers: [EstimateController],
  providers: [EstimateService, EstimateB2bService],
  exports: [EstimateService], // 계약 모듈이 참조
})
export class EstimateModule {}
