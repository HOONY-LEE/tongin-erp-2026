import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AGENT_DEFAULT_MODEL,
  PERMISSION_WILDCARD,
  evalExpr,
  normalizeAgentGraph,
  readPath,
  renderArg,
  renderTemplate,
  type AgentGraph,
  type AgentNode,
  type ApprovalConfig,
  type AuthPrincipal,
  type BranchConfig,
  type GuardrailConfig,
  type LlmConfig,
  type LoopConfig,
  type OutputConfig,
  type ToolConfig,
  type TriggerConfig,
} from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ToolError, type AiTool, type ToolContext } from '../ai/ai-tool.types';
import { AgentBlueprintService } from './agent-blueprint.service';
import {
  FALLBACK_BETA,
  assertComplete,
  createClaude,
  describeClaudeError,
  requireClaude,
  supportsFallback,
  textOf,
} from './agent-claude';

/** 가드레일이 없어도 넘지 않는 한도(무한 실행 방지) */
const HARD_MAX_STEPS = 300;
const MAX_TRACE_CHARS = 4000;

type StepStatus = 'ok' | 'dry' | 'error' | 'pending' | 'blocked' | 'skipped';

export interface TraceStep {
  seq: number;
  nodeId: string;
  nodeType: string;
  label: string;
  status: StepStatus;
  /** 다음으로 나간 포트 */
  port?: string;
  input?: unknown;
  output?: unknown;
  message?: string;
  /** 반복 중이면 몇 번째 항목인지 */
  iteration?: number;
  startedAt: string;
  durationMs: number;
  tokens?: { input: number; output: number };
}

interface LoopFrame {
  nodeId: string;
  itemVar: string;
  items: unknown[];
  index: number;
  bodyStart: string | null;
  doneTarget: string | null;
}

interface Guards {
  /** 쓰기 도구 호출마다 승인 */
  strictApproval: boolean;
  allowTools: string[] | null;
  blockTools: string[];
  maxSteps: number | null;
  maxLlmCalls: number | null;
  maxRecipients: number | null;
  recipientAllowlist: string[] | null;
  piiMask: boolean;
}

interface Pending {
  kind: 'approval' | 'tool';
  nodeId: string;
  message: string;
  args?: Record<string, unknown>;
}

interface RunState {
  graph: AgentGraph;
  vars: Record<string, unknown>;
  next: string | null;
  loops: LoopFrame[];
  steps: number;
  llmCalls: number;
  /** 사람 승인 노드를 통과했는지(쓰기 도구 실행 허락) */
  approved: boolean;
  guards: Guards;
  output: unknown;
  pending: Pending | null;
  dryRun: boolean;
  mockLlm: boolean;
}

type Outcome =
  | {
      port: string | null;
      output?: unknown;
      input?: unknown;
      status?: StepStatus;
      message?: string;
      tokens?: TraceStep['tokens'];
    }
  | {
      stop: 'BLOCKED' | 'ERROR' | 'AWAITING_APPROVAL' | 'REJECTED';
      message: string;
      input?: unknown;
      output?: unknown;
      status: StepStatus;
    };

class Stop extends Error {
  constructor(
    public status: 'BLOCKED' | 'ERROR',
    message: string,
  ) {
    super(message);
  }
}

export interface RunOptions {
  input: Record<string, unknown>;
  dryRun: boolean;
  mockLlm: boolean;
  graph?: unknown;
}

/**
 * AIX-04: 블루프린트 해석기 — 시작에서 실행선을 따라가며 노드를 하나씩 실행한다.
 * - 도구는 AI 비서와 같은 레지스트리를 실행자 본인 토큰으로 부른다(권한·스코프·감사 동일).
 * - 시험 실행(dryRun)에서는 읽기 도구만 실제로 부르고, 쓰기 도구는 "이렇게 부를 것"만 기록한다.
 * - 실제 실행에서 쓰기 도구는 사람 승인을 거친 뒤에만 실행된다(승인 노드 또는 그 자리에서 승인 대기).
 * - 실행 상태(변수·다음 노드·반복 스택)는 JSON으로 저장돼 승인 뒤 그대로 이어 간다.
 */
