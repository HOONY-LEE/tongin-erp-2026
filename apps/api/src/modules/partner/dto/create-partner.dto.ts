import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PARTNER_TYPES, type PartnerType } from '@tongin/shared';

/** 코드는 서버가 발급한다(PTN-0001) — 입력받지 않는다 */
export class CreatePartnerDto {
  @IsIn(PARTNER_TYPES)
  type!: PartnerType;

  @IsString()
  @MaxLength(200)
  name!: string;

  /** 담당자 연락처 — 전속 작업 배정 알림톡 수신처 */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
