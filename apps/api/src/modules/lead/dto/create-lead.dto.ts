import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SERVICE_LINES, type ServiceLine } from '@tongin/shared';
import { MoveAddressDto } from '../../../common/dto/address-fields.dto';
import { PhoneDigits } from '../../../common/phone';

export class CreateLeadDto extends MoveAddressDto {
  @IsUUID()
  orgUnitId!: string; // 담당 지점(필수)

  @IsOptional()
  @IsUUID()
  customerId?: string; // 기존(재이용) 고객 선택 시

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string; // 신규 고객명(입력 시 고객 자동 생성·연결)

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @PhoneDigits()
  customerPhone?: string;

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

  /** 고객 요청사항(상담 중 받은 요청) */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerRequest?: string;

  /** 상품 특이사항 — 제휴·전속 상품의 혜택·조건. 비우면 고른 업체의 혜택·메모로 채운다 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  productNote?: string;

  /** 중복 접수를 이 접수로 대체 — 먼저 들어온 그 건은 '중복 접수'로 취소하고 이 접수가 가리킨다 */
  @IsOptional()
  @IsUUID()
  replaceLeadId?: string;
}
