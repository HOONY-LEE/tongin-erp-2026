import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ACCESS_METHODS,
  HANDLING,
  VAT_MODES,
  type AccessMethod,
  type Handling,
  type VatMode,
} from '@tongin/shared';

export class CreateZoneDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateLineDto {
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  cbmItemId?: string; // 있으면 품목사전에서 단위CBM·명칭 채움

  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemName?: string; // cbmItemId 없으면 필수

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cbm?: number; // cbmItemId 없을 때 수동 라인 CBM

  @IsOptional()
  @IsIn(HANDLING)
  handling?: Handling;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class CreateAddonDto {
  @IsOptional()
  @IsUUID()
  addonServiceId?: string; // 카탈로그에서 고른 경우. 자유 입력(기타서비스)이면 생략

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string; // addonServiceId 없으면 필수

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number; // 생략 시 상품별 단가(ProductAddon) → 옵션 기본가 순으로 채움

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

/** 금액 상한 — 99억 원(그 이상은 입력 실수로 본다. DB 자릿수 초과로 500이 나지 않게) */
export const MAX_AMOUNT = 9_999_999_999;

/** 견적 금액 확정 — 견적사원이 발송 전에 정하는 값들. */
export class UpdateAmountsDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  moveAmount?: number; // 이사비용(옵션 제외)

  @IsOptional()
  @IsIn(VAT_MODES)
  vatMode?: VatMode;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  vatAmount?: number; // vatMode=INCLUDED일 때 명시 금액

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  depositAmount?: number; // 계약금

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  balanceAmount?: number; // 잔금
}

/** 작업조건(전/후) — 평수 + 짐 내리고 올리는 방법. 기타면 메모로 내용을 적는다. */
export class UpdateConditionsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  fromPyeong?: number;

  @IsOptional()
  @IsIn(ACCESS_METHODS)
  fromAccess?: AccessMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromAccessNote?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  toPyeong?: number;

  @IsOptional()
  @IsIn(ACCESS_METHODS)
  toAccess?: AccessMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  toAccessNote?: string;
}
