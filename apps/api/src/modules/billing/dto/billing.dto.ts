import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** SET-03: 거래처(전속/B2B) 청구서 생성. */
export class CreateInvoiceDto {
  @IsUUID()
  partnerId!: string;

  /** 담당 지점(실적 귀속). 발행은 본사만 하고, 지점은 본인 담당 건을 조회한다. */
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

/** 청구서 수금 기록. */
export class CreateReceiptDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsIn(['TRANSFER', 'CASH', 'CARD'])
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

/** 작업오더 전속원가(billedCost) 입력 — 마진 추적용. */
export class SetOutsourceCostDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  billedCost!: number;
}
