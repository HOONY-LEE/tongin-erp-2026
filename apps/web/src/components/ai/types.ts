/** API(/api/ai) 응답 모양 — apps/api/src/ai/ai.service.ts view()와 맞춘다 */

export interface AiModelOption {
  id: string;
  label: string;
  hint: string;
  /** false면 목록에만 보이고 고를 수 없다(서버가 닫아 둔 모델) */
  enabled: boolean;
  /** AI 비서 대화에 쓰는 모델인지 */
  chat: boolean;
}

export interface AiStatus {
  configured: boolean;
  /** 서버 기본 모델 */
  model: string;
  models?: AiModelOption[];
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
  | { kind: 'user'; text: string; attachments?: ChatAttachment[] }
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
    }
  /** 코드 실행(Anthropic 샌드박스) — bash 명령 또는 파일 만들기·고치기 */
  | {
      kind: 'code';
      toolUseId: string;
      tool: 'bash' | 'file';
      title: string;
      code: string;
      status: 'RUNNING' | 'DONE' | 'ERROR';
      output?: string;
    }
  /** AI가 만든 파일 — 다운로드 카드 */
  | { kind: 'file'; id: string; name: string; mediaType: string; size: number };

export interface Recipient {
  customerId: string;
  name: string;
  phone: string;
}
/** 말풍선에 붙는 첨부 — 이미지는 미리보기(src), 문서는 이름만 */
export interface ChatAttachment {
  name: string;
  kind: 'image' | 'file';
  src?: string;
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
  /** 이 대화에 쓰는 모델 */
  model?: string;
  /** IDLE | RUNNING | AWAITING_APPROVAL | ERROR */
  status: string;
  lastError: string | null;
  updatedAt: string;
  items: ChatItem[];
  pending: PendingCall[];
  /** 마지막 답이 제안한 이어서 할 일(최대 3개) */
  suggestions: string[];
}

/** "[견적] 견적 금액 저장(…). 견적 — …" → "견적 · 견적 금액 저장(…)" */
export function toolLabel(name: string, tools: Map<string, AiToolInfo>) {
  const BUILTIN: Record<string, string> = {
    search_leads: '접수·고객 조회',
    search_customers: '고객 찾기',
    send_sms: '문자 발송',
    create_report_file: '보고서 파일 만들기',
  };
  if (BUILTIN[name]) return BUILTIN[name];
  const d = tools.get(name)?.description;
  if (!d) return name;
  const m = /^\[([^\]]+)\]\s*([^.]+)/.exec(d);
  return m ? `${m[1]} · ${m[2]}` : name;
}
