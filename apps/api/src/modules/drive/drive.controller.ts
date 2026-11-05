import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DRIVE_NAME_MAX, DRIVE_ROLE, type AuthPrincipal, type DriveRole } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { contentDisposition } from '../../ai/ai-files.service';
import { DriveService } from './drive.service';
import { GoogleDriveService } from './google-drive.service';
import { AccessLog } from '../../audit/access-log';

const ROLES = Object.keys(DRIVE_ROLE);

class MemberDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(ROLES)
  role!: DriveRole;
}

class CreateSpaceDto {
  @IsString()
  @MaxLength(DRIVE_NAME_MAX)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members!: MemberDto[];
}

class UpdateSpaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(DRIVE_NAME_MAX)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members?: MemberDto[];
}

class FolderDto {
  @IsUUID()
  spaceId!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MaxLength(DRIVE_NAME_MAX)
  name!: string;
}

class UpdateItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(DRIVE_NAME_MAX)
  name?: string;

  @IsOptional()
  @IsBoolean()
  starred?: boolean;
}

class MoveDto {
  @IsUUID()
  spaceId!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

class SharesDto {
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  shares!: MemberDto[];
}

class GoogleTargetDto {
  @IsString()
  @MaxLength(200)
  fileId!: string;

  @IsUUID()
  spaceId!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

/**
 * 드라이브 — 권한 없이(로그인만) 쓴다. 볼 수 있는지는 서비스가 공간·공유로 판단한다.
 * 파일 올리기는 본문을 그대로(바이트) 받는다 — main.ts에서 /api/drive/upload에만 raw 본문을 연다.
 */
@Controller('drive')
export class DriveController {
  constructor(
    private readonly drive: DriveService,
    private readonly google: GoogleDriveService,
  ) {}

  // ── 공간 ──

  @Get('spaces')
  spaces(@CurrentUser() u: AuthPrincipal) {
    return this.drive.spaces(u);
  }

  @Post('spaces')
  async createSpace(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateSpaceDto) {
    return { id: await this.drive.createShared(u, dto) };
  }

  @Get('spaces/:id')
  space(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.drive.spaceDetail(id, u);
  }

  @Patch('spaces/:id')
  @HttpCode(204)
  async updateSpace(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpaceDto,
  ) {
    await this.drive.updateSpace(id, u, dto);
  }

  @Delete('spaces/:id')
  @HttpCode(204)
  async deleteSpace(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.drive.deleteSpace(id, u);
  }

  // ── 목록 ──

  @Get('list')
  list(
    @CurrentUser() u: AuthPrincipal,
    @Query('spaceId', ParseUUIDPipe) spaceId: string,
    @Query('folderId') folderId?: string,
  ) {
    if (folderId && !/^[0-9a-f-]{36}$/i.test(folderId))
      throw new BadRequestException('폴더 번호 형식이 올바르지 않습니다.');
    return this.drive.list(u, spaceId, folderId || null);
  }

  @Get('view/:view')
  view(@CurrentUser() u: AuthPrincipal, @Param('view') view: string) {
    if (view === 'recent') return this.drive.recent(u);
    if (view === 'starred') return this.drive.starred(u);
    if (view === 'shared') return this.drive.sharedWithMe(u);
    if (view === 'trash') return this.drive.trash(u);
    throw new BadRequestException('모르는 보기입니다.');
  }

  @Get('search')
  search(@CurrentUser() u: AuthPrincipal, @Query('q') q = '') {
    return this.drive.search(u, q);
  }

  @Get('folders')
  folders(@CurrentUser() u: AuthPrincipal) {
    return this.drive.folderTree(u);
  }

  // ── 항목 ──

  @Post('folders')
  async folder(@CurrentUser() u: AuthPrincipal, @Body() dto: FolderDto) {
    return { id: await this.drive.createFolder(u, dto.spaceId, dto.parentId ?? null, dto.name) };
  }

