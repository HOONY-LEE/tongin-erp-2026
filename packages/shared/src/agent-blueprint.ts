// AIX-04: AI 에이전트 블루프린트 — 노드와 선으로 만드는 에이전트 그래프의 공용 타입·포트·검증.
// 화면(편집기 실시간 검사)과 서버(저장·자연어 생성·테스트 실행)가 같은 규칙을 쓴다.
//
// 그래프 모델
// - 실행선(exec wire): 노드의 출력 포트 → 다음 노드의 입력 포트('in'). 출력 포트 하나에는 선 하나만.
// - 데이터: 노드가 결과를 변수(outputVar)로 남기고, 뒤 노드가 {{변수.경로}} 템플릿으로 꺼내 쓴다.
//   편집기는 이 참조를 점선 데이터선으로 그려 보여 준다.

export const AGENT_NODE_TYPES = [
  'trigger',
  'llm',
  'tool',
  'branch',
  'loop',
  'guardrail',
  'approval',
  'output',
] as const;
export type AgentNodeType = (typeof AGENT_NODE_TYPES)[number];

export const AGENT_NODE_LABEL: Record<AgentNodeType, string> = {
  trigger: '시작',
  llm: 'AI 판단',
  tool: '도구 호출',
  branch: '분기',
  loop: '반복',
  guardrail: '가드레일',
  approval: '사람 승인',
  output: '출력',
};

export const AGENT_NODE_DESC: Record<AgentNodeType, string> = {
  trigger: '에이전트가 시작되는 방식(수동·AI 비서 대화·예약·이벤트)과 입력값',
  llm: 'Claude가 지시문대로 글을 쓰거나 판단해 결과를 변수로 남긴다',
  tool: 'ERP API·업무 도구를 실제로 호출한다(읽기는 바로, 쓰기는 승인 필요)',
  branch: '조건식 또는 AI 분류 결과에 따라 갈림길을 고른다',
  loop: '목록의 항목마다 본문을 반복 실행한다',
  guardrail: '이후 단계에 지킬 규칙(승인 필수·도구 제한·한도·마스킹·시간대)',
  approval: '사람이 승인해야 다음으로 넘어간다',
  output: '최종 결과(응답)를 만든다',
};

export const AGENT_BLUEPRINT_STATUS = ['DRAFT', 'ACTIVE'] as const;
export type AgentBlueprintStatus = (typeof AGENT_BLUEPRINT_STATUS)[number];
export const AGENT_BLUEPRINT_STATUS_LABEL: Record<AgentBlueprintStatus, string> = {
  DRAFT: '초안',
  ACTIVE: '사용중',
};

export const AGENT_RUN_STATUS_LABEL: Record<string, string> = {
  RUNNING: '실행 중',
  DONE: '완료',
  ERROR: '오류',
  BLOCKED: '가드레일 차단',
  AWAITING_APPROVAL: '승인 대기',
  REJECTED: '거절됨',
};

/** AI 판단 노드에서 고를 수 있는 모델 */
export const AGENT_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (기본·가장 똑똑함)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (빠르고 균형)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 싸고 빠름)' },
] as const;
export const AGENT_DEFAULT_MODEL = 'claude-opus-5-5';

/** 에이전트 공개 범위 — 개인용 / 전체 공개 / 부분 공유(고른 직원만) */
export const AGENT_VISIBILITIES = ['PRIVATE', 'PUBLIC', 'SHARED'] as const;
export type AgentVisibility = (typeof AGENT_VISIBILITIES)[number];
export const AGENT_VISIBILITY_LABEL: Record<AgentVisibility, string> = {
  PRIVATE: '개인용',
  PUBLIC: '전체 공개',
  SHARED: '부분 공유',
};
export const AGENT_VISIBILITY_HINT: Record<AgentVisibility, string> = {
  PRIVATE: '나만 보고 실행할 수 있습니다',
  PUBLIC: '모든 직원이 AI 에이전트 화면에서 실행할 수 있습니다',
  SHARED: '고른 직원만 AI 에이전트 화면에서 실행할 수 있습니다',
};

export const TRIGGER_KINDS = ['manual', 'chat', 'schedule', 'event'] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];
export const TRIGGER_KIND_LABEL: Record<TriggerKind, string> = {
  manual: '수동 실행',
  chat: 'AI 비서 대화',
  schedule: '예약(크론)',
  event: '이벤트',
};
/** 이벤트 시작에서 고를 수 있는 업무 이벤트(events 모듈의 도메인 이벤트 이름) */
export const TRIGGER_EVENTS = [
  'lead.created',
  'lead.status_changed',
  'estimate.created',
  'estimate.quoted',
  'estimate.sent',
  'contract.created',
  'contract.signed',
  'payment.confirmed',
  'work_order.created',
  'work_order.assigned',
  'work_order.started',
  'work_order.completed',
  'service_order.created',
  'support.created',
  'invoice.issued',
] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

export const TRIGGER_EVENT_LABEL: Record<TriggerEvent, string> = {
  'lead.created': '새 접수가 들어오면',
  'lead.status_changed': '접수 단계가 바뀌면',
  'estimate.created': '견적이 만들어지면',
  'estimate.quoted': '견적 금액이 확정되면',
  'estimate.sent': '견적서를 고객에게 보내면',
  'contract.created': '계약서가 만들어지면',
  'contract.signed': '계약이 서명되면',
  'payment.confirmed': '입금이 확인되면',
  'work_order.created': '작업 지시가 만들어지면',
  'work_order.assigned': '작업팀이 배정되면',
  'work_order.started': '작업이 시작되면',
  'work_order.completed': '작업이 끝나면',
  'service_order.created': '리빙케어 주문이 들어오면',
  'support.created': '새 CS 티켓이 들어오면',
  'invoice.issued': '청구서가 발행되면',
};

