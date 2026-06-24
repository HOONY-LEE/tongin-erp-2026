import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DISCOUNT_TYPES, type DiscountType } from '@tongin/shared';

export class CreatePriceConditionDto {
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsIn(DISCOUNT_TYPES)
  discountType!: DiscountType;

  @IsNumber({ maxDecimalPlaces: 2 })
  discountValue!: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
