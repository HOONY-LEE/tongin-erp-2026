import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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

  @Post('send')
  @RequirePermissions('LEAD.CREATE')
  send(@CurrentUser() user: AuthPrincipal, @Body() dto: SendDto) {
    return this.svc.send(user, dto);
  }
}
