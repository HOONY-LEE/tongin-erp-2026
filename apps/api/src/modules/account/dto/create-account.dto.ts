import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { DATA_SCOPES, type DataScope } from '@tongin/shared';

export class CreateAccountDto {
  @IsString()
  @MaxLength(50)
  loginId!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  @IsUUID()
  roleId!: string;

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
  isActive?: boolean;
}
