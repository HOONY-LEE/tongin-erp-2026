import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  APPROVAL_FILE_MAX_BYTES,
  APPROVAL_FILE_MAX_COUNT,
  type AuthPrincipal,
  type FormFile,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalService } from './approval.service';

/** 실행 파일처럼 결재에 붙일 일이 없고 위험한 것만 막는다(문서·이미지·압축은 그대로) */
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|ps1|vbs|js|jar|sh|app|dmg)$/i;

const meta = (a: { id: string; fileName: string; size: number; mediaType: string }): FormFile => ({
  id: a.id,
  name: a.fileName,
  size: a.size,
  mediaType: a.mediaType,
});

/**
 * 결재 첨부파일 — 작성 중에 먼저 올리고(문서 없음), 상신하면 문서에 붙인다.
 * 받기는 올린 사람이거나 그 문서를 볼 수 있는 사람만.
 */
@Injectable()
export class ApprovalAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
  ) {}

  async upload(p: AuthPrincipal, input: { fileName: string; mediaType: string; data: string }) {
    const name = input.fileName.trim().replace(/[\\/]/g, '_').slice(0, 200);
    if (!name) throw new BadRequestException('파일 이름이 비어 있습니다.');
    if (BLOCKED_EXT.test(name)) throw new BadRequestException('실행 파일은 첨부할 수 없습니다.');
    const bytes = Buffer.from(input.data, 'base64');
    if (!bytes.length) throw new BadRequestException('파일 내용이 비어 있습니다.');
    if (bytes.length > APPROVAL_FILE_MAX_BYTES)
      throw new BadRequestException(
        `파일이 너무 큽니다(${(bytes.length / 1048576).toFixed(1)}MB, 최대 ${APPROVAL_FILE_MAX_BYTES / 1048576}MB).`,
      );
    const row = await this.prisma.approvalAttachment.create({
      data: {
        uploadedByUserId: p.userId,
        fileName: name,
        mediaType: input.mediaType.trim() || 'application/octet-stream',
        size: bytes.length,
        bytes: new Uint8Array(bytes),
      },
      select: { id: true, fileName: true, size: true, mediaType: true },
    });
    return meta(row);
  }

  /** 올린 사람이 아직 문서에 안 붙인 파일만 지운다 */
  async removeDraft(p: AuthPrincipal, id: string) {
    await this.prisma.approvalAttachment.deleteMany({
      where: { id, uploadedByUserId: p.userId, docId: null },
    });
  }

  async download(p: AuthPrincipal, id: string) {
    const a = await this.prisma.approvalAttachment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('첨부파일을 찾을 수 없습니다.');
    if (a.uploadedByUserId !== p.userId) {
      if (!a.docId) throw new NotFoundException('첨부파일을 찾을 수 없습니다.');
      await this.approvals.get(a.docId, p); // 문서를 볼 수 없으면 여기서 막힌다
    }
    return { name: a.fileName, mediaType: a.mediaType, bytes: Buffer.from(a.bytes) };
  }

  /**
   * 양식 값의 첨부파일 확인 — 이 사람이 올렸고 아직 문서에 안 붙은 파일만 받는다.
   * 정리된 값(이름·크기)을 돌려준다.
   */
  async resolve(userId: string, label: string, raw: unknown): Promise<FormFile[]> {
    const ids = Array.isArray(raw)
      ? raw
          .map((x) => (typeof x === 'string' ? x : (x as { id?: unknown })?.id))
          .filter((x): x is string => typeof x === 'string')
      : [];
    const uniq = [...new Set(ids)];
    if (uniq.length > APPROVAL_FILE_MAX_COUNT)
      throw new BadRequestException(
        `'${label}'은(는) ${APPROVAL_FILE_MAX_COUNT}개까지 붙일 수 있습니다.`,
      );
    if (!uniq.length) return [];
    const rows = await this.prisma.approvalAttachment.findMany({
      where: { id: { in: uniq }, uploadedByUserId: userId, docId: null },
      select: { id: true, fileName: true, size: true, mediaType: true },
    });
    if (rows.length !== uniq.length)
      throw new BadRequestException(`'${label}' 첨부파일을 다시 올려 주세요.`);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return uniq.map((id) => meta(byId.get(id)!));
  }

  /** 상신한 문서에 파일을 붙인다(같은 트랜잭션에서) */
  async link(tx: Prisma.TransactionClient, docId: string, files: FormFile[]) {
    if (!files.length) return;
    await tx.approvalAttachment.updateMany({
      where: { id: { in: files.map((f) => f.id) }, docId: null },
      data: { docId },
    });
  }
}
