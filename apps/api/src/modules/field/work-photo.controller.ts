import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { WORK_PHOTO_KINDS, type AuthPrincipal, type WorkPhotoKind } from '@tongin/shared';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { WorkPhotoService } from './work-photo.service';

/** 사진 올리기 — 내용은 base64(JSON 본문 한도 30MB 안에서, 사진 한 장 최대 8MB) */
class UploadPhotoDto {
  @IsIn(WORK_PHOTO_KINDS)
  kind!: WorkPhotoKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;

  @IsString()
  @MaxLength(100)
  mediaType!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(11_200_000) // base64 ≈ 8MB
  data!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  height?: number;
}

/**
 * 현장 작업 사진.
 * - 현장: /field/work-orders/:id/photos (목록·올리기·지우기)
 * - 관리자: /work-orders/:id/photos (목록, 조회만)
 * - 이미지: /work-photos/:id — <img>는 Authorization 헤더를 못 보내므로 화면이 fetch → blob URL로 띄운다
 */
@Controller()
export class WorkPhotoController {
  constructor(private readonly photos: WorkPhotoService) {}

  @Get('field/work-orders/:id/photos')
  @RequirePermissions('WORK_ORDER.READ')
  listField(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.photos.listForField(id, user);
  }

  /** 올리기·지우기는 시작·완료와 같은 쓰기 권한(현장 작업팀 기본 역할에 포함) */
  @Post('field/work-orders/:id/photos')
  @RequirePermissions('WORK_ORDER.WRITE')
  upload(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadPhotoDto,
  ) {
    return this.photos.upload(id, user, dto);
  }

  @Delete('field/work-orders/:id/photos/:photoId')
  @RequirePermissions('WORK_ORDER.WRITE')
  remove(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.photos.remove(id, photoId, user);
  }

  @Get('work-orders/:id/photos')
  @RequirePermissions('WORK_ORDER.READ')
  listStaff(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.photos.listForStaff(id, user);
  }

  /** 사진은 한 번 올리면 바뀌지 않는다 — 브라우저 개인 캐시에 하루 둔다(공유 캐시 금지) */
  @Get('work-photos/:id')
  @RequirePermissions('WORK_ORDER.READ')
  async image(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const p = await this.photos.bytes(id, user);
    res.set({
      'Content-Type': p.mediaType,
      'Content-Length': String(p.bytes.length),
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(p.bytes);
  }
}
