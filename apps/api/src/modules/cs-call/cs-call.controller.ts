import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { Request, Response } from 'express';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CsCallService, type RingTarget } from './cs-call.service';

class AvailableDto {
  @IsBoolean() available!: boolean;
}
class RingToDto {
  /** 받을 전화번호 — 비우면 착신 연결 끔 */
  @IsOptional() @IsString() @MaxLength(30) ringTo?: string | null;
}
class SimulateDto {
  @IsInt() @Min(1) @Max(20) count!: number;
  /** 시험할 번호(비우면 아무 번호) — 내 휴대폰으로 받아 보기 */
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}
class FinishDto {
  @IsIn(['DONE', 'RETRY']) result!: 'DONE' | 'RETRY';
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsString() @MaxLength(1000) memo?: string;
  /** 고객 요청사항 */
  @IsOptional() @IsString() @MaxLength(2000) request?: string;
}
class UpdateCallDto {
  /** 상담 중에 등록한 접수 — 콜은 끝내지 않고 잇기만 한다 */
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsString() @MaxLength(1000) memo?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) request?: string | null;
}
class ScriptDto {
  @IsOptional() @IsString() @MaxLength(40) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  /** 공유 메모(상담 콘솔 모든 직원) — 없으면 개인 */
  @IsOptional() @IsBoolean() shared?: boolean;
}
class AnswerDto {
  @IsString() @MaxLength(30) phone!: string;
  @IsOptional() @IsString() @MaxLength(100) katCallSid?: string;
}
class ListQuery {
  @IsOptional() @IsIn(['mine', 'all']) scope?: 'mine' | 'all';
  @IsOptional() @IsString() @MaxLength(50) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  /** 통화 날짜 범위(YYYY-MM-DD, 한국 시간) */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
class InboundDto {
  @IsString() @MaxLength(30) phone!: string;
  @IsOptional() @IsString() @MaxLength(50) channel?: string;
}

const MSG_CALLBACK =
  '통인익스프레스입니다. 전화 주셔서 감사합니다. 상담원이 바로 전화드리겠습니다.';
const MSG_BUSY =
  '통인익스프레스입니다. 지금 모든 상담원이 상담 중입니다. 순서대로 곧 다시 전화드리겠습니다.';
const HANGUP = '<Hangup/>';
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/**
 * 안내 멘트 목소리 — KAT_TTS_VOICE(예: typecast:tc_…·google:ko-KR-Chirp3-HD-…·cartesia)면 고품질 유료 음성,
 * 비우면 무료 기본 음성. 같은 문장은 한국AI통신이 저장해 두고 다시 쓰므로 고정 멘트는 처음 한 번만 과금된다.
 */
const TTS_VOICE = (process.env.KAT_TTS_VOICE ?? '').trim();
const say = (text: string) =>
  `<Say language="ko"${TTS_VOICE ? ` voice="${esc(TTS_VOICE)}"` : ''}>${esc(text)}</Say>`;
const vxml = (...verbs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.join('')}</Response>`;
/** 통화 한 건 최대 길이(초) — 요금 안전망 */
const DIAL_TIME_LIMIT_S = 3600;
/** 착신 연결 — PC 전화(브라우저 SIP)가 켜져 있으면 그 브라우저를, 아니면 착신 번호를 울린다. 20초 안에 안 받으면 action으로 다음 상담원 */
const dial = (t: RingTarget, action: string) =>
  `<Dial timeout="20" timeLimit="${DIAL_TIME_LIMIT_S}" action="${esc(action)}">${
    t.sipUri
      ? `<Sip>${esc(t.sipUri)}</Sip>`
      : `<Number>${esc((t.ringTo ?? '').replace(/\D/g, ''))}</Number>`
  }</Dial>`;
const canRing = (t: RingTarget) => !!(t.sipUri || t.ringTo);
/** action 주소 — 전화 서비스가 부른 주소(터널·Render)와 같은 호스트로 */
const afterUrl = (req: Request, key: string, callId: string) => {
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0];
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host);
  return `${proto}://${host}/api/cs-calls/voice/after?key=${encodeURIComponent(key)}&call=${callId}`;
};

