import type { AuthPrincipal } from '@tongin/shared';
import type { JsonSchema } from './dto-schema';

/** READ는 바로 실행, WRITE(등록·수정·삭제·발송)는 사용자가 승인해야 실행된다. */
export type ToolMode = 'READ' | 'WRITE';

export interface ToolContext {
  principal: AuthPrincipal;
  /** 사용자 요청의 Authorization 헤더 — API 도구가 같은 사용자로 ERP API를 부른다 */
  authorization: string;
}

export interface AiTool {
  /** Claude에 노출되는 이름 (^[a-zA-Z0-9_-]{1,64}$) */
  name: string;
  description: string;
  inputSchema: JsonSchema;
  mode: ToolMode;
  /** 이 권한을 모두 가진 사용자에게만 도구가 보인다 */
  permissions: string[];
  /**
   * true면 처음에는 이름만 숨겨 두고 tool search로 찾아 쓴다(defer_loading).
   * 자주 쓰는 몇 개만 false로 둔다.
   */
  deferred: boolean;
  /** 승인 카드에 보여줄 한 줄 요약 */
  summarize?: (input: Record<string, unknown>) => string;
  /** 승인 카드에 보여줄 상세(받는 사람 목록 등). 실행은 하지 않고 미리 계산만 한다 */
  preview?: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

/** 도구 실행 실패를 모델에게 그대로 알려 줄 때 쓰는 오류 — 메시지가 tool_result 본문이 된다 */
export class ToolError extends Error {}
