import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ApiCatalog } from './api-catalog';
import { DomainTools } from './domain-tools';
import { SYSTEM_PROMPT, contextBlock } from './prompt';
import { ToolError, type AiTool, type ToolContext } from './ai-tool.types';

const MODEL = process.env.AI_MODEL ?? 'claude-opus-5-5';
/** 한 번의 요청에서 모델↔도구를 오갈 수 있는 최대 횟수(무한 반복 방지) */
const MAX_STEPS = 16;
/** 도구 결과가 이보다 길면 잘라서 모델에 넘긴다 — 조건을 좁혀 다시 조회하게 한다 */
const MAX_RESULT_CHARS = 30_000;
const BETAS = [
  // 안전 분류기가 요청을 거절하면 같은 요청을 권장 대체 모델로 서버에서 다시 돌린다
  'server-side-fallback-2026-07-01',
  // 도구 구성이 바뀌어(권한 변경·API 추가) 이전 thinking 블록이 무효가 되면 오류 대신 그 블록만 버린다
  'thinking-binding-controls-2026-08-01',
];

interface PendingCall {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  mode: 'READ' | 'WRITE';
  summary: string;
  preview?: unknown;
}

export interface Decision {
  toolUseId: string;
  approve: boolean;
}

type Messages = BetaMessageParam[];