/** 이벤트로 시작하면 {{input.event.…}}에 들어오는 값 — id는 해당 건(접수·견적·계약…)의 id */
export const TRIGGER_EVENT_FIELDS: Record<TriggerEvent, string> = {
  'lead.created': 'id(접수 id), leadNo, source, orgUnitId',
  'lead.status_changed': 'id(접수 id), leadNo, from, to(새 단계)',
  'estimate.created': 'id(견적 id), estimateNo, leadId',
  'estimate.quoted': 'id(견적 id), estimateNo, totalCbm',
  'estimate.sent': 'id(견적 id), estimateNo, contractNo',
  'contract.created': 'id(계약 id), contractNo, total, deposit',
  'contract.signed': 'id(계약 id), contractNo',
  'payment.confirmed': 'id(입금 id), contractId, amount, kind',
  'work_order.created': 'id(작업 id), workNo, contractId',
  'work_order.assigned': 'id(작업 id), workNo',
  'work_order.started': 'id(작업 id), workNo',
  'work_order.completed': 'id(작업 id), workNo',
  'service_order.created': 'id(주문 id), serviceLine',
  'support.created': 'id(티켓 id), kind',
  'invoice.issued': 'id(청구서 id), invoiceNo, partnerId, amount',
};

export const FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'list', 'object'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface InputField {
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
}

export interface TriggerConfig {
  kind: TriggerKind;
  /** 예약일 때 크론식(분 시 일 월 요일, 한국 시간) */
  cron: string;
  /** 이벤트일 때 이벤트 이름 */
  event: string;
  inputFields: InputField[];
}

export interface LlmConfig {
  model: string;
  effort: 'low' | 'medium' | 'high';
  /** 역할·규칙(시스템 지시문) */
  instructions: string;
  /** 이번에 처리할 내용 — {{변수}} 사용 */
  prompt: string;
  outputFormat: 'text' | 'json';
  /** json일 때 결과 필드 */
  jsonFields: { name: string; type: 'string' | 'number' | 'boolean'; description: string }[];
  outputVar: string;
}

export interface ToolConfig {
  tool: string;
  /** 인자 이름 → 값. 값은 리터럴(JSON 가능)이거나 {{변수}} 템플릿 */
  args: Record<string, string>;
  outputVar: string;
}

export interface BranchCase {
  /** 출력 포트 id — 영문·숫자·_ */
  id: string;
  label: string;
  /** condition 모드: 조건식(예: leads.total > 0) */
  expr: string;
  /** classify 모드: 이 갈래를 고를 기준 설명 */
  description: string;
}

export interface BranchConfig {
  mode: 'condition' | 'classify';
  cases: BranchCase[];
  /** classify: 분류할 내용(템플릿) */
  input: string;
  /** classify: 분류 기준 지시문 */
  instructions: string;
  model: string;
  /** classify: 고른 갈래 id를 남길 변수 */
  outputVar: string;
}

export interface LoopConfig {
  /** 반복할 목록의 경로(예: leads.rows) */
  listVar: string;
  /** 본문에서 항목을 부를 변수 이름 */
  itemVar: string;
  /** 안전 한도 */
  maxItems: number;
}

export const GUARDRAIL_KINDS = [
  'requireApproval',
  'allowTools',
  'blockTools',
  'maxSteps',
  'maxLlmCalls',
  'maxRecipients',
  'recipientAllowlist',
  'piiMask',
  'timeWindow',
] as const;
export type GuardrailKind = (typeof GUARDRAIL_KINDS)[number];
export const GUARDRAIL_LABEL: Record<GuardrailKind, string> = {
  requireApproval: '쓰기 도구는 호출마다 사람 승인',
  allowTools: '허용 도구 목록(이 도구만)',
  blockTools: '차단 도구 목록',
  maxSteps: '최대 실행 단계 수',
  maxLlmCalls: '최대 AI 호출 수(비용 한도)',
  maxRecipients: '문자 한 번 최대 수신자 수',
  recipientAllowlist: '문자 수신자 허용목록(고객 id)',
  piiMask: '개인정보 마스킹(AI에 넘길 때 전화번호 등 가림)',
  timeWindow: '실행 시간대 제한(한국 시간)',
};

export interface GuardrailRule {
  kind: GuardrailKind;
  /** maxSteps·maxLlmCalls·maxRecipients */
  value?: number;
  /** allowTools·blockTools·recipientAllowlist */
  list?: string[];
  /** timeWindow — 시작·끝 시(0~24), 요일(0=일 … 6=토) */
  startHour?: number;
  endHour?: number;
  weekdays?: number[];
}

export interface GuardrailConfig {
  rules: GuardrailRule[];
}

export interface ApprovalConfig {
  /** 승인 요청 문구 — {{변수}} 사용 */
  message: string;
}

export interface OutputConfig {
  /** 최종 응답 — {{변수}} 사용 */
  template: string;
}

