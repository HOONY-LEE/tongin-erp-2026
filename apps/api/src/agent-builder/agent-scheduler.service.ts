import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PERMISSION_WILDCARD,
  normalizeAgentGraph,
  type AuthPrincipal,
  type TriggerConfig,
} from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ScopeService } from '../scope/scope.service';
import { AgentRunnerService, agentRunContext } from './agent-runner.service';
import type { DomainEventBundle } from '../events/event-bus.service';

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

/** 이벤트 실행이 꼬리를 무는 깊이 한도(에이전트 → 이벤트 → 다른 에이전트 …) */
const MAX_EVENT_CHAIN = 3;
/** 한 에이전트가 1분 동안 이벤트로 시작할 수 있는 최대 횟수(폭주 방지) */
const MAX_EVENT_RUNS_PER_MINUTE = 20;
/** 자동 실행을 하려면 만든 사람이 지금도 갖고 있어야 하는 권한(에이전트 부르기와 같은 기준) */
const REQUIRED_PERMISSION = 'AI.USE';

type AutoBlueprint = { id: string; name: string; createdBy: string | null };

/**
 * 자동 실행 — '사용중' 에이전트를 만든 사람 권한으로 돌린다.
 *  - 정해진 시간: 매분 cron(한국 시간)이 맞는 에이전트. 같은 분에 두 번 돌지 않게 실행 기록으로 확인한다.
 *  - 업무 이벤트: 새 접수·계약 서명 같은 도메인 이벤트가 나면 그 이벤트로 시작하는 에이전트.
 *    에이전트가 낸 이벤트가 자기 자신을 다시 깨우지 않게 실행 사슬을 보고, 분당 횟수도 제한한다.
 * 쓰기 도구는 평소처럼 승인 대기로 멈추고, 만든 사람이 실행 기록에서 승인한다.
 * 실행할 때마다 만든 사람이 지금도 AI 권한을 갖고 있는지 다시 보고, 이벤트는 만든 사람의
 * 데이터범위(지점) 안에서 생긴 것만 넘긴다.
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
    private readonly scope: ScopeService,
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
    let due: AutoBlueprint[];
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
    for (const b of due) {
      await this.fire(b, minute).catch((e) =>
        this.logger.warn(
          `'${b.name}' 예약 확인 실패: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }
  }

  private async fire(b: AutoBlueprint, minute: Date) {
    const already = await this.prisma.agentRun.count({
      where: {
        blueprintId: b.id,
        createdAt: { gte: minute },
        input: { path: ['_trigger'], equals: 'schedule' },
      },
    });
    if (already) return;
    await this.runAsCreator(b, { _trigger: 'schedule' }, '예약');
  }

  /** 업무 이벤트 → 그 이벤트로 시작하는 '사용중' 에이전트 실행(요청을 붙잡지 않게 뒤에서) */
  @OnEvent('**')
  onDomainEvent(e: DomainEventBundle) {
    if (process.env.AGENT_SCHEDULER === 'off' || process.env.NODE_ENV === 'test') return;
    const chain = agentRunContext.getStore()?.chain ?? [];
    if (chain.length >= MAX_EVENT_CHAIN) return;
    void this.dispatch(e, chain).catch((err) =>
      this.logger.warn(
        `이벤트 실행 실패(${e.eventType}): ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  private async dispatch(e: DomainEventBundle, chain: string[]) {
    const rows = await this.prisma.agentBlueprint.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, createdBy: true, graph: true },
    });
    const targets = rows.filter((b) => {
      if (chain.includes(b.id)) return false;
      const t = normalizeAgentGraph(b.graph).nodes.find((n) => n.type === 'trigger');
      const c = t?.config as TriggerConfig | undefined;
      return c?.kind === 'event' && c.event === e.eventType;
    });
    for (const b of targets) {
      const recent = await this.prisma.agentRun.count({
        where: {
          blueprintId: b.id,
          createdAt: { gte: new Date(Date.now() - 60_000) },
          input: { path: ['_trigger'], equals: 'event' },
        },
      });
      if (recent >= MAX_EVENT_RUNS_PER_MINUTE) {
        this.logger.warn(
          `'${b.name}' 이벤트 실행 건너뜀 — 1분에 ${MAX_EVENT_RUNS_PER_MINUTE}번을 넘었습니다.`,
        );
        continue;
      }
      const event = {
        type: e.eventType,
        id: e.aggregateId,
        aggregateType: e.aggregateType,
        ...e.payload,
      };
      // 사슬을 이어 줘야 이 실행이 낸 이벤트가 같은 에이전트를 다시 깨우지 않는다
      await agentRunContext.run({ chain }, () =>
        this.runAsCreator(b, { _trigger: 'event', event }, `이벤트 ${e.eventType}`, e),
      );
    }
  }

  /** 만든 사람 권한(주체 + 30분짜리 토큰)으로 실행 */
  private async runAsCreator(
    b: AutoBlueprint,
    input: Record<string, unknown>,
    why: string,
    event?: DomainEventBundle,
  ) {
    try {
      const principal = b.createdBy ? await this.auth.buildPrincipal(b.createdBy) : null;
      if (!principal) {
        this.logger.warn(`'${b.name}' ${why} 실행 건너뜀 — 만든 사람 계정이 없거나 비활성입니다.`);
        return;
      }
      // 권한을 회수당한 사람의 에이전트가 계속 돌지 않게 — 실행 때마다 다시 확인한다
      if (
        !principal.permissions.includes(PERMISSION_WILDCARD) &&
        !principal.permissions.includes(REQUIRED_PERMISSION)
      ) {
        this.logger.warn(
          `'${b.name}' ${why} 실행 건너뜀 — 만든 사람(${principal.loginId})에게 ${REQUIRED_PERMISSION} 권한이 없습니다.`,
        );
        return;
      }
      if (event && !(await this.eventInScope(event, principal))) {
        this.logger.log(
          `'${b.name}' ${why} 실행 건너뜀 — 만든 사람(${principal.loginId})의 데이터범위 밖 이벤트입니다.`,
        );
        return;
      }
      const token = await this.jwt.signAsync(
        { sub: principal.userId, loginId: principal.loginId },
        { expiresIn: 30 * 60 },
      );
      this.logger.log(`'${b.name}' ${why} 실행 (${principal.loginId})`);
      await this.runner.start(
        b.id,
        { input, dryRun: false, mockLlm: false },
        { principal, authorization: `Bearer ${token}` },
      );
    } catch (e) {
      this.logger.warn(
        `'${b.name}' ${why} 실행 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * 이벤트가 만든 사람의 데이터범위 안에서 생겼는지 — 전체 범위면 늘 통과.
   * 지점을 알 수 없는 이벤트(본사 전용 자재·청구 등)는 지점 범위인 사람에게 넘기지 않는다.
   */
  private async eventInScope(e: DomainEventBundle, principal: AuthPrincipal): Promise<boolean> {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids === null) return true;
    if (!ids.length) return false;
    const org = await this.eventOrgUnitId(e);
    return !!org && ids.includes(org);
  }

  /** 이벤트가 속한 지점 — payload의 orgUnitId, 없으면 대상 레코드에서 찾는다 */
  private async eventOrgUnitId(e: DomainEventBundle): Promise<string | null> {
    const fromPayload = e.payload?.orgUnitId;
    if (typeof fromPayload === 'string' && fromPayload) return fromPayload;
    const id = e.aggregateId;
    const sel = { select: { orgUnitId: true } } as const;
    try {
      switch (e.aggregateType) {
        case 'lead':
          return (await this.prisma.lead.findUnique({ where: { id }, ...sel }))?.orgUnitId ?? null;
        case 'estimate':
          return (
            (await this.prisma.estimate.findUnique({ where: { id }, ...sel }))?.orgUnitId ?? null
          );
        case 'contract':
          return (
            (await this.prisma.contract.findUnique({ where: { id }, ...sel }))?.orgUnitId ?? null
          );
        case 'payment': {
          const p = await this.prisma.payment.findUnique({
            where: { id },
            select: { contract: { select: { orgUnitId: true } } },
          });
          return p?.contract?.orgUnitId ?? null;
        }
        case 'work_order':
          return (
            (await this.prisma.workOrder.findUnique({ where: { id }, ...sel }))?.orgUnitId ?? null
          );
        case 'service_order':
          return (
            (await this.prisma.serviceOrder.findUnique({ where: { id }, ...sel }))?.orgUnitId ??
            null
          );
        case 'support_ticket':
          return (
            (await this.prisma.supportTicket.findUnique({ where: { id }, ...sel }))?.orgUnitId ??
            null
          );
        case 'invoice':
          return (
            (await this.prisma.invoice.findUnique({ where: { id }, ...sel }))?.orgUnitId ?? null
          );
        case 'org_unit':
          return id;
        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
