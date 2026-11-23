import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { IsObject, IsOptional } from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AccessLog } from '../audit/access-log';
import { AiService } from './ai.service';

class RunDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

const DAY = 86_400_000;

/**
 * 개발자 메뉴 — AI가 쓸 수 있는 도구 전부(업무 도구 + ERP API 카탈로그)를 보여 주고 시험 실행한다.
 * 시험 실행은 조회(READ) 도구만, 이 화면을 연 사람의 권한·토큰으로 — 권한 가드·지점 범위가 그대로 걸린다.
 * 등록·수정·삭제·발송(WRITE) 도구는 여기서 실행하지 않는다(AI 대화의 승인 카드로만).
 */
@Controller('dev')
@RequirePermissions('AI.DEV')
export class DevToolsController {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('tools')
  async tools() {
    const since = new Date(Date.now() - 30 * DAY);
    const usage = await this.prisma.aiToolCall.groupBy({
      by: ['toolName'],
      where: { createdAt: { gte: since } },
      _count: true,
      _max: { createdAt: true },
    });
    const used = new Map(usage.map((u) => [u.toolName, u]));
    return this.ai.allTools().map((t) => ({
      name: t.name,
      description: t.description,
      group: t.group ?? (t.source === 'domain' ? 'AI 업무 도구' : null),
      source: t.source,
      endpoint: t.endpoint ?? null,
      mode: t.mode,
      permissions: t.permissions,
      deferred: t.deferred,
      inputSchema: t.inputSchema,
      calls30d: used.get(t.name)?._count ?? 0,
      lastUsedAt: used.get(t.name)?._max.createdAt ?? null,
    }));
  }

  @AccessLog('ai-tool', 'VIEW')
  @Post('tools/:name/run')
  async run(
    @CurrentUser() user: AuthPrincipal,
    @Headers('authorization') authorization: string,
    @Param('name') name: string,
    @Body() dto: RunDto,
  ) {
    const tool = this.ai.allTools().find((t) => t.name === name);
    if (!tool) throw new NotFoundException('없는 도구입니다.');
    if (tool.mode !== 'READ')
      throw new BadRequestException('데이터를 바꾸는 도구는 시험 실행하지 않습니다.');
    if (!this.ai.toolsFor(user).some((t) => t.name === name))
      throw new ForbiddenException('이 도구를 쓸 권한이 없습니다.');
    const started = Date.now();
    try {
      const result = await tool.run(dto.input ?? {}, { principal: user, authorization });
      return { ok: true, ms: Date.now() - started, result };
    } catch (e) {
      return {
        ok: false,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
