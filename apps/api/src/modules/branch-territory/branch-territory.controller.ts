import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { BranchTerritoryService } from './branch-territory.service';

class TerritoryItemDto {
  @IsString() @MaxLength(10) sido!: string;
  @IsString() @MaxLength(40) sigungu!: string;
  @IsOptional() @IsUUID() orgUnitId?: string | null;
}
class SaveTerritoryDto {
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => TerritoryItemDto)
  items!: TerritoryItemDto[];
}
class ResolveQuery {
  @IsOptional() @IsString() @MaxLength(10) sido?: string;
  @IsOptional() @IsString() @MaxLength(40) sigungu?: string;
}

/** 지점 담당 영역 — 지점 관리 > 담당 영역(지도) */
@Controller('branch-territories')
export class BranchTerritoryController {
  constructor(private readonly service: BranchTerritoryService) {}

  @Get()
  @RequirePermissions('ORG_UNIT.READ')
  list() {
    return this.service.list();
  }

  @Put()
  @RequirePermissions('ORG_UNIT.UPDATE')
  save(@Body() dto: SaveTerritoryDto) {
    return this.service.save(
      dto.items.map((x) => ({ sido: x.sido, sigungu: x.sigungu, orgUnitId: x.orgUnitId ?? null })),
    );
  }

  /** 출발지 주소 → 담당 지점(상담 콘솔 마감 달력이 자동으로 고른다) */
  @Get('resolve')
  @RequirePermissions('LEAD.READ')
  async resolve(@Query() q: ResolveQuery) {
    // 못 찾으면 빈 값(본문 없는 응답 대신)
    return (await this.service.resolve(q.sido, q.sigungu)) ?? { orgUnitId: null, orgName: null };
  }
}
