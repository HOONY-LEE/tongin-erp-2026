import { AsyncLocalStorage } from 'async_hooks';
import {
  ForbiddenException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  aiBilledTokens,
  type AiAccess,
  type AiFeature,
  type AiModelDef,
  type AiPrices,
} from '@tongin/shared';
import type { Prisma } from '@prisma/client';
import { createClaude } from '../agent-builder/agent-claude';
import { PrismaService } from '../prisma/prisma.service';
import { currentActorUserId } from '../events/request-context';
import {
  allowedFor,
  allowedModels,
  applyModelSetting,
  defaultModel,
  setCatalog,
} from './ai-models';

/** 사용 기록 보관 기간 — 이보다 오래된 줄은 하루 한 번 지운다 */
const USAGE_RETENTION_DAYS = 365;
/** 설정·사용자 정책·이번 달 사용량을 메모리에 들고 있는 시간 */
const CACHE_MS = 60_000;
/** 모델 목록을 Claude에서 다시 받는 간격 */
const CATALOG_REFRESH_MS = 6 * 3600_000;

/**
 * 누가 부른 AI 호출인지 — HTTP 요청이면 로그인한 사람, 예약·이벤트로 돈 에이전트면 실행 주인.
 * 에이전트 실행기가 aiCaller.run({ userId, refId })로 감싼다.
 */
export const aiCaller = new AsyncLocalStorage<{ userId?: string | null; refId?: string }>();

interface ClaudeResult {
  model?: string;
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null;
}

let instance: AiUsageService | null = null;
const register = (s: AiUsageService | null) => {
  instance = s;
};

/**
 * Claude 호출 하나를 감싼다 — 부르기 전에 사용자 권한·월 한도를 보고, 끝나면 사용량(토큰·시간·성공 여부)을 남긴다.
 * 서비스마다 주입하지 않아도 되게 모듈 함수로 둔다(AiUsageService가 부팅 때 자기를 등록).
 */
export async function trackClaude<T extends ClaudeResult>(
  feature: AiFeature,
  model: string,
  call: () => Promise<T>,
  refId?: string | null,
): Promise<T> {
  const caller = aiCaller.getStore();
  const userId = caller?.userId ?? currentActorUserId() ?? null;
  const ref = refId ?? caller?.refId ?? null;
  if (instance && userId) await instance.assertCanUse(userId);
  const started = Date.now();
  try {
    const res = await call();
    instance?.record({
      userId,
      feature,
      model: res.model || model,
      usage: res.usage,
      durationMs: Date.now() - started,
      refId: ref,
    });
    return res;
  } catch (e) {
    instance?.record({
      userId,
      feature,
      model,
      durationMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
      refId: ref,
    });
    throw e;
  }
}

export interface AiSettingView {
  allowed: string[];
  defaultModel: string;
  prices: AiPrices;
  monthlyTokenLimit: number | null;
  updatedAt: string | null;
}

export interface UserPolicy {
  access: AiAccess;
  builderAccess: AiAccess;
  models: string[];
  monthlyTokenLimit: number | null;
}

/** 한국 시간 이번 달 1일 0시(UTC 시각) */
export function kstMonthStart(d = new Date(), offsetMonths = 0): Date {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + offsetMonths, 1) - 9 * 3600_000);
}

/**
 * AI 관리 — 회사 설정(열린 모델·기본 모델·단가·기본 월 한도), 사용자별 권한, 사용 기록.
 */
