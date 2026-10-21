import { IsDateString, IsIn, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateContractDto {
  @IsUUID()
  estimateId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount?: number; // 견적에 금액이 없으면 필수

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number; // 계약금 금액. 미지정 시 견적에서 정한 계약금 → 비율 순

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositRatio?: number; // 금액이 어디에도 없을 때만 쓰는 비율(기본 0.1)

  @IsOptional()
  @IsDateString()
  contractDate?: string;
}

export class CreatePaymentDto {
  @IsIn(['DEPOSIT', 'BALANCE'])
  kind!: 'DEPOSIT' | 'BALANCE';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number; // 미지정 시 계약금/잔금 기본값
}
