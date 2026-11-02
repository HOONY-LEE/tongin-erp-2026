import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  FORM_FIELD_TYPES,
  SUBSTITUTE_MODES,
  isApprovalLineKey,
  type FormFieldType,
  type SubstituteMode,
  type ApprovalLineKey,
  type ApprovalResolver,
  type ApprovalStepKind,
} from '@tongin/shared';

const KINDS = ['APPROVER', 'CC'] as const;

@ValidatorConstraint({ name: 'lineKey' })
class IsLineKey implements ValidatorConstraintInterface {
  validate(v: unknown) {
    return typeof v === 'string' && isApprovalLineKey(v);
  }
  defaultMessage() {
    return "docType은 LEAVE | ATTENDANCE_FIX | GENERAL | 'FORM:<양식 id>' 중 하나여야 합니다.";
  }
}
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
  /** 문서 종류(LEAVE·ATTENDANCE_FIX·GENERAL) 또는 결재 양식 'FORM:<양식 id>' */
  @IsString()
  @Validate(IsLineKey)
  docType!: ApprovalLineKey;

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

/** 결재 양식 항목 — 서비스에서 종류·선택지·id를 다시 확인한다 */
export class FormFieldDto {
  @IsString()
  @MaxLength(30)
  id!: string;

  @IsString()
  @MaxLength(50)
  label!: string;

  @IsIn(FORM_FIELD_TYPES)
  type!: FormFieldType;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  help?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  placeholder?: string;
}

export class LeaveFormSettingsDto {
  @IsOptional()
  @IsIn(SUBSTITUTE_MODES)
  substitute?: SubstituteMode;

  @IsOptional()
  @IsBoolean()
  reasonRequired?: boolean;
}

/** 결재 양식을 누가 고를 수 있나 */
export class FormAudienceDto {
  @IsIn(['ALL', 'SOME'])
  mode!: 'ALL' | 'SOME';

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  orgIds!: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  employeeIds!: string[];
}

export class SaveApprovalFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => LeaveFormSettingsDto)
  settings?: LeaveFormSettingsDto;

  /** 결재 양식(CUSTOM) — 고를 수 있는 사람 */
  @IsOptional()
  @ValidateNested()
  @Type(() => FormAudienceDto)
  audience?: FormAudienceDto;

  /** 이 양식의 기본 결재선(전사) — 빈 배열이면 지운다(일반 품의 결재선을 쓴다), 안 보내면 그대로 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalLineRuleDto)
  line?: ApprovalLineRuleDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

/** 첨부파일 올리기 — 내용은 base64(JSON 본문 한도 30MB 안에서, 한 개 최대 10MB) */
export class UploadAttachmentDto {
  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @MaxLength(150)
  mediaType!: string;

  @IsString()
  @MaxLength(14_000_000)
  data!: string;
}

/** 결재 양식 상신 — 값은 서비스가 항목 정의대로 확인한다 */
export class SubmitFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalLineEntryDto)
  line?: ApprovalLineEntryDto[];
}
