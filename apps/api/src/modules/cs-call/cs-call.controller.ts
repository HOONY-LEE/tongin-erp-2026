import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
} from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CsCallService } from './cs-call.service';

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
const say = (text: string) => `<Say language="ko">${esc(text)}</Say>`;
const vxml = (...verbs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.join('')}</Response>`;
/** 착신 연결 — 20초 안에 안 받으면 action으로 다음 상담원 */
const dial = (to: string, action: string) =>
  `<Dial timeout="20" action="${esc(action)}"><Number>${esc(to.replace(/\D/g, ''))}</Number></Dial>`;
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
  constructor(private readonly calls: CsCallService) {}

  @Get('console')
  @RequirePermissions('LEAD.CREATE')
  console(@CurrentUser() user: AuthPrincipal) {
    return this.calls.console(user);
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
   * - 배분된 상담원에게 착신 번호가 있으면 <Dial>로 그 전화를 바로 울린다(착신 연결).
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
      );
      if (call.status !== 'ASSIGNED') return vxml(say(MSG_BUSY), HANGUP);
      if (call.ringTo)
        return vxml(
          say('통인익스프레스입니다. 상담원에게 연결해 드리겠습니다.'),
          dial(call.ringTo, afterUrl(req, key!, call.id)),
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
      if (next.status === 'ASSIGNED' && next.ringTo)
        return vxml(
          say('다른 상담원에게 연결해 드리겠습니다.'),
          dial(next.ringTo, afterUrl(req, key!, callId)),
        );
      if (next.status === 'ASSIGNED') return vxml(say(MSG_CALLBACK), HANGUP);
      return vxml(say(MSG_BUSY), HANGUP);
    } catch {
      return vxml(say(MSG_BUSY), HANGUP);
    }
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
