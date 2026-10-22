import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PRICING_METHODS,
  SERVICE_LINES,
  type PricingMethod,
  type ServiceLine,
} from '@tongin/shared';

/** 상품 코드는 서버가 발급한다(PRD-0001) — 입력받지 않는다 */
export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string; // 가정이사/사무실이사/보관 등

  @IsIn(SERVICE_LINES)
  serviceLine!: ServiceLine;

  @IsIn(PRICING_METHODS)
  pricingMethod!: PricingMethod;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number; // 기본(디폴트) 가격

  @IsOptional()
  @IsUUID()
  brandOrgId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
