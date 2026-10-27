import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AGENT_DEFAULT_MODEL,
  AGENT_MODELS,
  AGENT_NODE_DESC,
  AGENT_NODE_LABEL,
  AGENT_NODE_TYPES,
  FIELD_TYPES,
  GUARDRAIL_KINDS,
  GUARDRAIL_LABEL,
  TRIGGER_EVENTS,
  TRIGGER_KINDS,
  autoLayout,
  defaultConfig,
  newAgentId,
  normalizeAgentGraph,
  outputPorts,
  type AgentEdge,
  type AgentGraph,
  type AgentIssue,
  type AgentJsonSchema,
  type AgentNode,
  type AgentNodeType,
  type AgentToolInfo,
  type AuthPrincipal,
  type GuardrailConfig,
  type GuardrailRule,
  type ToolConfig,
} from '@tongin/shared';
import { AgentBlueprintService } from './agent-blueprint.service';
import type { ReferenceMeta } from './agent-reference.service';
import {
  BUILDER_MODEL,
  FALLBACK_BETA,
  assertComplete,
  createClaude,
  describeClaudeError,
  requireClaude,
  textOf,
} from './agent-claude';

/** 자연어 생성 결과 — 화면이 미리 보고 적용한다(저장은 화면에서) */
export interface GenerateResult {
  name: string;
  description: string;
  summary: string;
  graph: AgentGraph;
  changes: {
    added: string[];
    removed: string[];
    changed: string[];
    edgesAdded: number;
    edgesRemoved: number;
  };
  /** 서버가 고친 것(없는 포트 선 제거·승인 노드 자동 추가 등) */
  fixes: string[];
  issues: AgentIssue[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const arr = (items: unknown) => ({ type: 'array', items });
const enumOf = (values: readonly string[]) => ({ type: 'string', enum: [...values] });

/**
 * 노드 종류별 설정 형태. 종류마다 다른 스키마를 anyOf로 묶으면 구조화 출력 문법이 너무 커져
 * API가 거절한다(실측: "compiled grammar is too large"). 그래서 출력 스키마의 config는 JSON 글자로 받고,
 * 이 형태는 안내문에 적어 준 뒤 서버가 파싱·기본값 채우기·검증을 한다.
 */
const CONFIG_SCHEMA: Record<AgentNodeType, unknown> = {
  trigger: obj({
    kind: enumOf(TRIGGER_KINDS),
    cron: str,
    event: str,
    inputFields: arr(
      obj({
        name: str,
        type: enumOf(FIELD_TYPES),
        required: { type: 'boolean' },
        description: str,
      }),
    ),
  }),
  llm: obj({
    model: enumOf(AGENT_MODELS.map((m) => m.id)),
    effort: enumOf(['low', 'medium', 'high']),
    instructions: str,
    prompt: str,
    outputFormat: enumOf(['text', 'json']),
    jsonFields: arr(
      obj({ name: str, type: enumOf(['string', 'number', 'boolean']), description: str }),
    ),
    outputVar: str,
  }),
  tool: obj({ tool: str, args: arr(obj({ name: str, value: str })), outputVar: str }),
  branch: obj({
    mode: enumOf(['condition', 'classify']),
    cases: arr(obj({ id: str, label: str, expr: str, description: str })),
    input: str,
    instructions: str,
    outputVar: str,
  }),
  loop: obj({ listVar: str, itemVar: str, maxItems: { type: 'integer' } }),
  guardrail: obj({
    rules: arr(
      obj({
        kind: enumOf(GUARDRAIL_KINDS),
        value: { type: 'integer' },
        list: arr(str),
        startHour: { type: 'integer' },
        endHour: { type: 'integer' },
        weekdays: arr({ type: 'integer' }),
      }),
    ),
  }),
  approval: obj({ message: str }),
  output: obj({ template: str }),
};

const OUTPUT_SCHEMA = obj({
  name: str,
  description: str,
  summary: str,
  nodes: arr(
    obj({
      id: str,
      type: enumOf(AGENT_NODE_TYPES),
      label: str,
      config: { type: 'string', description: '노드 종류별 설정 JSON 객체를 글자로' },
    }),
  ),
  edges: arr(obj({ source: str, sourceHandle: str, target: str })),
});

/** 스키마 → 짧은 타입 표기(안내문용) */
function shape(s: unknown): string {
  const x = s as {
    type?: string;
    enum?: string[];
    properties?: Record<string, unknown>;
    items?: unknown;
  };
  if (x.enum) return x.enum.map((v) => `"${v}"`).join('|');
  if (x.type === 'object')
    return `{ ${Object.entries(x.properties ?? {})
      .map(([k, v]) => `${k}: ${shape(v)}`)
      .join(', ')} }`;
  if (x.type === 'array') return `${shape(x.items)}[]`;
  return String(x.type);
}
const CONFIG_SHAPES = AGENT_NODE_TYPES.map((t) => `- ${t}: ${shape(CONFIG_SCHEMA[t])}`).join('\n');

export interface DesignMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface DesignReply {
  /** 직원에게 보여 줄 답(질문이나 정리) */
  reply: string;
  /** ask: 더 물어볼 것이 있음, ready: 만들 준비가 됨 */
  status: 'ask' | 'ready';
  /** 참고 양식 파일을 올려 달라고 하는 중인지 */
  askForFile: boolean;
  name: string;
  description: string;
  /** 설계할 내용 정리(ready일 때) — 그대로 generate에 넘긴다 */
  spec: string;
}

const DESIGN_SCHEMA = obj({
  reply: str,
  status: enumOf(['ask', 'ready']),
  askForFile: { type: 'boolean' },
  name: str,
  description: str,
  spec: str,
});

const DESIGN_GUIDE = `당신은 통인익스프레스(이사·리빙케어 회사) ERP에서 직원과 대화하며 "AI 에이전트"를 함께 기획하는 담당입니다.
직원이 하고 싶은 일을 말하면, 실제로 동작하는 에이전트를 만들 수 있을 만큼 정보가 모였는지 판단하고 부족하면 되묻습니다.

## 확인할 것(이미 말했거나 상식으로 정할 수 있으면 묻지 않음)
- 무엇을(대상 데이터·조건): 어떤 접수·고객·계약·작업을, 어떤 기간·지점·상태로
- 무엇을 하나: 조회·요약·문자 발송·담당자 배정·파일 만들기 등
- 언제 시작하나: 필요할 때 직접 실행 / AI 비서 대화에서 / 정해진 시간(예: 매주 월요일 9시). 업무가 생길 때(새 접수 등) 자동 시작은 아직 안 되므로 그런 요청이면 정해진 시간마다 새 건을 확인하는 방식으로 제안합니다.
- 결과물: 화면 요약인지, 파일(엑셀·PDF)인지, 문자인지
- 안전 장치: 데이터를 바꾸거나 문자를 보내면 사람 승인은 기본으로 넣는다(묻지 말고 알려만 준다). 발송 인원 한도 등은 필요할 때만 묻는다.

## 보고서·문서 파일
- 보고서·집계표·주간/월간 보고처럼 파일을 만드는 일이면, 실제로 쓰는 양식 파일(엑셀 .xlsx 또는 CSV)을 올려 달라고 요청하고 askForFile을 true로 합니다. 올리면 그 양식(서식·칸 위치) 그대로 채워 만든다고 설명합니다.
- 양식이 없다고 하면 기본 표 형식(엑셀·CSV·PDF)으로 만든다고 하고 넘어갑니다.
- 이미 올린 양식이 있으면 그 구조를 보고, 칸마다 무엇을 채울지 애매한 부분만 확인합니다.

## 대화 방식
- 한국어, 짧고 친절하게. 한 번에 질문은 1~3개, 번호 목록으로. 고를 수 있으면 예시 선택지를 붙입니다.
- 이미 받은 답을 다시 묻지 않습니다. 직원이 "알아서 해 줘"라고 하면 합리적인 기본값으로 정하고 넘어갑니다.
- 정보가 충분하면 status를 "ready"로 하고, reply에 만들 에이전트를 3~6줄 "- " 목록으로 정리한 뒤 "이대로 만들까요? 바꿀 점이 있으면 말씀해 주세요."로 끝냅니다.
- status가 ready면 spec에 설계자가 그대로 보고 만들 수 있게 대상·조건·시작 방식·단계·결과물·승인/한도·참고 양식 id(있으면, 칸마다 채울 내용)를 빠짐없이 적습니다. ask일 때 spec은 지금까지 정리한 내용.
- name은 짧은 한국어 이름(예: "주간 지점 실적 보고"), description은 한 줄 설명. 아직 모르면 빈 글자.
- 도구 목록에 없는 일(외부 메일 발송, 다른 회사 시스템 조회 등)은 할 수 없다고 솔직히 말하고 대안을 제안합니다.`;

/** 시스템 프롬프트 앞부분 — 바뀌지 않는다(캐시) */
const GUIDE = `당신은 통인익스프레스(이사·리빙케어 회사) ERP의 "AI 에이전트 빌더"입니다.
직원이 자연어로 설명한 일을 하는 에이전트를 노드와 실행선으로 이은 블루프린트(언리얼 블루프린트 방식)로 설계해 JSON으로 돌려줍니다.

## 노드 종류(type)와 출력 포트(sourceHandle)
${AGENT_NODE_TYPES.map((t) => `- ${t} (${AGENT_NODE_LABEL[t]}): ${AGENT_NODE_DESC[t]}`).join('\n')}
포트: trigger·llm·guardrail → "out" / tool → "out"(성공), "error"(실패) / branch → 각 case의 id + "else" /
loop → "body"(항목마다 실행할 첫 노드), "done"(다 돌고 나서) / approval → "approved", "rejected" / output → 없음.
모든 노드(시작 제외)는 입력 포트가 하나("in")이고 여러 선이 들어와도 됩니다. 출력 포트 하나에는 선을 하나만 잇습니다.
실행선이 되돌아가는 순환은 금지 — 반복은 loop 노드로 만듭니다. loop 본문은 끝 노드에서 선을 끊으면 다음 항목으로 넘어갑니다.

## 노드 설정(config) — 종류별 JSON 객체를 글자(string)로 넣습니다. 모든 칸을 채우고 안 쓰는 칸은 "" · 0 · [].
${CONFIG_SHAPES}

## 데이터(변수)
- 노드 결과는 outputVar 이름(영문 camelCase)으로 남고, 뒤 노드에서 {{변수.경로}}로 씁니다. 예: {{leads.total}}, {{leads.rows[0].customerName}}, {{leads.rows[*].customerId}}(목록에서 한 칸씩 뽑아 배열로).
- 시작 입력은 {{input.필드}}, 시스템 변수: {{run.today}}, {{run.weekAgo}}, {{run.monthStart}}, {{run.now}}, {{user.name}}.
- 도구 인자 값(args[].value)은 글자입니다. 값 전체가 {{경로}} 하나면 원래 값(배열·객체)이 그대로 넘어가고, JSON 글자(예: false, 50, {"a":"{{x}}"})도 됩니다.
- branch condition 모드의 expr은 조건식: 경로 비교(leads.total > 0), &&, ||, !, ==, !=, len(x), empty(x), contains(a,b). 중괄호 없이 씁니다.
- branch classify 모드는 AI가 input 내용을 읽고 cases 중 하나(설명 description 기준)를 고릅니다. outputVar에 고른 id가 남습니다.
- llm 노드는 instructions(역할·규칙)과 prompt(이번 내용, {{변수}} 사용)로 Claude를 부릅니다. 구조가 필요하면 outputFormat "json" + jsonFields. model은 보통 ${AGENT_DEFAULT_MODEL}, 단순 작업은 claude-haiku-5-5. effort는 보통 low.

## 가드레일(guardrail.rules[].kind)
${GUARDRAIL_KINDS.map((k) => `- ${k}: ${GUARDRAIL_LABEL[k]}`).join('\n')}
값: maxSteps·maxLlmCalls·maxRecipients → value, allowTools·blockTools·recipientAllowlist → list, timeWindow → startHour·endHour(0~24)·weekdays(0=일~6=토). 안 쓰는 칸은 0 또는 [].

## 시작(trigger)
kind: manual(수동) | chat(AI 비서 대화에서 호출) | schedule(cron "분 시 일 월 요일", 한국 시간) | event(업무 이벤트: ${TRIGGER_EVENTS.join(', ')}).
필요한 입력값은 inputFields로 정의합니다(예: 기간, 지점 id).
event 자동 시작은 아직 연결 전이라 쓰지 않습니다 — "새 접수가 오면" 같은 요청은 schedule(예: 30분마다)로 새 건을 확인하게 설계합니다.

## 설계 원칙
- 도구는 아래 목록에 있는 이름만 그대로 씁니다. 지어내지 마세요. 필수 인자(*)는 반드시 채웁니다.
- 데이터를 바꾸는 쓰기(WRITE) 도구 앞에는 반드시 approval 노드(사람 승인)를 둡니다. 문자 발송이 있으면 guardrail로 maxRecipients 같은 한도도 겁니다.
- 고객 문자(send_sms)는 customerIds(고객 id 배열)와 message가 필요합니다. 본문은 [통인익스프레스]로 시작하고 {고객명}을 쓰면 고객마다 이름이 들어갑니다.
- "미계약"은 search_leads의 contracted=false입니다.
- 조회 결과가 없을 때를 branch로 나눠 처리하고, 마지막에 output 노드로 무엇을 했는지 요약합니다.
- 보고서·문서 파일을 만들어야 하면: 참고 양식이 있으면 create_file_from_template(templateId=양식 id, data={{앞 노드 결과}}, instructions=어느 칸에 무엇을), 없으면 create_report_file(xlsx·csv·pdf 표). 앞 노드에서 필요한 데이터를 먼저 조회하고, output 노드에 만든 파일 이름({{변수.fileName}})을 적습니다.
- 노드 id는 짧은 영문 snake_case(예: find_leads). label은 짧은 한국어. 꼭 필요한 노드만 둡니다(보통 5~12개).
- summary에는 무엇을 만들었는지(수정이면 무엇을 바꿨는지) 한국어 2~5줄 "- " 목록으로 적습니다.
- 기존 블루프린트를 고치는 요청이면 바뀌지 않는 노드는 id·설정을 그대로 두고, 요청한 부분만 바꾼 전체 그래프를 돌려줍니다.`;

function argSummary(schema: AgentJsonSchema): string {
  const req = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {})
    .map(([k, v]) => {
      const sub =
        v.properties && Object.keys(v.properties).length
          ? `{${Object.keys(v.properties)
              .slice(0, 12)
              .map((p) => `${p}${(v.required ?? []).includes(p) ? '*' : ''}`)
              .join(',')}}`
          : '';
      return `${k}${req.has(k) ? '*' : ''}${sub}`;
    })
    .join(', ');
}

/** 도구 목록을 짧게 — 이름·읽기/쓰기·한 줄 설명·인자(필수는 *) */
function compactCatalog(tools: AgentToolInfo[]): string {
  const groups = new Map<string, AgentToolInfo[]>();
  for (const t of tools) {
    if (!groups.has(t.group)) groups.set(t.group, []);
    groups.get(t.group)!.push(t);
  }
  const lines: string[] = [];
  for (const [g, list] of groups) {
    lines.push(`### ${g}`);
    for (const t of list) {
      const short = t.description
        .replace(/^\[[^\]]*\]\s*/, '')
        .split(/\.\s|\n/)[0]
        .slice(0, 90);
      const args = argSummary(t.inputSchema);
      lines.push(`- ${t.name} [${t.mode}] ${short}${args ? ` | 인자: ${args}` : ''}`);
    }
  }
  return lines.join('\n');
}

