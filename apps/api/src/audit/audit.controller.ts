import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ACCESS_ACTIONS, writeAccessLog } from './access-log';
import { LIST_LIMIT, listWhere, type ListFilterRules } from '../common/list-filter';

/** 접근 기록 화면 필터 — 대상은 표 내려받기('table' = table:*) 또는 기록 대상 종류 */
const ACCESS_RULES: ListFilterRules = {
  target: {
    custom: (v) => {
      const list = Array.isArray(v) ? v : [];
      if (!list.length) return null;
      const kinds = list.filter((x) => x !== 'table');
      return {
        OR: [
          ...(kinds.length ? [{ entityType: { in: kinds } }] : []),
          ...(list.includes('table') ? [{ entityType: { startsWith: 'table:' } }] : []),
        ],
      };
    },
  },
  // 사용자 id(uuid 칸 — 모양이 아닌 값은 버린다)
  who: {
    custom: (v) => {
      const ids = (Array.isArray(v) ? v : []).filter((x) => UUID_RE.test(x));
      return ids.length ? { actorUserId: { in: ids } } : null;
    },
  },
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 화면에서 표를 내려받았다 — 표 내보내기는 브라우저 안에서 만들어지므로 화면이 알려 준다 */
export class ExportLogDto {
  /** 내려받은 화면 주소(예: /customers) */
  @IsString()
  @MaxLength(200)
  screen!: string;

  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsIn(['csv', 'xlsx', 'json', 'xml'])
  format!: string;

  @IsInt()
  @Min(0)
  rowCount!: number;

  /** 내려받은 칸 이름 */
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  columns!: string[];

  /** 가려서 내려받은 칸 이름 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  masked?: string[];
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class AccessLogQueryDto {
  @IsOptional()
  @IsIn(ACCESS_ACTIONS)
  action?: string;

  @IsOptional()
  @Matches(YMD)
  from?: string;

  @IsOptional()
  @Matches(YMD)
  to?: string;

  /** 화면 필터(FilterButton) — target(대상: 'table' 또는 entityType)·who(사용자 id) */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  f?: string;

  /** 검색 — 경로·대상·대상 id·사용자 이름/아이디 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

@Controller()
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('audit-logs')
  @RequirePermissions('AUDIT.READ')
  auditLogs(@Query('entityType') entityType?: string) {
    return this.prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('domain-events')
  @RequirePermissions('AUDIT.READ')
  domainEvents(@Query('aggregateType') aggregateType?: string) {
    return this.prisma.domainEvent.findMany({
      where: aggregateType ? { aggregateType } : undefined,
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  /** 표 내려받기 기록 — 로그인한 누구나 자기 내려받기를 남긴다(권한 검사 없음: 기록만 쓴다) */
  @Post('access-logs/export')
  @HttpCode(204)
  async logExport(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: ExportLogDto,
    @Req() req: Request,
  ) {
    await writeAccessLog(this.prisma, {
      resource: `table:${dto.screen}`,
      action: 'EXPORT',
      actorUserId: user.userId,
      method: req.method,
      path: dto.screen,
      detail: {
        fileName: dto.fileName,
        format: dto.format,
        rowCount: dto.rowCount,
        columns: dto.columns,
        masked: dto.masked ?? [],
      },
    });
  }

  /** 개인정보 접근 기록(열람·목록·내려받기) — 최근 것부터 1000줄. 기간(한국 날짜, 포함)·종류로 거른다 */
  @Get('access-logs')
  @RequirePermissions('AUDIT.READ')
  async accessLogs(@Query() q: AccessLogQueryDto) {
    const gte = q.from ? new Date(`${q.from}T00:00:00+09:00`) : undefined;
    const lt = q.to ? new Date(Date.parse(`${q.to}T00:00:00+09:00`) + 86_400_000) : undefined;
    // 검색어가 사용자 이름·아이디면 그 사용자의 기록도(기록에는 사용자 id만 있다)
    const term = q.q?.trim();
    const byUser = term
      ? await this.prisma.appUser.findMany({
          where: {
            OR: [
              { loginId: { contains: term, mode: 'insensitive' } },
              { employee: { name: { contains: term, mode: 'insensitive' } } },
            ],
          },
          select: { id: true },
          take: 200,
        })
      : [];
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: q.action ? q.action : { in: ACCESS_ACTIONS },
        ...(gte || lt ? { createdAt: { ...(gte && { gte }), ...(lt && { lt }) } } : {}),
        AND: [
          ...listWhere(ACCESS_RULES, q.f),
          ...(term
            ? [
                {
                  OR: [
                    { path: { contains: term, mode: 'insensitive' as const } },
                    { entityType: { contains: term, mode: 'insensitive' as const } },
                    { entityId: { contains: term, mode: 'insensitive' as const } },
                    ...(byUser.length ? [{ actorUserId: { in: byUser.map((u) => u.id) } }] : []),
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    const ids = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, loginId: true, employee: { select: { name: true } } },
    });
    const who = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const u = r.actorUserId ? who.get(r.actorUserId) : undefined;
      return {
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        resource: r.entityType,
        entityId: r.entityId,
        path: r.path,
        detail: r.after,
        userId: r.actorUserId,
        loginId: u?.loginId ?? null,
        userName: u?.employee?.name ?? null,
      };
    });
  }
}
