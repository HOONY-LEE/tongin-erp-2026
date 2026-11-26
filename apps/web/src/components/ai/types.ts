import i18n from '../../i18n';
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
  /** 이번 달 한도(토큰, 없으면 null)와 쓴 양 */
  quota?: { limit: number | null; used: number } | null;
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
  /** 문자 발송 — 직원이 고친 본문 */
  message?: string;
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
    search_leads: i18n.t('ai.tool.lookup'),
    search_customers: i18n.t('ai.tool.findCustomer'),
    send_sms: i18n.t('ai.tool.sms'),
    create_report_file: i18n.t('ai.tool.report'),
    search_knowledge: i18n.t('ai.tool.knowledge'),
    read_knowledge: i18n.t('ai.tool.readKnowledge'),
    create_file_from_template: i18n.t('ai.tool.template'),
    find_suspicious_branches: i18n.t('ai.tool.suspicious'),
  };
  if (BUILTIN[name]) return BUILTIN[name];
  const d = tools.get(name)?.description;
  if (!d) return name;
  const m = /^\[([^\]]+)\]\s*([^.]+)/.exec(d);
  // 동작 설명은 ' — ' 앞의 짧은 이름만(뒤는 AI용 자세한 설명)
  return m ? `${m[1]} · ${m[2].split(' — ')[0].trim()}` : name;
}
