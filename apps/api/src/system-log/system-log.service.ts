import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { drainSystemLogs, logSystem, requeueSystemLogs } from './system-log.sink';

/** 모아 둔 로그를 DB에 넣는 간격 */
const FLUSH_MS = 5_000;
/** 보관 — 30일, 그리고 최대 2만 줄(넘으면 오래된 것부터) */
const RETENTION_DAYS = 30;
const MAX_ROWS = 20_000;

/**
 * 시스템 로그 — 모아 둔 경고·오류(system-log.sink)를 몇 초마다 DB에 넣고, 한 시간마다 오래된 줄을 지운다.
 * 처리 안 된 Promise 거절·예외도 여기서 잡아 남긴다(서버는 계속 돈다).
 */
@Injectable()
export class SystemLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SystemLog');
  private flushTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_MS);
    this.pruneTimer = setInterval(() => void this.prune(), 3600_000);
    setTimeout(() => void this.prune(), 90_000).unref();
    process.on('unhandledRejection', this.onRejection);
  }

  async onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    process.off('unhandledRejection', this.onRejection);
    await this.flush();
  }

  private readonly onRejection = (reason: unknown) => {
    const e = reason instanceof Error ? reason : null;
    this.logger.error(`처리되지 않은 오류: ${e?.message ?? String(reason)}`, e?.stack);
    logSystem({
      level: 'ERROR',
      source: 'API',
      context: 'unhandledRejection',
      message: e?.message ?? String(reason),
      detail: e?.stack ?? null,
    });
  };

  async flush() {
    if (this.flushing) return;
    const rows = drainSystemLogs();
    if (!rows.length) return;
    this.flushing = true;
    try {
      await this.prisma.systemLog.createMany({ data: rows });
    } catch (e) {
      // DB가 잠시 안 될 때 — 다음 번에 다시(메모리 한도 안에서). 여기서 logger.error를 부르면 되돌아 들어온다
      requeueSystemLogs(rows);
      console.error(`[SystemLog] 로그를 DB에 넣지 못했습니다: ${String(e)}`);
    } finally {
      this.flushing = false;
    }
  }

  private async prune() {
    try {
      const cut = new Date(Date.now() - RETENTION_DAYS * 24 * 3600_000);
      const old = await this.prisma.systemLog.deleteMany({ where: { createdAt: { lt: cut } } });
      // 2만 줄을 넘으면 그 경계보다 오래된 줄을 지운다
      const edge = await this.prisma.systemLog.findFirst({
        orderBy: { createdAt: 'desc' },
        skip: MAX_ROWS,
        select: { createdAt: true },
      });
      const over = edge
        ? await this.prisma.systemLog.deleteMany({ where: { createdAt: { lte: edge.createdAt } } })
        : { count: 0 };
      if (old.count + over.count)
        this.logger.log(`오래된 시스템 로그 ${old.count + over.count}줄을 지웠습니다`);
    } catch (e) {
      console.error(`[SystemLog] 정리 실패: ${String(e)}`);
    }
  }
}
