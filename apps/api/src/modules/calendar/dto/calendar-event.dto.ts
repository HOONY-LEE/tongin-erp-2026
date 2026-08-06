import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** CAL-01: 자체 캘린더 일정 생성. */
export class CreateCalendarEventDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** YYYY-MM-DD */
  @IsDateString()
  date!: string;

  @IsOptional()
  @Matches(HHMM, { message: 'startTime은 HH:mm 형식이어야 합니다.' })
  startTime?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'endTime은 HH:mm 형식이어야 합니다.' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  /** PRIVATE=본인만, ORG=소속 조직 공유 */
  @IsOptional()
  @IsIn(['PRIVATE', 'ORG'])
  visibility?: 'PRIVATE' | 'ORG';

  /** visibility=ORG일 때 공유 대상 조직(미지정 시 본인 소속 조직) */
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;
}

export class UpdateCalendarEventDto extends PartialType(CreateCalendarEventDto) {}

/** 캘린더 조회 필터: 기간 + 범위(내 일정 / 조직 전체). */
export class CalendarQueryDto {
  /** 조회 시작일 YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** 조회 종료일 YYYY-MM-DD (포함) */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** MINE=내 일정만, ORG=소속 조직 전체(내 개인 일정 포함) */
  @IsOptional()
  @IsIn(['MINE', 'ORG'])
  scope?: 'MINE' | 'ORG';

  /** 특정 조직으로 좁히기(관리자가 지점 선택) */
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  /** 작업오더(이사 일정)를 함께 내려줄지 — 기본 true */
  @IsOptional()
  @IsBoolean()
  includeWorkOrders?: boolean;
}
