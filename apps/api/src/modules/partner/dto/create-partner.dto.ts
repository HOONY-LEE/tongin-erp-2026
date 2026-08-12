import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PARTNER_TYPES, type PartnerType } from '@tongin/shared';

export class CreatePartnerDto {
  @IsIn(PARTNER_TYPES)
  type!: PartnerType;

  @IsString()
  @MaxLength(50)
  code!: string;

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
