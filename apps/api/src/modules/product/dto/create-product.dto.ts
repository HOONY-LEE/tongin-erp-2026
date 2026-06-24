import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  PRICING_METHODS,
  SERVICE_LINES,
  type PricingMethod,
  type ServiceLine,
} from '@tongin/shared';

export class CreateProductDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsIn(SERVICE_LINES)
  serviceLine!: ServiceLine;

  @IsIn(PRICING_METHODS)
  pricingMethod!: PricingMethod;

  @IsOptional()
  @IsUUID()
  brandOrgId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
