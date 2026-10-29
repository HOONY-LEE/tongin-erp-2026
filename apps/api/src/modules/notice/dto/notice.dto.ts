import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { NOTICE_AUDIENCE, type NoticeAudience } from '@tongin/shared';

export class CreateNoticeDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  /** ALL = 전사, ORG = orgUnitIds의 조직(+하위) */
  @IsIn(NOTICE_AUDIENCE)
  audience!: NoticeAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  orgUnitIds?: string[];

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class UpdateNoticeDto extends PartialType(CreateNoticeDto) {}
