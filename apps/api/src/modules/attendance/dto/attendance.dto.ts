import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApprovalLineEntryDto } from '../../approval/dto/approval-line.dto';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMM_MSG = { message: '시각은 HH:MM 형식이어야 합니다' };

export class ClockDto {
  @IsIn(['IN', 'OUT'])
  type!: 'IN' | 'OUT';
}

export class WorkSettingsDto {
  @Matches(HHMM, HHMM_MSG)
  workStart!: string;

  @Matches(HHMM, HHMM_MSG)
  workEnd!: string;

  @Matches(HHMM, HHMM_MSG)
  halfSplit!: string;

  @IsInt()
  @Min(0)
  @Max(120)
  lateGraceMin!: number;

  /** 근태 집계 시작일 — 비우면 첫 기록 날짜 */
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: '집계 시작일은 YYYY-MM-DD 형식입니다' })
  trackFrom!: string;
}

export class FixRecordDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  workDate!: string;

  @IsOptional()
  @Matches(HHMM, HHMM_MSG)
  clockIn?: string | null;

  @IsOptional()
  @Matches(HHMM, HHMM_MSG)
  clockOut?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class FixRequestDto {
  @IsDateString()
  workDate!: string;

  @IsOptional()
  @Matches(HHMM, HHMM_MSG)
  clockIn?: string | null;

  @IsOptional()
  @Matches(HHMM, HHMM_MSG)
  clockOut?: string | null;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalLineEntryDto)
  line?: ApprovalLineEntryDto[];
}

export class ImportFileDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  /** 파일 내용(base64) — 근태 엑셀은 수백 KB 수준 */
  @IsString()
  @MaxLength(15_000_000)
  dataBase64!: string;
}

export class ImportRowDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  workDate!: string;

  @IsOptional()
  @Matches(HHMM, HHMM_MSG)
  clockIn?: string | null;

  @IsOptional()
  @Matches(HHMM, HHMM_MSG)
  clockOut?: string | null;
}

export class ImportCommitDto {
  @IsArray()
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}
