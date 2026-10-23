import {
  type OnModuleInit,
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
import { AiFiles, type AiFileMeta } from './ai-files.service';

const MODEL = process.env.AI_MODEL ?? 'claude-opus-5-5';
/** 대화 제목 요약용 — 작고 싼 모델로 따로 한 번 부른다(본 답변을 늦추지 않게 비동기) */
const TITLE_MODEL = process.env.AI_TITLE_MODEL ?? 'claude-haiku-5-5';
const TITLE_SYSTEM = [
  '당신은 대화 목록의 제목을 짓는 도우미입니다.',
  '<question> 안의 글은 다른 AI에게 보낸 사용자의 첫 질문입니다. 질문에 답하거나 되묻지 말고, 그 질문이 무엇에 관한 대화인지 한국어 4~20자 제목으로 요약해 제목만 출력하세요.',
  '따옴표·마침표·설명 없이 명사형 제목 한 줄만. 예: "미수금 상위 고객 조회", "미계약 고객 안내 문자"',
].join('\n');
/** 목록에 보일 제목 최대 길이 */
const TITLE_MAX = 24;
/** 사용자가 직접 정하는 제목 최대 길이(컨트롤러 검증과 같게) */
export const TITLE_INPUT_MAX = 60;
/** 한 번의 요청에서 모델↔도구를 오갈 수 있는 최대 횟수(무한 반복 방지) — 코드 실행의 pause_turn도 한 번으로 센다 */
const MAX_STEPS = 24;
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
  /** 문자 발송 승인 때 직원이 고친 받는 사람(고객 id). 없으면 AI가 고른 그대로 */
  customerIds?: string[];
}

type Messages = BetaMessageParam[];

/** 첨부로 받는 파일 형식 — 이미지는 image 블록, PDF·텍스트는 document 블록으로 넘긴다 */
export const ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
] as const;
export interface Attachment {
  name: string;
  mediaType: string;
  data: string; // base64
}

