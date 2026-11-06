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
} from '@nestjs/common';
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

  @Post('agent')
  @RequirePermissions('LEAD.CREATE')
  setAvailable(@CurrentUser() user: AuthPrincipal, @Body() dto: AvailableDto) {
    return this.calls.setAvailable(user, dto.available);
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
   * 전화 시스템(CTI) 웹훅 — 대표번호로 전화가 오면 부른다. 헤더 x-cti-secret이 서버 환경변수
   * CTI_WEBHOOK_SECRET과 같아야 한다(설정하지 않으면 닫혀 있다).
   */
  /**
   * 한국AI통신(ClawOps) 수신 웹훅 — 070 번호로 전화가 오면 From(발신 번호)을 form으로 보낸다.
   * 번호 설정의 웹훅 URL: https://<API>/api/cs-calls/voice?key=<CTI_WEBHOOK_SECRET>
   * 콜을 배분(또는 아웃콜)하고, 고객에게는 VoiceML(XML)로 안내 멘트를 들려준 뒤 끊는다 — 상담원이 콘솔에서 전화한다.
   */
  @Public()
  @Post('voice')
  @HttpCode(200)
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async voice(@Query('key') key: string | undefined, @Body() body: Record<string, string>) {
    const want = process.env.CTI_WEBHOOK_SECRET;
    const say = (text: string) =>
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="ko">${text}</Say><Hangup/></Response>`;
    if (!want || key !== want) return say('연결할 수 없는 번호입니다.');
    const from = body?.From ?? '';
    if (body?.Direction && body.Direction !== 'inbound') return say('');
    try {
      const call = await this.calls.inbound(from, body?.ForwardedFrom || body?.To || '대표번호');
      return say(
        call.status === 'ASSIGNED'
          ? '통인익스프레스입니다. 전화 주셔서 감사합니다. 상담원이 바로 전화드리겠습니다.'
          : '통인익스프레스입니다. 지금 모든 상담원이 상담 중입니다. 순서대로 곧 다시 전화드리겠습니다.',
      );
    } catch {
      return say('통인익스프레스입니다. 잠시 후 다시 걸어 주세요.');
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
