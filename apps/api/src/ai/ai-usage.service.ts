import { AsyncLocalStorage } from 'async_hooks';
import {
  ForbiddenException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { aiBilledTokens, type AiAccess, type AiFeature, type AiPrices } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { currentActorUserId } from '../events/request-context';
import { allowedFor, applyModelSetting } from './ai-models';

/** 사용 기록 보관 기간 — 이보다 오래된 줄은 하루 한 번 지운다 */
const USAGE_RETENTION_DAYS = 365;
/** 설정·사용자 정책·이번 달 사용량을 메모리에 들고 있는 시간 */
const CACHE_MS = 60_000;

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

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    register(this);
    await this.loadSetting().catch((e) =>
      this.logger.warn(`AI 설정을 읽지 못했습니다(환경변수 기본값으로): ${String(e)}`),
    );
    // 오래된 사용 기록 지우기 — 부팅 1분 뒤 한 번, 그다음 하루에 한 번
    this.timer = setInterval(() => void this.prune(), 24 * 3600_000);
    setTimeout(() => void this.prune(), 60_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (instance === this) register(null);
  }

  // ── 회사 설정 ──

  private async loadSetting(): Promise<AiSettingView | null> {
    const row = await this.prisma.aiSetting.findUnique({ where: { id: 1 } });
    this.settingAt = Date.now();
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

  // ── 사용자별 권한 ──

  async policy(userId: string): Promise<UserPolicy | null> {
    const hit = this.policies.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const row = await this.prisma.aiUserPolicy.findUnique({ where: { userId } });
    const value = row
      ? {
          access: row.access as AiAccess,
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
