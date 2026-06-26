import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/** 카카오/다음 우편번호 + 좌표 단일 주소 (고객 등). 모든 필드 선택. */
export class SingleAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addr?: string; // 도로명주소

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addrDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sigungu?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

/** 이사 출발/도착 2주소 (리드·견적). 모든 필드 선택. */
export class MoveAddressDto {
  @IsOptional() @IsString() @MaxLength(10) fromZipcode?: string;
  @IsOptional() @IsString() @MaxLength(200) fromAddr?: string;
  @IsOptional() @IsString() @MaxLength(200) fromAddrDetail?: string;
  @IsOptional() @IsString() @MaxLength(40) fromSido?: string;
  @IsOptional() @IsString() @MaxLength(40) fromSigungu?: string;
  @IsOptional() @IsNumber() fromLat?: number;
  @IsOptional() @IsNumber() fromLng?: number;

  @IsOptional() @IsString() @MaxLength(10) toZipcode?: string;
  @IsOptional() @IsString() @MaxLength(200) toAddr?: string;
  @IsOptional() @IsString() @MaxLength(200) toAddrDetail?: string;
  @IsOptional() @IsString() @MaxLength(40) toSido?: string;
  @IsOptional() @IsString() @MaxLength(40) toSigungu?: string;
  @IsOptional() @IsNumber() toLat?: number;
  @IsOptional() @IsNumber() toLng?: number;
}
