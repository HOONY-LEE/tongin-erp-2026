import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ORG_UNIT_TYPES, type OrgUnitType } from '@tongin/shared';
import { SingleAddressDto } from '../../../common/dto/address-fields.dto';

/**
 * 코드는 서버가 발급한다(ORG-0001) — 입력받지 않는다.
 * 위치(주소·좌표)는 선택 — 지점은 넣어 두면 대시보드 지도에 점으로 찍힌다.
 */
export class CreateOrgUnitDto extends SingleAddressDto {
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
