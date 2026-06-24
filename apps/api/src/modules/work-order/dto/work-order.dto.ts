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

export class CreateWorkOrderDto {
  @IsUUID()
  contractId!: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsUUID()
  partnerId?: string; // 전속 외주 시

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  billedCost?: number; // 전속 청구비용(원가)
}

export class CreateAssignmentDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsIn(['CREW', 'VEHICLE'])
  resourceType!: 'CREW' | 'VEHICLE';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceRef?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
