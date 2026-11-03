import { AI_DEFAULT_MODEL, AI_MODELS, type AiModelDef } from '@tongin/shared';

/**
 * 모델 목록과 실제로 부를 모델 — 화면·블루프린트가 무엇을 골랐든 열린 모델만 쓴다.
 *  - 모델 목록(catalog): Claude Models API에서 받아 둔 것(AiUsageService가 몇 시간마다·관리자가 누를 때 받아
 *    ai_setting.catalog에 저장). 아직 한 번도 못 받았으면(키 없음 등) 코드의 기본 목록(AI_MODELS)
 *  - 열린 모델·기본 모델: 관리자가 'AI 관리'에서 정한 값(ai_setting). 아직 정한 적 없으면
 *    AI_ALLOWED_MODELS(쉼표)·AI_MODEL 환경변수, 그것도 없으면 기본 목록에서 enabled인 것과 Sonnet
 *  - 사용자별로 모델을 좁혀 두었으면 그 안에서만(allowedFor)
 */
const FALLBACK: AiModelDef[] = AI_MODELS.map((m) => ({
  id: m.id,
  label: m.label,
  hint: m.hint,
  chat: m.chat,
  lifecycle: 'active',
  createdAt: null,
}));

const envAllowed = (
  process.env.AI_ALLOWED_MODELS ??
  AI_MODELS.filter((m) => m.enabled)
    .map((m) => m.id)
    .join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const state = {
  catalog: FALLBACK,
  /** 받아 둔 목록이 있으면 true — 없으면 기본 목록이라 모르는 id도 그냥 둔다 */
  live: false,
  allowed: new Set(envAllowed),
  defaultModel:
    process.env.AI_MODEL && envAllowed.includes(process.env.AI_MODEL)
      ? process.env.AI_MODEL
      : AI_DEFAULT_MODEL,
};

const known = (id: string) => state.catalog.some((m) => m.id === id);
export const isChatModel = (id: string) => state.catalog.some((m) => m.id === id && m.chat);
export const modelCatalog = () => state.catalog;
export const catalogIsLive = () => state.live;

/** 받아 둔 모델 목록 반영 — 없어진(은퇴한) 모델은 열린 목록에서도 뺀다 */
export function setCatalog(list: AiModelDef[]) {
  if (!list.length) return;
  state.catalog = list;
  state.live = true;
  const open = [...state.allowed].filter(known);
  state.allowed = new Set(
    open.length
      ? open
      : list
          .filter((m) => m.chat)
          .slice(0, 1)
          .map((m) => m.id),
  );
  if (!state.allowed.has(state.defaultModel))
    state.defaultModel =
      [...state.allowed].find(isChatModel) ?? [...state.allowed][0] ?? state.defaultModel;
}

/** 관리자 설정 반영 — 모르는 모델 id는 버리고, 기본 모델이 닫혀 있으면 열린 것 중 대화용 첫 모델로 */
export function applyModelSetting(allowed: string[], defaultModel: string) {
  const open = allowed.filter(known);
  if (!open.length) return;
  state.allowed = new Set(open);
  state.defaultModel = open.includes(defaultModel)
    ? defaultModel
    : (state.catalog.find((m) => m.chat && open.includes(m.id))?.id ?? open[0]);
}

export const defaultModel = () => state.defaultModel;
export const allowedModels = () => [...state.allowed];
export const isKnownModel = known;

/** 회사에 열린 모델 ∩ 사용자에게 준 모델(비었으면 회사에 열린 모델 전부) */
export function allowedFor(userModels?: string[] | null): Set<string> {
  if (!userModels?.length) return state.allowed;
  const s = new Set(userModels.filter((m) => state.allowed.has(m)));
  return s.size ? s : state.allowed;
}

/** 고른 모델 → 실제 부를 모델(닫힌 모델·모르는 값이면 기본 모델, 기본도 막혔으면 쓸 수 있는 첫 모델) */
export function resolveModel(
  requested?: string | null,
  allowed: Set<string> = state.allowed,
): string {
  if (requested && allowed.has(requested)) return requested;
  if (allowed.has(state.defaultModel)) return state.defaultModel;
  return [...allowed][0] ?? state.defaultModel;
}

/** AI 비서 대화용 — 대화에 안 맞는 모델(Haiku)도 기본 모델로 */
export function resolveChatModel(
  requested?: string | null,
  allowed: Set<string> = state.allowed,
): string {
  const m = resolveModel(requested, allowed);
  if (isChatModel(m)) return m;
  if (allowed.has(state.defaultModel) && isChatModel(state.defaultModel)) return state.defaultModel;
  return [...allowed].find(isChatModel) ?? state.defaultModel;
}

/** 화면에 보낼 모델 목록 — 서버 설정(사용자별로 좁힌 것 포함) 기준으로 열림 여부를 매긴다 */
export function modelOptions(allowed: Set<string> = state.allowed) {
  return state.catalog.map((m) => ({ ...m, enabled: allowed.has(m.id) }));
}

/** 거절 시 서버 대체 모델(fallbacks)은 Haiku에 없다 */
export const supportsFallback = (model: string) => !model.startsWith('claude-haiku');
