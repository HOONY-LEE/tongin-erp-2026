import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ACCESS_METHODS, VOLUME_UNITS, type AccessMethod, type VolumeUnit } from '@tongin/shared';
import { MoveAddressDto } from '../../../common/dto/address-fields.dto';

/**
 * 견적 상세 화면은 4단계 탭(기본정보·물품정보·옵션선택·견적/계약서)으로 나뉘고,
 * 탭마다 한 번에 저장한다. 아래 DTO가 각 탭의 저장 단위다.
 */

/** 1. 기본정보 — 이사종류·주소·상담일·이사일. 주소·날짜는 접수(lead)에도 같이 반영된다. */
export class SaveBasicDto extends MoveAddressDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsDateString()
  visitDate?: string; // 상담일(방문견적일)

  @IsOptional()
  @IsDateString()
  moveDate?: string; // 이사일
}

export class ItemLineInput {
  /** 이사물품 사전의 물품(직접 적은 물품이면 생략) */
  @IsOptional()
  @IsUUID()
  cbmItemId?: string;

  @IsString()
  @MaxLength(100)
  itemName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemNameEng?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cbm?: number;

  /** 톤 견적일 때 무게 */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ton?: number;

  /** 처리방법 코드(handling_method) — 서버가 있는 값인지 확인한다 */
  @IsString()
  @MaxLength(40)
  handling!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class ItemRoomInput {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  roomKey?: string; // 기본 방 틀 키. 직접 만든 방은 생략

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ItemLineInput)
  lines!: ItemLineInput[];
}

/** 2. 물품정보 — 방·물품 전체를 한 번에 바꿔 저장한다. */
export class SaveItemsDto {
  /** 이사물량을 CBM으로 견적하나 톤으로 견적하나 */
  @IsOptional()
  @IsIn(VOLUME_UNITS)
  volumeUnit?: VolumeUnit;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ItemRoomInput)
  rooms!: ItemRoomInput[];
}

export class OptionInput {
  @IsUUID()
  addonServiceId!: string; // 상품관리 '옵션' 카탈로그 행

  @IsOptional()
  @IsString()
  @MaxLength(40)
  variant?: string;

  @IsOptional()
  @IsDateString()
  serviceDate?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

/** 3. 옵션선택 — 작업조건(전/후) + 고른 옵션 전체를 한 번에 저장한다. */
export class SaveOptionsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  fromPyeong?: number;

  @IsOptional()
  @IsIn(ACCESS_METHODS)
  fromAccess?: AccessMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromAccessNote?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  toPyeong?: number;

  @IsOptional()
  @IsIn(ACCESS_METHODS)
  toAccess?: AccessMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  toAccessNote?: string;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => OptionInput)
  options!: OptionInput[];
}
