import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ORG_UNIT_TYPES, type OrgUnitType } from '@tongin/shared';

/** 코드는 서버가 발급한다(ORG-0001) — 입력받지 않는다 */
export class CreateOrgUnitDto {
  @IsIn(ORG_UNIT_TYPES)
  type!: OrgUnitType;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
