import { PartialType } from '@nestjs/mapped-types';
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
import {
  BRANCH_CASE_KIND,
  BRANCH_CASE_STATUS,
  type BranchCaseKind,
  type BranchCaseStatus,
} from '@tongin/shared';

export class CreateBranchCaseDto {
  @IsUUID()
  branchId!: string;

  @IsIn(BRANCH_CASE_KIND)
  kind!: BranchCaseKind;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string | null;

  @IsOptional()
  @IsIn(BRANCH_CASE_STATUS)
  status?: BranchCaseStatus;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  assigneeEmpId?: string | null;

  /** 보험금·합의금·위약금 등 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;
}

export class UpdateBranchCaseDto extends PartialType(CreateBranchCaseDto) {}