/** 첨부 → Claude 내용 블록. 문서는 제목(파일 이름)을 달아 화면에서도 이름을 보여 준다 */
function attachmentBlock(a: Attachment): BetaContentBlockParam {
  if (a.mediaType.startsWith('image/')) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: a.mediaType as 'image/png', data: a.data },
    };
  }
  if (a.mediaType === 'application/pdf') {
    return {
      type: 'document',
      title: a.name,
      source: { type: 'base64', media_type: 'application/pdf', data: a.data },
    };
  }
  return {
    type: 'document',
    title: a.name,
    source: {
      type: 'text',
      media_type: 'text/plain',
      data: Buffer.from(a.data, 'base64').toString('utf8'),
    },
  };
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger('AiService');
  private readonly client: Anthropic | null;
  /** 같은 대화에서 루프가 겹쳐 돌지 않게(더블 클릭 등) */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ApiCatalog,
    private readonly domain: DomainTools,
    private readonly files: AiFiles,
  ) {
    const key = process.env.ANTHROPIC_API_KEY;
    // 워크스페이스에 묶이지 않은 키(sk-ant-usr-…)는 어느 워크스페이스로 쓸지 헤더로 알려야 한다
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    this.client = key
      ? new Anthropic({
          apiKey: key,
          ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
        })
      : null;
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

  /** 승인 카드의 받는 사람 더하기용 고객 검색 */
  findCustomers(q: string, principal: AuthPrincipal) {
    return this.domain.findCustomers(q, principal);
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

  /** 사용자가 제목을 직접 바꾼다 — 이후 자동 제목으로 덮어쓰지 않는다 */
  async rename(id: string, userId: string, title: string) {
    await this.load(id, userId);
    const t = title.replace(/\s+/g, ' ').trim().slice(0, TITLE_INPUT_MAX);
    if (!t) throw new BadRequestException('제목을 입력하세요.');
    return this.prisma.aiConversation.update({
      where: { id },
      data: { title: t, titleManual: true },
      select: { id: true, title: true, status: true, updatedAt: true },
    });
  }

  async remove(id: string, userId: string) {
    await this.load(id, userId);
    await this.prisma.aiConversation.delete({ where: { id } });
  }

  async view(id: string, userId: string) {
    const c = await this.load(id, userId);
    const [calls, files] = await Promise.all([
      this.prisma.aiToolCall.findMany({
        where: { conversationId: id },
        select: { toolUseId: true, status: true },
      }),
      this.files.list(id),
    ]);
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      lastError: c.lastError,
      updatedAt: c.updatedAt,
      items: toItems(
        c.messages as unknown as Messages,
        new Map(calls.map((x) => [x.toolUseId, x.status])),
        files,
      ),
      // 마지막 답이 제안한 이어서 할 일(1·2·3 버튼, 입력칸 미리보기) — 답이 끝난 상태에서만
      suggestions: c.status === 'IDLE' ? lastSuggestions(c.messages as unknown as Messages) : [],
      pending: (c.pending as unknown as PendingCall[] | null) ?? [],
    };
  }

  /**
   * 첫 질문을 작은 모델로 요약해 대화 제목으로 저장한다. 실패하면 앞부분 자른 제목을 그대로 둔다.
   * 그 사이 사용자가 제목을 직접 바꿨으면 덮어쓰지 않는다(titleManual 조건).
   */
  private async summarizeTitle(id: string, question: string, fallback: string) {
    if (!this.client) return;
    try {
      const res = await this.client.messages.create({
        model: TITLE_MODEL,
        max_tokens: 40,
        // 제목 한 줄이라 생각 없이 바로 답하게(Haiku 5.5는 기본이 생각 켜짐)
        thinking: { type: 'disabled' },
        system: TITLE_SYSTEM,
        messages: [
          { role: 'user', content: `<question>\n${question.slice(0, 2000)}\n</question>` },
        ],
      });
      const raw = res.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
      const title = cleanTitle(raw);
      if (!title || title === fallback) return;
      await this.prisma.aiConversation.updateMany({
        where: { id, titleManual: false },
        data: { title },
      });
    } catch (e) {
      this.logger.warn(`대화 ${id} 제목 요약 실패: ${describeError(e)}`);
    }
  }

  private async load(id: string, userId: string) {
    const c = await this.prisma.aiConversation.findUnique({ where: { id } });
    if (!c || c.userId !== userId) throw new NotFoundException('대화를 찾을 수 없습니다.');
    return c;
  }

  // ── 대화 진행 ──

  /** 사용자 메시지를 붙이고 루프를 돌린다. 승인 대기 중이면 대기 건은 거절로 처리한 뒤 이어 간다 */
  async send(id: string, text: string, ctx: ToolContext, attachments: Attachment[] = []) {
    if (!text.trim() && !attachments.length) {
      throw new BadRequestException('메시지나 첨부가 있어야 합니다.');
    }
    const client = this.requireClient();
    return this.background(id, ctx, async () => {
      const c = await this.load(id, ctx.principal.userId);
      const messages = c.messages as unknown as Messages;
      const pending = (c.pending as unknown as PendingCall[] | null) ?? [];
      // 첫 질문이면 제목을 만든다(사용자가 이미 정한 제목은 그대로)
      const firstQuestion = !c.titleManual && !messages.some((m) => m.role === 'user');
      const fallbackTitle = fallbackTitleOf(text, attachments);

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
      // 첨부는 질문보다 앞에 둔다(문서를 먼저 읽고 질문에 답하게)
      for (const a of attachments) blocks.push(attachmentBlock(a));
      blocks.push({
        type: 'text',
        text: `${contextBlock(ctx.principal)}\n\n${text.trim() || '첨부한 파일을 확인해 주세요.'}`,
      });
      appendUser(messages, blocks);

      await this.prisma.aiConversation.update({
        where: { id },
        data: {
          messages: messages as object,
          pending: null as never,
          status: 'RUNNING',
          // 요약 제목이 오기 전까지는 첫 질문 앞부분을 제목으로 둔다
          ...(firstQuestion ? { title: fallbackTitle } : {}),
        },
      });
      // 제목 요약은 기다리지 않는다 — 본 답변과 나란히 돌고, 끝나면 제목만 바꾼다
      if (firstQuestion && text.trim()) void this.summarizeTitle(id, text.trim(), fallbackTitle);
      return () => this.loop(client, id, messages, ctx);
    });
  }

  /** 승인 대기 중인 도구 호출을 승인·거절하고 루프를 이어 간다 */
  async decide(id: string, decisions: Decision[], ctx: ToolContext) {
    const client = this.requireClient();
    return this.background(id, ctx, async () => {
      const c = await this.load(id, ctx.principal.userId);
      const pending = (c.pending as unknown as PendingCall[] | null) ?? [];
      if (!pending.length) throw new BadRequestException('승인 대기 중인 작업이 없습니다.');
      const byId = new Map(decisions.map((d) => [d.toolUseId, d.approve]));
      const edits = new Map(
        decisions.filter((d) => d.customerIds).map((d) => [d.toolUseId, d.customerIds!]),
      );
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
        // 문자 받는 사람을 직원이 고쳐서 승인했으면 그 명단으로 보내고, AI에게도 고친 사실을 알린다
        const edited = p.name === 'send_sms' ? edits.get(p.toolUseId) : undefined;
        const call = edited ? { ...p, input: { ...p.input, customerIds: edited } } : p;
        const result = await this.execute(
          id,
          tools.get(p.name),
          call,
          ctx,
          p.mode === 'WRITE' ? ctx.principal.userId : null,
        );
        if (edited) {
          const before = Array.isArray(p.input.customerIds) ? p.input.customerIds.length : 0;
          result.content = `직원이 받는 사람을 고쳐서 승인했습니다(처음 ${before}명 → ${edited.length}명). 결과: ${String(result.content)}`;
        }
        results.push(result);
      }
      const messages = c.messages as unknown as Messages;
      appendUser(messages, results);
      await this.prisma.aiConversation.update({
        where: { id },
        data: { messages: messages as object, pending: null as never, status: 'RUNNING' },
      });
      return () => this.loop(client, id, messages, ctx);
    });
  }

  /** 오류로 멈춘 대화를 마지막 상태에서 다시 돌린다 */
  async retry(id: string, ctx: ToolContext) {
    const client = this.requireClient();
    return this.background(id, ctx, async () => {
      const c = await this.load(id, ctx.principal.userId);
      const messages = c.messages as unknown as Messages;
      if (c.status !== 'ERROR' || messages.at(-1)?.role !== 'user') {
        throw new BadRequestException('다시 시도할 수 있는 상태가 아닙니다.');
      }
      await this.prisma.aiConversation.update({
        where: { id },
        data: { status: 'RUNNING', lastError: null },
      });
      return () => this.loop(client, id, messages, ctx);
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
    // 코드 실행 컨테이너 — 같은 대화에서는 이어 써서 앞에서 만든 파일을 다시 쓸 수 있게
    let container =
      (
        await this.prisma.aiConversation.findUnique({
          where: { id },
          select: { containerId: true },
        })
      )?.containerId ?? null;
    const call = (containerId: string | null) =>
      client.beta.messages.create({
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
        ...(containerId ? { container: containerId } : {}),
      });

    for (let step = 0; step < MAX_STEPS; step++) {
      let res: Anthropic.Beta.Messages.BetaMessage;
      try {
        try {
          res = await call(container);
        } catch (e) {
          // 컨테이너가 만료(30일)·삭제되면 새 컨테이너로 한 번 다시 — 이전 파일은 DB에 이미 받아 두었다
          if (!container || !isContainerError(e)) throw e;
          this.logger.warn(`대화 ${id} 코드 실행 컨테이너 만료 — 새로 시작: ${describeError(e)}`);
          container = null;
          await this.prisma.aiConversation.update({ where: { id }, data: { containerId: null } });
          res = await call(null);
        }
      } catch (e) {
        await this.fail(id, messages, describeError(e));
        return;
      }

      messages.push({ role: 'assistant', content: res.content as BetaContentBlock[] as never });
      if (res.container?.id && res.container.id !== container) {
        container = res.container.id;
        await this.prisma.aiConversation.update({
          where: { id },
          data: { containerId: container },
        });
      }
      // 코드 실행이 $OUTPUT_DIR에 남긴 파일을 받아 대화에 붙인다(채팅 화면 다운로드 카드)
      if (this.client) await this.files.collectFromCodeExecution(this.client, id, res.content);

      if (res.stop_reason === 'refusal') {
        await this.save(id, messages, null, 'IDLE');
        return;
      }
      // 서버 도구(tool search·코드 실행)가 길어져 잠시 멈춘 것 — 그대로 다시 보내면 이어서 한다
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
      const out = await tool.run(call.input, {
        ...ctx,
        conversationId: id,
        toolUseId: call.toolUseId,
      });
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

  /**
   * 요청은 준비(메시지 붙이기·상태 RUNNING 저장)까지만 기다리고, 모델 루프는 서버에서 계속 돈다.
   * 그래서 화면을 떠나도(다른 메뉴로 이동·새로고침) 에이전트는 이어서 일하고, 화면은 상태를 다시 읽어 따라온다.
   * 긴 루프가 프록시 응답 시간 제한에 걸리지 않는 것도 이 때문이다.
   */
  private async background(
    id: string,
    ctx: ToolContext,
    prepare: () => Promise<() => Promise<void>>,
  ) {
    if (this.running.has(id)) throw new ConflictException('AI가 이 대화를 처리하는 중입니다.');
    this.running.add(id);
    let job: () => Promise<void>;
    try {
      job = await prepare();
    } catch (e) {
      this.running.delete(id);
      throw e;
    }
    void job()
      .catch(async (e) => {
        // loop 안에서 못 잡은 예외(도구 실행 중 DB 오류 등) — 대화를 오류 상태로 남겨 다시 시도할 수 있게
        this.logger.error(`대화 ${id} 백그라운드 실행 실패: ${describeError(e)}`);
        await this.prisma.aiConversation
          .update({ where: { id }, data: { status: 'ERROR', lastError: describeError(e) } })
          .catch(() => undefined);
      })
      .finally(() => this.running.delete(id));
    return this.view(id, ctx.principal.userId);
  }

  /** 이 서버에서 지금 돌고 있는 대화인가 — 재시작으로 끊긴 RUNNING과 구분 */
  isRunning(id: string) {
    return this.running.has(id);
  }

  /**
   * 서버가 다시 뜰 때 — 이전 프로세스에서 돌던 대화는 끊겼으므로 오류로 돌려
   * '다시 시도'로 이어 갈 수 있게 한다(영원히 진행 중으로 남지 않게).
   */
  async onModuleInit() {
    const { count } = await this.prisma.aiConversation.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'ERROR',
        lastError: '서버가 다시 시작되어 처리가 중단되었습니다. 다시 시도해 주세요.',
      },
    });
    if (count) this.logger.warn(`중단된 AI 대화 ${count}건을 오류 상태로 돌림`);
  }
}

