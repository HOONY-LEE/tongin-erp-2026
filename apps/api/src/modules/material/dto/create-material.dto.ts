import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** 코드는 서버가 발급한다(MAT-0001) — 입력받지 않는다 */
export class CreateMaterialDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string; // 박스/포장지/유니폼…

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string; // EA | SET | ROLL | BOX

  @IsOptional()
  @IsInt()
  @Min(0)
  safetyStock?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
