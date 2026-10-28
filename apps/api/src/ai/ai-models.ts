import { AI_DEFAULT_MODEL, AI_MODELS } from '@tongin/shared';

/**
 * 실제로 부를 모델을 정한다 — 화면·블루프린트가 무엇을 골랐든 열린 모델만 쓴다.
 *  - 열린 모델: AI_ALLOWED_MODELS(쉼표) 환경변수, 없으면 목록에서 enabled인 것(Sonnet·Haiku)
 *  - 기본 모델: AI_MODEL 환경변수가 열린 모델이면 그것, 아니면 Sonnet
 * Opus는 목록에만 있고 닫혀 있어, 골라도(예전 블루프린트에 저장돼 있어도) Sonnet으로 돈다.
 */
const allowed = new Set(
  (process.env.AI_ALLOWED_MODELS ?? AI_MODELS.filter((m) => m.enabled).map((m) => m.id).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const DEFAULT_AI_MODEL =
  process.env.AI_MODEL && allowed.has(process.env.AI_MODEL)
    ? process.env.AI_MODEL
    : AI_DEFAULT_MODEL;

/** 고른 모델 → 실제 부를 모델(닫힌 모델·모르는 값이면 기본 모델) */
export function resolveModel(requested?: string | null): string {
  return requested && allowed.has(requested) ? requested : DEFAULT_AI_MODEL;
}

/** AI 비서 대화용 — 대화에 안 맞는 모델(Haiku)도 기본 모델로 */
export function resolveChatModel(requested?: string | null): string {
  const m = resolveModel(requested);
  return AI_MODELS.some((x) => x.id === m && x.chat) ? m : DEFAULT_AI_MODEL;
}

/** 화면에 보낼 모델 목록 — 서버 설정 기준으로 열림 여부를 다시 매긴다 */
export function modelOptions() {
  return AI_MODELS.map((m) => ({ ...m, enabled: allowed.has(m.id) }));
}

/** 거절 시 서버 대체 모델(fallbacks)은 Haiku에 없다 */
export const supportsFallback = (model: string) => !model.startsWith('claude-haiku');