@Injectable()
export class AiUsageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiUsageService.name);
  private setting: AiSettingView | null = null;
  private settingAt = 0;
  private readonly policies = new Map<string, { at: number; value: UserPolicy | null }>();
  private readonly monthUsed = new Map<string, { at: number; month: number; tokens: number }>();
  private timer: NodeJS.Timeout | null = null;
  private catalogTimer: NodeJS.Timeout | null = null;
  private catalogAt: Date | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    register(this);
    await this.loadSetting().catch((e) =>
      this.logger.warn(`AI 설정을 읽지 못했습니다(환경변수 기본값으로): ${String(e)}`),
    );
    // 오래된 사용 기록 지우기 — 부팅 1분 뒤 한 번, 그다음 하루에 한 번
    this.timer = setInterval(() => void this.prune(), 24 * 3600_000);
    setTimeout(() => void this.prune(), 60_000).unref();
    // 모델 목록 — 받은 지 오래됐으면 부팅 20초 뒤, 그다음 6시간마다 Claude에서 다시 받는다
    const stale = !this.catalogAt || Date.now() - this.catalogAt.getTime() > CATALOG_REFRESH_MS;
    if (stale) setTimeout(() => void this.refreshCatalog().catch(() => undefined), 20_000).unref();
    this.catalogTimer = setInterval(
      () => void this.refreshCatalog().catch(() => undefined),
      CATALOG_REFRESH_MS,
    );
    this.catalogTimer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.catalogTimer) clearInterval(this.catalogTimer);
    if (instance === this) register(null);
  }

  // ── 회사 설정 ──

  private async loadSetting(): Promise<AiSettingView | null> {
    const row = await this.prisma.aiSetting.findUnique({ where: { id: 1 } });
    this.settingAt = Date.now();
    // 받아 둔 모델 목록을 먼저 — 열린 모델은 이 목록 안에서만 남는다
    if (row) {
      this.catalogAt = row.catalogAt;
      setCatalog(parseCatalog(row.catalog));
    }
    this.setting = row
      ? {
          allowed: row.allowed,
          defaultModel: row.defaultModel,
          prices: (row.prices ?? {}) as AiPrices,
          monthlyTokenLimit: row.monthlyTokenLimit,
          updatedAt: row.updatedAt.toISOString(),
        }
      : null;
    if (this.setting) applyModelSetting(this.setting.allowed, this.setting.defaultModel);
    return this.setting;
  }

  /** 설정(없으면 null) — 1분마다 DB에서 다시 읽는다(다른 서버 인스턴스에서 바꾼 것 반영) */
  async getSetting(): Promise<AiSettingView | null> {
    if (Date.now() - this.settingAt > CACHE_MS) await this.loadSetting();
    return this.setting;
  }

  async saveSetting(
    data: Omit<AiSettingView, 'updatedAt'>,
    userId: string,
  ): Promise<AiSettingView | null> {
    await this.prisma.aiSetting.upsert({
      where: { id: 1 },
      create: { id: 1, ...data, prices: data.prices, updatedBy: userId },
      update: { ...data, prices: data.prices, updatedBy: userId },
    });
    return this.loadSetting();
  }

  // ── 모델 목록(Claude Models API) ──

  get catalogFetchedAt() {
    return this.catalogAt?.toISOString() ?? null;
  }

  /**
   * Claude에 지금 쓸 수 있는 모델 목록을 물어 저장한다 — 새 모델이 나오면 목록에 생기고(관리자가 켜야 쓰임),
   * 은퇴한 모델은 목록·열린 모델에서 빠진다. 키가 없으면 아무것도 안 한다.
   */
  async refreshCatalog(): Promise<{ count: number; fetchedAt: string } | null> {
    const client = createClaude();
    if (!client) return null;
    const list: AiModelDef[] = [];
    for await (const m of client.models.list({ limit: 100 })) {
      if (m.lifecycle === 'retired') continue;
      const created =
        m.created_at && !m.created_at.startsWith('1970') ? m.created_at.slice(0, 10) : null;
      const small = m.line === 'haiku';
      list.push({
        id: m.id,
        label: m.display_name || m.id,
        hint: [
          small ? '짧은 분류·요약' : '대화·에이전트',
          m.lifecycle === 'deprecated' ? '곧 종료' : null,
          created ? `${created.slice(0, 7)} 출시` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        chat: !small,
        lifecycle: m.lifecycle === 'deprecated' ? 'deprecated' : 'active',
        createdAt: created,
      });
    }
    if (!list.length) return null;
    const now = new Date();
    const catalog = list as unknown as Prisma.InputJsonValue;
    // 설정 줄이 아직 없으면 지금 쓰는 값(환경변수 기본)으로 만들어 둔다
    await this.prisma.aiSetting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        allowed: allowedModels(),
        defaultModel: defaultModel(),
        catalog,
        catalogAt: now,
      },
      update: { catalog, catalogAt: now },
    });
    await this.loadSetting();
    this.logger.log(`Claude 모델 목록 ${list.length}개 받음`);
    return { count: list.length, fetchedAt: now.toISOString() };
  }

  // ── 사용자별 권한 ──

  async policy(userId: string): Promise<UserPolicy | null> {
    const hit = this.policies.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const row = await this.prisma.aiUserPolicy.findUnique({ where: { userId } });
    const value = row
      ? {
          access: row.access as AiAccess,
          builderAccess: row.builderAccess as AiAccess,
          models: row.models,
          monthlyTokenLimit: row.monthlyTokenLimit,
        }
      : null;
    this.policies.set(userId, { at: Date.now(), value });
    return value;
  }

  forgetPolicy(userId: string) {
    this.policies.delete(userId);
  }

  /** 이 사용자가 쓸 수 있는 모델 */
  async modelsFor(userId: string | null | undefined): Promise<Set<string>> {
    return allowedFor(userId ? (await this.policy(userId))?.models : null);
  }

  /** 이 사용자의 월 한도(토큰) — 사용자 한도 > 회사 기본 한도 > 무제한(null) */
  async limitFor(userId: string): Promise<number | null> {
    const p = await this.policy(userId);
    return p?.monthlyTokenLimit ?? (await this.getSetting())?.monthlyTokenLimit ?? null;
  }

  /** 이번 달(한국 시간) 한도에 센 토큰 */
  async usedThisMonth(userId: string): Promise<number> {
    const month = kstMonthStart().getTime();
    const hit = this.monthUsed.get(userId);
    if (hit && hit.month === month && Date.now() - hit.at < CACHE_MS) return hit.tokens;
    const agg = await this.prisma.aiUsageLog.aggregate({
      where: { userId, createdAt: { gte: new Date(month) } },
      _sum: { inputTokens: true, outputTokens: true, cacheWriteTokens: true },
    });
    const tokens = aiBilledTokens({
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      cacheWriteTokens: agg._sum.cacheWriteTokens ?? 0,
    });
    this.monthUsed.set(userId, { at: Date.now(), month, tokens });
    return tokens;
  }

  /** 막힌 사용자·한도를 다 쓴 사용자면 403 */
  async assertCanUse(userId: string) {
    const p = await this.policy(userId);
    if (p?.access === 'BLOCK')
      throw new ForbiddenException('관리자가 이 계정의 AI 사용을 막아 두었습니다.');
    const limit = await this.limitFor(userId);
    if (limit != null && (await this.usedThisMonth(userId)) >= limit)
      throw new ForbiddenException(
        `이번 달 AI 사용 한도(${limit.toLocaleString('ko-KR')} 토큰)를 다 썼습니다. 관리자에게 한도를 늘려 달라고 요청하세요.`,
      );
  }

  // ── 사용 기록 ──

  /** 기다리지 않는다 — 기록이 실패해도 AI 응답은 그대로 간다 */
  record(e: {
    userId: string | null;
    feature: AiFeature;
    model: string;
    usage?: ClaudeResult['usage'];
    durationMs: number;
    error?: string;
    refId?: string | null;
  }) {
    const u = {
      inputTokens: e.usage?.input_tokens ?? 0,
      outputTokens: e.usage?.output_tokens ?? 0,
      cacheReadTokens: e.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: e.usage?.cache_creation_input_tokens ?? 0,
    };
    if (e.userId) {
      const hit = this.monthUsed.get(e.userId);
      if (hit) hit.tokens += aiBilledTokens(u);
    }
    void this.prisma.aiUsageLog
      .create({
        data: {
          userId: e.userId,
          feature: e.feature,
          model: e.model.slice(0, 80),
          ...u,
          durationMs: Math.min(e.durationMs, 2_000_000_000),
          ok: !e.error,
          error: e.error?.slice(0, 500) ?? null,
          refId: e.refId ?? null,
        },
      })
      .catch((err) => this.logger.warn(`AI 사용 기록을 남기지 못했습니다: ${String(err)}`));
  }

  private async prune() {
    try {
      const cut = new Date(Date.now() - USAGE_RETENTION_DAYS * 24 * 3600_000);
      const { count } = await this.prisma.aiUsageLog.deleteMany({
        where: { createdAt: { lt: cut } },
      });
      if (count) this.logger.log(`1년 지난 AI 사용 기록 ${count}줄을 지웠습니다`);
    } catch (e) {
      this.logger.warn(`AI 사용 기록 정리 실패: ${String(e)}`);
    }
  }
}

/** 저장된 모델 목록 읽기 — 모양이 틀린 줄은 버린다 */
function parseCatalog(v: Prisma.JsonValue): AiModelDef[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || typeof x.id !== 'string') return [];
    return [
      {
        id: x.id,
        label: typeof x.label === 'string' ? x.label : x.id,
        hint: typeof x.hint === 'string' ? x.hint : '',
        chat: x.chat !== false,
        lifecycle: x.lifecycle === 'deprecated' ? ('deprecated' as const) : ('active' as const),
        createdAt: typeof x.createdAt === 'string' ? x.createdAt : null,
      },
    ];
  });
}