@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService');
  private readonly client: Anthropic | null;
  /** 같은 대화에서 루프가 겹쳐 돌지 않게(더블 클릭 등) */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ApiCatalog,
    private readonly domain: DomainTools,
  ) {
    const key = process.env.ANTHROPIC_API_KEY;
    this.client = key ? new Anthropic({ apiKey: key }) : null;
  }

  status() {
    return { configured: !!this.client, model: MODEL };
  }

  /** 사용자 권한으로 쓸 수 있는 도구만. 업무 도구가 같은 이름의 API 도구보다 우선 */
  toolsFor(principal: AuthPrincipal): AiTool[] {
    const can = (perms: string[]) =>
      principal.permissions.includes(PERMISSION_WILDCARD) ||
      perms.every((p) => principal.permissions.includes(p));
    const byName = new Map<string, AiTool>();
    for (const t of [...this.domain.list(), ...this.catalog.list()]) {
      if (!byName.has(t.name) && can(t.permissions)) byName.set(t.name, t);
    }
    return [...byName.values()];
  }

  /** 도구 목록(화면의 "AI가 할 수 있는 일" 안내용) */
  catalogFor(principal: AuthPrincipal) {
    return this.toolsFor(principal).map((t) => ({
      name: t.name,
      description: t.description,
      mode: t.mode,
      deferred: t.deferred,
    }));
  }

  // ── 대화 CRUD ──

  list(userId: string) {
    return this.prisma.aiConversation.findMany({
      where: { userId },
      select: { id: true, title: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async create(userId: string) {
    const c = await this.prisma.aiConversation.create({ data: { userId } });
    return this.view(c.id, userId);
  }

  async remove(id: string, userId: string) {
    await this.load(id, userId);
    await this.prisma.aiConversation.delete({ where: { id } });
  }

  async view(id: string, userId: string) {
    const c = await this.load(id, userId);
    const calls = await this.prisma.aiToolCall.findMany({
      where: { conversationId: id },
      select: { toolUseId: true, status: true },
    });
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      lastError: c.lastError,
      updatedAt: c.updatedAt,
      items: toItems(
        c.messages as unknown as Messages,
        new Map(calls.map((x) => [x.toolUseId, x.status])),
      ),
      pending: (c.pending as unknown as PendingCall[] | null) ?? [],
    };
  }

  private async load(id: string, userId: string) {
    const c = await this.prisma.aiConversation.findUnique({ where: { id } });
    if (!c || c.userId !== userId) throw new NotFoundException('대화를 찾을 수 없습니다.');
    return c;
  }

  // ── 대화 진행 ──

  /** 사용자 메시지를 붙이고 루프를 돌린다. 승인 대기 중이면 대기 건은 거절로 처리한 뒤 이어 간다 */
  async send(id: string, text: string, ctx: ToolContext) {
    const client = this.requireClient();
    return this.exclusive(id, async () => {
      const c = await this.load(id, ctx.principal.userId);
      const messages = c.messages as unknown as Messages;
      const pending = (c.pending as unknown as PendingCall[] | null) ?? [];

      const blocks: BetaContentBlockParam[] = [];
      if (pending.length) {
        for (const p of pending) {
          blocks.push(
            toolResult(
              p.toolUseId,
              '직원이 승인하지 않고 새 요청을 보냈습니다. 이 작업은 실행되지 않았습니다.',
              true,
            ),
          );
          await this.logCall(id, p, 'REJECTED', null, null);
        }
      }
      blocks.push({ type: 'text', text: `${contextBlock(ctx.principal)}\n\n${text}` });
      appendUser(messages, blocks);

      await this.prisma.aiConversation.update({
        where: { id },
        data: {
          messages: messages as object,
          pending: null as never,
          status: 'RUNNING',
          ...(c.title === '새 대화' ? { title: text.slice(0, 40) } : {}),
        },
      });
      await this.loop(client, id, messages, ctx);
      return this.view(id, ctx.principal.userId);
    });
  }

  /** 승인 대기 중인 도구 호출을 승인·거절하고 루프를 이어 간다 */
  async decide(id: string, decisions: Decision[], ctx: ToolContext) {
    const client = this.requireClient();
    return this.exclusive(id, async () => {
      const c = await this.load(id, ctx.principal.userId);
      const pending = (c.pending as unknown as PendingCall[] | null) ?? [];
      if (!pending.length) throw new BadRequestException('승인 대기 중인 작업이 없습니다.');
      const byId = new Map(decisions.map((d) => [d.toolUseId, d.approve]));
      const tools = new Map(this.toolsFor(ctx.principal).map((t) => [t.name, t]));

      const results: BetaToolResultBlockParam[] = [];
      for (const p of pending) {
        // 읽기 도구는 같은 묶음에 쓰기 도구가 있어서 함께 멈췄던 것 — 결정과 상관없이 실행
        const approved = p.mode === 'READ' || byId.get(p.toolUseId) === true;
        if (!approved) {
          results.push(
            toolResult(p.toolUseId, '직원이 이 작업을 거절했습니다. 실행되지 않았습니다.', true),
          );
          await this.logCall(id, p, 'REJECTED', null, null);
          continue;
        }
        results.push(
          await this.execute(
            id,
            tools.get(p.name),
            p,
            ctx,
            p.mode === 'WRITE' ? ctx.principal.userId : null,
          ),
        );
      }
      const messages = c.messages as unknown as Messages;
      appendUser(messages, results);
      await this.prisma.aiConversation.update({
        where: { id },
        data: { messages: messages as object, pending: null as never, status: 'RUNNING' },
      });
      await this.loop(client, id, messages, ctx);
      return this.view(id, ctx.principal.userId);
    });
  }

  /** 오류로 멈춘 대화를 마지막 상태에서 다시 돌린다 */
  async retry(id: string, ctx: ToolContext) {
    const client = this.requireClient();
    return this.exclusive(id, async () => {
      const c = await this.load(id, ctx.principal.userId);
      const messages = c.messages as unknown as Messages;
      if (c.status !== 'ERROR' || messages.at(-1)?.role !== 'user') {
        throw new BadRequestException('다시 시도할 수 있는 상태가 아닙니다.');
      }
      await this.loop(client, id, messages, ctx);
      return this.view(id, ctx.principal.userId);
    });
  }

  /**
   * 모델 호출 → 도구 실행 → 결과 전달을 반복한다.
   * 쓰기 도구가 나오면 그 묶음 전체를 승인 대기로 저장하고 멈춘다(다음 요청에서 decide로 이어 감).
   * 대화 원문은 받은 그대로 이어 붙이기만 한다 — 중간을 고치면 thinking 블록 검증에 걸린다.
   */
  private async loop(client: Anthropic, id: string, messages: Messages, ctx: ToolContext) {
    const tools = this.toolsFor(ctx.principal);
    const byName = new Map(tools.map((t) => [t.name, t]));
    const apiTools = toApiTools(tools);

    for (let step = 0; step < MAX_STEPS; step++) {
      let res: Anthropic.Beta.Messages.BetaMessage;
      try {
        res = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: BETAS,
          fallbacks: 'default',
          // 생각은 항상 켜져 있다(Opus 5.5). 도구 구성이 바뀐 대화도 오류 없이 이어지도록 drop_block
          thinking: {
            type: 'adaptive',
            block_binding: { prefix_mismatch_behavior: 'drop_block' },
          } as never,
          output_config: { effort: 'medium' },
          // 대화가 길어져도 앞부분(도구 정의·시스템·이전 턴)은 캐시에서 읽는다
          cache_control: { type: 'ephemeral' },
          system: SYSTEM_PROMPT,
          tools: apiTools,
          messages,
        });
      } catch (e) {
        await this.fail(id, messages, describeError(e));
        return;
      }

      messages.push({ role: 'assistant', content: res.content as BetaContentBlock[] as never });

      if (res.stop_reason === 'refusal') {
        await this.save(id, messages, null, 'IDLE');
        return;
      }
      // 서버 도구(tool search)가 길어져 잠시 멈춘 것 — 그대로 다시 보내면 이어서 한다
      if (res.stop_reason === 'pause_turn') {
        await this.save(id, messages, null, 'RUNNING');
        continue;
      }
      if (res.stop_reason !== 'tool_use') {
        await this.save(id, messages, null, 'IDLE');
        return;
      }

      const uses = res.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use',
      );
      const calls: PendingCall[] = [];
      for (const u of uses) {
        const tool = byName.get(u.name);
        const input = (u.input ?? {}) as Record<string, unknown>;
        calls.push({
          toolUseId: u.id,
          name: u.name,
          input,
          mode: tool?.mode ?? 'READ',
          summary: tool?.summarize?.(input) ?? u.name,
        });
      }

      if (calls.some((c) => c.mode === 'WRITE')) {
        // 승인 화면용 미리보기(받는 사람 목록 등)는 실행 없이 계산만
        for (const c of calls) {
          const tool = byName.get(c.name);
          if (c.mode === 'WRITE' && tool?.preview) {
            try {
              c.preview = await tool.preview(c.input, ctx);
            } catch (e) {
              c.preview = { error: e instanceof Error ? e.message : String(e) };
            }
          }
        }
        await this.save(id, messages, calls, 'AWAITING_APPROVAL');
        return;
      }

      const results: BetaToolResultBlockParam[] = [];
      for (const c of calls) results.push(await this.execute(id, byName.get(c.name), c, ctx, null));
      appendUser(messages, results);
      await this.save(id, messages, null, 'RUNNING');
    }
    await this.fail(
      id,
      messages,
      `도구 호출이 ${MAX_STEPS}번을 넘어 멈췄습니다. 요청을 나눠서 다시 시켜 주세요.`,
    );
  }

  private async execute(
    id: string,
    tool: AiTool | undefined,
    call: PendingCall,
    ctx: ToolContext,
    approvedBy: string | null,
  ): Promise<BetaToolResultBlockParam> {
    if (!tool) {
      await this.logCall(id, call, 'ERROR', { error: 'unknown tool' }, approvedBy);
      return toolResult(
        call.toolUseId,
        `${call.name}: 이 사용자에게 없는 도구입니다(권한 없음 또는 이름 오류).`,
        true,
      );
    }
    try {
      const out = await tool.run(call.input, ctx);
      const text = clip(JSON.stringify(out ?? null));
      await this.logCall(id, call, 'DONE', clipJson(out), approvedBy);
      return toolResult(call.toolUseId, text, false);
    } catch (e) {
      const msg = e instanceof ToolError || e instanceof Error ? e.message : String(e);
      if (!(e instanceof ToolError)) this.logger.warn(`${call.name} 실패: ${msg}`);
      await this.logCall(id, call, 'ERROR', { error: msg }, approvedBy);
      return toolResult(call.toolUseId, msg, true);
    }
  }

  private logCall(
    conversationId: string,
    call: PendingCall,
    status: 'DONE' | 'ERROR' | 'REJECTED',
    result: unknown,
    approvedBy: string | null,
  ) {
    return this.prisma.aiToolCall.create({
      data: {
        conversationId,
        toolUseId: call.toolUseId,
        toolName: call.name,
        mode: call.mode,
        input: call.input as object,
        status,
        result: (result ?? undefined) as object | undefined,
        approvedBy,
      },
    });
  }

  private save(id: string, messages: Messages, pending: PendingCall[] | null, status: string) {
    return this.prisma.aiConversation.update({
      where: { id },
      data: {
        messages: messages as object,
        pending: (pending ?? null) as never,
        status,
        lastError: null,
      },
    });
  }

  private async fail(id: string, messages: Messages, error: string) {
    this.logger.warn(`대화 ${id} 오류: ${error}`);
    await this.prisma.aiConversation.update({
      where: { id },
      data: { messages: messages as object, status: 'ERROR', lastError: error },
    });
  }

  private requireClient(): Anthropic {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI 비서가 아직 설정되지 않았습니다. 서버 환경변수 ANTHROPIC_API_KEY를 넣고 API를 다시 시작하세요.',
      );
    }
    return this.client;
  }

  private async exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.running.has(id)) throw new ConflictException('AI가 이 대화를 처리하는 중입니다.');
    this.running.add(id);
    try {
      return await fn();
    } finally {
      this.running.delete(id);
    }
  }
}

