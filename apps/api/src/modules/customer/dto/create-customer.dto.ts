import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SingleAddressDto } from '../../../common/dto/address-fields.dto';
import { PhoneDigits } from '../../../common/phone';

export class CreateCustomerDto extends SingleAddressDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @PhoneDigits()
  phonePrimary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @IsOptional()
  @IsUUID()
  ownerOrgId?: string;
}
