import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { GeoService } from './geo.service';

class GeocodeDto {
  @IsString()
  @MaxLength(200)
  query!: string; // 도로명주소
}

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  /** 도로명주소 → 좌표/시도·시군구 (카카오 키 없으면 available:false). 인증 필요, 별도 권한 없음. */
  @Post('geocode')
  geocode(@Body() dto: GeocodeDto) {
    return this.geo.geocode(dto.query);
  }
}