export interface AgentNodeConfigMap {
  trigger: TriggerConfig;
  llm: LlmConfig;
  tool: ToolConfig;
  branch: BranchConfig;
  loop: LoopConfig;
  guardrail: GuardrailConfig;
  approval: ApprovalConfig;
  output: OutputConfig;
}

export interface AgentNode<T extends AgentNodeType = AgentNodeType> {
  id: string;
  type: T;
  label: string;
  position: { x: number; y: number };
  config: AgentNodeConfigMap[T];
}

export interface AgentEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
}

export interface AgentGraph {
  version: 1;
  nodes: AgentNode[];
  edges: AgentEdge[];
}

export const EMPTY_AGENT_GRAPH: AgentGraph = { version: 1, nodes: [], edges: [] };

/** 도구 목록 항목(GET /agent-blueprints/tools) */
export interface AgentToolInfo {
  name: string;
  description: string;
  mode: 'READ' | 'WRITE';
  group: string;
  /** 검색용 낱말(설명에서 뽑은 것) */
  keywords?: string;
  inputSchema: AgentJsonSchema;
}
export interface AgentJsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, AgentJsonSchema>;
  required?: string[];
  items?: AgentJsonSchema;
  enum?: unknown[];
  format?: string;
}

// ── 기본값 ──

export function defaultConfig<T extends AgentNodeType>(type: T): AgentNodeConfigMap[T] {
  const c: { [K in AgentNodeType]: AgentNodeConfigMap[K] } = {
    trigger: { kind: 'manual', cron: '0 9 * * 1', event: 'lead.created', inputFields: [] },
    llm: {
      model: AGENT_DEFAULT_MODEL,
      effort: 'low',
      instructions: '',
      prompt: '',
      outputFormat: 'text',
      jsonFields: [],
      outputVar: 'answer',
    },
    tool: { tool: '', args: {}, outputVar: 'result' },
    branch: {
      mode: 'condition',
      cases: [{ id: 'yes', label: '참', expr: '', description: '' }],
      input: '',
      instructions: '',
      model: AGENT_DEFAULT_MODEL,
      outputVar: 'category',
    },
    loop: { listVar: '', itemVar: 'item', maxItems: 50 },
    guardrail: { rules: [{ kind: 'requireApproval' }] },
    approval: { message: '다음 작업을 실행할까요?' },
    output: { template: '' },
  };
  return structuredCloneSafe(c[type]);
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ── 포트 ──

export interface AgentPort {
  id: string;
  label: string;
}

/** 노드의 실행 출력 포트 */
export function outputPorts(node: Pick<AgentNode, 'type' | 'config'>): AgentPort[] {
  switch (node.type) {
    case 'trigger':
    case 'llm':
    case 'guardrail':
      return [{ id: 'out', label: '다음' }];
    case 'tool':
      return [
        { id: 'out', label: '성공' },
        { id: 'error', label: '실패' },
      ];
    case 'branch': {
      const cfg = node.config as BranchConfig;
      return [
        ...cfg.cases.map((c) => ({ id: c.id, label: c.label || c.id })),
        { id: 'else', label: '그 외' },
      ];
    }
    case 'loop':
      return [
        { id: 'body', label: '항목마다' },
        { id: 'done', label: '끝나면' },
      ];
    case 'approval':
      return [
        { id: 'approved', label: '승인' },
        { id: 'rejected', label: '거절' },
      ];
    case 'output':
      return [];
  }
}

export const hasInputPort = (type: AgentNodeType) => type !== 'trigger';

// ── 변수 ──

export interface AgentVar {
  name: string;
  type: string;
  description: string;
  /** 만든 노드 id(시스템 변수는 없음) */
  nodeId?: string;
}

/** 어느 노드에서나 쓸 수 있는 시스템 변수 */
export const SYSTEM_VARS: AgentVar[] = [
  { name: 'run.today', type: 'date', description: '오늘(YYYY-MM-DD, 한국 시간)' },
  { name: 'run.now', type: 'string', description: '지금 시각(ISO)' },
  { name: 'run.weekAgo', type: 'date', description: '7일 전(YYYY-MM-DD)' },
  { name: 'run.monthStart', type: 'date', description: '이번 달 1일(YYYY-MM-DD)' },
  { name: 'user.name', type: 'string', description: '실행한 직원 이름' },
];

/** 노드가 만드는 변수 */
export function producedVars(node: AgentNode): AgentVar[] {
  const base = { nodeId: node.id };
  switch (node.type) {
    case 'trigger': {
      const cfg = node.config as TriggerConfig;
      return [
        { ...base, name: 'input', type: 'object', description: '시작 입력값 전체' },
        ...(cfg.kind === 'event'
          ? [
              {
                ...base,
                name: 'input.event',
                type: 'object',
                description: `업무 이벤트 — ${TRIGGER_EVENT_FIELDS[cfg.event as TriggerEvent] ?? 'id, type'}`,
              },
              {
                ...base,
                name: 'input.event.id',
                type: 'string',
                description: '이벤트가 생긴 건의 id',
              },
            ]
          : []),
        ...cfg.inputFields.map((f) => ({
          ...base,
          name: `input.${f.name}`,
          type: f.type,
          description: f.description || f.name,
        })),
      ];
    }
    case 'llm': {
      const cfg = node.config as LlmConfig;
      if (!cfg.outputVar) return [];
      return [
        {
          ...base,
          name: cfg.outputVar,
          type: cfg.outputFormat === 'json' ? 'object' : 'string',
          description: `${node.label} 결과`,
        },
        ...(cfg.outputFormat === 'json'
          ? cfg.jsonFields.map((f) => ({
              ...base,
              name: `${cfg.outputVar}.${f.name}`,
              type: f.type,
              description: f.description || f.name,
            }))
          : []),
      ];
    }
    case 'tool': {
      const cfg = node.config as ToolConfig;
      return cfg.outputVar
        ? [{ ...base, name: cfg.outputVar, type: 'object', description: `${cfg.tool} 결과` }]
        : [];
    }
    case 'branch': {
      const cfg = node.config as BranchConfig;
      return cfg.mode === 'classify' && cfg.outputVar
        ? [{ ...base, name: cfg.outputVar, type: 'string', description: '고른 갈래 id' }]
        : [];
    }
    case 'loop': {
      const cfg = node.config as LoopConfig;
      return cfg.itemVar
        ? [
            { ...base, name: cfg.itemVar, type: 'object', description: '반복 중인 항목' },
            {
              ...base,
              name: `${cfg.itemVar}Index`,
              type: 'number',
              description: '항목 순번(0부터)',
            },
          ]
        : [];
    }
    default:
      return [];
  }
}

// ── 템플릿·경로 ──

const TEMPLATE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** 텍스트 안의 {{경로}} 참조들 */
export function templateRefs(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TEMPLATE_RE)) out.push(m[1].trim());
  return out;
}

