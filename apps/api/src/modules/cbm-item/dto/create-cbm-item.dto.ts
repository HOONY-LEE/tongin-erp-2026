import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** 이사물품 — 코드는 서버 발급(ITM-0001). 기본 부피·무게는 없어도 된다(견적 때 입력) */
export class CreateCbmItemDto {
  @IsString()
  @MaxLength(50)
  category!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEng?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cbm?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ton?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
