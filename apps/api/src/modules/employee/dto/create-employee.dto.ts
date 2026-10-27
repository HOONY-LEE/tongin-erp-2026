import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsUUID()
  orgUnitId!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  /** 사번 — 비우면 입사연도+일련번호로 자동(20260001) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  empNo?: string;

  /** 입사일(YYYY-MM-DD) — 비우려면 null */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  hireDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** 직책·직급(권한과 별개) — 비우려면 null */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  positionId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
