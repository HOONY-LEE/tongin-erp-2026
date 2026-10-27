import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATA_SCOPES, type DataScope } from '@tongin/shared';
import { RoleAssignmentDto } from '../../access/dto/access.dto';

/** 아이디 규칙 — 영문·숫자·. _ - 만, 3~50자 */
export const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;

/** 계정과 함께 만드는(또는 고치는) 직원 정보 — 계정 = 직원 */
export class AccountEmployeeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsUUID()
  orgUnitId!: string;

  /** 직책 — 비우려면 null */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  positionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** 사번 — 비우면 입사연도+일련번호로 자동 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  empNo?: string;

  /** 입사일(YYYY-MM-DD) */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  hireDate?: string | null;
}

export class CreateAccountDto {
  @IsString()
  @Matches(LOGIN_ID_PATTERN, { message: '아이디는 영문·숫자·. _ - 로 3~50자입니다.' })
  loginId!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  /** 권한 그룹 여러 개 + 그룹별 데이터 범위 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles?: RoleAssignmentDto[];

  /** (예전 화면) 권한 그룹 하나 */
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  orgScopeId?: string; // 데이터범위가 ORG일 때 대상 조직

  @IsOptional()
  @IsIn(DATA_SCOPES)
  dataScope?: DataScope; // OWN | ORG | ALL (기본 OWN)

  /** 새 직원 정보 — 계정을 만들 때 직원도 같이 등록한다 */
  @IsOptional()
  @ValidateNested()
  @Type(() => AccountEmployeeDto)
  employee?: AccountEmployeeDto;

  @IsOptional()
  @IsUUID()
  employeeId?: string; // (예전 화면) 이미 있는 직원 연결
}

export class UpdateAccountDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetAccountRolesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles!: RoleAssignmentDto[];
}

export class SetAccountEmployeeDto {
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  employeeId!: string | null;
}

export class CheckLoginIdDto {
  @IsString()
  @MaxLength(50)
  loginId!: string;
}
