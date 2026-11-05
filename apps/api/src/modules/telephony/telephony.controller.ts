import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import type { Response } from 'express';
import { filter, interval, map, merge, type Observable } from 'rxjs';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { parseCallEvent } from './call-event';
import { CreateLineDto, TestCallDto, UpdateCallDto, UpdateLineDto } from './dto/telephony.dto';
import { TelephonyHub } from './telephony-hub.service';
import { TelephonyService } from './telephony.service';

/** Twilio에 돌려줄 응답 — 받았다는 안내만 하고 잠시 기다렸다 끊는다(그동안 ERP에 팝업이 뜬다) */
const TWIML = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="ko-KR">통인 콜팝업 시험 전화입니다. 화면에 팝업이 떴는지 확인해 주세요.</Say><Pause length="15"/><Hangup/></Response>`;

/**
 * 수신 알림 받는 곳 — 로그인 없이 회선 토큰으로만 들어온다.
 * 통신사 CTI·교환기·안드로이드 자동화 앱·Twilio가 POST(JSON·폼) 또는 GET(?from=)으로 부른다.
 */
@Controller('telephony/hook')
export class TelephonyHookController {
  constructor(private readonly service: TelephonyService) {}

  @Public()
  @Post(':token')
  async post(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.handle(token, body, query, res);
  }

  @Public()
  @Get(':token')
  async get(
    @Param('token') token: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.handle(token, undefined, query, res);
  }

  private async handle(
    token: string,
    body: Record<string, unknown> | undefined,
    query: Record<string, unknown>,
    res: Response,
  ) {
    const ev = parseCallEvent(body, query);
    const call = await this.service.handleHook(token, ev);
    if (!call) throw new NotFoundException('없는 회선 주소입니다.');
    if (ev.provider === 'TWILIO') {
      res.type('text/xml');
      return TWIML;
    }
    return { ok: true, callId: call.id };
  }
}

@Controller('telephony')
export class TelephonyController {
  constructor(
    private readonly service: TelephonyService,
    private readonly hub: TelephonyHub,
  ) {}

  /** 콜팝업 실시간 스트림(SSE) — 25초마다 ping으로 연결을 살려 둔다 */
  @Sse('stream')
  @RequirePermissions('CALL.READ')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  stream(): Observable<MessageEvent> {
    return merge(
      this.hub.signals.pipe(
        filter(Boolean),
        map((s) => ({ data: s })),
      ),
      interval(25_000).pipe(map(() => ({ data: { type: 'ping' } }))),
    );
  }

  @Get('calls')
  @RequirePermissions('CALL.READ')
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query('status') status?: string,
    @Query('days') days?: string,
    @Query('phone') phone?: string,
  ) {
    return this.service.list(user, {
      status: status || undefined,
      days: days ? Number(days) : undefined,
      phone,
    });
  }

  @Get('calls/:id')
  @RequirePermissions('CALL.READ')
  context(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.context(id, user);
  }

  @Post('calls/:id/answer')
  @RequirePermissions('CALL.READ')
  answer(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.answer(id, user);
  }

  @Patch('calls/:id')
  @RequirePermissions('CALL.READ')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCallDto) {
    return this.service.update(id, dto);
  }

  @Get('lines')
  @RequirePermissions('CALL.MANAGE')
  lines() {
    return this.service.lines();
  }

  @Post('lines')
  @RequirePermissions('CALL.MANAGE')
  createLine(@Body() dto: CreateLineDto) {
    return this.service.createLine(dto);
  }

  @Patch('lines/:id')
  @RequirePermissions('CALL.MANAGE')
  updateLine(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLineDto) {
    return this.service.updateLine(id, dto);
  }

  @Delete('lines/:id')
  @RequirePermissions('CALL.MANAGE')
  deleteLine(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteLine(id);
  }

  @Post('test')
  @RequirePermissions('CALL.MANAGE')
  test(@Body() dto: TestCallDto) {
    return this.service.test(dto);
  }
}
