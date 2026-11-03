import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CONCEPT_KINDS,
  PERMISSION_WILDCARD,
  type AuthPrincipal,
  type KnowledgeAnalyzeStatus,
  type KnowledgeCategory,
  type KnowledgeConceptKind,
  type KnowledgeDocRow,
  type KnowledgeDocView,
  type KnowledgeGraph,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertComplete,
  builderModel,
  createClaude,
  describeClaudeError,
  requireClaude,
  textOf,
} from '../../agent-builder/agent-claude';
import { aiCaller, trackClaude } from '../../ai/ai-usage.service';

export interface KnowledgeInput {
  title?: string;
  category?: string;
  content?: string;
}

/** AI에게 넘기는 본문 한도(글자) — 이보다 길면 앞부분만 정리한다 */
const ANALYZE_MAX = 60_000;
/** read_knowledge가 돌려주는 본문 한도 */
const READ_MAX = 20_000;
const FILE_MAX = 15 * 1024 * 1024;
/** 이보다 짧은 문서는 검색 결과에 본문을 통째로 넣는다 */
const SEARCH_FULL = 4000;

const ANALYZE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keywords', 'category', 'concepts', 'relations'],
  properties: {
    summary: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    category: { type: 'string', enum: [...KNOWLEDGE_CATEGORIES] },
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'description'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: [...KNOWLEDGE_CONCEPT_KINDS] },
          description: { type: 'string' },
        },
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'label'],
        properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } },
      },
    },
  },
};

const ANALYZE_GUIDE = `당신은 통인익스프레스(이사·리빙케어 회사)의 사내 지식베이스 정리 담당입니다.
회사 문서(지침·규정·원칙·매뉴얼)를 읽고, AI가 나중에 업무를 처리할 때 근거로 찾아 쓸 수 있게 정리합니다.

- summary: 이 문서가 무엇을 정하는지 2~4문장. 누가·언제 이 문서를 참고해야 하는지도 한 문장.
- keywords: 검색에 걸릴 핵심 낱말 5~12개(동의어 포함, 예: 연차·휴가·반차).
- category: POLICY(규정·원칙) HR(인사·휴가) SALES(영업·계약) OPERATION(현장·작업) CS(고객 응대) COMPANY(회사 소개) ETC.
- concepts: 문서의 핵심 개념 4~15개. kind는 TERM(용어) RULE(지켜야 할 규칙·기준) ROLE(역할·담당자) PROCESS(절차) TOPIC(주제).
  - RULE은 description에 규칙 내용을 숫자·조건 그대로 한 문장으로 적습니다(예: "반차는 오전 9~13시, 오후 14~18시로 나눈다").
  - name은 짧은 한국어 명사구. 아래 '이미 있는 개념'과 같은 뜻이면 그 이름을 그대로 써서 문서끼리 이어지게 합니다.
- relations: 개념 사이 관계 3~20개. from·to는 concepts의 name, label은 짧은 동사구(예: "승인한다", "포함한다", "먼저 해야 한다", "예외").
- 문서에 없는 내용을 지어내지 않습니다.`;

const kindOf = (k: string): KnowledgeConceptKind =>
  (KNOWLEDGE_CONCEPT_KINDS as readonly string[]).includes(k)
    ? (k as KnowledgeConceptKind)
    : 'TOPIC';
const categoryOf = (c: string | undefined): KnowledgeCategory =>
  (KNOWLEDGE_CATEGORIES as readonly string[]).includes(c ?? '') ? (c as KnowledgeCategory) : 'ETC';
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 60);