// ── 헬퍼 ──

/** 요약 제목을 못 만들 때 — 첫 질문(없으면 첨부 이름) 앞부분 */
function fallbackTitleOf(text: string, attachments: Attachment[]) {
  const base = text.replace(/\s+/g, ' ').trim() || attachments[0]?.name || '첨부';
  return base.length > TITLE_MAX ? `${base.slice(0, TITLE_MAX - 1)}…` : base;
}

/** 모델이 준 제목 다듬기 — 첫 줄만, "제목:" 머리말·따옴표·끝 문장부호를 떼고 길이를 자른다 */
export function cleanTitle(raw: string): string {
  const line = raw.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const t = line
    .replace(/^\s*(제목|title)\s*[:：]\s*/i, '')
    .replace(/[*#`]/g, '')
    .replace(/["'“”‘’「」『』<>《》]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.,!?…。·:;~-]+$/u, '')
    .replace(/^[\s.,!?…。·:;~-]+/u, '')
    .trim();
  return t.slice(0, TITLE_MAX).trim();
}

function toApiTools(tools: AiTool[]): BetaToolUnion[] {
  return [
    // 도구가 많아(ERP API 전부) 처음엔 이름만 숨겨 두고, 모델이 키워드로 찾아 쓰게 한다
    // BM25 검색은 한글 낱말을 못 찾는다(실측: "미수금" → 0건) — 정규식 검색은 부분 일치라 한글도 찾는다
    { type: 'tool_search_tool_regex_20251119', name: 'tool_search_tool_regex' },
    // 코드 실행(Anthropic 샌드박스, ERP 접근 없음) — 계산·가공·차트·엑셀/PDF 등 도구에 없는 일을 직접 한다
    { type: 'code_execution_20260521', name: 'code_execution' },
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

/** 컨테이너 id가 만료·없음이라 생긴 오류인가(다른 400과 구분) */
function isContainerError(e: unknown) {
  return (
    (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) &&
    /container/i.test(e.message)
  );
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
  if (e instanceof Anthropic.APIError && /workspace/i.test(e.message)) {
    return '이 Claude API 키는 워크스페이스가 정해지지 않은 키입니다. 서버 ANTHROPIC_WORKSPACE_ID에 워크스페이스 ID를 넣거나, 워크스페이스용 키(sk-ant-api…)로 바꿔 주세요.';
  }
  if (e instanceof Anthropic.APIError) return `Claude API 오류 ${e.status ?? ''}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/** 화면 표시용으로 대화 원문을 정리 — 사용자 글·AI 답변·도구 실행 기록·만든 파일 */
type Item =
  | {
      kind: 'user';
      text: string;
      attachments?: { name: string; kind: 'image' | 'file'; src?: string }[];
    }
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
    }
  | {
      kind: 'code';
      toolUseId: string;
      /** bash(명령 실행) | file(파일 만들기·고치기·보기) */
      tool: 'bash' | 'file';
      /** 실행한 명령·코드 또는 파일 경로 */
      title: string;
      code: string;
      status: 'RUNNING' | 'DONE' | 'ERROR';
      output?: string;
    }
  | { kind: 'file'; id: string; name: string; mediaType: string; size: number };

const NEXT_RE = /<next>([\s\S]*?)<\/next>/i;

/** 답 끝의 <next> 제안 묶음을 화면 글에서 뺀다 */
function stripNext(text: string) {
  return text.replace(NEXT_RE, '').trimEnd();
}

/** 마지막 AI 답의 <next> 제안 → 요청문 목록(최대 3개) */
function lastSuggestions(messages: Messages): string[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant' || typeof last.content === 'string') return [];
  for (const b of [...last.content].reverse() as unknown as Array<Record<string, unknown>>) {
    if (b.type !== 'text') continue;
    const m = NEXT_RE.exec(String(b.text));
    if (!m) return [];
    return m[1]
      .split('\n')
      .map((l) => l.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  return [];
}

const CODE_TOOLS = new Set(['bash_code_execution', 'text_editor_code_execution', 'code_execution']);
const CODE_RESULTS = new Set([
  'bash_code_execution_tool_result',
  'text_editor_code_execution_tool_result',
  'code_execution_tool_result',
]);
const clipOut = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n)}\n…(생략)` : s);

/** 코드 실행 결과 블록 → 화면용 출력·성공 여부 */
function codeOutput(content: Record<string, unknown> | undefined): {
  output: string;
  ok: boolean;
} {
  if (!content) return { output: '', ok: true };
  const t = String(content.type ?? '');
  if (t.endsWith('_error'))
    return { output: `오류: ${String(content.error_code ?? t)}`, ok: false };
  if ('return_code' in content) {
    const out = [String(content.stdout ?? ''), String(content.stderr ?? '')]
      .filter((x) => x.trim())
      .join('\n');
    return { output: out, ok: Number(content.return_code) === 0 };
  }
  // 파일 편집기 결과(view·create·str_replace)
  if (typeof content.content === 'string') return { output: content.content, ok: true };
  if (Array.isArray(content.lines)) return { output: content.lines.join('\n'), ok: true };
  if ('is_file_update' in content) {
    return {
      output: content.is_file_update ? '파일을 고쳤습니다.' : '파일을 만들었습니다.',
      ok: true,
    };
  }
  return { output: '', ok: true };
}

function toItems(
  messages: Messages,
  callStatus: Map<string, string>,
  files: AiFileMeta[] = [],
): Item[] {
  const items: Item[] = [];
  const tools = new Map<string, Extract<Item, { kind: 'tool' }>>();
  const codes = new Map<string, Extract<Item, { kind: 'code' }>>();
  const filesByCall = new Map<string, AiFileMeta[]>();
  for (const f of files) filesByCall.set(f.toolUseId, [...(filesByCall.get(f.toolUseId) ?? []), f]);
  // 한 턴에서 만든 파일은 그 턴의 답 아래에 카드로 모아 보인다
  let turnFiles: AiFileMeta[] = [];
  const flushFiles = () => {
    for (const f of turnFiles) items.push({ kind: 'file', ...pickFile(f) });
    turnFiles = [];
  };
  const takeFiles = (toolUseId: string) => {
    const fs = filesByCall.get(toolUseId);
    if (fs) {
      turnFiles.push(...fs);
      filesByCall.delete(toolUseId);
    }
  };
  let pendingFiles: NonNullable<Extract<Item, { kind: 'user' }>['attachments']> = [];
  for (const m of messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    for (const b of blocks as Array<Record<string, unknown>>) {
      if (m.role === 'user' && b.type === 'text') {
        flushFiles();
        // 매 메시지 앞에 붙인 <context>는 화면에서 숨긴다
        const text = String(b.text).replace(/^<context>[\s\S]*?<\/context>\s*/, '');
        items.push({
          kind: 'user',
          text,
          ...(pendingFiles.length ? { attachments: pendingFiles } : {}),
        });
        pendingFiles = [];
      } else if (m.role === 'user' && (b.type === 'image' || b.type === 'document')) {
        flushFiles();
        // 첨부 — 다음 글과 한 말풍선으로 묶는다
        const src = b.source as { type: string; media_type?: string; data?: string };
        pendingFiles.push(
          b.type === 'image'
            ? {
                name: '이미지',
                kind: 'image',
                src:
                  src.type === 'base64' ? `data:${src.media_type};base64,${src.data}` : undefined,
              }
            : { name: String(b.title ?? '문서'), kind: 'file' },
        );
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
        takeFiles(String(b.tool_use_id));
      } else if (m.role === 'assistant' && b.type === 'text' && String(b.text).trim()) {
        items.push({ kind: 'assistant', text: stripNext(String(b.text)) });
      } else if (
        m.role === 'assistant' &&
        b.type === 'server_tool_use' &&
        CODE_TOOLS.has(String(b.name))
      ) {
        // 코드 실행 — bash는 command, 파일 편집기는 path(+file_text), 예전 파이썬 도구는 code
        const input = (b.input ?? {}) as Record<string, unknown>;
        const bash = b.name !== 'text_editor_code_execution';
        const code = String(
          input.command && bash ? input.command : (input.file_text ?? input.code ?? ''),
        );
        const c: Extract<Item, { kind: 'code' }> = {
          kind: 'code',
          toolUseId: String(b.id),
          tool: bash ? 'bash' : 'file',
          title: bash
            ? (code.split('\n')[0] ?? '').slice(0, 120)
            : `${String(input.command ?? '')} ${String(input.path ?? '')}`.trim(),
          code: clipOut(code, 8000),
          status: 'RUNNING',
        };
        codes.set(c.toolUseId, c);
        items.push(c);
      } else if (m.role === 'assistant' && CODE_RESULTS.has(String(b.type))) {
        const c = codes.get(String(b.tool_use_id));
        if (c) {
          const { output, ok } = codeOutput(b.content as Record<string, unknown> | undefined);
          c.output = clipOut(output);
          c.status = ok ? 'DONE' : 'ERROR';
        }
        takeFiles(String(b.tool_use_id));
      } else if (m.role === 'assistant' && b.type === 'server_tool_use') {
        // bm25는 query, 정규식 검색은 pattern
        const input = (b.input ?? {}) as { query?: string; pattern?: string };
        items.push({ kind: 'search', query: input.pattern ?? input.query ?? '' });
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
  flushFiles();
  // 원문에서 짝을 못 찾은 파일(만약을 위해)도 맨 끝에 보인다
  for (const fs of filesByCall.values())
    for (const f of fs) items.push({ kind: 'file', ...pickFile(f) });
  return items;
}

function pickFile(f: AiFileMeta) {
  return { id: f.id, name: f.name, mediaType: f.mediaType, size: f.size };
}
