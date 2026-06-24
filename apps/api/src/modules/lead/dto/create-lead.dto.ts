import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SERVICE_LINES, type ServiceLine } from '@tongin/shared';

export class CreateLeadDto {
  @IsUUID()
  orgUnitId!: string; // 담당 지점(필수)

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  ownerEmpId?: string;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string; // common_code: RECEIPT_PATH

  @IsOptional()
  @IsIn(SERVICE_LINES)
  serviceLine?: ServiceLine;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  fromZipcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromAddr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  toZipcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  toAddr?: string;

  @IsOptional()
  @IsDateString()
  moveDate?: string;

  @IsOptional()
  @IsDateString()
  visitDate?: string;
}
