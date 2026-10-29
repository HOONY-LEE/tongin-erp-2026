import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LEAVE_SLOTS, type LeaveSlot } from '@tongin/shared';
import { ApprovalLineEntryDto } from '../../approval/dto/approval-line.dto';

export class RequestLeaveDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsDateString()
  startDate!: string;

  /** 반차는 비워도 된다(시작일 하루) */
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** 반차 AM·PM, 반반차 Q1~Q4 */
  @IsOptional()
  @IsIn(LEAVE_SLOTS)
  slot?: LeaveSlot;

  /** 업무 대리인(직원) */
  @IsOptional()
  @IsUUID()
  substituteEmpId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  handover?: string;

  /** 휴가 신청서에 관리자가 더한 항목 값 */
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;

  /** 비우면 기본 결재선 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalLineEntryDto)
  line?: ApprovalLineEntryDto[];
}

export class AdjustLeaveDto {
  @IsUUID()
  employeeId!: string;

  /** + 더하기 / - 빼기, 0.25 단위 */
  @IsNumber({ maxDecimalPlaces: 2 })
  days!: number;

  @IsString()
  @MaxLength(200)
  reason!: string;

  /** 어느 연차 기간에 넣을지(그 날짜가 속한 기간). 비우면 오늘 */
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}

export class CreateLeaveTypeDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,30}$/, { message: '코드는 영문 대문자·숫자·_ 로 2~31자' })
  code!: string;

  @IsString()
  @MaxLength(50)
  name!: string;

  @IsIn([1, 0.5, 0.25])
  unitDays!: number;

  @IsBoolean()
  deducts!: boolean;

  @IsBoolean()
  paid!: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsIn([1, 0.5, 0.25])
  unitDays?: number;

  @IsOptional()
  @IsBoolean()
  deducts?: boolean;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** 연차 일괄 부여·차감 — 직원 여럿 또는 조직(하위 포함) 전체 */
export class BulkAdjustLeaveDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  orgUnitIds?: string[];

  /** + 부여 / - 차감, 0.25 단위 */
  @IsNumber({ maxDecimalPlaces: 2 })
  days!: number;

  @IsString()
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}
