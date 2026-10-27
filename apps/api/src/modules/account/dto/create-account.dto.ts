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
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATA_SCOPES, type DataScope } from '@tongin/shared';
import { RoleAssignmentDto } from '../../access/dto/access.dto';

export class CreateAccountDto {
  @IsString()
  @MaxLength(50)
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

  @IsOptional()
  @IsUUID()
  employeeId?: string; // 직원 계정 연결(선택)
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
