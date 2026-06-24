import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateEstimateDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromAddr?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fromPyeong?: number;

  @IsOptional()
  @IsBoolean()
  fromElevator?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  toAddr?: string;

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
