import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InboxService } from './inbox.service';

class IdsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids?: string[];
}

/** 내 알림 — 로그인한 사람 본인 것만(권한 없이) */
@Controller('me/notifications')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query('take') take?: string,
    @Query('unread') unread?: string,
  ) {
    const n = Number.parseInt(take ?? '', 10);
    return this.inbox.list(user.userId, Number.isFinite(n) ? n : 30, unread === '1');
  }

  @Get('count')
  async count(@CurrentUser() user: AuthPrincipal) {
    return { unread: await this.inbox.unreadCount(user.userId) };
  }

  /** 읽음 — ids가 없으면 전부 */
  @Post('read')
  read(@CurrentUser() user: AuthPrincipal, @Body() dto: IdsDto) {
    return this.inbox.markRead(user.userId, dto.ids);
  }

  /** 지우기 — ids가 없으면 읽은 알림 전부 */
  @Post('clear')
  clear(@CurrentUser() user: AuthPrincipal, @Body() dto: IdsDto) {
    return this.inbox.remove(user.userId, dto.ids);
  }
}