interface RawNode {
  id: string;
  type: AgentNodeType;
  label: string;
  /** 설정 JSON 글자(출력 스키마 참고) */
  config: string | Record<string, unknown>;
}

function parseConfig(
  raw: RawNode['config'],
  label: string,
  fixes: string[],
): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(String(raw || '{}')) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    fixes.push(`'${label}'의 설정을 읽지 못해 기본값으로 두었습니다.`);
    return {};
  }
}

@Injectable()
export class AgentGeneratorService {
  private readonly logger = new Logger('AgentGenerator');
  private readonly client: Anthropic | null = createClaude();

  constructor(private readonly blueprints: AgentBlueprintService) {}

  get configured() {
    return !!this.client;
  }

  async generate(
    prompt: string,
    principal: AuthPrincipal,
    current: AgentGraph | null,
    references: ReferenceMeta[] = [],
  ): Promise<GenerateResult> {
    const client = requireClaude(this.client);
    const tools = this.blueprints.toolInfos(principal);
    const toolMap = new Map(tools.map((t) => [t.name, t]));

    // 자주 쓰는 업무 도구는 스키마 전체를 붙인다(인자 설명이 길다)
    const domainDetail = tools
      .filter((t) => t.group === 'AI 업무 도구')
      .map((t) => `- ${t.name}: ${t.description}\n  스키마: ${JSON.stringify(t.inputSchema)}`)
      .join('\n');

    const refText = references.length
      ? `<reference_files>\n${references.map((r) => `- 양식 id: ${r.id}\n${r.summary}`).join('\n\n')}\n</reference_files>\n` +
        '위 참고 양식 그대로 파일을 만들어야 하면 create_file_from_template 노드에 이 양식 id를 templateId로 넣습니다.\n\n'
      : '';
    const userText = current
      ? `${refText}<current_blueprint>\n${JSON.stringify(compactGraph(current))}\n</current_blueprint>\n\n<request>\n${prompt}\n</request>\n\n위 블루프린트를 요청대로 고친 전체 그래프를 돌려주세요.`
      : `${refText}<request>\n${prompt}\n</request>\n\n이 일을 하는 에이전트 블루프린트를 새로 설계해 주세요.`;

    let res: Anthropic.Beta.Messages.BetaMessage;
    try {
      res = await client.beta.messages
        .stream({
          model: BUILDER_MODEL,
          max_tokens: 32000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
          },
          // 안내문 + 도구 목록은 사용자(권한)가 같으면 그대로라 캐시에서 읽는다
          system: [
            {
              type: 'text',
              text: `${GUIDE}\n\n## 업무 도구(자세히)\n${domainDetail}\n\n## 호출할 수 있는 도구 전체(${tools.length}개)\n${compactCatalog(tools)}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: userText }],
        })
        .finalMessage();
      assertComplete(res);
    } catch (e) {
      const msg = describeClaudeError(e);
      this.logger.warn(`블루프린트 생성 실패: ${msg}`);
      throw new BadGatewayException(msg);
    }

    let raw: {
      name: string;
      description: string;
      summary: string;
      nodes: RawNode[];
      edges: { source: string; sourceHandle: string; target: string }[];
    };
    try {
      raw = JSON.parse(textOf(res));
    } catch {
      throw new BadGatewayException('AI 응답을 블루프린트로 읽지 못했습니다. 다시 시도해 주세요.');
    }

    const fixes: string[] = [];
    let graph = toGraph(raw, fixes);
    graph = insertApprovals(graph, toolMap, fixes);
    for (const n of graph.nodes) {
      if (
        n.type === 'tool' &&
        (n.config as ToolConfig).tool &&
        !toolMap.has((n.config as ToolConfig).tool)
      )
        fixes.push(
          `'${n.label}'의 도구 '${(n.config as ToolConfig).tool}'는 목록에 없습니다 — 직접 골라 주세요.`,
        );
    }
    graph = placeNodes(graph, current);

    return {
      name: raw.name,
      description: raw.description,
      summary: raw.summary,
      graph,
      changes: diffGraphs(current, graph),
      fixes,
      issues: this.blueprints.validate(graph, principal),
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      },
    };
  }

  /**
   * 대화로 만들기 — 직원이 말한 내용에서 빠진 정보를 되묻고, 충분해지면 설계 명세(spec)를 정리한다.
   * 보고서·문서를 만드는 일이면 실제로 쓰는 양식 파일을 올려 달라고 한다.
   */
  async designChat(
    messages: DesignMessage[],
    references: ReferenceMeta[],
    principal: AuthPrincipal,
  ): Promise<DesignReply> {
    const client = requireClaude(this.client);
    const tools = this.blueprints.toolInfos(principal);
    const refText = references.length
      ? references.map((r) => `- ${r.name} (id ${r.id})\n${r.summary}`).join('\n\n')
      : '(아직 없음)';
    let res: Anthropic.Beta.Messages.BetaMessage;
    try {
      res = await client.beta.messages
        .stream({
          model: BUILDER_MODEL,
          max_tokens: 8000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: DESIGN_SCHEMA },
          },
          system: [
            {
              type: 'text',
              text: `${DESIGN_GUIDE}\n\n## 에이전트가 쓸 수 있는 ERP 도구(${tools.length}개)\n${compactCatalog(tools)}`,
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: `## 지금까지 올린 참고 양식\n${refText}` },
          ],
          messages: messages.map((m) => ({ role: m.role, content: m.text })),
        })
        .finalMessage();
      assertComplete(res);
    } catch (e) {
      const msg = describeClaudeError(e);
      this.logger.warn(`대화 설계 실패: ${msg}`);
      throw new BadGatewayException(msg);
    }
    try {
      return JSON.parse(textOf(res)) as DesignReply;
    } catch {
      throw new BadGatewayException('AI 응답을 읽지 못했습니다. 다시 보내 주세요.');
    }
  }
}

