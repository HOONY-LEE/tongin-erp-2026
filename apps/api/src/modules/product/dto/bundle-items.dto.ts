import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { BUNDLE_ROLES, type BundleRole } from '@tongin/shared';

export class BundleItemInput {
  @IsUUID()
  addonServiceId!: string;

  @IsIn(BUNDLE_ROLES)
  role!: BundleRole;

  /** 이 구성에서의 단가(비우면 상품 기본가). 이사물량이면 CBM·톤당 단가 */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceOverride?: number | null;
}

/** 상품 구성 전체를 이 순서로 바꾼다 */
export class SetBundleItemsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BundleItemInput)
  items!: BundleItemInput[];
}
