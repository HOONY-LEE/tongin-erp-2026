import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { COMMISSION_CALC_TYPES, type CommissionCalcType } from '@tongin/shared';

/** SET-02: 수수료 규칙 생성. 차원(지점/서비스라인/출처)은 비우면 전체 적용. */
export class CreateCommissionRuleDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  serviceLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsIn(COMMISSION_CALC_TYPES)
  calcType!: CommissionCalcType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  rate?: number; // RATE일 때 필수(0~1)

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fixedAmount?: number; // FIXED일 때 필수

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCommissionRuleDto extends PartialType(CreateCommissionRuleDto) {}
