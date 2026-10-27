import type { LucideIcon } from 'lucide-react';
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
  AGENT_MODELS,
  GUARDRAIL_LABEL,
  TRIGGER_EVENT_LABEL,
  TRIGGER_KIND_LABEL,
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

export const modelLabel = (id: string) =>
  AGENT_MODELS.find((m) => m.id === id)?.label.split(' (')[0] ?? id;

const cut = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 노드 카드 본문에 보일 요약 줄 */
export function nodeSummary(
  node: AgentNode,
  tools: Map<string, AgentToolInfo>,
): { lines: string[]; mono?: string; outVar?: string; mode?: 'READ' | 'WRITE' } {
  switch (node.type) {
    case 'trigger': {
      const c = node.config as TriggerConfig;
      const extra =
        c.kind === 'schedule'
          ? c.cron
          : c.kind === 'event'
            ? (TRIGGER_EVENT_LABEL[c.event as keyof typeof TRIGGER_EVENT_LABEL] ?? c.event)
            : '';
      return {
        lines: [
          `${TRIGGER_KIND_LABEL[c.kind]}${extra ? ` · ${extra}` : ''}`,
          ...(c.inputFields.length
            ? [`입력: ${c.inputFields.map((f) => `${f.name}${f.required ? '*' : ''}`).join(', ')}`]
            : []),
        ],
        outVar: 'input',
      };
    }
    case 'llm': {
      const c = node.config as LlmConfig;
      return {
        lines: [
          `${modelLabel(c.model)} · ${c.outputFormat === 'json' ? 'JSON' : '글'}`,
          cut(c.prompt || c.instructions || '(지시문 없음)'),
        ],
        outVar: c.outputVar,
      };
    }
    case 'tool': {
      const c = node.config as ToolConfig;
      const info = tools.get(c.tool);
      const args = Object.entries(c.args).filter(([, v]) => String(v).trim());
      return {
        mono: c.tool || '(도구 선택 안 함)',
        mode: info?.mode,
        lines: args.length
          ? [cut(args.map(([k, v]) => `${k}=${v}`).join(', '), 80)]
          : info
            ? [cut(info.description, 60)]
            : [],
        outVar: c.outputVar,
      };
    }
    case 'branch': {
      const c = node.config as BranchConfig;
      return {
        lines:
          c.mode === 'condition'
            ? c.cases.map((k) => `${k.label}: ${k.expr || '(조건 없음)'}`).slice(0, 3)
            : [`AI 분류 · ${modelLabel(c.model)}`, cut(c.input || '(분류할 내용 없음)')],
        outVar: c.mode === 'classify' ? c.outputVar : undefined,
      };
    }
    case 'loop': {
      const c = node.config as LoopConfig;
      return {
        lines: [`${c.listVar || '(목록 없음)'}의 항목마다`, `최대 ${c.maxItems}개`],
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
                    ? ` ${r.list.length}개`
                    : r.kind === 'timeWindow'
                      ? ` ${r.startHour ?? 0}~${r.endHour ?? 24}시`
                      : '';
              return `• ${GUARDRAIL_LABEL[r.kind].split('(')[0]}${v}`;
            })
          : ['(규칙 없음)'],
      };
    }
    case 'approval':
      return { lines: [cut((node.config as ApprovalConfig).message || '(승인 문구 없음)')] };
    case 'output':
      return { lines: [cut((node.config as OutputConfig).template || '(응답 없음)')] };
  }
}
