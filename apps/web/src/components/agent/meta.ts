import i18n, { tDyn } from '../../i18n';
import type { LucideIcon } from 'lucide-react';
import { aiModelLabel } from '../../lib/aiModels';
import {
  BrainCircuit,
  Flag,
  Repeat,
  ShieldAlert,
  Split,
  UserCheck,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  type AgentNode,
  type AgentNodeType,
  type AgentToolInfo,
  type ApprovalConfig,
  type BranchConfig,
  type GuardrailConfig,
  type LlmConfig,
  type LoopConfig,
  type OutputConfig,
  type ToolConfig,
  type TriggerConfig,
} from '@tongin/shared';
import { GUARDRAIL_LABEL, TRIGGER_EVENT_LABEL, TRIGGER_KIND_LABEL } from '../../i18n/codes';

export const NODE_ICON: Record<AgentNodeType, LucideIcon> = {
  trigger: Zap,
  llm: BrainCircuit,
  tool: Wrench,
  branch: Split,
  loop: Repeat,
  guardrail: ShieldAlert,
  approval: UserCheck,
  output: Flag,
};

/** CSS 변수(agentBuilder.module.css .page에 정의) */
export const NODE_COLOR: Record<AgentNodeType, string> = {
  trigger: 'var(--ab-trigger)',
  llm: 'var(--ab-llm)',
  tool: 'var(--ab-tool)',
  branch: 'var(--ab-branch)',
  loop: 'var(--ab-loop)',
  guardrail: 'var(--ab-guardrail)',
  approval: 'var(--ab-approval)',
  output: 'var(--ab-output)',
};

/** 미니맵처럼 CSS 변수를 못 쓰는 SVG 속성용(라이트·다크 공통으로 읽히는 중간 톤) */
export const NODE_HEX: Record<AgentNodeType, string> = {
  trigger: '#e5484d',
  llm: '#8e4ec6',
  tool: '#0b84e5',
  branch: '#d9a400',
  loop: '#12a594',
  guardrail: '#f76b15',
  approval: '#d6409f',
  output: '#30a46c',
};

export const modelLabel = (id: string) => aiModelLabel(id).split(' (')[0];

const cut = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 예약 cron("분 시 일 월 요일") → "매주 월요일 09:00" · "매일 08:30" · "평일 …"(못 읽으면 그대로) */
export function cronLabel(cron: string): string {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6](?:-[0-6])?|[0-6](?:,[0-6])+)$/.exec(cron.trim());
  if (!m) return cron;
  const time = `${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}`;
  const dow = m[3];
  const day = (d: string) => tDyn(`agent.dow.${d}`, d);
  if (dow === '*') return i18n.t('agent.cronFmt.daily', { v0: time });
  if (dow === '1-5') return i18n.t('agent.cronFmt.weekdays', { v0: time });
  const days = dow.includes('-')
    ? `${day(dow[0])}~${day(dow[2])}`
    : dow.split(',').map(day).join('·');
  return i18n.t('agent.cronFmt.weekly', { v0: days, v1: time });
}

/** {{run.today}} 같은 시스템 변수 → '오늘', 그 밖의 {{x.y}} → ‹x.y› */
const RUN_WORD: Record<string, string> = {
  'run.today': 'today',
  'run.tomorrow': 'tomorrow',
  'run.weekAgo': 'weekAgo',
  'run.in3days': 'in3days',
  'run.in7days': 'in7days',
  'run.monthStart': 'monthStart',
  'run.now': 'now',
  'user.name': 'me',
};
/** 인자 값 코드 → 말(묶음·기준 날짜·상태·예/아니오·형식) */
const VALUE_WORD = new Set([
  'branch',
  'source',
  'day',
  'week',
  'month',
  'serviceLine',
  'partner',
  'region',
  'createdAt',
  'moveDate',
  'visitDate',
  'true',
  'false',
  'xlsx',
  'csv',
  'pdf',
  'RECEIVED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'PENDING',
  'PAID',
  'DONE',
  'ASSIGNED',
  'CANCELED',
  'HIGH',
  'NORMAL',
  'LOW',
  'todo',
  'mine',
  'cc',
  'all',
]);
export function prettyValue(v: unknown): string {
  // 값 목록(["leadNo","customerName"])은 쉼표로
  if (Array.isArray(v)) return v.map((x) => prettyValue(x)).join(', ');
  let raw = typeof v === 'string' ? v.trim() : JSON.stringify(v);
  if (/^\[.*\]$/.test(raw)) {
    try {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) return arr.map((x) => prettyValue(x)).join(', ');
    } catch {
      // 목록 글자가 아니면 그대로
    }
  }
  if (VALUE_WORD.has(raw)) raw = tDyn(`agent.val.${raw}`, raw);
  const s = raw;
  return s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, p: string) =>
    RUN_WORD[p] ? tDyn(`agent.when.${RUN_WORD[p]}`, p) : `‹${p}›`,
  );
}