/**
 * 지식베이스 — 문서를 모으고(직접 쓰기·파일 올리기), AI가 요약·키워드·개념·관계를 뽑아 온톨로지 그래프를 만든다.
 * 보기·검색은 로그인한 누구나, 올리기·고치기·지우기는 KNOWLEDGE.* 권한.
 * AI 비서·에이전트는 search / read로 회사 기준을 찾아 근거로 쓴다.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger('Knowledge');
  private readonly client: Anthropic | null = createClaude();

  constructor(private readonly prisma: PrismaService) {}

  private can(p: AuthPrincipal, action: 'CREATE' | 'UPDATE' | 'DELETE') {
    return (
      p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes(`KNOWLEDGE.${action}`)
    );
  }
  private assert(p: AuthPrincipal, action: 'CREATE' | 'UPDATE' | 'DELETE') {
    if (!this.can(p, action)) throw new ForbiddenException('지식베이스를 고칠 권한이 없습니다');
  }

  private row(d: {
    id: string;
    title: string;
    category: string;
    summary: string | null;
    keywords: string[];
    sourceName: string | null;
    analyzeStatus: string;
    analyzeError: string | null;
    updatedAt: Date;
    updatedByName: string | null;
    _count: { mentions: number };
  }): KnowledgeDocRow {
    return {
      id: d.id,
      title: d.title,
      category: categoryOf(d.category),
      summary: d.summary,
      keywords: d.keywords,
      sourceName: d.sourceName,
      analyzeStatus: d.analyzeStatus as KnowledgeAnalyzeStatus,
      analyzeError: d.analyzeError,
      conceptCount: d._count.mentions,
      updatedAt: d.updatedAt.toISOString(),
      updatedByName: d.updatedByName,
    };
  }

  async list(): Promise<KnowledgeDocRow[]> {
    const rows = await this.prisma.knowledgeDoc.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { mentions: true } } },
    });
    return rows.map((d) => this.row(d));
  }

  async one(id: string, p: AuthPrincipal): Promise<KnowledgeDocView> {
    const d = await this.prisma.knowledgeDoc.findUnique({
      where: { id },
      include: {
        _count: { select: { mentions: true } },
        mentions: { include: { concept: true } },
        relations: { include: { from: true, to: true } },
      },
    });
    if (!d) throw new NotFoundException('문서를 찾을 수 없습니다');
    const ids = d.mentions.map((m) => m.conceptId);
    const others = ids.length
      ? await this.prisma.knowledgeMention.groupBy({
          by: ['docId'],
          where: { conceptId: { in: ids }, docId: { not: id } },
          _count: true,
          orderBy: { _count: { docId: 'desc' } },
          take: 8,
        })
      : [];
    const titles = await this.prisma.knowledgeDoc.findMany({
      where: { id: { in: others.map((o) => o.docId) } },
      select: { id: true, title: true },
    });
    return {
      ...this.row(d),
      content: d.content,
      concepts: d.mentions
        .map((m) => ({
          id: m.concept.id,
          name: m.concept.name,
          kind: kindOf(m.concept.kind),
          description: m.concept.description,
        }))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
      relations: d.relations.map((r) => ({ from: r.from.name, to: r.to.name, label: r.label })),
      related: others.map((o) => ({
        id: o.docId,
        title: titles.find((t) => t.id === o.docId)?.title ?? '',
        shared: o._count,
      })),
      canEdit: this.can(p, 'UPDATE'),
    };
  }

  async create(p: AuthPrincipal, input: KnowledgeInput, sourceName?: string) {
    this.assert(p, 'CREATE');
    const title = input.title?.trim();
    const content = input.content?.trim();
    if (!title) throw new BadRequestException('제목을 넣어 주세요');
    if (!content) throw new BadRequestException('내용을 넣어 주세요');
    const d = await this.prisma.knowledgeDoc.create({
      data: {
        title,
        content,
        category: categoryOf(input.category),
        sourceName: sourceName ?? null,
        createdByUserId: p.userId,
        updatedByName: p.employeeName ?? p.loginId,
      },
    });
    this.analyzeLater(d.id, p.userId);
    return { id: d.id };
  }

  async update(p: AuthPrincipal, id: string, input: KnowledgeInput) {
    this.assert(p, 'UPDATE');
    const cur = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('문서를 찾을 수 없습니다');
    const contentChanged = input.content !== undefined && input.content.trim() !== cur.content;
    await this.prisma.knowledgeDoc.update({
      where: { id },
      data: {
        ...(input.title?.trim() && { title: input.title.trim() }),
        ...(input.category && { category: categoryOf(input.category) }),
        ...(contentChanged && { content: input.content!.trim(), analyzeStatus: 'PENDING' }),
        updatedByName: p.employeeName ?? p.loginId,
      },
    });
    if (contentChanged) this.analyzeLater(id, p.userId);
    return { id };
  }

  async remove(p: AuthPrincipal, id: string) {
    this.assert(p, 'DELETE');
    await this.prisma.knowledgeDoc.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('문서를 찾을 수 없습니다');
    });
    await this.dropOrphans();
    return { ok: true };
  }

  async reanalyze(p: AuthPrincipal, id: string) {
    this.assert(p, 'UPDATE');
    await this.prisma.knowledgeDoc.update({
      where: { id },
      data: { analyzeStatus: 'PENDING', analyzeError: null },
    });
    this.analyzeLater(id, p.userId);
    return { id };
  }

  // ── 파일 올리기 ──

  /** 파일 → 마크다운 본문. PDF는 Claude가 읽어 옮겨 적는다 */
  async upload(
    p: AuthPrincipal,
    file: { name: string; dataBase64: string; category?: string; title?: string },
  ) {
    this.assert(p, 'CREATE');
    const buf = Buffer.from(file.dataBase64, 'base64');
    if (!buf.length) throw new BadRequestException('빈 파일입니다');
    if (buf.length > FILE_MAX) throw new BadRequestException('15MB보다 큰 파일은 올릴 수 없습니다');
    const content = await this.extract(file.name, buf, p.userId);
    if (!content.trim()) throw new BadRequestException('파일에서 글을 찾지 못했습니다');
    return this.create(
      p,
      {
        title: file.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
        category: file.category,
        content,
      },
      file.name,
    );
  }

  private async extract(name: string, buf: Buffer, userId: string): Promise<string> {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    if (['md', 'txt', 'csv', 'markdown'].includes(ext)) return buf.toString('utf8');
    if (ext === 'docx') return this.docxText(buf);
    if (ext === 'xlsx') return this.xlsxText(buf);
    if (ext === 'pdf') return this.pdfText(buf, userId);
    if (ext === 'hwp' || ext === 'hwpx')
      throw new BadRequestException('한글(hwp) 파일은 PDF나 Word로 저장해서 올려 주세요');
    throw new BadRequestException(
      'PDF·Word(.docx)·엑셀(.xlsx)·텍스트(.md·.txt) 파일만 올릴 수 있습니다',
    );
  }

  private async docxText(buf: Buffer) {
    const zip = await JSZip.loadAsync(buf);
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const decode = (s: string) =>
      s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
    return xml
      .split(/<\/w:p>/)
      .map((para) => {
        const text = decode(
          [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)]
            .map((m) => m[1] ?? '\t')
            .join(''),
        ).trim();
        if (!text) return '';
        const h = /<w:pStyle w:val="(?:Heading|제목)\s?(\d)"/i.exec(para);
        const list = /<w:numPr>/.test(para);
        return h
          ? `${'#'.repeat(Math.min(Number(h[1]) || 1, 4))} ${text}`
          : list
            ? `- ${text}`
            : text;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private async xlsxText(buf: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const out: string[] = [];
    wb.eachSheet((ws) => {
      out.push(`## ${ws.name}`);
      ws.eachRow((row) => {
        const cells = (row.values as unknown[])
          .slice(1)
          .map((v) =>
            v == null
              ? ''
              : typeof v === 'object' && 'text' in (v as object)
                ? String((v as { text: unknown }).text)
                : String(v),
          );
        if (cells.some((c) => c.trim())) out.push(`| ${cells.join(' | ')} |`);
      });
    });
    return out.join('\n');
  }

  private async pdfText(buf: Buffer, userId: string) {
    const client = requireClaude(this.client);
    const model = builderModel();
    try {
      const res = await aiCaller.run({ userId }, () =>
        trackClaude('KNOWLEDGE', model, () =>
          client.beta.messages
            .stream({
              model,
              max_tokens: 32000,
              output_config: { effort: 'low' },
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'document',
                      source: {
                        type: 'base64',
                        media_type: 'application/pdf',
                        data: buf.toString('base64'),
                      },
                    },
                    {
                      type: 'text',
                      text: '이 PDF의 본문을 빠짐없이 마크다운으로 옮겨 적어 주세요. 제목은 #, 목록은 -, 표는 마크다운 표로. 설명·요약 없이 본문만 출력합니다.',
                    },
                  ],
                },
              ],
            })
            .finalMessage(),
        ),
      );
      assertComplete(res);
      return textOf(res);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadGatewayException(`PDF를 읽지 못했습니다: ${describeClaudeError(e)}`);
    }
  }

  // ── AI 정리(온톨로지) ──

  private analyzeLater(id: string, userId: string) {
    if (!this.client) {
      void this.prisma.knowledgeDoc
        .update({
          where: { id },
          data: {
            analyzeStatus: 'ERROR',
            analyzeError: 'ANTHROPIC_API_KEY가 없어 AI 정리를 못 했습니다',
          },
        })
        .catch(() => undefined);
      return;
    }
    void aiCaller.run({ userId, refId: id }, () =>
      this.analyze(id).catch(async (e) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`지식 정리 실패(${id}): ${msg}`);
        await this.prisma.knowledgeDoc
          .update({
            where: { id },
            data: { analyzeStatus: 'ERROR', analyzeError: msg.slice(0, 500) },
          })
          .catch(() => undefined);
      }),
    );
  }

  async analyze(id: string) {
    const client = requireClaude(this.client);
    const doc = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
    if (!doc) return;
    const existing = await this.prisma.knowledgeConcept.findMany({
      select: { name: true, kind: true },
      orderBy: { name: 'asc' },
      take: 400,
    });
    const model = builderModel();
    let res: Anthropic.Beta.Messages.BetaMessage;
    try {
      res = await trackClaude('KNOWLEDGE', model, () =>
        client.beta.messages
          .stream({
            model,
            max_tokens: 8000,
            output_config: {
              effort: 'low',
              format: { type: 'json_schema', schema: ANALYZE_SCHEMA },
            },
            system: ANALYZE_GUIDE,
            messages: [
              {
                role: 'user',
                content:
                  `<existing_concepts>\n${existing.map((c) => `${c.name}(${c.kind})`).join(', ') || '없음'}\n</existing_concepts>\n\n` +
                  `<document title="${doc.title.replace(/"/g, "'")}">\n${doc.content.slice(0, ANALYZE_MAX)}\n</document>`,
              },
            ],
          })
          .finalMessage(),
      );
      assertComplete(res);
    } catch (e) {
      throw new Error(describeClaudeError(e));
    }
    const out = JSON.parse(textOf(res)) as {
      summary: string;
      keywords: string[];
      category: string;
      concepts: { name: string; kind: string; description: string }[];
      relations: { from: string; to: string; label: string }[];
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeMention.deleteMany({ where: { docId: id } });
      await tx.knowledgeRelation.deleteMany({ where: { docId: id } });
      const ids = new Map<string, string>();
      for (const c of out.concepts) {
        const name = norm(c.name);
        if (!name || ids.has(name)) continue;
        const found = await tx.knowledgeConcept.findUnique({ where: { name } });
        const concept =
          found ??
          (await tx.knowledgeConcept.create({
            data: { name, kind: kindOf(c.kind), description: c.description?.trim() || null },
          }));
        if (found && !found.description && c.description?.trim())
          await tx.knowledgeConcept.update({
            where: { id: found.id },
            data: { description: c.description.trim() },
          });
        ids.set(name, concept.id);
        await tx.knowledgeMention.create({ data: { docId: id, conceptId: concept.id } });
      }
      for (const r of out.relations) {
        const from = ids.get(norm(r.from));
        const to = ids.get(norm(r.to));
        if (from && to && from !== to && r.label?.trim())
          await tx.knowledgeRelation.create({
            data: { docId: id, fromId: from, toId: to, label: r.label.trim().slice(0, 40) },
          });
      }
      await tx.knowledgeDoc.update({
        where: { id },
        data: {
          summary: out.summary?.trim() || null,
          keywords: [...new Set(out.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 15),
          // 직접 고른 분류가 '기타'면 AI가 고른 분류로
          ...(doc.category === 'ETC' && { category: categoryOf(out.category) }),
          analyzeStatus: 'DONE',
          analyzeError: null,
          analyzedAt: new Date(),
        },
      });
    });
    await this.dropOrphans();
  }

  /** 어느 문서에도 안 걸린 개념은 지운다 */
  private async dropOrphans() {
    await this.prisma.knowledgeConcept.deleteMany({ where: { mentions: { none: {} } } });
  }

  // ── 그래프 ──

  async graph(): Promise<KnowledgeGraph> {
    const [docs, concepts, mentions, relations] = await Promise.all([
      this.prisma.knowledgeDoc.findMany({ select: { id: true, title: true, category: true } }),
      this.prisma.knowledgeConcept.findMany({ select: { id: true, name: true, kind: true } }),
      this.prisma.knowledgeMention.findMany(),
      this.prisma.knowledgeRelation.findMany({ select: { fromId: true, toId: true, label: true } }),
    ]);
    const links: KnowledgeGraph['links'] = [
      ...mentions.map((m) => ({ source: `d:${m.docId}`, target: `c:${m.conceptId}` })),
      ...relations.map((r) => ({ source: `c:${r.fromId}`, target: `c:${r.toId}`, label: r.label })),
    ];
    const degree = new Map<string, number>();
    for (const l of links)
      for (const k of [l.source, l.target]) degree.set(k, (degree.get(k) ?? 0) + 1);
    return {
      nodes: [
        ...docs.map((d) => ({
          id: `d:${d.id}`,
          type: 'doc' as const,
          label: d.title,
          group: categoryOf(d.category),
          degree: degree.get(`d:${d.id}`) ?? 0,
        })),
        ...concepts.map((c) => ({
          id: `c:${c.id}`,
          type: 'concept' as const,
          label: c.name,
          group: kindOf(c.kind),
          degree: degree.get(`c:${c.id}`) ?? 0,
        })),
      ],
      links,
    };
  }

  async concept(id: string) {
    const c = await this.prisma.knowledgeConcept.findUnique({
      where: { id },
      include: {
        mentions: { include: { doc: { select: { id: true, title: true, category: true } } } },
        outLinks: { include: { to: { select: { name: true } } } },
        inLinks: { include: { from: { select: { name: true } } } },
      },
    });
    if (!c) throw new NotFoundException('개념을 찾을 수 없습니다');
    return {
      id: c.id,
      name: c.name,
      kind: kindOf(c.kind),
      description: c.description,
      docs: c.mentions.map((m) => ({ ...m.doc, category: categoryOf(m.doc.category) })),
      relations: [
        ...c.outLinks.map((r) => ({ from: c.name, to: r.to.name, label: r.label })),
        ...c.inLinks.map((r) => ({ from: r.from.name, to: c.name, label: r.label })),
      ],
    };
  }

  // ── AI가 쓰는 검색·읽기 ──

  /**
   * 낱말로 문서를 찾는다 — 제목·키워드·개념 이름·요약·본문 순으로 점수. 규칙(RULE) 개념은 내용까지 함께 준다.
   * 문서가 수십~수백 개 규모라 DB에서 모두 읽어 점수를 매긴다.
   */
  async search(query: string, limit = 5) {
    const terms = [
      ...new Set(
        query
          .split(/[\s,·/]+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 1),
      ),
    ].slice(0, 12);
    const docs = await this.prisma.knowledgeDoc.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        summary: true,
        keywords: true,
        content: true,
        updatedAt: true,
        mentions: {
          select: { concept: { select: { name: true, kind: true, description: true } } },
        },
      },
    });
    const scored = docs
      .map((d) => {
        let score = 0;
        const hits: string[] = [];
        for (const t of terms) {
          if (d.title.includes(t)) score += 6;
          if (d.keywords.some((k) => k.includes(t) || t.includes(k))) score += 4;
          if (d.mentions.some((m) => m.concept.name.includes(t))) score += 3;
          if (d.summary?.includes(t)) score += 2;
          const at = d.content.indexOf(t);
          if (at >= 0) {
            score += 1 + Math.min(3, d.content.split(t).length - 2);
            if (hits.length < 3)
              hits.push(d.content.slice(Math.max(0, at - 80), at + 160).replace(/\s+/g, ' '));
          }
        }
        return { d, score, hits };
      })
      .filter((x) => !terms.length || x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(10, Math.max(1, limit)));
    return {
      query,
      total: scored.length,
      docs: scored.map(({ d, hits }) => ({
        id: d.id,
        title: d.title,
        category: categoryOf(d.category),
        summary: d.summary,
        rules: d.mentions
          .filter((m) => m.concept.kind === 'RULE' && m.concept.description)
          .map((m) => `${m.concept.name}: ${m.concept.description}`)
          .slice(0, 12),
        // 짧은 문서는 본문을 통째로(따로 read_knowledge를 부르지 않게), 긴 문서는 맞는 부분만
        ...(d.content.length <= SEARCH_FULL ? { content: d.content } : { excerpts: hits }),
        updatedAt: d.updatedAt.toISOString().slice(0, 10),
      })),
      hint: scored.length
        ? '정확한 기준이 필요하면 read_knowledge로 본문을 읽고, 답에 근거 문서 이름을 밝히세요.'
        : '맞는 문서가 없습니다. 회사 기준이 없다고 말하고, 일반 상식으로 답할 때는 그렇다고 밝히세요.',
    };
  }

  async read(id: string) {
    const d = await this.prisma.knowledgeDoc.findUnique({
      where: { id },
      include: { mentions: { include: { concept: true } } },
    });
    if (!d) throw new NotFoundException('문서를 찾을 수 없습니다');
    return {
      id: d.id,
      title: d.title,
      category: categoryOf(d.category),
      updatedAt: d.updatedAt.toISOString().slice(0, 10),
      summary: d.summary,
      concepts: d.mentions.map((m) => ({
        name: m.concept.name,
        kind: m.concept.kind,
        description: m.concept.description,
      })),
      content:
        d.content.length > READ_MAX ? `${d.content.slice(0, READ_MAX)}\n…(뒷부분 생략)` : d.content,
    };
  }

  /** AI 맥락에 붙이는 문서 목록(제목만) */
  async titles(limit = 60) {
    return this.prisma.knowledgeDoc.findMany({
      select: { id: true, title: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }
}