/** 경로의 첫 이름(변수 루트). a.b[0].c → a, input.x → input.x(시작 입력은 input.필드까지) */
export function refRoot(path: string): string {
  const head = path.split(/[.[]/)[0];
  return head;
}

/** 노드 하나가 참조하는 모든 경로 */
export function nodeRefs(node: AgentNode): string[] {
  const texts: string[] = [];
  switch (node.type) {
    case 'llm': {
      const c = node.config as LlmConfig;
      texts.push(c.prompt, c.instructions);
      break;
    }
    case 'tool':
      texts.push(...Object.values((node.config as ToolConfig).args));
      break;
    case 'branch': {
      const c = node.config as BranchConfig;
      if (c.mode === 'classify') texts.push(c.input);
      else
        for (const k of c.cases) {
          for (const p of exprPaths(k.expr)) texts.push(`{{${p}}}`);
        }
      break;
    }
    case 'loop': {
      const p = (node.config as LoopConfig).listVar.replace(/^\{\{|\}\}$/g, '').trim();
      if (p) texts.push(`{{${p}}}`);
      break;
    }
    case 'approval':
      texts.push((node.config as ApprovalConfig).message);
      break;
    case 'output':
      texts.push((node.config as OutputConfig).template);
      break;
  }
  return texts.flatMap((t) => templateRefs(t ?? ''));
}

/** 경로 읽기: a.b[0].c, rows[*].id(목록에서 뽑기), list.length */
export function readPath(root: Record<string, unknown>, path: string): unknown {
  const tokens = tokenizePath(path);
  let cur: unknown = root;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (cur === null || cur === undefined) return undefined;
    if (t === '*') {
      if (!Array.isArray(cur)) return undefined;
      const rest = tokens.slice(i + 1);
      return cur.map((x) => readTokens(x, rest));
    }
    if (t === 'length' && (Array.isArray(cur) || typeof cur === 'string')) {
      cur = cur.length;
      continue;
    }
    cur = (cur as Record<string, unknown>)[t];
  }
  return cur;
}

function readTokens(v: unknown, tokens: string[]): unknown {
  let cur = v;
  for (const t of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (t === 'length' && (Array.isArray(cur) || typeof cur === 'string')) cur = cur.length;
    else cur = (cur as Record<string, unknown>)[t];
  }
  return cur;
}

function tokenizePath(path: string): string[] {
  const out: string[] = [];
  for (const part of path.trim().split('.')) {
    const m = /^([^[\]]*)((?:\[[^\]]*\])*)$/.exec(part);
    if (!m) {
      out.push(part);
      continue;
    }
    if (m[1]) out.push(m[1]);
    for (const idx of m[2].matchAll(/\[([^\]]*)\]/g)) out.push(idx[1].trim());
  }
  return out;
}

/**
 * 템플릿 풀기. 값 전체가 {{경로}} 하나면 원래 값(목록·객체 그대로), 아니면 글자로 끼워 넣는다.
 */