@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger('AgentRunner');
  private readonly client: Anthropic | null = createClaude();
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly blueprints: AgentBlueprintService,
  ) {}

  async start(blueprintId: string, opts: RunOptions, ctx: ToolContext) {
    // 볼 수 있는 에이전트만 실행(개인용·부분 공유 검사) — 도구는 실행자 본인 권한으로 불린다
    const bp = await this.blueprints.get(blueprintId, ctx.principal);
    const graph = opts.graph ? normalizeAgentGraph(opts.graph) : bp.graph;
    const issues = this.blueprints
      .validate(graph, ctx.principal)
      .filter((i) => i.level === 'error');
    if (issues.length) {
      throw new BadRequestException({
        message: `블루프린트에 오류가 ${issues.length}개 있어 실행할 수 없습니다: ${issues[0].message}`,
        issues,
      });
    }
    const trigger = graph.nodes.find((n) => n.type === 'trigger')!;
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600_000);
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const state: RunState = {
      graph,
      vars: {
        run: {
          now: now.toISOString(),
          today: ymd(kst),
          weekAgo: ymd(new Date(kst.getTime() - 7 * 86400_000)),
          monthStart: `${ymd(kst).slice(0, 8)}01`,
        },
        user: { name: ctx.principal.employeeName ?? ctx.principal.loginId },
      },
      next: trigger.id,
      loops: [],
      steps: 0,
      llmCalls: 0,
      approved: false,
      guards: {
        strictApproval: false,
        allowTools: null,
        blockTools: [],
        maxSteps: null,
        maxLlmCalls: null,
        maxRecipients: null,
        recipientAllowlist: null,
        piiMask: false,
      },
      output: null,
      pending: null,
      dryRun: opts.dryRun,
      mockLlm: opts.mockLlm,
    };
    state.vars.input = opts.input;
    const run = await this.prisma.agentRun.create({
      data: {
        blueprintId,
        input: opts.input as object,
        dryRun: opts.dryRun,
        status: 'RUNNING',
        createdBy: ctx.principal.userId,
      },
    });
    const runCtx: ToolContext = { ...ctx, agentRunId: run.id, blueprintId };
    return this.exclusive(run.id, () => this.drive(run.id, state, [], runCtx));
  }

  /** 승인 대기 중인 실행을 승인·거절하고 이어 간다 */
  async decide(runId: string, approve: boolean, ctx: ToolContext) {
    ctx = { ...ctx, agentRunId: runId };
    return this.exclusive(runId, async () => {
      const run = await this.prisma.agentRun.findUnique({ where: { id: runId } });
      if (!run || !this.ownsRun(run, ctx.principal))
        throw new NotFoundException('실행 기록을 찾을 수 없습니다.');
      ctx = { ...ctx, blueprintId: run.blueprintId };
      if (run.status !== 'AWAITING_APPROVAL' || !run.state)
        throw new BadRequestException('승인 대기 중인 실행이 아닙니다.');
      const state = run.state as unknown as RunState;
      const trace = run.trace as unknown as TraceStep[];
      const pending = state.pending!;
      const node = state.graph.nodes.find((n) => n.id === pending.nodeId);
      if (!node) throw new BadRequestException('승인할 노드가 그래프에 없습니다.');
      state.pending = null;
      const started = Date.now();
      const push = (status: StepStatus, message: string, port?: string, output?: unknown) =>
        trace.push({
          seq: trace.length + 1,
          nodeId: node.id,
          nodeType: node.type,
          label: node.label,
          status,
          port,
          message,
          output,
          startedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
        });

      if (pending.kind === 'approval') {
        const port = approve ? 'approved' : 'rejected';
        if (approve) state.approved = true;
        push('ok', `${ctx.principal.loginId}님이 ${approve ? '승인' : '거절'}했습니다.`, port);
        const nx = this.edgeTarget(state.graph, node.id, port);
        if (!approve && !nx)
          return this.finish(runId, state, trace, 'REJECTED', '승인이 거절되어 멈췄습니다.');
        state.next = nx;
        return this.drive(runId, state, trace, ctx);
      }
      // 그 자리 승인(도구 호출)
      if (!approve) {
        push('skipped', `${ctx.principal.loginId}님이 거절해 실행하지 않았습니다.`);
        return this.finish(runId, state, trace, 'REJECTED', '쓰기 도구 실행이 거절되었습니다.');
      }
      const cfg = node.config as ToolConfig;
      const tool = this.blueprints.toolsFor(ctx.principal).find((t) => t.name === cfg.tool);
      if (!tool)
        return this.finish(
          runId,
          state,
          trace,
          'ERROR',
          `${cfg.tool}: 권한이 없거나 없는 도구입니다.`,
        );
      const out = await this.callTool(tool, pending.args ?? {}, ctx, state, node);
      push(
        out.status ?? 'ok',
        `${ctx.principal.loginId}님 승인 후 실행 — ${out.message ?? ''}`.trim(),
        'port' in out ? (out.port ?? undefined) : undefined,
        this.clipForTrace(out.output, state),
      );
      if ('stop' in out)
        return this.finish(
          runId,
          state,
          trace,
          out.stop === 'AWAITING_APPROVAL' ? 'ERROR' : out.stop,
          out.message,
        );
      state.next = out.port ? this.edgeTarget(state.graph, node.id, out.port) : null;
      return this.drive(runId, state, trace, ctx);
    });
  }

  private async drive(runId: string, state: RunState, trace: TraceStep[], ctx: ToolContext) {
    const byId = new Map(state.graph.nodes.map((n) => [n.id, n]));
    try {
      while (state.next || state.loops.length) {
        if (!state.next) {
          // 반복 본문 끝 — 다음 항목으로, 다 돌았으면 '끝나면' 포트로
          const f = state.loops[state.loops.length - 1];
          f.index++;
          if (f.index < f.items.length && f.bodyStart) {
            state.vars[f.itemVar] = f.items[f.index];
            state.vars[`${f.itemVar}Index`] = f.index;
            state.next = f.bodyStart;
          } else {
            state.loops.pop();
            state.next = f.doneTarget;
          }
          continue;
        }
        const node = byId.get(state.next);
        if (!node) throw new Stop('ERROR', `노드 ${state.next}가 없습니다.`);
        state.steps++;
        const limit = Math.min(state.guards.maxSteps ?? HARD_MAX_STEPS, HARD_MAX_STEPS);
        if (state.steps > limit)
          throw new Stop('BLOCKED', `가드레일: 최대 실행 단계 ${limit}를 넘어 멈췄습니다.`);

        const started = Date.now();
        const frame = state.loops[state.loops.length - 1];
        let out: Outcome;
        try {
          out = await this.exec(node, state, ctx);
        } catch (e) {
          if (e instanceof Stop) {
            out = {
              stop: e.status,
              message: e.message,
              status: e.status === 'BLOCKED' ? 'blocked' : 'error',
            };
          } else {
            out = { stop: 'ERROR', message: describeClaudeError(e), status: 'error' };
          }
        }
        trace.push({
          seq: trace.length + 1,
          nodeId: node.id,
          nodeType: node.type,
          label: node.label,
          status: out.status ?? 'ok',
          port: 'port' in out ? (out.port ?? undefined) : undefined,
          input: this.clipForTrace(out.input, state),
          output: this.clipForTrace(out.output, state),
          message: out.message,
          iteration: frame ? frame.index : undefined,
          startedAt: new Date(started).toISOString(),
          durationMs: Date.now() - started,
          tokens: 'tokens' in out ? out.tokens : undefined,
        });
        if ('stop' in out) {
          if (out.stop === 'AWAITING_APPROVAL') {
            await this.prisma.agentRun.update({
              where: { id: runId },
              data: {
                status: 'AWAITING_APPROVAL',
                trace: trace as object,
                state: state as unknown as object,
              },
            });
            return this.view(runId);
          }
          return this.finish(runId, state, trace, out.stop, out.message);
        }
        state.next = out.port ? this.edgeTarget(state.graph, node.id, out.port) : null;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.finish(runId, state, trace, e instanceof Stop ? e.status : 'ERROR', msg);
    }
    return this.finish(runId, state, trace, 'DONE', null);
  }

  private async exec(node: AgentNode, state: RunState, ctx: ToolContext): Promise<Outcome> {
    const v = state.vars;
    switch (node.type) {
      case 'trigger': {
        const cfg = node.config as TriggerConfig;
        const input = (v.input ?? {}) as Record<string, unknown>;
        const missing = cfg.inputFields.filter(
          (f) => f.required && (input[f.name] === undefined || input[f.name] === ''),
        );
        if (missing.length)
          return {
            stop: 'ERROR',
            status: 'error',
            message: `필수 입력값이 없습니다: ${missing.map((f) => f.name).join(', ')}`,
            input,
          };
        return { port: 'out', output: input, message: `시작(${cfg.kind})` };
      }

      case 'guardrail': {
        const cfg = node.config as GuardrailConfig;
        const g = state.guards;
        const applied: string[] = [];
        for (const r of cfg.rules) {
          switch (r.kind) {
            case 'requireApproval':
              g.strictApproval = true;
              break;
            case 'allowTools':
              g.allowTools = r.list ?? [];
              break;
            case 'blockTools':
              g.blockTools = [...g.blockTools, ...(r.list ?? [])];
              break;
            case 'maxSteps':
              g.maxSteps = Number(r.value) || null;
              break;
            case 'maxLlmCalls':
              g.maxLlmCalls = Number(r.value) || null;
              break;
            case 'maxRecipients':
              g.maxRecipients = Number(r.value) || null;
              break;
            case 'recipientAllowlist':
              g.recipientAllowlist = r.list ?? [];
              break;
            case 'piiMask':
              g.piiMask = true;
              break;
            case 'timeWindow': {
              const kst = new Date(Date.now() + 9 * 3600_000);
              const hour = kst.getUTCHours();
              const day = kst.getUTCDay();
              const s = r.startHour ?? 0;
              const e = r.endHour ?? 24;
              const days = r.weekdays?.length ? r.weekdays : [0, 1, 2, 3, 4, 5, 6];
              if (!days.includes(day) || hour < s || hour >= e)
                throw new Stop(
                  'BLOCKED',
                  `가드레일: 실행 가능 시간(${s}~${e}시, 요일 ${days.join(',')})이 아닙니다.`,
                );
              break;
            }
          }
          applied.push(r.kind);
        }
        return {
          port: 'out',
          output: { applied },
          message: `가드레일 적용: ${applied.join(', ')}`,
        };
      }

      case 'llm': {
        const cfg = node.config as LlmConfig;
        const prompt = this.mask(String(renderTemplate(cfg.prompt, v)), state);
        const system = this.mask(String(renderTemplate(cfg.instructions, v)), state);
        if (state.mockLlm) {
          const fake =
            cfg.outputFormat === 'json'
              ? Object.fromEntries(
                  cfg.jsonFields.map((f) => [
                    f.name,
                    f.type === 'number' ? 0 : f.type === 'boolean' ? false : `(${f.name} 예시)`,
                  ]),
                )
              : `(AI 응답 예시 — 테스트에서 AI 호출을 건너뜀)`;
          v[cfg.outputVar] = fake;
          return {
            port: 'out',
            status: 'dry',
            input: { prompt },
            output: fake,
            message: 'AI 호출 건너뜀(모의 응답)',
          };
        }
        this.countLlm(state);
        const schema =
          cfg.outputFormat === 'json' && cfg.jsonFields.length
            ? {
                type: 'object',
                additionalProperties: false,
                required: cfg.jsonFields.map((f) => f.name),
                properties: Object.fromEntries(
                  cfg.jsonFields.map((f) => [f.name, { type: f.type, description: f.description }]),
                ),
              }
            : null;
        const res = await this.ask(cfg.model, cfg.effort, system, prompt, schema);
        let output: unknown = textOf(res);
        if (cfg.outputFormat === 'json') {
          try {
            output = JSON.parse(
              String(output)
                .replace(/^```(json)?|```$/g, '')
                .trim(),
            );
          } catch {
            return {
              stop: 'ERROR',
              status: 'error',
              message: 'AI 응답이 JSON이 아닙니다.',
              input: { prompt },
              output,
            };
          }
        }
        v[cfg.outputVar] = output;
        return {
          port: 'out',
          input: { prompt },
          output,
          message: `${res.model}`,
          tokens: { input: res.usage.input_tokens, output: res.usage.output_tokens },
        };
      }

      case 'tool': {
        const cfg = node.config as ToolConfig;
        const tool = this.blueprints.toolsFor(ctx.principal).find((t) => t.name === cfg.tool);
        if (!tool)
          return {
            stop: 'ERROR',
            status: 'error',
            message: `${cfg.tool}: 권한이 없거나 없는 도구입니다.`,
          };
        const g = state.guards;
        if (g.allowTools && !g.allowTools.includes(tool.name))
          throw new Stop('BLOCKED', `가드레일: '${tool.name}'은(는) 허용 도구 목록에 없습니다.`);
        if (g.blockTools.includes(tool.name))
          throw new Stop('BLOCKED', `가드레일: '${tool.name}'은(는) 차단된 도구입니다.`);
        const args: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(cfg.args)) {
          if (String(val).trim() === '') continue;
          const r = renderArg(String(val), v);
          if (r !== undefined && r !== '') args[k] = r;
        }
        this.checkRecipients(tool, args, state);

        if (tool.mode === 'WRITE') {
          if (state.dryRun) {
            let preview: unknown;
            if (tool.preview) {
              try {
                preview = await tool.preview(args, ctx);
              } catch (e) {
                preview = { error: e instanceof Error ? e.message : String(e) };
              }
            }
            const fake = {
              dryRun: true,
              wouldCall: tool.name,
              args,
              ...(preview ? { preview } : {}),
            };
            if (cfg.outputVar) v[cfg.outputVar] = fake;
            return {
              port: 'out',
              status: 'dry',
              input: args,
              output: preview ?? null,
              message: `시험 실행 — ${tool.summarize?.(args) ?? tool.name} 호출 예정(실제로 실행하지 않음)`,
            };
          }
          // 승인 노드를 지났으면 실행. 엄격 모드(requireApproval 가드레일)는 승인 한 번이 쓰기 한 번만 허락한다
          if (!state.approved) {
            state.pending = {
              kind: 'tool',
              nodeId: node.id,
              message: `${tool.summarize?.(args) ?? tool.name} — 실행할까요?`,
              args,
            };
            return {
              stop: 'AWAITING_APPROVAL',
              status: 'pending',
              input: args,
              message: `쓰기 도구 실행 전 승인 대기: ${state.pending.message}`,
            };
          }
        }
        return this.callTool(tool, args, ctx, state, node);
      }

      case 'branch': {
        const cfg = node.config as BranchConfig;
        if (cfg.mode === 'condition') {
          for (const c of cfg.cases) {
            if (evalExpr(c.expr, v))
              return { port: c.id, output: c.id, message: `'${c.label}' 조건 참: ${c.expr}` };
          }
          return { port: 'else', output: 'else', message: '모든 조건이 거짓 → 그 외' };
        }
        const input = this.mask(String(renderTemplate(cfg.input, v)), state);
        if (state.mockLlm) {
          const pick = cfg.cases[0]?.id ?? 'else';
          if (cfg.outputVar) v[cfg.outputVar] = pick;
          return {
            port: pick,
            status: 'dry',
            input: { input },
            output: pick,
            message: 'AI 분류 건너뜀(첫 갈래로 가정)',
          };
        }
        this.countLlm(state);
        const ids = [...cfg.cases.map((c) => c.id), 'else'];
        const system = [
          cfg.instructions,
          '다음 내용을 읽고 아래 갈래 중 하나를 고르세요. 어느 것에도 맞지 않으면 else.',
          ...cfg.cases.map(
            (c) => `- ${c.id}: ${c.label}${c.description ? ` — ${c.description}` : ''}`,
          ),
        ]
          .filter(Boolean)
          .join('\n');
        const res = await this.ask(cfg.model || AGENT_DEFAULT_MODEL, 'low', system, input, {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'reason'],
          properties: { label: { type: 'string', enum: ids }, reason: { type: 'string' } },
        });
        let parsed: { label?: string; reason?: string } = {};
        try {
          parsed = JSON.parse(textOf(res));
        } catch {
          // 아래에서 else로
        }
        const label = ids.includes(String(parsed.label)) ? String(parsed.label) : 'else';
        if (cfg.outputVar) v[cfg.outputVar] = label;
        return {
          port: label,
          input: { input },
          output: parsed,
          message: `AI 분류 → ${label}${parsed.reason ? ` (${parsed.reason})` : ''}`,
          tokens: { input: res.usage.input_tokens, output: res.usage.output_tokens },
        };
      }

      case 'loop': {
        const cfg = node.config as LoopConfig;
        const path = cfg.listVar.replace(/^\s*\{\{|\}\}\s*$/g, '').trim();
        const list = readPath(v, path);
        if (!Array.isArray(list))
          return { stop: 'ERROR', status: 'error', message: `'${path}'은(는) 목록이 아닙니다.` };
        const items = list.slice(0, Math.max(1, cfg.maxItems || 50));
        const bodyStart = this.edgeTarget(state.graph, node.id, 'body');
        const doneTarget = this.edgeTarget(state.graph, node.id, 'done');
        const note = list.length > items.length ? ` (한도 ${items.length}개까지만)` : '';
        if (!items.length || !bodyStart)
          return {
            port: 'done',
            output: { count: items.length },
            message: `항목 ${items.length}개${note}`,
          };
        state.loops.push({
          nodeId: node.id,
          itemVar: cfg.itemVar,
          items,
          index: 0,
          bodyStart,
          doneTarget,
        });
        v[cfg.itemVar] = items[0];
        v[`${cfg.itemVar}Index`] = 0;
        // 'body' 포트를 따라 본문 첫 노드로 들어간다. 본문 끝에서 drive가 다음 항목으로 되돌린다
        return {
          port: 'body',
          output: { count: items.length },
          message: `항목 ${items.length}개 반복 시작${note}`,
        };
      }

      case 'approval': {
        const cfg = node.config as ApprovalConfig;
        const message = String(renderTemplate(cfg.message, v));
        if (state.dryRun) {
          state.approved = true;
          return {
            port: 'approved',
            status: 'dry',
            output: { message },
            message: `승인 요청: "${message}" — 시험 실행이라 승인으로 가정`,
          };
        }
        state.pending = { kind: 'approval', nodeId: node.id, message };
        return {
          stop: 'AWAITING_APPROVAL',
          status: 'pending',
          output: { message },
          message: `승인 대기: ${message}`,
        };
      }

      case 'output': {
        const cfg = node.config as OutputConfig;
        // 시험 실행에서는 쓰기 도구 결과가 없어 빈 칸이 생긴다 — 빈 칸을 표시해 둔다
        const out = renderTemplate(cfg.template, v, state.dryRun ? '(시험 실행)' : '');
        state.output = out;
        v.output = out;
        return { port: null, output: out, message: '결과를 만들었습니다' };
      }
    }
  }

  private async callTool(
    tool: AiTool,
    args: Record<string, unknown>,
    ctx: ToolContext,
    state: RunState,
    node: AgentNode,
  ): Promise<Outcome> {
    const cfg = node.config as ToolConfig;
    if (tool.mode === 'WRITE' && state.guards.strictApproval) state.approved = false;
    try {
      // 파일을 만드는 도구는 결과 파일을 이 실행·노드에 붙인다
      const result = await tool.run(args, { ...ctx, toolUseId: node.id });
      if (cfg.outputVar) state.vars[cfg.outputVar] = result;
      return {
        port: 'out',
        input: args,
        output: result,
        message: tool.summarize?.(args) ?? tool.name,
      };
    } catch (e) {
      const msg = e instanceof ToolError || e instanceof Error ? e.message : String(e);
      if (!(e instanceof ToolError)) this.logger.warn(`${tool.name} 실패: ${msg}`);
      if (this.edgeTarget(state.graph, node.id, 'error')) {
        if (cfg.outputVar) state.vars[cfg.outputVar] = { error: msg };
        return {
          port: 'error',
          status: 'error',
          input: args,
          message: `실패 → 실패 포트로: ${msg}`,
        };
      }
      return { stop: 'ERROR', status: 'error', input: args, message: `${tool.name} 실패: ${msg}` };
    }
  }

  /** 문자 발송 가드레일 — 한 번 최대 수신자, 수신자 허용목록 */
  private checkRecipients(tool: AiTool, args: Record<string, unknown>, state: RunState) {
    const ids = Array.isArray(args.customerIds) ? args.customerIds.map(String) : null;
    if (!ids) return;
    const g = state.guards;
    if (g.maxRecipients && ids.length > g.maxRecipients)
      throw new Stop(
        'BLOCKED',
        `가드레일: ${tool.name} 수신자 ${ids.length}명이 한도 ${g.maxRecipients}명을 넘습니다.`,
      );
    if (g.recipientAllowlist) {
      const bad = ids.filter((id) => !g.recipientAllowlist!.includes(id));
      if (bad.length)
        throw new Stop('BLOCKED', `가드레일: 허용목록에 없는 수신자 ${bad.length}명이 있습니다.`);
    }
  }

  private countLlm(state: RunState) {
    state.llmCalls++;
    if (state.guards.maxLlmCalls && state.llmCalls > state.guards.maxLlmCalls)
      throw new Stop(
        'BLOCKED',
        `가드레일: 최대 AI 호출 ${state.guards.maxLlmCalls}번을 넘어 멈췄습니다.`,
      );
  }

  private async ask(
    model: string,
    effort: 'low' | 'medium' | 'high',
    system: string,
    prompt: string,
    schema: Record<string, unknown> | null,
  ) {
    const client = requireClaude(this.client);
    const res = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      ...(supportsFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      output_config: {
        effort,
        ...(schema ? { format: { type: 'json_schema' as const, schema } } : {}),
      },
      ...(system.trim() ? { system } : {}),
      messages: [{ role: 'user', content: prompt.trim() || '(내용 없음)' }],
    });
    assertComplete(res);
    return res;
  }

  /** 개인정보 마스킹 가드레일 — 전화번호·이메일을 가린다 */
  private mask(text: string, state: RunState): string {
    if (!state.guards.piiMask) return text;
    return maskPii(text);
  }

  private clipForTrace(v: unknown, state: RunState): unknown {
    if (v === undefined) return undefined;
    let s = JSON.stringify(v ?? null);
    if (state.guards.piiMask) s = maskPii(s);
    if (s.length <= MAX_TRACE_CHARS) return JSON.parse(s);
    return { truncated: true, preview: s.slice(0, MAX_TRACE_CHARS), length: s.length };
  }

  private edgeTarget(graph: AgentGraph, nodeId: string, port: string): string | null {
    return graph.edges.find((e) => e.source === nodeId && e.sourceHandle === port)?.target ?? null;
  }

  private async finish(
    runId: string,
    state: RunState,
    trace: TraceStep[],
    status: 'DONE' | 'ERROR' | 'BLOCKED' | 'REJECTED',
    error: string | null,
  ) {
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status,
        trace: trace as object,
        state: {
          vars: this.clipForTrace(state.vars, state),
          steps: state.steps,
          llmCalls: state.llmCalls,
        } as object,
        output: (state.output ?? undefined) as object | undefined,
        error,
      },
    });
    return this.view(runId);
  }

  /** 실행 기록은 실행한 사람(과 슈퍼관리자)만 보고 승인한다 */
  private ownsRun(r: { createdBy: string | null }, p: AuthPrincipal) {
    return p.permissions.includes(PERMISSION_WILDCARD) || r.createdBy === p.userId;
  }

  async view(runId: string, principal?: AuthPrincipal) {
    const r = await this.prisma.agentRun.findUnique({ where: { id: runId } });
    if (!r || (principal && !this.ownsRun(r, principal)))
      throw new NotFoundException('실행 기록을 찾을 수 없습니다.');
    const st = (r.state ?? {}) as Partial<RunState>;
    return {
      id: r.id,
      blueprintId: r.blueprintId,
      status: r.status,
      dryRun: r.dryRun,
      input: r.input,
      output: r.output,
      error: r.error,
      trace: r.trace,
      pending: r.status === 'AWAITING_APPROVAL' ? (st.pending ?? null) : null,
      files: await this.prisma.aiFile.findMany({
        where: { agentRunId: r.id },
        select: { id: true, toolUseId: true, name: true, mediaType: true, size: true },
        orderBy: { createdAt: 'asc' },
      }),
      createdAt: r.createdAt,
    };
  }

  private async exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.running.has(id)) throw new ConflictException('이 실행을 처리하는 중입니다.');
    this.running.add(id);
    try {
      return await fn();
    } finally {
      this.running.delete(id);
    }
  }
}

export function maskPii(s: string): string {
  return s
    .replace(
      /(01[016789])[-\s]?(\d{3,4})[-\s]?(\d{4})/g,
      (_, a: string, _b: string, c: string) => `${a}-****-${c}`,
    )
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2');
}
