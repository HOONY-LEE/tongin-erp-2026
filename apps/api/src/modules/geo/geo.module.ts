import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

@Module({
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService], // 견적이 거리 계산에 쓴다
})
export class GeoModule {}
