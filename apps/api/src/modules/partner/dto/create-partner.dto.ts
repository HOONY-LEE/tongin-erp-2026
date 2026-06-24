import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PARTNER_TYPES, type PartnerType } from '@tongin/shared';

export class CreatePartnerDto {
  @IsIn(PARTNER_TYPES)
  type!: PartnerType;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
