import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
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
    return this.calls.simulate(dto.count);
  }

  /**
   * 전화 시스템(CTI) 웹훅 — 대표번호로 전화가 오면 부른다. 헤더 x-cti-secret이 서버 환경변수
   * CTI_WEBHOOK_SECRET과 같아야 한다(설정하지 않으면 닫혀 있다).
   */
  @Public()
  @Post('inbound')
  inbound(@Headers('x-cti-secret') secret: string | undefined, @Body() dto: InboundDto) {
    const want = process.env.CTI_WEBHOOK_SECRET;
    if (!want || secret !== want)
      throw new ForbiddenException('전화 시스템 연동이 설정되지 않았습니다.');
    return this.calls.inbound(dto.phone, dto.channel);
  }
}
