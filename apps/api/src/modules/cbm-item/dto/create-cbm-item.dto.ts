import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCbmItemDto {
  @IsString()
  @MaxLength(50)
  category!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cbm!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
