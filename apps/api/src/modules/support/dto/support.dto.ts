import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** AS-01: CS·AS 티켓 생성. */
export class CreateTicketDto {
  @IsIn(['CS', 'AS'])
  kind!: 'CS' | 'AS';

  @IsUUID()
  orgUnitId!: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsIn(['PHONE', 'EMAIL', 'KAKAO', 'VISIT'])
  channel?: string;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsUUID()
  assigneeEmpId?: string;
}

export class UpdateTicketDto extends PartialType(CreateTicketDto) {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}
