import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { HANDLING_BUCKETS, type HandlingBucket } from '@tongin/shared';

/** 방 틀 — 코드는 서버 발급(ROOM-0001) */
export class CreateRoomTemplateDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nameEng?: string;

  /** 견적표 '기타' 칸 수 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  extraSlots?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateRoomTemplateDto extends PartialType(CreateRoomTemplateDto) {}

/** 방 틀의 물품 목록 전체를 이 순서로 바꾼다 */
export class SetRoomItemsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  itemIds!: string[];
}

/** 처리방법 — 코드는 서버 발급(HDL-0001). bucket = 물량 집계 칸 */
export class CreateHandlingMethodDto {
  @IsString()
  @MaxLength(30)
  name!: string;

  @IsIn(HANDLING_BUCKETS)
  bucket!: HandlingBucket;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateHandlingMethodDto extends PartialType(CreateHandlingMethodDto) {}
