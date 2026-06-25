import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class MaterialOrderLineInput {
  @IsUUID()
  materialId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

/** MM-02: 가맹점 발주 생성 — 발주 지점 + 자재 라인(최소 1건). */
export class CreateMaterialOrderDto {
  @IsUUID()
  orgUnitId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MaterialOrderLineInput)
  lines!: MaterialOrderLineInput[];
}
