import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SERVICE_LINES, type ServiceLine } from '@tongin/shared';
import { MoveAddressDto } from '../../../common/dto/address-fields.dto';

export class CreateLeadDto extends MoveAddressDto {
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

  // 출발/도착 주소(우편번호·도로명·상세·시도/시군구·좌표)는 MoveAddressDto에서 상속

  @IsOptional()
  @IsDateString()
  moveDate?: string;

  @IsOptional()
  @IsDateString()
  visitDate?: string;
}