// ── 헬퍼 ──

function toApiTools(tools: AiTool[]): BetaToolUnion[] {
  return [
    // 도구가 많아(ERP API 전부) 처음엔 이름만 숨겨 두고, 모델이 키워드로 찾아 쓰게 한다
    { type: 'tool_search_tool_bm25_20251119', name: 'tool_search_tool_bm25' },
    ...tools.map(
      (t) =>
        ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
          ...(t.deferred ? { defer_loading: true } : {}),
        }) as BetaToolUnion,
    ),
  ];
}

function toolResult(
  toolUseId: string,
  content: string,
  isError: boolean,
): BetaToolResultBlockParam {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    ...(isError ? { is_error: true } : {}),
  };
}

/** 마지막 메시지가 user면 거기에 이어 붙인다(오류 후 재요청 등) — user가 연달아 두 번 오지 않게 */
function appendUser(messages: Messages, blocks: BetaContentBlockParam[]) {
  const last = messages.at(-1);
  if (last?.role === 'user') {
    const content =
      typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
    last.content = [...(content as never[]), ...(blocks as never[])];
  } else {
    messages.push({ role: 'user', content: blocks as never });
  }
}

function clip(s: string) {
  return s.length <= MAX_RESULT_CHARS
    ? s
    : `${s.slice(0, MAX_RESULT_CHARS)}\n…(결과가 길어 앞부분만 보냄 — 조건을 좁혀 다시 조회하세요. 전체 ${s.length}자)`;
}