export function renderTemplate(
  text: string,
  vars: Record<string, unknown>,
  /** 값이 없을 때 끼울 글자(시험 실행에서 빈 칸을 드러내려고) */
  missing = '',
): unknown {
  const whole = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/.exec(text);
  if (whole) return readPath(vars, whole[1]) ?? (missing || undefined);
  return text.replace(TEMPLATE_RE, (_, p: string) => {
    const v = readPath(vars, p.trim());
    if (v === undefined || v === null) return missing;
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

/** 도구 인자 값 풀기 — JSON이면 안쪽 글자까지 템플릿을 풀고, 아니면 템플릿만 */
export function renderArg(value: string, vars: Record<string, unknown>): unknown {
  const s = value.trim();
  if (/^[[{]/.test(s) || /^-?\d+(\.\d+)?$/.test(s) || s === 'true' || s === 'false') {
    try {
      return deepRender(JSON.parse(s), vars);
    } catch {
      // JSON이 아니면 아래 일반 템플릿으로
    }
  }
  return renderTemplate(value, vars);
}

function deepRender(v: unknown, vars: Record<string, unknown>): unknown {
  if (typeof v === 'string') return renderTemplate(v, vars);
  if (Array.isArray(v)) return v.map((x) => deepRender(x, vars));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepRender(x, vars)]));
  }
  return v;
}

// ── 조건식 ──
// 지원: 경로, 숫자·'글자'·"글자"·true·false·null, == != > >= < <=, && || !, 괄호,
//       contains(a, b), len(a), empty(a). 경로는 {{ }} 없이 써도 되고 써도 된다.

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

function lex(src: string): Tok[] {
  const s = src.replace(/\{\{\s*|\s*\}\}/g, ' ');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('<>!(),'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = s.indexOf(ch, i + 1);
      if (end < 0) throw new Error('따옴표가 닫히지 않았습니다');
      out.push({ t: 'str', v: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(s.slice(i));
    if (num && (out.length === 0 || out[out.length - 1].t === 'op')) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_가-힣][\w가-힣.[\]*]*/.exec(s.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    throw new Error(`알 수 없는 글자: ${ch}`);
  }
  return out;
}

type Expr =
  | { k: 'lit'; v: unknown }
  | { k: 'path'; p: string }
  | { k: 'not'; e: Expr }
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'call'; fn: string; args: Expr[] };

export function parseExpr(src: string): Expr {
  const toks = lex(src);
  if (!toks.length) throw new Error('조건식이 비어 있습니다');
  let p = 0;
  const peek = () => toks[p];
  const eat = (v: string) => {
    const t = toks[p];
    if (t?.t === 'op' && t.v === v) {
      p++;
      return true;
    }
    return false;
  };
  const or = (): Expr => {
    let a = and();
    while (eat('||')) a = { k: 'bin', op: '||', a, b: and() };
    return a;
  };
  const and = (): Expr => {
    let a = cmp();
    while (eat('&&')) a = { k: 'bin', op: '&&', a, b: cmp() };
    return a;
  };
  const cmp = (): Expr => {
    const a = unary();
    const t = peek();
    if (t?.t === 'op' && ['==', '!=', '>', '>=', '<', '<='].includes(t.v)) {
      p++;
      return { k: 'bin', op: t.v, a, b: unary() };
    }
    return a;
  };
  const unary = (): Expr => {
    if (eat('!')) return { k: 'not', e: unary() };
    return primary();
  };
  const primary = (): Expr => {
    const t = toks[p++];
    if (!t) throw new Error('조건식이 덜 끝났습니다');
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'op' && t.v === '(') {
      const e = or();
      if (!eat(')')) throw new Error('괄호가 닫히지 않았습니다');
      return e;
    }
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      if (eat('(')) {
        if (!['contains', 'len', 'empty'].includes(t.v)) throw new Error(`모르는 함수: ${t.v}`);
        const args: Expr[] = [];
        if (!eat(')')) {
          do args.push(or());
          while (eat(','));
          if (!eat(')')) throw new Error('함수 괄호가 닫히지 않았습니다');
        }
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'path', p: t.v };
    }
    throw new Error(`예상하지 못한 기호: ${t.v}`);
  };
  const e = or();
  if (p < toks.length) throw new Error(`조건식 뒤에 남은 부분: ${String(toks[p].v)}`);
  return e;
}

/** 조건식이 쓰는 경로들(검증·데이터선용). 문법이 틀리면 빈 목록 */
export function exprPaths(src: string): string[] {
  if (!src.trim()) return [];
  try {
    const out: string[] = [];
    const walk = (e: Expr) => {
      if (e.k === 'path') out.push(e.p);
      else if (e.k === 'not') walk(e.e);
      else if (e.k === 'bin') {
        walk(e.a);
        walk(e.b);
      } else if (e.k === 'call') e.args.forEach(walk);
    };
    walk(parseExpr(src));
    return out;
  } catch {
    return [];
  }
}

export function evalExpr(src: string, vars: Record<string, unknown>): boolean {
  return truthy(evalNode(parseExpr(src), vars));
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v;
}

function evalNode(e: Expr, vars: Record<string, unknown>): unknown {
  switch (e.k) {
    case 'lit':
      return e.v;
    case 'path':
      return readPath(vars, e.p);
    case 'not':
      return !truthy(evalNode(e.e, vars));
    case 'call': {
      const a = e.args.map((x) => evalNode(x, vars));
      if (e.fn === 'len') return Array.isArray(a[0]) || typeof a[0] === 'string' ? a[0].length : 0;
      if (e.fn === 'empty')
        return (
          a[0] === null ||
          a[0] === undefined ||
          a[0] === '' ||
          (Array.isArray(a[0]) && !a[0].length)
        );
      if (Array.isArray(a[0])) return a[0].includes(a[1]);
      return String(a[0] ?? '').includes(String(a[1] ?? ''));
    }
    case 'bin': {
      if (e.op === '&&') return truthy(evalNode(e.a, vars)) && truthy(evalNode(e.b, vars));
      if (e.op === '||') return truthy(evalNode(e.a, vars)) || truthy(evalNode(e.b, vars));
      const a = evalNode(e.a, vars);
      const b = evalNode(e.b, vars);
      const num = (x: unknown) => (typeof x === 'number' ? x : Number(x));
      switch (e.op) {
        case '==':
          return a == b;
        case '!=':
          return a != b;
        case '>':
          return num(a) > num(b);
        case '>=':
          return num(a) >= num(b);
        case '<':
          return num(a) < num(b);
        case '<=':
          return num(a) <= num(b);
      }
      return false;
    }
  }
}

