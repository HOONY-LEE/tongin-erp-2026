import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  APPROVAL_DOC_TYPES,
  type ApprovalDocType,
  type ApprovalResolver,
  type ApprovalStepKind,
} from '@tongin/shared';

const KINDS = ['APPROVER', 'CC'] as const;
const RESOLVERS = ['DEPT_HEAD', 'ORG_HEAD', 'EMPLOYEE'] as const;

/** 상신 때 사람으로 정해진 결재선 한 단계 */
export class ApprovalLineEntryDto {
  @IsIn(KINDS)
  kind!: ApprovalStepKind;

  @IsUUID()
  employeeId!: string;
}

/** 기본 결재선(템플릿)의 규칙 한 단계 */
export class ApprovalLineRuleDto {
  @IsIn(KINDS)
  kind!: ApprovalStepKind;

  @IsIn(RESOLVERS)
  resolver!: ApprovalResolver;

  @IsOptional()
  @IsUUID()
  orgUnitId?: string | null;

  @IsOptional()
  @IsUUID()
  employeeId?: string | null;
}

export class SaveLineTemplateDto {
  @IsIn(APPROVAL_DOC_TYPES)
  docType!: ApprovalDocType;

  /** 비우면 전사 기본 */
  @IsOptional()
  @IsUUID()
  orgUnitId?: string | null;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalLineRuleDto)
  steps!: ApprovalLineRuleDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** 일반 품의 상신 */
export class SubmitGeneralDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  /** 비우면 기본 결재선 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalLineEntryDto)
  line?: ApprovalLineEntryDto[];
}

export class ActApprovalDto {
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
