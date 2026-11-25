import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PhoneDigits } from '../../../common/phone';

/**
 * CS·AS 접수 — 반드시 고객에 잇는다(고르거나, 이름·전화로 찾아 잇거나 새로 만든다).
 * 담당 지점은 따로 받지 않는다 — 관련 접수(견적건)·고객의 지점을 따른다.
 */
export class CreateTicketDto {
  @IsOptional()
  @IsIn(['CS', 'AS'])
  kind?: 'CS' | 'AS';

  /** 접수 유형(공통 코드 AS_CATEGORY) */
  @IsString()
  @MaxLength(50)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  /** 고객 — 없으면 customerName·customerPhone으로 찾거나 만든다 */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @PhoneDigits()
  @IsString()
  customerPhone?: string;

  /** 관련 접수(견적건) — 같은 고객의 접수만 */
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsIn(['PHONE', 'EMAIL', 'KAKAO', 'VISIT'])
  channel?: string;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  priority?: string;

  @IsOptional()
  @IsUUID()
  assigneeEmpId?: string;
}

export class UpdateTicketDto extends PartialType(CreateTicketDto) {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}

/** A/S 접수 유형 — 추가 */
export class CreateAsCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;
}

/** A/S 접수 유형 — 고치기(이름·순서·사용 여부) */
export class UpdateAsCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