  /**
   * 파일 올리기 — 본문 = 파일 바이트(Content-Type은 늘 application/octet-stream — JSON 파일이 JSON으로 읽히지 않게),
   * 이름은 X-File-Name, 실제 종류는 X-File-Type(둘 다 encodeURIComponent)
   */
  @Post('upload')
  async upload(
    @CurrentUser() u: AuthPrincipal,
    @Req() req: Request,
    @Query('spaceId', ParseUUIDPipe) spaceId: string,
    @Headers('x-file-name') rawName: string | undefined,
    @Headers('x-file-type') fileType: string | undefined,
    @Query('parentId') parentId?: string,
  ) {
    if (parentId && !/^[0-9a-f-]{36}$/i.test(parentId))
      throw new BadRequestException('폴더 번호 형식이 올바르지 않습니다.');
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body)) throw new BadRequestException('파일 내용을 받지 못했습니다.');
    let name = 'file';
    let type = '';
    try {
      name = decodeURIComponent(rawName ?? 'file');
      type = decodeURIComponent(fileType ?? '');
    } catch {
      throw new BadRequestException('파일 이름을 읽지 못했습니다.');
    }
    return {
      id: await this.drive.upload(u, spaceId, parentId || null, name, type, body),
    };
  }

  @Get('items/:id')
  item(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.drive.itemView(id, u);
  }

  @AccessLog('drive-file', 'EXPORT')
  @Get('items/:id/content')
  async content(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.drive.content(id, u);
    res.set({
      'Content-Type': f.mimeType,
      'Content-Disposition': contentDisposition(f.name),
      'Content-Length': String(f.bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(Buffer.from(f.bytes));
  }

  /** 링크 항목을 열었을 때 — 최근 문서함에 남긴다 */
  @Post('items/:id/opened')
  @HttpCode(204)
  async opened(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.drive.itemView(id, u);
    await this.drive.touch(id, u.userId);
  }

  @Patch('items/:id')
  @HttpCode(204)
  async update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
  ) {
    if (dto.name !== undefined) await this.drive.rename(id, u, dto.name);
    if (dto.starred !== undefined) await this.drive.star(id, u, dto.starred);
  }

  @Post('items/:id/move')
  @HttpCode(204)
  async move(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveDto,
  ) {
    await this.drive.move(id, u, dto.spaceId, dto.parentId ?? null);
  }

  @Post('items/:id/copy')
  async copy(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return { id: await this.drive.copy(id, u) };
  }

  /** 휴지통으로 */
  @Delete('items/:id')
  @HttpCode(204)
  async trash(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.drive.trashItem(id, u);
  }

  @Post('items/:id/restore')
  restore(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.drive.restore(id, u);
  }

  @Delete('items/:id/permanent')
  @HttpCode(204)
  async purge(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.drive.purge(id, u);
  }

  @Delete('trash')
  emptyTrash(@CurrentUser() u: AuthPrincipal) {
    return this.drive.emptyTrash(u);
  }

  @Get('items/:id/shares')
  shares(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.drive.shares(id, u);
  }

  @Put('items/:id/shares')
  @HttpCode(204)
  async setShares(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SharesDto,
  ) {
    await this.drive.setShares(id, u, dto.shares);
  }

  // ── 구글 드라이브 ──

  @Get('google/status')
  googleStatus(@CurrentUser() u: AuthPrincipal) {
    return this.google.status(u);
  }

  @Get('google/auth-url')
  googleAuthUrl(@CurrentUser() u: AuthPrincipal) {
    return this.google.authUrl(u);
  }

  @Delete('google')
  @HttpCode(204)
  async googleDisconnect(@CurrentUser() u: AuthPrincipal) {
    await this.google.disconnect(u);
  }

  @Get('google/files')
  googleFiles(
    @CurrentUser() u: AuthPrincipal,
    @Query('folderId') folderId?: string,
    @Query('q') q?: string,
    @Query('view') view?: string,
    @Query('pageToken') pageToken?: string,
  ) {
    return this.google.list(u, {
      folderId: folderId?.slice(0, 200),
      q: q?.slice(0, 100),
      view,
      pageToken: pageToken?.slice(0, 500),
    });
  }

  @Post('google/import')
  async googleImport(@CurrentUser() u: AuthPrincipal, @Body() dto: GoogleTargetDto) {
    return { id: await this.google.importFile(u, dto.fileId, dto.spaceId, dto.parentId ?? null) };
  }

  @Post('google/link')
  async googleLink(@CurrentUser() u: AuthPrincipal, @Body() dto: GoogleTargetDto) {
    return { id: await this.google.linkFile(u, dto.fileId, dto.spaceId, dto.parentId ?? null) };
  }

  @Post('items/:id/to-google')
  toGoogle(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.google.sendToGoogle(u, id);
  }
}
