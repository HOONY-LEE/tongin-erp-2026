import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { normalizeAgentGraph, type TriggerConfig } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AgentRunnerService } from './agent-runner.service';

/** cron 한 칸(예: 별/15, 1-5, 0,30)이 값에 맞는지 */
function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  return field.split(',').some((part) => {
    const [range, stepText] = part.split('/');
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) return false;
    let lo: number;
    let hi: number;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      [lo, hi] = range.split('-').map(Number);
    } else {
      lo = Number(range);
      hi = stepText ? max : lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) return false;
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

/** 표준 cron 5칸(분 시 일 월 요일) — 한국 시간. 일·요일이 둘 다 정해져 있으면 둘 중 하나만 맞아도 된다 */
export function cronMatches(cron: string, kst: Date): boolean {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return false;
  const [mi, h, dom, mon, dow] = f;
  const day = kst.getUTCDay();
  const dowOk = fieldMatches(dow, day, 0, 7) || (day === 0 && fieldMatches(dow, 7, 0, 7));
  const domOk = fieldMatches(dom, kst.getUTCDate(), 1, 31);
  const dayOk =
    dom !== '*' && dow !== '*' ? domOk || dowOk : dom !== '*' ? domOk : dow !== '*' ? dowOk : true;
  return (
    fieldMatches(mi, kst.getUTCMinutes(), 0, 59) &&
    fieldMatches(h, kst.getUTCHours(), 0, 23) &&
    fieldMatches(mon, kst.getUTCMonth() + 1, 1, 12) &&
    dayOk
  );
}

/**
 * 정해진 시간 실행 — 매분 '사용중' 에이전트 중 시작이 '정해진 시간'이고 cron이 지금(한국 시간)과 맞는 것을
 * 만든 사람 권한으로 실행한다. 같은 분에 두 번 돌지 않게 실행 기록으로 확인한다.
 * 쓰기 도구는 평소처럼 승인 대기로 멈추고, 만든 사람이 실행 기록에서 승인한다.
 */
@Injectable()
export class AgentSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AgentScheduler');
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly runner: AgentRunnerService,
  ) {}

  onModuleInit() {
    if (process.env.AGENT_SCHEDULER === 'off' || process.env.NODE_ENV === 'test') return;
    // 다음 분 정각에 맞춰 시작해 매분 돈다
    const wait = 60_000 - (Date.now() % 60_000) + 500;
    this.first = setTimeout(() => {
      void this.tick();
      this.timer = setInterval(() => void this.tick(), 60_000);
    }, wait);
  }

  onModuleDestroy() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const kst = new Date(minute.getTime() + 9 * 3600_000);
    let due: { id: string; name: string; createdBy: string | null }[];
    try {
      const rows = await this.prisma.agentBlueprint.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, createdBy: true, graph: true },
      });
      due = rows.filter((b) => {
        const t = normalizeAgentGraph(b.graph).nodes.find((n) => n.type === 'trigger');
        const c = t?.config as TriggerConfig | undefined;
        return c?.kind === 'schedule' && cronMatches(c.cron, kst);
      });
    } catch (e) {
      this.logger.warn(`예약 확인 실패: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    for (const b of due) await this.fire(b, minute);
  }

  private async fire(b: { id: string; name: string; createdBy: string | null }, minute: Date) {
    try {
      const already = await this.prisma.agentRun.count({
        where: {
          blueprintId: b.id,
          createdAt: { gte: minute },
          input: { path: ['_trigger'], equals: 'schedule' },
        },
      });
      if (already) return;
      const principal = b.createdBy ? await this.auth.buildPrincipal(b.createdBy) : null;
      if (!principal) {
        this.logger.warn(`'${b.name}' 예약 실행 건너뜀 — 만든 사람 계정이 없거나 비활성입니다.`);
        return;
      }
      const token = await this.jwt.signAsync(
        { sub: principal.userId, loginId: principal.loginId },
        { expiresIn: 30 * 60 },
      );
      this.logger.log(`'${b.name}' 예약 실행 (${principal.loginId})`);
      await this.runner.start(
        b.id,
        { input: { _trigger: 'schedule' }, dryRun: false, mockLlm: false },
        { principal, authorization: `Bearer ${token}` },
      );
    } catch (e) {
      this.logger.warn(`'${b.name}' 예약 실행 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
