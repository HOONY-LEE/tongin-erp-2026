import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateEmployeeDto {
  @IsUUID()
  orgUnitId!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  empNo?: string;

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
