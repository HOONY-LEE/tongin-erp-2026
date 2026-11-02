import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { logSystem } from './system-log.sink';

/** 한 번에 보내는 최대 줄 수 */
const ROWS_MAX = 500;
/** 화면 오류 보고 — 한 사람이 1분에 이만큼까지(같은 오류가 되풀이돼도 DB가 차지 않게) */
const CLIENT_PER_MINUTE = 10;

class LogQuery {
  @IsOptional()
  @IsIn(['ERROR', 'WARN'])
  level?: 'ERROR' | 'WARN';

  @IsOptional()
  @IsIn(['API', 'WEB'])
  source?: 'API' | 'WEB';

  /** 메시지·주소·로거 이름·오류 번호에서 찾기 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

class ClientErrorDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  /** 화면에 보인 오류 번호 */
  @IsOptional()
  @Matches(/^[0-9A-F]{4,12}$/)
  ref?: string;
}

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const kstDay = (s: string, plusDays = 0) =>
  new Date(Date.parse(`${s}T00:00:00+09:00`) + plusDays * 24 * 3600_000);

@Controller('system-logs')
export class SystemLogController {
  private readonly clientCount = new Map<string, { at: number; n: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** 시스템 로그 — 기간(기본 최근 7일)·종류·출처·검색어. 최신 500줄 */
  @Get()
  @RequirePermissions('SYSTEM_LOG.READ')
  async list(@Query() q: LogQuery) {
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const to = isDate(q.to) ? kstDay(q.to!, 1) : kstDay(today, 1);
    const from = isDate(q.from) ? kstDay(q.from!) : new Date(to.getTime() - 7 * 24 * 3600_000);
    const kw = q.q?.trim();
    const where: Prisma.SystemLogWhereInput = {
      createdAt: { gte: from, lt: to },
      ...(q.level ? { level: q.level } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(kw
        ? {
            OR: [
              { ref: kw.toUpperCase() },
              { message: { contains: kw, mode: 'insensitive' } },
              { path: { contains: kw, mode: 'insensitive' } },
              { context: { contains: kw, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: ROWS_MAX,
    });
    const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
    const users = ids.length
      ? await this.prisma.appUser.findMany({
          where: { id: { in: ids } },
          select: { id: true, loginId: true, employee: { select: { name: true } } },
        })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.employee?.name ?? u.loginId]));
    return {
      truncated: rows.length === ROWS_MAX,
      rows: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        userName: r.userId ? (nameOf.get(r.userId) ?? null) : null,
      })),
    };
  }

  /** 최근 24시간 오류·경고 수(화면 위 요약) */
  @Get('stats')
  @RequirePermissions('SYSTEM_LOG.READ')
  async stats() {
    const since = new Date(Date.now() - 24 * 3600_000);
    const g = await this.prisma.systemLog.groupBy({
      by: ['level'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const n = (lv: string) => g.find((x) => x.level === lv)?._count._all ?? 0;
    const total = await this.prisma.systemLog.count();
    return { errors24h: n('ERROR'), warnings24h: n('WARN'), total };
  }

  /** 화면(브라우저)에서 난 오류 — 로그인한 누구나 보낼 수 있다(1분에 10번까지) */
  @Post('client')
  @HttpCode(204)
  client(@CurrentUser() user: AuthPrincipal, @Body() dto: ClientErrorDto) {
    const now = Date.now();
    const c = this.clientCount.get(user.userId);
    if (c && now - c.at < 60_000) {
      if (c.n >= CLIENT_PER_MINUTE) return;
      c.n++;
    } else this.clientCount.set(user.userId, { at: now, n: 1 });
    if (this.clientCount.size > 5000) this.clientCount.clear();
    logSystem({
      level: 'ERROR',
      source: 'WEB',
      context: 'browser',
      message: dto.message,
      detail: dto.detail ?? null,
      path: dto.path ?? null,
      userId: user.userId,
      ref: dto.ref ?? null,
    });
  }
}
