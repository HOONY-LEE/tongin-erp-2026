/** API(/api/ai) 응답 모양 — apps/api/src/ai/ai.service.ts view()와 맞춘다 */

export interface AiStatus {
  configured: boolean;
  model: string;
}

export interface AiToolInfo {
  name: string;
  description: string;
  mode: 'READ' | 'WRITE';
  deferred: boolean;
}

export interface ConversationRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

export type ToolStatus = 'PENDING' | 'DONE' | 'ERROR' | 'REJECTED';

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'search'; query: string }
  | {
      kind: 'tool';
      toolUseId: string;
      name: string;
      input: unknown;
      status: ToolStatus;
      result?: string;
      isError?: boolean;
    };

export interface Recipient {
  customerId: string;
  name: string;
  phone: string;
}
export interface SmsPreview {
  message: string;
  recipients: Recipient[];
  skipped: string[];
}
/** 승인 결정 — 문자는 직원이 고친 받는 사람(customerIds)을 함께 보낼 수 있다 */
export interface Decision {
  toolUseId: string;
  approve: boolean;
  customerIds?: string[];
}

export interface PendingCall {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  mode: 'READ' | 'WRITE';
  summary: string;
  preview?: SmsPreview | { error: string } | unknown;
}

export interface Conversation {
  id: string;
  title: string;
  /** IDLE | RUNNING | AWAITING_APPROVAL | ERROR */
  status: string;
  lastError: string | null;
  updatedAt: string;
  items: ChatItem[];
  pending: PendingCall[];
}

/** "[견적] 견적 금액 저장(…). 견적 — …" → "견적 · 견적 금액 저장(…)" */
export function toolLabel(name: string, tools: Map<string, AiToolInfo>) {
  const BUILTIN: Record<string, string> = {
    search_leads: '접수·고객 조회',
    search_customers: '고객 찾기',
    send_sms: '문자 발송',
  };
  if (BUILTIN[name]) return BUILTIN[name];
  const d = tools.get(name)?.description;
  if (!d) return name;
  const m = /^\[([^\]]+)\]\s*([^.]+)/.exec(d);
  return m ? `${m[1]} · ${m[2]}` : name;
}
