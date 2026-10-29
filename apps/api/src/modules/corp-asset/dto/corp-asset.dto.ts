import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ASSET_AMOUNT_UNIT,
  ASSET_KIND,
  type AssetAmountUnit,
  type AssetKind,
} from '@tongin/shared';

export class CreateCorpAssetDto {
  @IsIn(ASSET_KIND)
  kind!: AssetKind;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  counterparty?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  refNo?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @IsIn(ASSET_AMOUNT_UNIT)
  amountUnit?: AssetAmountUnit | null;

  @IsOptional()
  @IsUUID()
  managerEmpId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  memo?: string | null;
}

export class UpdateCorpAssetDto extends PartialType(CreateCorpAssetDto) {}