/** 도구 이름 — '[결재] 결재함 목록. …' 설명에서 '결재 · 결재함 목록'(업무 도구는 이름표) */
export function toolTitle(name: string, info?: AgentToolInfo): string {
  if (!name) return '';
  const builtin = tDynSafe(`agent.toolName.${name}`);
  if (builtin) return builtin;
  const m = info ? /^\[([^\]]+)\]\s*([^.]+)/.exec(info.description) : null;
  return m ? `${m[1]} · ${m[2].split(' — ')[0].trim()}` : name;
}
const tDynSafe = (k: string) => (i18n.exists(k) ? tDyn(k) : '');

/** 도구 인자 한 줄 — from·to는 '기간 7일 전 ~ 오늘'로 묶고, 아는 이름은 한국어로 */
function argLine(args: [string, unknown][]): string {
  const map = new Map(args);
  const parts: string[] = [];
  if (map.has('from') || map.has('to')) {
    parts.push(
      `${i18n.t('agent.arg.period')} ${prettyValue(map.get('from') ?? '')} ~ ${prettyValue(map.get('to') ?? '')}`,
    );
    map.delete('from');
    map.delete('to');
  }
  for (const [k, v] of map) {
    const label = tDynSafe(`agent.arg.${k}`) || k;
    parts.push(`${label} ${prettyValue(v)}`);
  }
  return parts.join(' · ');
}

/** 노드 카드 본문에 보일 요약 줄 */
export function nodeSummary(
  node: AgentNode,
  tools: Map<string, AgentToolInfo>,
): { lines: string[]; mono?: string; raw?: string; outVar?: string; mode?: 'READ' | 'WRITE' } {
  switch (node.type) {
    case 'trigger': {
      const c = node.config as TriggerConfig;
      const extra =
        c.kind === 'schedule'
          ? cronLabel(c.cron)
          : c.kind === 'event'
            ? (TRIGGER_EVENT_LABEL[c.event as keyof typeof TRIGGER_EVENT_LABEL] ?? c.event)
            : '';
      return {
        lines: [
          `${TRIGGER_KIND_LABEL[c.kind]}${extra ? ` · ${extra}` : ''}`,
          ...(c.inputFields.length
            ? [
                i18n.t('agent.m.inputs', {
                  v0: c.inputFields.map((f) => `${f.name}${f.required ? '*' : ''}`).join(', '),
                }),
              ]
            : []),
        ],
        outVar: 'input',
      };
    }
    case 'llm': {
      const c = node.config as LlmConfig;
      return {
        lines: [
          `${modelLabel(c.model)} · ${c.outputFormat === 'json' ? 'JSON' : i18n.t('agent.fmt.text')}`,
          cut(prettyValue(c.prompt || c.instructions || i18n.t('agent.m.noInstr'))),
        ],
        outVar: c.outputVar,
      };
    }
    case 'tool': {
      const c = node.config as ToolConfig;
      const info = tools.get(c.tool);
      const args = Object.entries(c.args).filter(([, v]) => String(v).trim());
      return {
        // 사람이 읽는 도구 이름(실제 이름은 마우스를 올리면)
        mono: c.tool ? toolTitle(c.tool, info) : i18n.t('agent.m.noTool'),
        raw: c.tool,
        mode: info?.mode,
        lines: args.length ? [cut(argLine(args), 90)] : [],
        outVar: c.outputVar,
      };
    }
    case 'branch': {
      const c = node.config as BranchConfig;
      return {
        lines:
          c.mode === 'condition'
            ? c.cases.map((k) => `${k.label}: ${k.expr || i18n.t('agent.m.noCond')}`).slice(0, 3)
            : [
                i18n.t('agent.m.aiClassify', { v0: modelLabel(c.model) }),
                cut(c.input || i18n.t('agent.m.noClassify')),
              ],
        outVar: c.mode === 'classify' ? c.outputVar : undefined,
      };
    }
    case 'loop': {
      const c = node.config as LoopConfig;
      return {
        lines: [
          i18n.t('agent.m.eachOf', { v0: c.listVar || i18n.t('agent.m.noList') }),
          i18n.t('agent.m.maxN', { v0: c.maxItems }),
        ],
        outVar: c.itemVar,
      };
    }
    case 'guardrail': {
      const c = node.config as GuardrailConfig;
      return {
        lines: c.rules.length
          ? c.rules.slice(0, 4).map((r) => {
              const v =
                r.value !== undefined
                  ? ` ${r.value}`
                  : r.list?.length
                    ? i18n.t('agent.m.countN', { v0: r.list.length })
                    : r.kind === 'timeWindow'
                      ? i18n.t('agent.m.hours', { v0: r.startHour ?? 0, v1: r.endHour ?? 24 })
                      : '';
              return `• ${GUARDRAIL_LABEL[r.kind].split('(')[0]}${v}`;
            })
          : [i18n.t('agent.m.noRules')],
      };
    }
    case 'approval':
      return {
        lines: [cut((node.config as ApprovalConfig).message || i18n.t('agent.m.noApproval'))],
      };
    case 'output':
      return {
        lines: [
          cut(prettyValue((node.config as OutputConfig).template || i18n.t('agent.m.noReply')), 90),
        ],
      };
  }
}