// ── 검증 ──

export interface AgentIssue {
  level: 'error' | 'warning';
  nodeId?: string;
  edgeId?: string;
  message: string;
}

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PORT_ID_RE = /^[A-Za-z0-9_]+$/;

/** 노드마다 위쪽(실행선 기준 조상)에서 만들어진 변수 이름 */
export function upstreamVars(graph: AgentGraph): Map<string, AgentVar[]> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parents = parentMap(graph);
  const result = new Map<string, AgentVar[]>();
  for (const n of graph.nodes) {
    const vars: AgentVar[] = [...SYSTEM_VARS];
    for (const a of ancestorIds(parents, n.id)) {
      const an = byId.get(a);
      if (an) vars.push(...producedVars(an));
    }
    result.set(n.id, vars);
  }
  return result;
}

function parentMap(graph: AgentGraph): Map<string, string[]> {
  const parents = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!parents.has(e.target)) parents.set(e.target, []);
    parents.get(e.target)!.push(e.source);
  }
  return parents;
}

/** 실행선을 거슬러 올라가 닿는 모든 노드 id */
function ancestorIds(parents: Map<string, string[]>, id: string): Set<string> {
  const seen = new Set<string>();
  const st = [id];
  while (st.length) {
    const x = st.pop()!;
    for (const p of parents.get(x) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        st.push(p);
      }
    }
  }
  seen.delete(id);
  return seen;
}

/**
 * 그래프 검사. tools를 주면 도구 이름·필수 인자까지 본다(화면은 도구 목록을 받은 뒤에).
 * error는 실행을 막고, warning은 알려 주기만 한다.
 */
