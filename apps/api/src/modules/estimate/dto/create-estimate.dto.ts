import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { MoveAddressDto } from '../../../common/dto/address-fields.dto';

export class CreateEstimateDto extends MoveAddressDto {
  @IsUUID()
  leadId!: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  orgUnitId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  estimatorEmpId?: string;

  // 출발/도착 주소(우편번호·도로명·상세·시도/시군구·좌표)는 MoveAddressDto에서 상속

  @IsOptional()
  @IsInt()
  @Min(0)
  fromPyeong?: number;

  @IsOptional()
  @IsBoolean()
  fromElevator?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  toPyeong?: number;

  @IsOptional()
  @IsBoolean()
  toElevator?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  workInstructions?: string;

  @IsOptional()
  baseAmount?: number;

  @IsOptional()
  totalAmount?: number;
}
