import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { HANDLING, type Handling } from '@tongin/shared';

export class CreateZoneDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateLineDto {
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  cbmItemId?: string; // 있으면 품목사전에서 단위CBM·명칭 채움

  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemName?: string; // cbmItemId 없으면 필수

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cbm?: number; // cbmItemId 없을 때 수동 라인 CBM

  @IsOptional()
  @IsIn(HANDLING)
  handling?: Handling;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}
