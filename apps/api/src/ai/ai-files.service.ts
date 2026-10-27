import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { basename, extname } from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';

/** 파일 하나 최대 크기 — 데모라 DB(bytea)에 두므로 너무 큰 파일은 받지 않는다 */
export const AI_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** 화면에 보낼 파일 정보(내용 빼고) */
export interface AiFileMeta {
  id: string;
  toolUseId: string;
  name: string;
  mediaType: string;
  size: number;
}

const EXT_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.html': 'text/html; charset=utf-8',
};

/**
 * AI가 만든 파일 보관소 — 서버 보고서 도구(create_report_file)와 코드 실행 샌드박스가 만든 파일을
 * 대화에 붙여 저장하고, 대화 주인만 내려받게 한다.
 */
@Injectable()
export class AiFiles {
  private readonly logger = new Logger('AiFiles');

  constructor(private readonly prisma: PrismaService) {}

  async save(data: {
    /** AI 비서 대화 또는 에이전트 실행 — 둘 중 하나 */
    conversationId?: string;
    agentRunId?: string;
    toolUseId: string;
    source: 'REPORT' | 'CODE';
    remoteFileId?: string;
    name: string;
    mediaType: string;
    bytes: Buffer;
  }): Promise<AiFileMeta> {
    if (data.bytes.length > AI_FILE_MAX_BYTES) {
      throw new Error(
        `파일이 너무 큽니다(${(data.bytes.length / 1048576).toFixed(1)}MB, 최대 ${AI_FILE_MAX_BYTES / 1048576}MB).`,
      );
    }
    const f = await this.prisma.aiFile.create({
      data: { ...data, bytes: new Uint8Array(data.bytes), size: data.bytes.length },
      select: { id: true, toolUseId: true, name: true, mediaType: true, size: true },
    });
    return f;
  }

  list(conversationId: string): Promise<AiFileMeta[]> {
    return this.prisma.aiFile.findMany({
      where: { conversationId },
      select: { id: true, toolUseId: true, name: true, mediaType: true, size: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 에이전트 실행이 만든 파일 */
  listForRun(agentRunId: string): Promise<AiFileMeta[]> {
    return this.prisma.aiFile.findMany({
      where: { agentRunId },
      select: { id: true, toolUseId: true, name: true, mediaType: true, size: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 내려받기 — 대화 주인·실행한 사람만(다른 사람 파일은 없는 것처럼) */
  async get(id: string, userId: string, isAdmin = false) {
    const f = await this.prisma.aiFile.findUnique({
      where: { id },
      include: {
        conversation: { select: { userId: true } },
        agentRun: { select: { createdBy: true } },
      },
    });
    const owner = f?.conversation?.userId ?? f?.agentRun?.createdBy;
    if (!f || (!isAdmin && owner !== userId)) {
      throw new NotFoundException('파일을 찾을 수 없습니다.');
    }
    return { name: f.name, mediaType: f.mediaType, bytes: Buffer.from(f.bytes) };
  }

  /**
   * 코드 실행 결과 블록에서 샌드박스가 내보낸 파일($OUTPUT_DIR)을 찾아 Files API로 받아 저장한다.
   * 이미 받은 파일(remoteFileId)은 건너뛴다. 실패해도 대화는 이어 가도록 오류는 기록만.
   */
  async collectFromCodeExecution(
    client: Anthropic,
    conversationId: string,
    content: ReadonlyArray<unknown>,
  ): Promise<AiFileMeta[]> {
    const found: { toolUseId: string; fileId: string }[] = [];
    for (const raw of content) {
      const b = raw as { type?: string; tool_use_id?: string; content?: unknown };
      if (b.type !== 'bash_code_execution_tool_result' && b.type !== 'code_execution_tool_result')
        continue;
      const result = b.content as { content?: unknown } | undefined;
      if (!result || !Array.isArray(result.content)) continue;
      for (const o of result.content as Array<{ type?: string; file_id?: string }>) {
        if (o.file_id) found.push({ toolUseId: String(b.tool_use_id), fileId: o.file_id });
      }
    }
    if (!found.length) return [];
    const known = new Set(
      (
        await this.prisma.aiFile.findMany({
          where: { remoteFileId: { in: found.map((f) => f.fileId) } },
          select: { remoteFileId: true },
        })
      ).map((f) => f.remoteFileId),
    );
    const saved: AiFileMeta[] = [];
    for (const f of found) {
      if (known.has(f.fileId)) continue;
      try {
        const meta = await client.files.retrieveMetadata(f.fileId);
        if (meta.size_bytes > AI_FILE_MAX_BYTES) {
          this.logger.warn(
            `코드 실행 파일 ${meta.filename}이 너무 커서 건너뜀(${meta.size_bytes}B)`,
          );
          continue;
        }
        const res = await client.files.download(f.fileId);
        const bytes = Buffer.from(await res.arrayBuffer());
        const name = basename(meta.filename || 'file') || 'file';
        const mediaType =
          EXT_TYPES[extname(name).toLowerCase()] ?? meta.mime_type ?? 'application/octet-stream';
        saved.push(
          await this.save({
            conversationId,
            toolUseId: f.toolUseId,
            source: 'CODE',
            remoteFileId: f.fileId,
            name,
            mediaType,
            bytes,
          }),
        );
      } catch (e) {
        this.logger.warn(
          `코드 실행 파일 ${f.fileId} 받기 실패: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return saved;
  }
}

/** Content-Disposition — 한글 이름은 RFC 5987 filename*로, 옛 브라우저용 ASCII 이름도 함께 */
export function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file';
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
