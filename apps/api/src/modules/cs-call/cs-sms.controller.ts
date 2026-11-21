import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CsSmsService } from './cs-sms.service';

class TemplateDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MinLength(1) @MaxLength(40) title!: string;
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @IsOptional() @IsBoolean() shared?: boolean;
}
class SendDto {
  @IsString() @MinLength(8) @MaxLength(20) phone!: string;
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @IsOptional() @IsString() @MaxLength(40) title?: string;
  @IsOptional() @IsUUID() callId?: string;
}

class HistoryQuery {
  @IsOptional() @IsIn(['mine', 'all']) scope?: 'mine' | 'all';
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  /** 화면 필터(FilterButton) 값 JSON */
  @IsOptional() @IsString() @MaxLength(4000) f?: string;
  /** 검색어(번호·제목·본문·고객명) */
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

/** 상담 콘솔 문자 — 템플릿과 보내기 */
@Controller('cs-sms')
export class CsSmsController {
  constructor(private readonly svc: CsSmsService) {}

  @Get('templates')
  @RequirePermissions('LEAD.CREATE')
  templates(@CurrentUser() user: AuthPrincipal) {
    return this.svc.templates(user);
  }

  @Post('templates')
  @RequirePermissions('LEAD.CREATE')
  save(@CurrentUser() user: AuthPrincipal, @Body() dto: TemplateDto) {
    return this.svc.saveTemplate(user, dto);
  }

  @Delete('templates/:id')
  @RequirePermissions('LEAD.CREATE')
  remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteTemplate(user, id);
  }

  @Get('status')
  @RequirePermissions('LEAD.CREATE')
  status() {
    return this.svc.status();
  }

  /** 보낸 문자 내역 — 기본은 내가 보낸 것. '전체'는 상담 콘솔 전체 보기 권한 */
  @Get('history')
  @RequirePermissions('LEAD.CREATE')
  history(@CurrentUser() user: AuthPrincipal, @Query() q: HistoryQuery) {
    return this.svc.history(user, q);
  }

  @Post('send')
  @RequirePermissions('LEAD.CREATE')
  send(@CurrentUser() user: AuthPrincipal, @Body() dto: SendDto) {
    return this.svc.send(user, dto);
  }
}
