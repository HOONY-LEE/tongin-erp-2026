import { ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { DEFAULT_AI_MODEL } from '../ai/ai-models';

/** 에이전트 빌더(자연어 생성)에 쓰는 모델 — AI 비서 기본 모델과 같게(Sonnet) */
export const BUILDER_MODEL = DEFAULT_AI_MODEL;

/** 안전 분류기가 거절하면 서버가 권장 대체 모델로 다시 돌린다(Opus·Sonnet만 지원) */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export { supportsFallback } from '../ai/ai-models';

/** AI 비서(ai.service.ts)와 같은 방식으로 클라이언트를 만든다. 키가 없으면 null */
export function createClaude(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  // 워크스페이스에 묶이지 않은 키(sk-ant-usr-…)는 어느 워크스페이스로 쓸지 헤더로 알려야 한다
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return key
    ? new Anthropic({
        apiKey: key,
        ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
      })
    : null;
}

export function requireClaude(client: Anthropic | null): Anthropic {
  if (!client) {
    throw new ServiceUnavailableException(
      'AI가 아직 설정되지 않았습니다(서버 환경변수 ANTHROPIC_API_KEY). 자연어 생성과 AI 판단 노드는 쓸 수 없지만, 블루프린트를 직접 만들고 고치는 것은 그대로 됩니다.',
    );
  }
  return client;
}

export function textOf(res: BetaMessage): string {
  return res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
}

/** 응답이 끝까지 오지 않았으면 이유를 알려 준다 */
export function assertComplete(res: BetaMessage) {
  if (res.stop_reason === 'refusal') throw new Error('AI가 이 요청을 거절했습니다(안전 정책).');
  if (res.stop_reason === 'max_tokens')
    throw new Error('AI 응답이 길어 중간에 끊겼습니다. 요청을 나눠 주세요.');
}

export function describeClaudeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError)
    return 'Claude API 키가 올바르지 않습니다(ANTHROPIC_API_KEY 확인).';
  if (e instanceof Anthropic.PermissionDeniedError)
    return 'Claude API 키에 이 모델 사용 권한이 없습니다.';
  if (e instanceof Anthropic.RateLimitError)
    return 'Claude API 사용량 한도에 걸렸습니다. 잠시 후 다시 시도하세요.';
  if (e instanceof Anthropic.APIConnectionError)
    return 'Claude API에 연결하지 못했습니다(네트워크 확인).';
  if (e instanceof Anthropic.APIError) return `Claude API 오류 ${e.status ?? ''}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
