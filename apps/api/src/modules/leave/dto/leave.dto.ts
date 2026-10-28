import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
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

  /** + 더하기 / - 빼기, 0.5 단위 */
  @IsNumber({ maxDecimalPlaces: 1 })
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

  @IsIn([1, 0.5])
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
  @IsIn([1, 0.5])
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
