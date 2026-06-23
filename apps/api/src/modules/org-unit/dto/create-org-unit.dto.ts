import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ORG_UNIT_TYPES, type OrgUnitType } from '@tongin/shared';

export class CreateOrgUnitDto {
  @IsIn(ORG_UNIT_TYPES)
  type!: OrgUnitType;

  @IsString()
  @MaxLength(50)
  code!: string;

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