/** 모델에 보여 줄 현재 그래프 — 위치는 빼고 id·종류·설정·선만 */
function compactGraph(g: AgentGraph) {
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      config:
        n.type === 'tool'
          ? {
              ...(n.config as ToolConfig),
              args: Object.entries((n.config as ToolConfig).args).map(([name, value]) => ({
                name,
                value,
              })),
            }
          : n.config,
    })),
    edges: g.edges.map((e) => ({
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
    })),
  };
}

/** 모델 출력 → 내부 그래프. 없는 노드·포트를 가리키는 선은 버리고 기록한다 */
function toGraph(
  raw: { nodes: RawNode[]; edges: { source: string; sourceHandle: string; target: string }[] },
  fixes: string[],
): AgentGraph {
  const nodes: AgentNode[] = [];
  const seen = new Set<string>();
  for (const r of raw.nodes ?? []) {
    let id = String(r.id || newAgentId(r.type)).replace(/[^A-Za-z0-9_-]/g, '_');
    while (seen.has(id)) id = `${id}_2`;
    seen.add(id);
    const cfg = {
      ...(defaultConfig(r.type) as object),
      ...parseConfig(r.config, r.label || r.id, fixes),
    } as Record<string, unknown>;
    if (r.type === 'tool') {
      const list = Array.isArray(cfg.args) ? (cfg.args as { name: string; value: string }[]) : [];
      cfg.args = Object.fromEntries(list.filter((a) => a.name).map((a) => [a.name, a.value]));
    }
    if (r.type === 'branch') cfg.model = cfg.model || AGENT_DEFAULT_MODEL;
    if (r.type === 'guardrail') {
      cfg.rules = ((cfg as unknown as GuardrailConfig).rules ?? []).map(cleanRule);
    }
    nodes.push({
      id,
      type: r.type,
      label: r.label || AGENT_NODE_LABEL[r.type],
      position: { x: 0, y: 0 },
      config: cfg as never,
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: AgentEdge[] = [];
  const used = new Set<string>();
  for (const e of raw.edges ?? []) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) {
      fixes.push(`없는 노드를 잇는 선(${e.source} → ${e.target})을 뺐습니다.`);
      continue;
    }
    if (!outputPorts(s).some((p) => p.id === e.sourceHandle)) {
      fixes.push(`'${s.label}'에 없는 포트 '${e.sourceHandle}'의 선을 뺐습니다.`);
      continue;
    }
    if (t.type === 'trigger') {
      fixes.push('시작 노드로 들어가는 선을 뺐습니다.');
      continue;
    }
    const key = `${s.id}:${e.sourceHandle}`;
    if (used.has(key)) {
      fixes.push(`'${s.label}'의 '${e.sourceHandle}' 포트에 선이 둘 이상이라 첫 선만 남겼습니다.`);
      continue;
    }
    used.add(key);
    edges.push({
      id: `e_${s.id}_${e.sourceHandle}_${t.id}`,
      source: s.id,
      sourceHandle: e.sourceHandle,
      target: t.id,
    });
  }
  return { version: 1, nodes, edges };
}

/** 구조화 출력은 모든 칸이 필수라 안 쓰는 칸이 0·[]로 온다 — 규칙에 필요한 칸만 남긴다 */
function cleanRule(r: GuardrailRule): GuardrailRule {
  switch (r.kind) {
    case 'maxSteps':
    case 'maxLlmCalls':
    case 'maxRecipients':
      return { kind: r.kind, value: Number(r.value) || 0 };
    case 'allowTools':
    case 'blockTools':
    case 'recipientAllowlist':
      return { kind: r.kind, list: r.list ?? [] };
    case 'timeWindow':
      return {
        kind: r.kind,
        startHour: r.startHour ?? 9,
        endHour: r.endHour || 18,
        weekdays: r.weekdays?.length ? r.weekdays : [1, 2, 3, 4, 5],
      };
    default:
      return { kind: r.kind };
  }
}

/** 위쪽에 사람 승인(또는 승인 가드레일)이 없는 쓰기 도구 앞에 승인 노드를 끼워 넣는다 */
function insertApprovals(
  graph: AgentGraph,
  tools: Map<string, AgentToolInfo>,
  fixes: string[],
): AgentGraph {
  const nodes = [...graph.nodes];
  let edges = [...graph.edges];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const guardedAbove = (id: string) => {
    const seen = new Set<string>();
    const st = [id];
    while (st.length) {
      const x = st.pop()!;
      for (const e of edges) {
        if (e.target !== x || seen.has(e.source)) continue;
        seen.add(e.source);
        const n = byId.get(e.source);
        if (!n) continue;
        if (n.type === 'approval') return true;
        if (
          n.type === 'guardrail' &&
          (n.config as GuardrailConfig).rules.some((r) => r.kind === 'requireApproval')
        )
          return true;
        st.push(e.source);
      }
    }
    return false;
  };
  for (const n of graph.nodes) {
    if (n.type !== 'tool') continue;
    const info = tools.get((n.config as ToolConfig).tool);
    if (info?.mode !== 'WRITE' || guardedAbove(n.id)) continue;
    const ap: AgentNode = {
      id: `approve_${n.id}`.slice(0, 60),
      type: 'approval',
      label: '사람 승인',
      position: { x: 0, y: 0 },
      config: { message: `'${n.label}'(${info.name})을(를) 실행할까요?` },
    };
    nodes.push(ap);
    byId.set(ap.id, ap);
    edges = edges.map((e) => (e.target === n.id ? { ...e, target: ap.id, id: `${e.id}_ap` } : e));
    edges.push({
      id: `e_${ap.id}_approved_${n.id}`,
      source: ap.id,
      sourceHandle: 'approved',
      target: n.id,
    });
    fixes.push(`쓰기 도구 '${n.label}' 앞에 사람 승인 노드를 넣었습니다.`);
  }
  return { ...graph, nodes, edges };
}

/** 새로 만든 그래프는 전체 자동 배치, 고친 그래프는 원래 있던 노드 자리를 지킨다 */
function placeNodes(graph: AgentGraph, current: AgentGraph | null): AgentGraph {
  const laid = autoLayout(graph);
  if (!current) return laid;
  const old = new Map(current.nodes.map((n) => [n.id, n.position]));
  const placed: AgentNode[] = [];
  for (const n of laid.nodes) {
    const keep = old.get(n.id);
    if (keep) placed.push({ ...n, position: keep });
  }
  for (const n of laid.nodes) {
    if (old.has(n.id)) continue;
    const pos = { ...n.position };
    // 사람이 옮겨 둔 노드와 겹치면 아래로 비킨다
    while (
      placed.some(
        (p) => Math.abs(p.position.x - pos.x) < 240 && Math.abs(p.position.y - pos.y) < 140,
      )
    )
      pos.y += 160;
    placed.push({ ...n, position: pos });
  }
  return normalizeAgentGraph({
    ...graph,
    nodes: graph.nodes.map((n) => placed.find((p) => p.id === n.id)!),
  });
}

/** 바뀐 점 — 노드 추가·삭제·설정 변경, 선 추가·삭제 */
export function diffGraphs(before: AgentGraph | null, after: AgentGraph) {
  const prev = new Map((before?.nodes ?? []).map((n) => [n.id, n]));
  const next = new Map(after.nodes.map((n) => [n.id, n]));
  const added = after.nodes.filter((n) => !prev.has(n.id)).map((n) => n.label);
  const removed = (before?.nodes ?? []).filter((n) => !next.has(n.id)).map((n) => n.label);
  const changed = after.nodes
    .filter((n) => {
      const p = prev.get(n.id);
      return p && (p.label !== n.label || JSON.stringify(p.config) !== JSON.stringify(n.config));
    })
    .map((n) => n.label);
  const key = (e: AgentEdge) => `${e.source}:${e.sourceHandle}>${e.target}`;
  const pe = new Set((before?.edges ?? []).map(key));
  const ne = new Set(after.edges.map(key));
  return {
    added,
    removed,
    changed,
    edgesAdded: [...ne].filter((k) => !pe.has(k)).length,
    edgesRemoved: [...pe].filter((k) => !ne.has(k)).length,
  };
}
