import { Module } from '@nestjs/common';
import { EstimateController } from './estimate.controller';
import { EstimateService } from './estimate.service';
import { EstimateB2bService } from './estimate-b2b.service';
import { LeadModule } from '../lead/lead.module';
import { MoveCatalogModule } from '../move-catalog/move-catalog.module';
import { GeoModule } from '../geo/geo.module';

@Module({
  imports: [LeadModule, MoveCatalogModule, GeoModule], // 견적 확정 시 리드 상태 전이 · 이사물량 카탈로그
  controllers: [EstimateController],
  providers: [EstimateService, EstimateB2bService],
  exports: [EstimateService], // 계약 모듈이 참조
})
export class EstimateModule {}