export function validateAgentGraph(
  graph: AgentGraph,
  tools?: Map<string, Pick<AgentToolInfo, 'mode' | 'inputSchema'>>,
): AgentIssue[] {
  const issues: AgentIssue[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const triggers = graph.nodes.filter((n) => n.type === 'trigger');
  if (!triggers.length) issues.push({ level: 'error', message: '시작 노드가 없습니다.' });
  if (triggers.length > 1)
    issues.push({ level: 'error', message: '시작 노드는 하나만 둘 수 있습니다.' });
  if (!graph.nodes.some((n) => n.type === 'output'))
    issues.push({ level: 'warning', message: '출력 노드가 없습니다 — 실행 결과가 남지 않습니다.' });

  // 선
  const usedPorts = new Set<string>();
  for (const e of graph.edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) {
      issues.push({ level: 'error', edgeId: e.id, message: '없는 노드에 이어진 선이 있습니다.' });
      continue;
    }
    if (!outputPorts(s).some((p) => p.id === e.sourceHandle)) {
      issues.push({
        level: 'error',
        nodeId: s.id,
        edgeId: e.id,
        message: `'${s.label}'에 '${e.sourceHandle}' 출력 포트가 없습니다.`,
      });
    }
    if (!hasInputPort(t.type)) {
      issues.push({
        level: 'error',
        nodeId: t.id,
        edgeId: e.id,
        message: '시작 노드로 들어오는 선은 둘 수 없습니다.',
      });
    }
    const key = `${e.source}:${e.sourceHandle}`;
    if (usedPorts.has(key)) {
      issues.push({
        level: 'error',
        nodeId: s.id,
        edgeId: e.id,
        message: `'${s.label}'의 한 출력 포트에 선이 여러 개입니다(포트 하나에 선 하나).`,
      });
    }
    usedPorts.add(key);
  }

  // 도달 가능성·순환
  const out = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e.target);
  }
  const reach = new Set<string>();
  const stack = triggers.map((t) => t.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (reach.has(id)) continue;
    reach.add(id);
    stack.push(...(out.get(id) ?? []));
  }
  for (const n of graph.nodes) {
    if (triggers.length && !reach.has(n.id))
      issues.push({
        level: 'warning',
        nodeId: n.id,
        message: `'${n.label}'은(는) 시작에서 이어지지 않아 실행되지 않습니다.`,
      });
  }
  const color = new Map<string, number>();
  let cycleAt: string | null = null;
  const dfs = (id: string) => {
    color.set(id, 1);
    for (const nx of out.get(id) ?? []) {
      if (cycleAt) return;
      if (color.get(nx) === 1) cycleAt = nx;
      else if (!color.get(nx)) dfs(nx);
    }
    color.set(id, 2);
  };
  for (const n of graph.nodes) if (!color.get(n.id) && !cycleAt) dfs(n.id);
  if (cycleAt)
    issues.push({
      level: 'error',
      nodeId: cycleAt,
      message: '실행선이 되돌아가는 순환이 있습니다. 반복은 반복 노드로 만드세요.',
    });

  // 노드별
  const vars = upstreamVars(graph);
  const parents = parentMap(graph);
  const ancestorsOf = (id: string) =>
    [...ancestorIds(parents, id)].map((x) => byId.get(x)).filter((x): x is AgentNode => !!x);
  const outVarOwners = new Map<string, string>();

  for (const n of graph.nodes) {
    const label = n.label || AGENT_NODE_LABEL[n.type];
    const err = (message: string) => issues.push({ level: 'error', nodeId: n.id, message });
    const warn = (message: string) => issues.push({ level: 'warning', nodeId: n.id, message });

    // 이 노드가 쓰는 변수가 위쪽에서 만들어지는지
    const known = vars.get(n.id) ?? [];
    const roots = new Set(known.map((v) => refRoot(v.name)));
    for (const ref of nodeRefs(n)) {
      if (!roots.has(refRoot(ref)) && !(refRoot(ref) === 'run' || refRoot(ref) === 'user'))
        warn(`'${label}'이(가) 쓰는 {{${ref}}}를 위쪽 노드가 만들지 않습니다.`);
    }
    for (const v of producedVars(n)) {
      if (v.name.includes('.') || n.type === 'trigger') continue;
      const prev = outVarOwners.get(v.name);
      if (prev && prev !== n.id) warn(`결과 변수 '${v.name}'를 다른 노드도 씁니다(덮어씀).`);
      outVarOwners.set(v.name, n.id);
    }

    switch (n.type) {
      case 'trigger': {
        const c = n.config as TriggerConfig;
        if (c.kind === 'schedule' && c.cron.trim().split(/\s+/).length !== 5)
          err('예약 시작의 크론식은 "분 시 일 월 요일" 다섯 칸이어야 합니다.');
        if (c.kind === 'event' && !c.event.trim()) err('이벤트 시작에 이벤트 이름이 없습니다.');
        for (const f of c.inputFields)
          if (!VAR_NAME_RE.test(f.name)) err(`입력값 이름 '${f.name}'은 영문·숫자·_만 됩니다.`);
        break;
      }
      case 'llm': {
        const c = n.config as LlmConfig;
        if (!c.prompt.trim() && !c.instructions.trim())
          warn(`'${label}'에 지시문이 비어 있습니다.`);
        if (!VAR_NAME_RE.test(c.outputVar)) err(`'${label}'의 결과 변수 이름이 올바르지 않습니다.`);
        break;
      }
      case 'tool': {
        const c = n.config as ToolConfig;
        if (!c.tool) {
          err(`'${label}'에 호출할 도구가 정해지지 않았습니다.`);
          break;
        }
        if (c.outputVar && !VAR_NAME_RE.test(c.outputVar))
          err(`'${label}'의 결과 변수 이름이 올바르지 않습니다.`);
        if (!tools) break;
        const info = tools.get(c.tool);
        if (!info) {
          err(`'${c.tool}' 도구가 없거나 이 계정에 권한이 없습니다.`);
          break;
        }
        for (const r of info.inputSchema.required ?? [])
          if (!String(c.args[r] ?? '').trim())
            err(`'${label}'에 필수 인자 '${r}'가 비어 있습니다.`);
        const props = info.inputSchema.properties ?? {};
        for (const k of Object.keys(c.args))
          if (!(k in props)) warn(`'${label}'의 인자 '${k}'는 이 도구에 없습니다.`);
        if (info.mode === 'WRITE') {
          const guarded = ancestorsOf(n.id).some(
            (a) =>
              a.type === 'approval' ||
              (a.type === 'guardrail' &&
                (a.config as GuardrailConfig).rules.some((r) => r.kind === 'requireApproval')),
          );
          if (!guarded)
            warn(
              `'${label}'은(는) 데이터를 바꾸는 쓰기 도구인데 위쪽에 사람 승인이나 승인 가드레일이 없습니다.`,
            );
        }
        break;
      }
      case 'branch': {
        const c = n.config as BranchConfig;
        if (!c.cases.length) err(`'${label}'에 갈래가 없습니다.`);
        const ids = new Set<string>();
        for (const k of c.cases) {
          if (!PORT_ID_RE.test(k.id) || k.id === 'else')
            err(`'${label}'의 갈래 id '${k.id}'가 올바르지 않습니다(영문·숫자·_, else 제외).`);
          if (ids.has(k.id)) err(`'${label}'에 같은 갈래 id '${k.id}'가 두 번 있습니다.`);
          ids.add(k.id);
          if (c.mode === 'condition') {
            if (!k.expr.trim()) err(`'${label}'의 '${k.label}' 조건식이 비어 있습니다.`);
            else
              try {
                parseExpr(k.expr);
              } catch (e) {
                err(`'${label}'의 '${k.label}' 조건식 오류: ${(e as Error).message}`);
              }
          }
        }
        if (c.mode === 'classify' && !c.input.trim()) err(`'${label}'에 분류할 내용이 없습니다.`);
        break;
      }
      case 'loop': {
        const c = n.config as LoopConfig;
        if (!c.listVar.trim()) err(`'${label}'에 반복할 목록이 정해지지 않았습니다.`);
        if (!VAR_NAME_RE.test(c.itemVar)) err(`'${label}'의 항목 변수 이름이 올바르지 않습니다.`);
        if (!graph.edges.some((e) => e.source === n.id && e.sourceHandle === 'body'))
          warn(`'${label}'의 '항목마다' 포트에 이어진 노드가 없습니다.`);
        break;
      }
      case 'guardrail': {
        const c = n.config as GuardrailConfig;
        if (!c.rules.length) warn(`'${label}'에 규칙이 없습니다.`);
        for (const r of c.rules) {
          if (
            ['maxSteps', 'maxLlmCalls', 'maxRecipients'].includes(r.kind) &&
            !(Number(r.value) > 0)
          )
            err(`'${label}'의 '${GUARDRAIL_LABEL[r.kind]}' 값이 필요합니다.`);
          if (
            ['allowTools', 'blockTools', 'recipientAllowlist'].includes(r.kind) &&
            !r.list?.length
          )
            warn(`'${label}'의 '${GUARDRAIL_LABEL[r.kind]}' 목록이 비어 있습니다.`);
          if (tools && (r.kind === 'allowTools' || r.kind === 'blockTools'))
            for (const t of r.list ?? [])
              if (!tools.has(t)) warn(`'${label}'의 도구 목록에 없는 도구 '${t}'가 있습니다.`);
        }
        break;
      }
      case 'output': {
        if (!(n.config as OutputConfig).template.trim())
          warn(`'${label}'의 응답 내용이 비어 있습니다.`);
        break;
      }
    }
  }
  return issues;
}