/**
 * 고객관리부 상담 콘솔 — 콜 자동 배분 · 아웃콜(콜백 대기) · 콜백.
 * 상담은 접수 등록 권한(LEAD.CREATE)으로 한다.
 */
@Controller('cs-calls')
export class CsCallController {
  private readonly log = new Logger('CsCall');
  constructor(private readonly calls: CsCallService) {}

  @Get('console')
  @RequirePermissions('LEAD.CREATE')
  console(@CurrentUser() user: AuthPrincipal) {
    return this.calls.console(user);
  }

  /** 내 대본 메모 */
  @Get('scripts')
  @RequirePermissions('LEAD.CREATE')
  scripts(@CurrentUser() user: AuthPrincipal) {
    return this.calls.scripts(user);
  }

  @Post('scripts')
  @RequirePermissions('LEAD.CREATE')
  createScript(@CurrentUser() user: AuthPrincipal, @Body() dto: ScriptDto) {
    return this.calls.createScript(user, {
      title: dto.title ?? '새 메모',
      body: dto.body,
      shared: dto.shared,
    });
  }

  @Patch('scripts/:sid')
  @RequirePermissions('LEAD.CREATE')
  updateScript(
    @CurrentUser() user: AuthPrincipal,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: ScriptDto,
  ) {
    return this.calls.updateScript(user, sid, dto);
  }

  @Delete('scripts/:sid')
  @RequirePermissions('LEAD.CREATE')
  deleteScript(@CurrentUser() user: AuthPrincipal, @Param('sid', ParseUUIDPipe) sid: string) {
    return this.calls.deleteScript(user, sid);
  }

  /** 콜 목록 — 검색(전화번호·고객명) · 내 전화/전체 전화 */
  @Get()
  @RequirePermissions('LEAD.CREATE')
  list(@CurrentUser() user: AuthPrincipal, @Query() q: ListQuery) {
    // '전체 전화'는 상담 콘솔 전체 보기 권한(또는 전체 권한)이 있을 때만
    const all = user.permissions.includes('*') || user.permissions.includes('CS_CALL.ALL');
    return this.calls.list(user, {
      scope: all && q.scope === 'all' ? 'all' : 'mine',
      q: q.q,
      page: q.page,
      limit: q.limit,
      from: q.from,
      to: q.to,
    });
  }

  /** 전화 연동 설정 — 웹훅 주소(키 포함). 시스템 관리자만 */
  @Get('integration')
  @RequirePermissions('LEAD.CREATE')
  integration(@CurrentUser() user: AuthPrincipal) {
    if (!user.permissions.includes('*'))
      throw new ForbiddenException('전화 연동 설정은 시스템 관리자만 볼 수 있습니다.');
    return this.calls.integration();
  }

  @Post('agent')
  @RequirePermissions('LEAD.CREATE')
  setAvailable(@CurrentUser() user: AuthPrincipal, @Body() dto: AvailableDto) {
    return this.calls.setAvailable(user, dto.available);
  }

  @Post('agent/ring-to')
  @RequirePermissions('LEAD.CREATE')
  setRingTo(@CurrentUser() user: AuthPrincipal, @Body() dto: RingToDto) {
    return this.calls.setRingTo(user, dto.ringTo);
  }

  /** PC 전화 켜기 — 이 브라우저용 단기 SIP 토큰(+ICE). 켜 두는 동안 배분된 전화가 이 브라우저로 울린다 */
  @Post('agent/phone-token')
  @RequirePermissions('LEAD.CREATE')
  phoneToken(@CurrentUser() user: AuthPrincipal) {
    return this.calls.phoneToken(user);
  }

  /** PC 전화가 울려도 되는지(상담 가능 · 열린 콜 없음) — 브라우저가 등록/해제를 정한다 */
  @Get('agent/state')
  @RequirePermissions('LEAD.CREATE')
  agentState(@CurrentUser() user: AuthPrincipal) {
    return this.calls.agentState(user);
  }

