import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  PARTNER_CONTRACT_STATUSES,
  PARTNER_TYPES,
  type PartnerContractStatus,
  type PartnerType,
} from '@tongin/shared';
import { PhoneDigits } from '../../../common/phone';

/** 코드는 서버가 발급한다(PTN-0001) — 입력받지 않는다 */
export class CreatePartnerDto {
  @IsIn(PARTNER_TYPES)
  type!: PartnerType;

  @IsString()
  @MaxLength(200)
  name!: string;

  /** 담당자 연락처 — 외주 작업 배정 알림톡 수신처 */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @PhoneDigits()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** 제휴·전속 계약 상태 */
  @IsOptional()
  @IsIn([...PARTNER_CONTRACT_STATUSES, null])
  contractStatus?: PartnerContractStatus | null;

  /** 제휴·전속 내용(대상·혜택·할인·할증) */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  benefit?: string | null;

  /** 접수 방식 */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  intake?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string | null;
}

/** 제휴·전속 목록 한꺼번에 넣기 — 같은 유형에 같은 이름이 있으면 건너뛴다 */
export class ImportPartnerRowDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  benefit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  intake?: string;
}

export class ImportPartnersDto {
  @IsIn(['AFFILIATE', 'EXCLUSIVE'])
  type!: 'AFFILIATE' | 'EXCLUSIVE';

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportPartnerRowDto)
  rows!: ImportPartnerRowDto[];
}
