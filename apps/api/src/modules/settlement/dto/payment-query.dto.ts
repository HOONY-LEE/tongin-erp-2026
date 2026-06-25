import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

/** SET-01: 입금 현황 조회 필터. */
export class PaymentQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'CANCELED'])
  status?: string;

  @IsOptional()
  @IsIn(['DEPOSIT', 'BALANCE'])
  kind?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  from?: string; // createdAt >= (ISO 날짜)

  @IsOptional()
  @IsDateString()
  to?: string; // createdAt <= (ISO 날짜)
}
