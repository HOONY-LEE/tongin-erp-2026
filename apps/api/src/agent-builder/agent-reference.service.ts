import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { AGENT_DEFAULT_MODEL, PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiFiles } from '../ai/ai-files.service';
import { ToolError, type AiTool } from '../ai/ai-tool.types';
import { MEDIA_TYPES, safeFileName } from '../ai/report-file';
import {
  FALLBACK_BETA,
  assertComplete,
  createClaude,
  describeClaudeError,
  requireClaude,
  textOf,
} from './agent-claude';
import {
  FILL_SPEC_SCHEMA,
  analyzeTemplate,
  describeTemplate,
  fillTemplate,
  kindOf,
  type FillSpec,
  type TemplateKind,
  type TemplateStructure,
} from './agent-template';

/** 참고 양식 하나 최대 크기 */
const MAX_BYTES = 10 * 1024 * 1024;
/** 양식을 채울 때 AI에게 넘기는 데이터 최대 글자 수 */
const MAX_DATA_CHARS = 120_000;

export interface ReferenceMeta {
  id: string;
  name: string;
  size: number;
  kind: TemplateKind;
  /** AI에게 보여 주는 양식 설명 */
  summary: string;
}

/**
 * 에이전트 참고 양식 — 만들 때 올린 실제 양식(예: 주간 보고 엑셀)을 보관하고,
 * 에이전트가 실행될 때 그 양식 그대로 파일을 만들어 주는 도구(create_file_from_template)를 제공한다.
 */
