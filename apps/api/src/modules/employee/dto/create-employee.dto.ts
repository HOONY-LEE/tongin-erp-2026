import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EMPLOYMENT_TYPES, type EmploymentType } from '@tongin/shared';

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

  // ── 인사기록(모두 선택, 비우려면 null) ──

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  birthDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail({}, { message: '이메일 형식이 아닙니다' })
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipcode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addrDetail?: string | null;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyRelation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string | null;
}

/** 겸직(추가 소속) 더하기 */
export class AddConcurrentOrgDto {
  @IsUUID()
  orgUnitId!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  positionId?: string | null;
}

export class ResignEmployeeDto {
  @IsDateString()
  resignDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ChecklistToggleDto {
  @IsBoolean()
  done!: boolean;
}

export class ChecklistTemplateDto {
  @IsIn(['ONBOARD', 'OFFBOARD'])
  kind!: 'ONBOARD' | 'OFFBOARD';

  @IsString()
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
