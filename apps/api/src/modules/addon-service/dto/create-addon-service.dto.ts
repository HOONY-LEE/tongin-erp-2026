import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ESTIMATE_OPTION_GROUPS, type EstimateOptionGroup } from '@tongin/shared';

/** 옵션 코드는 서버가 발급한다(OPT-0001) — 입력받지 않는다 */
export class CreateAddonServiceDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsIn(['EA', 'FLAT'])
  unit!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  /** 견적 3단계에서 어느 묶음에 보일지 */
  @IsOptional()
  @IsIn(ESTIMATE_OPTION_GROUPS)
  groupCode?: EstimateOptionGroup;

  /** 종류 — 쉼표로 구분한 이름("일반, 프리미엄"). 빈 문자열이면 종류 없음 */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  variantText?: string;

  @IsOptional()
  @IsBoolean()
  hasDate?: boolean;

  @IsOptional()
  @IsBoolean()
  hasNote?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
