import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  HR_CALC_TYPES,
  HR_METRICS,
  HR_POLICY_KINDS,
  HR_TARGET_TYPES,
  type HrCalcType,
  type HrMetric,
  type HrPolicyKind,
  type HrTargetType,
} from '@tongin/shared';

export class CreatePolicyDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(HR_POLICY_KINDS)
  kind?: HrPolicyKind;

  @IsIn(HR_TARGET_TYPES)
  targetType!: HrTargetType;

  @IsIn(HR_METRICS)
  metric!: HrMetric;

  @IsIn(HR_CALC_TYPES)
  calcType!: HrCalcType;

  @IsNumber({ maxDecimalPlaces: 4 })
  value!: number; // rate(0.015) 또는 단위당 정액(30000)

  @IsOptional()
  @IsUUID()
  orgScopeId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;
}