/** 새 노드 id — 화면·서버 공용 */
export function newAgentId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/**
 * 자동 배치 — 시작에서 실행선 기준 가장 긴 거리로 열(왼→오)을 정하고, 열 안에서 위→아래로 둔다.
 * keep에 든 노드는 원래 자리를 지킨다(자연어 수정 때 사람이 옮겨 둔 자리 보존).
 */
export function autoLayout(graph: AgentGraph, keep: Set<string> = new Set()): AgentGraph {
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const layer = new Map<string, number>();
  const queue = graph.nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  for (const id of queue) layer.set(id, 0);
  const remaining = new Map(indeg);
  let guard = 0;
  while (queue.length && guard++ < 10_000) {
    const id = queue.shift()!;
    for (const nx of out.get(id) ?? []) {
      layer.set(nx, Math.max(layer.get(nx) ?? 0, (layer.get(id) ?? 0) + 1));
      remaining.set(nx, (remaining.get(nx) ?? 1) - 1);
      if (remaining.get(nx) === 0) queue.push(nx);
    }
  }
  // 순환 등으로 못 정한 노드는 맨 뒤 열
  const maxLayer = Math.max(0, ...layer.values());
  for (const n of graph.nodes) if (!layer.has(n.id)) layer.set(n.id, maxLayer + 1);

  const cols = new Map<number, string[]>();
  for (const n of graph.nodes) {
    const l = layer.get(n.id)!;
    if (!cols.has(l)) cols.set(l, []);
    cols.get(l)!.push(n.id);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [l, ids] of cols) {
    const h = (ids.length - 1) * 190;
    ids.forEach((id, i) => pos.set(id, { x: l * 300, y: i * 190 - h / 2 }));
  }
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (keep.has(n.id) ? n : { ...n, position: pos.get(n.id)! })),
  };
}

/**
 * 저장·불러오기 때 그래프 정리 — 모르는 노드 종류는 빼고, 빠진 설정은 기본값으로 채우고,
 * 없는 노드를 가리키는 선은 버린다(사람이 손댄 JSON·예전 버전도 열리게).
 */
export function normalizeAgentGraph(raw: unknown): AgentGraph {
  const g = (raw ?? {}) as { nodes?: unknown; edges?: unknown };
  const nodes: AgentNode[] = [];
  const ids = new Set<string>();
  for (const r of Array.isArray(g.nodes) ? g.nodes : []) {
    const n = r as Partial<AgentNode>;
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id)) continue;
    if (!AGENT_NODE_TYPES.includes(n.type as AgentNodeType)) continue;
    const type = n.type as AgentNodeType;
    const base = defaultConfig(type) as unknown as Record<string, unknown>;
    const cfg = { ...base, ...((n.config ?? {}) as Record<string, unknown>) };
    if (
      type === 'tool' &&
      (typeof cfg.args !== 'object' || cfg.args === null || Array.isArray(cfg.args))
    )
      cfg.args = {};
    if (type === 'branch' && !Array.isArray(cfg.cases)) cfg.cases = [];
    if (type === 'guardrail' && !Array.isArray(cfg.rules)) cfg.rules = [];
    if (type === 'trigger' && !Array.isArray(cfg.inputFields)) cfg.inputFields = [];
    if (type === 'llm' && !Array.isArray(cfg.jsonFields)) cfg.jsonFields = [];
    ids.add(n.id);
    nodes.push({
      id: n.id,
      type,
      label: typeof n.label === 'string' && n.label ? n.label : AGENT_NODE_LABEL[type],
      position: {
        x: Number(n.position?.x) || 0,
        y: Number(n.position?.y) || 0,
      },
      config: cfg as never,
    });
  }
  const edges: AgentEdge[] = [];
  const edgeIds = new Set<string>();
  for (const r of Array.isArray(g.edges) ? g.edges : []) {
    const e = r as Partial<AgentEdge>;
    if (!e || !ids.has(String(e.source)) || !ids.has(String(e.target))) continue;
    let id =
      typeof e.id === 'string' && e.id ? e.id : `e_${e.source}_${e.sourceHandle}_${e.target}`;
    while (edgeIds.has(id)) id = `${id}_`;
    edgeIds.add(id);
    edges.push({
      id,
      source: String(e.source),
      sourceHandle: String(e.sourceHandle ?? 'out'),
      target: String(e.target),
    });
  }
  return { version: 1, nodes, edges };
}