@Injectable()
export class AgentReferenceService {
  private readonly logger = new Logger('AgentReference');
  private readonly client: Anthropic | null = createClaude();

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: AiFiles,
  ) {}

  async upload(
    input: { name: string; mediaType: string; dataBase64: string },
    principal: AuthPrincipal,
  ): Promise<ReferenceMeta> {
    const kind = kindOf(input.name, input.mediaType);
    if (!kind) {
      throw new BadRequestException(
        '참고 양식은 엑셀(.xlsx)이나 CSV 파일로 올려 주세요. (.xls는 엑셀에서 .xlsx로 저장해 주세요)',
      );
    }
    const bytes = Buffer.from(input.dataBase64, 'base64');
    if (!bytes.length) throw new BadRequestException('빈 파일입니다.');
    if (bytes.length > MAX_BYTES)
      throw new BadRequestException('파일은 10MB까지 올릴 수 있습니다.');
    let structure: TemplateStructure;
    try {
      structure = await analyzeTemplate(kind, bytes);
    } catch (e) {
      throw new BadRequestException(
        `양식을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const f = await this.prisma.agentReferenceFile.create({
      data: {
        name: input.name.slice(0, 200),
        mediaType: kind === 'xlsx' ? MEDIA_TYPES.xlsx : MEDIA_TYPES.csv,
        size: bytes.length,
        bytes: new Uint8Array(bytes),
        structure: structure as object,
        createdBy: principal.userId,
      },
      select: { id: true, name: true, size: true },
    });
    return { ...f, kind, summary: describeTemplate(f.name, structure) };
  }

  /** 볼 수 있는 양식만 — 올린 사람, 또는 그 양식이 붙은 에이전트를 실행 중일 때 */
  private async load(id: string, principal: AuthPrincipal, blueprintId?: string) {
    const f = await this.prisma.agentReferenceFile.findUnique({ where: { id } });
    const ok =
      !!f &&
      (principal.permissions.includes(PERMISSION_WILDCARD) ||
        f.createdBy === principal.userId ||
        (!!blueprintId && f.blueprintId === blueprintId));
    if (!f || !ok) throw new NotFoundException('참고 양식을 찾을 수 없습니다.');
    return f;
  }

  async describe(ids: string[], principal: AuthPrincipal): Promise<ReferenceMeta[]> {
    const out: ReferenceMeta[] = [];
    for (const id of ids) {
      const f = await this.load(id, principal);
      const st = f.structure as unknown as TemplateStructure;
      out.push({
        id: f.id,
        name: f.name,
        size: f.size,
        kind: st.kind,
        summary: describeTemplate(f.name, st),
      });
    }
    return out;
  }

  /** 블루프린트의 참고 양식 목록(편집 화면) */
  async listFor(blueprintId: string): Promise<ReferenceMeta[]> {
    const rows = await this.prisma.agentReferenceFile.findMany({
      where: { blueprintId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((f) => {
      const st = f.structure as unknown as TemplateStructure;
      return {
        id: f.id,
        name: f.name,
        size: f.size,
        kind: st.kind,
        summary: describeTemplate(f.name, st),
      };
    });
  }

  /** 대화로 만들 때 올린 양식을 만든 블루프린트에 붙인다(내가 올린 것만) */
  async attach(ids: string[], blueprintId: string, principal: AuthPrincipal) {
    if (!ids.length) return;
    await this.prisma.agentReferenceFile.updateMany({
      where: { id: { in: ids }, createdBy: principal.userId },
      data: { blueprintId },
    });
  }

  /** 블루프린트 복제 — 양식을 새 블루프린트로 복사하고 (옛 id → 새 id)를 돌려준다 */
  async copyAll(fromBlueprintId: string, toBlueprintId: string, principal: AuthPrincipal) {
    const rows = await this.prisma.agentReferenceFile.findMany({
      where: { blueprintId: fromBlueprintId },
    });
    const map = new Map<string, string>();
    for (const f of rows) {
      const c = await this.prisma.agentReferenceFile.create({
        data: {
          blueprintId: toBlueprintId,
          name: f.name,
          mediaType: f.mediaType,
          size: f.size,
          bytes: f.bytes,
          structure: f.structure as object,
          createdBy: principal.userId,
        },
        select: { id: true },
      });
      map.set(f.id, c.id);
    }
    return map;
  }

  async download(id: string, principal: AuthPrincipal) {
    const f = await this.load(id, principal);
    return { name: f.name, mediaType: f.mediaType, bytes: Buffer.from(f.bytes) };
  }

  /** 에이전트 노드에서 부르는 도구 — 참고 양식 그대로 파일 만들기 */
  tool(): AiTool {
    return {
      name: 'create_file_from_template',
      group: '파일 만들기',
      description:
        '에이전트에 올려 둔 참고 양식(엑셀·CSV) 그대로 파일을 만든다 — 양식의 서식·병합·수식은 유지하고, 앞 단계에서 모은 데이터로 ' +
        '제목·기간·작성자 같은 칸과 표의 행을 채운다. 표가 양식의 빈 행보다 길면 같은 서식으로 행을 늘린다. ' +
        'ERP 데이터는 바꾸지 않는다(만든 파일은 실행 결과에서 내려받는다).',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: '참고 양식 id' },
          data: { description: '채울 데이터 — 앞 노드 결과({{변수}}) 그대로' },
          instructions: {
            type: 'string',
            description:
              '어느 칸에 무엇을 넣을지(예: "기간 칸에 지난주 월~일, 표에는 지점별 접수·계약 건수")',
          },
          fileName: { type: 'string', description: '파일 이름(선택, 비우면 AI가 정함)' },
        },
        required: ['templateId', 'data'],
      },
      mode: 'READ',
      permissions: [],
      deferred: false,
      summarize: (i) => `양식으로 파일 만들기${i.fileName ? ` — ${String(i.fileName)}` : ''}`,
      run: async (input, ctx) => {
        if (!ctx.agentRunId && !ctx.conversationId)
          throw new ToolError('파일을 붙일 실행 정보가 없습니다.');
        let tpl;
        try {
          tpl = await this.load(String(input.templateId ?? ''), ctx.principal, ctx.blueprintId);
        } catch {
          throw new ToolError(
            '참고 양식을 찾을 수 없습니다. 편집 화면에서 양식을 다시 골라 주세요.',
          );
        }
        const st = tpl.structure as unknown as TemplateStructure;
        const spec = await this.plan(tpl.name, st, input);
        const bytes = await fillTemplate(st.kind, Buffer.from(tpl.bytes), spec);
        const ext = st.kind;
        const name = safeFileName(
          (String(input.fileName ?? '').trim() || spec.fileName || tpl.name).replace(
            /\.(xlsx|xls|csv)$/i,
            '',
          ),
          ext,
        );
        const saved = await this.files.save({
          conversationId: ctx.conversationId,
          agentRunId: ctx.agentRunId,
          toolUseId: ctx.toolUseId ?? 'template',
          source: 'REPORT',
          name,
          mediaType: MEDIA_TYPES[ext],
          bytes,
        });
        const rows = spec.sheets.reduce(
          (n, s) => n + s.tables.reduce((m, t) => m + t.rows.length, 0),
          0,
        );
        return { created: true, fileId: saved.id, fileName: saved.name, size: saved.size, rows };
      },
    };
  }

  /** 양식 + 데이터 → 어느 칸에 무엇을 넣을지(AI) */
  private async plan(
    name: string,
    st: TemplateStructure,
    input: Record<string, unknown>,
  ): Promise<FillSpec> {
    const client = requireClaude(this.client);
    let data = typeof input.data === 'string' ? input.data : JSON.stringify(input.data ?? null);
    if (data.length > MAX_DATA_CHARS) data = `${data.slice(0, MAX_DATA_CHARS)}…(이하 생략)`;
    const kst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    try {
      const res = await client.beta.messages
        .stream({
          model: AGENT_DEFAULT_MODEL,
          max_tokens: 32000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: FILL_SPEC_SCHEMA },
          },
          system:
            '당신은 회사 보고서 양식을 채우는 담당입니다. 양식의 구조(칸 주소·글자)를 보고, 주어진 데이터로 채울 칸과 표 행을 정합니다.\n' +
            '- 양식의 제목·머리글 글자는 바꾸지 않습니다. 비어 있는 값 칸(예: "기간:" 오른쪽 칸, 머리글 아래 행)만 채웁니다.\n' +
            '- 표는 머리글 바로 아래 칸을 startCell로, 머리글 순서대로 값을 넣습니다. 숫자는 쉼표 없이 숫자만.\n' +
            '- 칸 주소(addr·startCell)는 항상 양식의 원래 위치로 씁니다. 표 행이 양식의 빈 행보다 많아도 아래 칸(합계·특이사항 등)의 주소를 미리 옮겨 계산하지 마세요 — 서버가 행을 늘리며 함께 옮깁니다.\n' +
            '- 수식 칸(합계 등)은 넣지 않습니다. 데이터에 없는 값은 지어내지 말고 빈 글자로 둡니다.\n' +
            `- 오늘은 ${kst}(한국 시간)입니다. 시트 이름은 양식 그대로 씁니다.`,
          messages: [
            {
              role: 'user',
              content:
                `<template>\n${describeTemplate(name, st)}\n</template>\n\n` +
                `<instructions>\n${String(input.instructions ?? '양식에 맞게 데이터를 채워 주세요.')}\n</instructions>\n\n` +
                `<data>\n${data}\n</data>`,
            },
          ],
        })
        .finalMessage();
      assertComplete(res);
      return JSON.parse(textOf(res)) as FillSpec;
    } catch (e) {
      const msg = describeClaudeError(e);
      this.logger.warn(`양식 채우기 실패: ${msg}`);
      throw new ToolError(
        e instanceof SyntaxError ? 'AI가 양식 채우기 내용을 만들지 못했습니다.' : msg,
      );
    }
  }
}
