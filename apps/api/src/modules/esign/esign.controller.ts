import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { EsignService } from './esign.service';

export class PublicSignDto {
  /** 서명 그림(PNG data URL) */
  @IsString()
  @MaxLength(400_000)
  signature!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  signerName!: string;

  @IsBoolean()
  agree!: boolean;
}

/** 견적서 보내기(직원) */
@Controller('estimates')
export class EsignController {
  constructor(private readonly esign: EsignService) {}

  @Get(':id/send')
  @RequirePermissions('ESTIMATE.READ')
  preview(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.esign.preview(id, user);
  }

  /** 고객에게 견적서 보내기 — 문자(견적서·서명 링크 + 계약금 계좌) */
  @Post(':id/send')
  @RequirePermissions('ESTIMATE.UPDATE')
  send(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.esign.send(id, user);
  }

  /** 시연: 고객 계좌이체를 흉내 내 자동 입금확인 흐름을 태운다 */
  @Post(':id/simulate-deposit')
  @RequirePermissions('PAYMENT.CREATE')
  simulate(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.esign.simulateDeposit(id, user);
  }
}

/** 고객용 공개 링크(로그인 없음 — 추측 불가능한 토큰으로만 접근) */
@Controller('public')
export class PublicSignController {
  constructor(private readonly esign: EsignService) {}

  @Public()
  @Get('sign/:token')
  view(@Param('token') token: string) {
    return this.esign.publicView(token);
  }

  @Public()
  @Get('sign/:token/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  document(@Param('token') token: string) {
    return this.esign.publicDocument(token);
  }

  @Public()
  @Post('sign/:token')
  @HttpCode(200)
  sign(@Param('token') token: string, @Body() dto: PublicSignDto) {
    return this.esign.publicSign(token, dto);
  }

  /** 토스페이먼츠 웹훅(DEPOSIT_CALLBACK) — 개발자센터에 이 주소를 등록한다 */
  @Public()
  @Post('payments/toss/webhook')
  @HttpCode(200)
  tossWebhook(@Body() body: { orderId?: string; secret?: string; status?: string }) {
    return this.esign.tossDepositCallback(body);
  }
}
