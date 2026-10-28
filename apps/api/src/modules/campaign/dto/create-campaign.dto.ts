import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  ValidateIf,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CAMPAIGN_CHANNELS, type CampaignChannel } from '@tongin/shared';

export class CampaignButtonInput {
  @IsString()
  @MaxLength(14)
  name!: string;

  @IsString()
  @MaxLength(300)
  url!: string;
}

/** 휴대폰·일반전화(하이픈 있어도 없어도) — 010-1234-5678, 01012345678, 02-123-4567 */
export const PHONE_PATTERN = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
const PHONE_MESSAGE = '전화번호 형식이 아닙니다(예: 010-1234-5678).';

/** 직접 입력한 받는 사람(대표님 등 시연 번호) */
export class ExtraRecipientInput {
  @IsString()
  @MaxLength(30)
  name!: string;

  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;
}

/** 시연 번호 등록 */
export class DemoNumberDto extends ExtraRecipientInput {}

/** 받을 직원 찾기 */
export class StaffQueryDto {
  @IsOptional() @IsString() @MaxLength(50) keyword?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) pageSize?: number;
}

/** 캠페인 작성·수정 — 작성 중(DRAFT)일 때만 바꿀 수 있다 */
export class CreateCampaignDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(CAMPAIGN_CHANNELS)
  channel?: CampaignChannel;

  /** 캠페인 기간(YYYY-MM-DD) — 빈 값·null은 기간 없음 */
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsDateString()
  periodStart?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsDateString()
  periodEnd?: string | null;

  @IsString()
  @MaxLength(2000)
  message!: string;

  /** 장문 제목 · 알림톡 강조 제목 */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isAd?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  optOutText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  templateCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CampaignButtonInput)
  buttons?: CampaignButtonInput[];

  @IsOptional()
  @IsBoolean()
  fallbackSms?: boolean;

  /** 고를 때 쓴 조건(기록용) */
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  /** 받는 고객 — 서버가 이름·번호를 원장에서 꺼내 남긴다 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20000)
  @IsUUID('all', { each: true })
  customerIds?: string[];

  /** 받는 직원 — 재직 중·번호 있는 직원만, 이름·번호는 직원 원장에서 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  /** 직접 입력한 받는 사람(시연 번호 등) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ExtraRecipientInput)
  extraRecipients?: ExtraRecipientInput[];

  /** 예약 발송 시각(비우면 즉시). 빈 값·null은 예약 해제 */
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsDateString()
  scheduledAt?: string | null;

  /** (예전 방식) 등급 일괄 대상 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetGrade?: string;
}
export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}

/** 받을 고객 찾기 */
export class AudienceQueryDto {
  @IsOptional() @IsString() @MaxLength(50) keyword?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sido?: string[];
  @IsOptional() @IsString() @MaxLength(50) addressKeyword?: string;
  @IsOptional() @IsDateString() moveDateFrom?: string;
  @IsOptional() @IsDateString() moveDateTo?: string;
  @IsOptional() @IsDateString() receivedFrom?: string;
  @IsOptional() @IsDateString() receivedTo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) leadStatuses?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) grades?: string[];
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsInt() @Min(0) excludeRecentDays?: number;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) pageSize?: number;
  /** 이 고객들 안에서만(최종 명단 보기·검색) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20000)
  @IsUUID('all', { each: true })
  ids?: string[];
}