  /** 소프트폰(동시 울림) — [받기]를 누른 상담원에게 콜을 만든다 */
  @Post('answer')
  @RequirePermissions('LEAD.CREATE')
  answer(@CurrentUser() user: AuthPrincipal, @Body() dto: AnswerDto) {
    return this.calls.answer(user, dto);
  }

  /** 울리는 전화의 고객(신규/기존) */
  @Get('caller')
  @RequirePermissions('LEAD.CREATE')
  caller(@Query('phone') phone: string | undefined) {
    return this.calls.callerInfo(phone ?? '');
  }

  @Post('agent/phone-off')
  @RequirePermissions('LEAD.CREATE')
  phoneOff(@CurrentUser() user: AuthPrincipal) {
    return this.calls.phoneOff(user);
  }

  @Post(':id/callback')
  @RequirePermissions('LEAD.CREATE')
  callback(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.calls.callback(user, id);
  }

  @Post(':id/finish')
  @RequirePermissions('LEAD.CREATE')
  finish(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinishDto,
  ) {
    return this.calls.finish(user, id, dto);
  }

  /** 아웃콜 정리 — 콜백하지 않고 목록에서 뺀다 */
  /** 끝난 상담에서 다시 걸기 — 새 콜(콜백)을 만든다 */
  @Post(':id/recall')
  @RequirePermissions('LEAD.CREATE')
  recall(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.calls.recall(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('LEAD.CREATE')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.calls.cancelOutcall(id, '아웃콜 정리');
  }

  /** 콜 상세 — 상담 화면 */
  @Get(':id')
  @RequirePermissions('LEAD.CREATE')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.calls.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('LEAD.CREATE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCallDto,
  ) {
    return this.calls.update(user, id, dto);
  }

  /** 통화 녹음(WAV) 듣기 */
  @Get(':id/recording')
  @RequirePermissions('LEAD.CREATE')
  async recording(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const r = await this.calls.recording(id);
    res.setHeader('Content-Type', r.type);
    if (r.length) res.setHeader('Content-Length', r.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    Readable.fromWeb(r.body as unknown as WebReadableStream).pipe(res);
  }

  /** 통화 받아쓰기 원문 — 상담 기록에서 본다 */
  @Get(':id/transcript')
  @RequirePermissions('LEAD.CREATE')
  transcript(@Param('id', ParseUUIDPipe) id: string) {
    return this.calls.transcript(id);
  }

  /** 시험 전화 — 실제 전화 시스템이 붙기 전 배분·아웃콜 확인용 */
  @Post('simulate')
  @RequirePermissions('LEAD.CREATE')
  simulate(@Body() dto: SimulateDto) {
    return this.calls.simulate(dto.count, dto.phone);
  }

  /**
   * 한국AI통신(ClawOps) 수신 웹훅 — 070 번호로 전화가 오면 From(발신 번호)을 form으로 보낸다.
   * 번호 설정의 웹훅 URL: 상담 콘솔의 '전화 연동'(시스템 관리자)에 나오는 주소 — /api/cs-calls/voice?key=<연동 키>
   * 콜을 배분하고 VoiceML(XML)로 답한다.
   * - 배분된 상담원이 PC 전화를 켜 두었으면 <Dial><Sip>로 그 브라우저를, 착신 번호가 있으면 그 전화를 바로 울린다.
   *   안 받으면 action(/voice/after)으로 다음 상담원 → 없으면 아웃콜 안내.
   * - 착신 번호가 없으면 안내 멘트 후 끊고, 상담원이 콘솔에서 콜백한다.
   */
  @Public()
  @Post('voice')
  @HttpCode(200)
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async voice(
    @Query('key') key: string | undefined,
    @Body() body: Record<string, string>,
    @Req() req: Request,
  ) {
    if (!(await this.calls.checkSecret(key)))
      return vxml(say('연결할 수 없는 번호입니다.'), HANGUP);
    if (body?.Direction && body.Direction !== 'inbound') return vxml(HANGUP);
    try {
      const call = await this.calls.inbound(
        body?.From ?? '',
        body?.ForwardedFrom || body?.To || '대표번호',
        body?.CallSid,
      );
      if (call.status !== 'ASSIGNED') return vxml(say(MSG_BUSY), HANGUP);
      if (canRing(call))
        return vxml(
          say('통인익스프레스입니다. 상담원에게 연결해 드리겠습니다.'),
          dial(call, afterUrl(req, key!, call.id)),
        );
      return vxml(say(MSG_CALLBACK), HANGUP);
    } catch {
      return vxml(say('통인익스프레스입니다. 잠시 후 다시 걸어 주세요.'), HANGUP);
    }
  }

  /** <Dial>이 끝난 뒤 — 통화했으면 끝, 안 받았으면 다음 상담원 또는 아웃콜 */
  @Public()
  @Post('voice/after')
  @HttpCode(200)
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async voiceAfter(
    @Query('key') key: string | undefined,
    @Query('call') callId: string | undefined,
    @Body() body: Record<string, string>,
    @Req() req: Request,
  ) {
    if (!(await this.calls.checkSecret(key)) || !callId) return vxml(HANGUP);
    if (body?.DialCallStatus === 'completed') return vxml(HANGUP);
    try {
      const next = await this.calls.ringFailed(callId);
      if (next.status === 'ASSIGNED' && canRing(next))
        return vxml(
          say('다른 상담원에게 연결해 드리겠습니다.'),
          dial(next, afterUrl(req, key!, callId)),
        );
      if (next.status === 'ASSIGNED') return vxml(say(MSG_CALLBACK), HANGUP);
      return vxml(say(MSG_BUSY), HANGUP);
    } catch {
      return vxml(say(MSG_BUSY), HANGUP);
    }
  }

  /**
   * 통화 상태 알림 — 번호의 '수신 통화 상태 webhook'과 SIP 단말의 statusCallback에 이 주소(+?key=)를 넣는다.
   * 통화가 끝나면 통화 시간을 남긴다.
   */
  @Public()
  @Post('voice/status')
  @HttpCode(204)
  async voiceStatus(@Query('key') key: string | undefined, @Body() body: Record<string, string>) {
    if (!(await this.calls.checkSecret(key))) return;
    await this.calls
      .statusEvent(body ?? {})
      .catch((e: unknown) => this.log.warn(`통화 상태 알림 처리 실패: ${String(e)}`));
  }

  /**
   * 통화 받아쓰기 알림 — 한국AI통신 webhooks(transcript.completed)에 이 주소(+?key=)를 등록한다.
   * 통화 받아쓰기 부가서비스와 번호 녹음이 켜져 있어야 온다.
   */
  @Public()
  @Post('voice/transcript')
  @HttpCode(204)
  async voiceTranscript(
    @Query('key') key: string | undefined,
    @Body() body: Record<string, string>,
  ) {
    if (!(await this.calls.checkSecret(key))) return;
    await this.calls
      .transcriptEvent(body ?? {})
      .catch((e: unknown) => this.log.warn(`받아쓰기 처리 실패: ${String(e)}`));
  }

  /**
   * AI 상담원 통화 요약 알림 — 한국AI통신 webhooks(summary.completed)에 이 주소(+?key=)를 등록한다.
   * 통화 요약·받아쓰기 부가서비스와 번호 녹음이 켜져 있어야 온다.
   */
  @Public()
  @Post('voice/summary')
  @HttpCode(204)
  async voiceSummary(@Query('key') key: string | undefined, @Body() body: Record<string, string>) {
    if (!(await this.calls.checkSecret(key))) return;
    await this.calls
      .aiSummary(body ?? {})
      .catch((e: unknown) => this.log.warn(`AI 통화 요약 처리 실패: ${String(e)}`));
  }

  @Public()
  @Post('inbound')
  inbound(@Headers('x-cti-secret') secret: string | undefined, @Body() dto: InboundDto) {
    const want = process.env.CTI_WEBHOOK_SECRET;
    if (!want || secret !== want)
      throw new ForbiddenException('전화 시스템 연동이 설정되지 않았습니다.');
    return this.calls.inbound(dto.phone, dto.channel);
  }
}
