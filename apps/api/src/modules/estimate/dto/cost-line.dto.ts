import { IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** EST-03: 견적 재료비 라인 생성 — 자재(Material) 참조 + 소요 수량/단가. */
export class CreateCostLineDto {
  @IsUUID()
  materialId!: string;

  @IsInt()
  @Min(1)
  qty!: number; // 자재 소요 수량(정수 — 재고 수불과 일치)

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number; // 단가(미입력 시 0)

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}
