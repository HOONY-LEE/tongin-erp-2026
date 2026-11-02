import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ApprovalAttachmentService } from './approval-attachment.service';
import { UploadAttachmentDto } from './dto/approval-line.dto';

/**
 * 결재 첨부파일 — 로그인만으로(직원이 양식을 채우며 올린다).
 * 받기는 올린 사람 또는 그 문서를 볼 수 있는 사람.
 */
@Controller('approval-attachments')
export class ApprovalAttachmentController {
  constructor(private readonly files: ApprovalAttachmentService) {}

  @Post()
  upload(@CurrentUser() p: AuthPrincipal, @Body() dto: UploadAttachmentDto) {
    return this.files.upload(p, dto);
  }

  /** 작성 중에 뺀 파일(아직 문서에 안 붙은 것만) */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.removeDraft(p, id);
  }

  @Get(':id')
  async download(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.files.download(p, id);
    res.set({
      // 받기만 — 브라우저가 열어 실행하지 않게
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(f.bytes.length),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(f.bytes);
  }
}
