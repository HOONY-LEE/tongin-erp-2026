import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiService } from './ai.service';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

class DecisionInput {
  @IsString()
  toolUseId!: string;

  @IsBoolean()
  approve!: boolean;
}

class DecideDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DecisionInput)
  decisions!: DecisionInput[];
}

/**
 * AIX-03: AI 비서. 대화는 사용자 본인 것만 보이고, 도구는 본인 권한으로 실행된다.
 * 응답이 오래 걸릴 수 있다(모델이 도구를 여러 번 오가며 처리) — 화면은 기다리는 동안 진행 표시.
 */
@Controller('ai')
@RequirePermissions('AI.USE')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status() {
    return this.ai.status();
  }

  @Get('tools')
  tools(@CurrentUser() user: AuthPrincipal) {
    return this.ai.catalogFor(user);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthPrincipal) {
    return this.ai.list(user.userId);
  }

  @Post('conversations')
  create(@CurrentUser() user: AuthPrincipal) {
    return this.ai.create(user.userId);
  }

  @Get('conversations/:id')
  get(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.view(id, user.userId);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.remove(id, user.userId);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: AuthPrincipal,
    @Headers('authorization') authorization: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.ai.send(id, dto.text, { principal: user, authorization });
  }

  @Post('conversations/:id/decisions')
  decide(
    @CurrentUser() user: AuthPrincipal,
    @Headers('authorization') authorization: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideDto,
  ) {
    return this.ai.decide(id, dto.decisions, { principal: user, authorization });
  }

  @Post('conversations/:id/retry')
  retry(
    @CurrentUser() user: AuthPrincipal,
    @Headers('authorization') authorization: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ai.retry(id, { principal: user, authorization });
  }
}