function clipJson(v: unknown): unknown {
  const s = JSON.stringify(v ?? null);
  return s.length <= 8000 ? v : { truncated: true, preview: s.slice(0, 8000) };
}

function describeError(e: unknown): string {
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

/** 화면 표시용으로 대화 원문을 정리 — 사용자 글·AI 답변·도구 실행 기록 */
type Item =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'search'; query: string }
  | {
      kind: 'tool';
      toolUseId: string;
      name: string;
      input: unknown;
      status: string;
      result?: string;
      isError?: boolean;
    };

function toItems(messages: Messages, callStatus: Map<string, string>): Item[] {
  const items: Item[] = [];
  const tools = new Map<string, Extract<Item, { kind: 'tool' }>>();
  for (const m of messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    for (const b of blocks as Array<Record<string, unknown>>) {
      if (m.role === 'user' && b.type === 'text') {
        // 매 메시지 앞에 붙인 <context>는 화면에서 숨긴다
        const text = String(b.text).replace(/^<context>[\s\S]*?<\/context>\s*/, '');
        items.push({ kind: 'user', text });
      } else if (m.role === 'user' && b.type === 'tool_result') {
        const t = tools.get(String(b.tool_use_id));
        if (t) {
          const content = b.content;
          t.result =
            typeof content === 'string'
              ? content.slice(0, 2000)
              : JSON.stringify(content).slice(0, 2000);
          t.isError = b.is_error === true;
          t.status = callStatus.get(t.toolUseId) ?? (t.isError ? 'ERROR' : 'DONE');
        }
      } else if (m.role === 'assistant' && b.type === 'text' && String(b.text).trim()) {
        items.push({ kind: 'assistant', text: String(b.text) });
      } else if (m.role === 'assistant' && b.type === 'server_tool_use') {
        const input = (b.input ?? {}) as { query?: string };
        items.push({ kind: 'search', query: input.query ?? '' });
      } else if (m.role === 'assistant' && b.type === 'tool_use') {
        const t: Extract<Item, { kind: 'tool' }> = {
          kind: 'tool',
          toolUseId: String(b.id),
          name: String(b.name),
          input: b.input,
          status: 'PENDING',
        };
        tools.set(t.toolUseId, t);
        items.push(t);
      }
    }
  }
  return items;
}
