import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthPrincipal } from '@tongin/shared';
import { CalendarService } from './calendar.service';
import { CalendarEventService } from './calendar-event.service';
import { GoogleCalendarService } from './google-calendar.service';
import {
  CalendarQueryDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar-event.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

const WEB_APP_URL = process.env.WEB_APP_URL ?? 'http://localhost:3002';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly events: CalendarEventService,
    private readonly google: GoogleCalendarService,
  ) {}

  /** 기간 내 캘린더 항목(자체 일정 + 작업오더). scope=MINE|ORG */
  @Get('events')
  @RequirePermissions('CALENDAR.READ')
  list(@Query() query: CalendarQueryDto, @CurrentUser() user: AuthPrincipal) {
    return this.events.list(query, user);
  }

  @Post('events')
  @RequirePermissions('CALENDAR.WRITE')
  create(@Body() dto: CreateCalendarEventDto, @CurrentUser() user: AuthPrincipal) {
    return this.events.create(dto, user);
  }

  @Patch('events/:id')
  @RequirePermissions('CALENDAR.WRITE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.events.update(id, dto, user);
  }

  @Delete('events/:id')
  @RequirePermissions('CALENDAR.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.events.remove(id, user);
  }

  /** 조직 필터 드롭다운용 — 내 데이터범위 내 조직 목록. */
  @Get('org-units')
  @RequirePermissions('CALENDAR.READ')
  orgUnits(@CurrentUser() user: AuthPrincipal) {
    return this.events.visibleOrgUnits(user);
  }

  // ── 구글 캘린더 연동 ──

  /** 연동 설정 여부 + 내 계정 연결 상태. */
  @Get('google/status')
  @RequirePermissions('CALENDAR.READ')
  googleStatus(@CurrentUser() user: AuthPrincipal) {
    return this.google.status(user);
  }

  /** 구글 동의 화면 URL 발급(프론트에서 새 창으로 연다). */
  @Get('google/auth-url')
  @RequirePermissions('CALENDAR.WRITE')
  googleAuthUrl(@CurrentUser() user: AuthPrincipal) {
    return this.google.authUrl(user);
  }

  /** 구글 OAuth 리다이렉트 수신 — 브라우저가 직접 호출하므로 공개 라우트(state로 검증). */
  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error) return res.redirect(`${WEB_APP_URL}/calendar?google=denied`);
    try {
      await this.google.handleCallback(code, state);
      return res.redirect(`${WEB_APP_URL}/calendar?google=connected`);
    } catch (e) {
      const msg = encodeURIComponent((e as Error).message);
      return res.redirect(`${WEB_APP_URL}/calendar?google=error&message=${msg}`);
    }
  }

  /** 양방향 동기화 실행(가져오기 + 내보내기). */
  @Post('google/sync')
  @RequirePermissions('CALENDAR.WRITE')
  googleSync(
    @CurrentUser() user: AuthPrincipal,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.google.sync(user, from, to);
  }

  /** 연결 해제 — 구글에서 가져온 미러 일정도 함께 제거. */
  @Delete('google')
  @RequirePermissions('CALENDAR.WRITE')
  @HttpCode(204)
  googleDisconnect(@CurrentUser() user: AuthPrincipal) {
    return this.google.disconnect(user);
  }

  /** 작업(이사) 일정 iCalendar 내보내기. 캘린더 앱에서 가져오기/구독. */
  @Get('work-orders.ics')
  @RequirePermissions('WORK_ORDER.READ')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tongin-schedule.ics"')
  workOrders() {
    return this.calendar.workOrdersIcs();
  }
}
