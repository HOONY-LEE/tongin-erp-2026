import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ACCESS_LABEL, type AccessMethod } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStoreService } from '../../prisma/file-store.service';

/** 고친 값 하나 — 이전 → 새 값. price = 금액에 관한 값(바꾸려면 승인) */
export interface RevisionChange {
  label: string;
  from: string;
  to: string;
  price: boolean;
}

export type RevisionKind =
  | 'BASE'
  | 'EDIT'
  | 'PRICE_REQUEST'
  | 'PRICE_APPROVED'
  | 'PRICE_REJECTED'
  | 'PRICE_CANCELED';

/** 금액에 관한 칸 — 이 칸이 바뀌면 담당자는 결재(승인 요청)를 거쳐야 한다 */
const PRICE_LABELS = new Set(['이사비용', '부가세', '총액', '계약금', '잔금']);
export const isPriceLabel = (label: string) =>
  PRICE_LABELS.has(label) || label.startsWith('옵션 · ');

const won = (v: Prisma.Decimal | number | null | undefined) =>
  v == null ? '-' : `${Number(v).toLocaleString('ko-KR')}원`;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '-');
const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '-');
const accessLabel = (code: string, note: string | null) =>
  code === 'ETC' && note ? `기타(${note})` : (ACCESS_LABEL[code as AccessMethod] ?? code);

/**
 * 계약서 수정 이력 — 계약서에 보이는 값을 '항목 → 글자'로 뽑아 고치기 전·후를 비교하고,
 * 그때 계약서 문서(HTML)를 통째로 남긴다(나중에 그 시점 계약서를 그대로 다시 본다).
 */
@Injectable()
export class ContractRevisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: FileStoreService,
  ) {}

  /** 계약서에 보이는 값 — 항목 이름 → 글자 */
  async facts(estimateId: string): Promise<Record<string, string>> {
    const e = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        lead: { select: { moveDate: true, visitDate: true } },
        customer: { select: { name: true, phonePrimary: true } },
        product: { select: { name: true } },
        addons: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { lines: true } },
      },
    });
    if (!e) throw new NotFoundException('견적을 찾을 수 없습니다.');
    const addr = (zip: string | null, a: string | null, d: string | null) =>
      a ? `${a}${d ? ` ${d}` : ''}${zip ? `(${zip})` : ''}` : '-';
    const f: Record<string, string> = {
      고객명: text(e.customer?.name),
      연락처: text(e.customer?.phonePrimary),
      상품: text(e.product?.name),
      상담일: day(e.lead?.visitDate),
      이사일: day(e.lead?.moveDate),
      출발지: addr(e.fromZipcode, e.fromAddr, e.fromAddrDetail),
      도착지: addr(e.toZipcode, e.toAddr, e.toAddrDetail),
      '출발 작업조건': `${e.fromPyeong ?? '-'}평 · ${accessLabel(e.fromAccess, e.fromAccessNote)}`,
      '도착 작업조건': `${e.toPyeong ?? '-'}평 · ${accessLabel(e.toAccess, e.toAccessNote)}`,
      물품: `${e._count.lines}개 · ${Number(e.totalCbm)}CBM`,
      '작업 지시·메모': text(e.workInstructions),
      이사비용: won(e.moveAmount),
      부가세: e.vatMode === 'INCLUDED' ? `포함 ${won(e.vatAmount)}` : '불포함',
      총액: won(e.totalAmount),
      계약금: won(e.depositAmount),
      잔금: won(e.balanceAmount),
    };
    for (const a of e.addons) {
      const name = `${a.name}${a.variant ? `(${a.variant})` : ''}`;
      f[`옵션 · ${name}`] = won(a.amount);
    }
    return f;
  }

  /** 두 값 묶음의 차이 */
  diff(before: Record<string, string>, after: Record<string, string>): RevisionChange[] {
    const labels = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return labels
      .filter((l) => (before[l] ?? '-') !== (after[l] ?? '-'))
      .map((l) => ({
        label: l,
        from: before[l] ?? '없음',
        to: after[l] ?? '없음',
        price: isPriceLabel(l),
      }));
  }

  private async nextSeq(contractId: string) {
    const last = await this.prisma.contractRevision.findFirst({
      where: { contractId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    return (last?.seq ?? 0) + 1;
  }

  /** 이력 한 줄 남기기 — html을 주면 그때 계약서 문서도 */
  async record(input: {
    contractId: string;
    kind: RevisionKind;
    changes?: RevisionChange[];
    summary?: string | null;
    html?: string | null;
    byEmpId?: string | null;
    approvalDocId?: string | null;
  }) {
    const stored = input.html
      ? await this.store.put(Buffer.from(input.html, 'utf8'), 'text/html; charset=utf-8')
      : { bytes: null, storageKey: null };
    const by = input.byEmpId
      ? await this.prisma.employee.findUnique({
          where: { id: input.byEmpId },
          select: { name: true },
        })
      : null;
    // 같은 순번을 두 요청이 동시에 잡으면 유니크 충돌 — 한 번 더 시도
    for (let i = 0; ; i++) {
      try {
        return await this.prisma.contractRevision.create({
          data: {
            contractId: input.contractId,
            seq: await this.nextSeq(input.contractId),
            kind: input.kind,
            summary: input.summary ?? null,
            changes: (input.changes ?? []) as unknown as Prisma.InputJsonValue,
            docBytes: stored.bytes,
            docKey: stored.storageKey,
            byEmpId: input.byEmpId ?? null,
            byName: by?.name ?? null,
            approvalDocId: input.approvalDocId ?? null,
          },
          select: { id: true, seq: true },
        });
      } catch (e) {
        const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!dup || i >= 2) throw e;
      }
    }
  }

  /** 첫 수정 전에 지금 계약서를 '원본'으로 남긴다(이미 이력이 있으면 그대로) */
  async ensureBase(contractId: string, render: () => Promise<string>) {
    const n = await this.prisma.contractRevision.count({ where: { contractId } });
    if (n > 0) return;
    await this.record({
      contractId,
      kind: 'BASE',
      summary: '처음 계약서(첫 수정 전)',
      html: await render(),
    });
  }

  /** 이력 목록 — 결재 문서 번호·상태도 */
  async list(contractId: string) {
    const rows = await this.prisma.contractRevision.findMany({
      where: { contractId },
      orderBy: { seq: 'desc' },
      select: {
        id: true,
        seq: true,
        kind: true,
        summary: true,
        changes: true,
        docKey: true,
        byName: true,
        approvalDocId: true,
        createdAt: true,
      },
    });
    const docIds = rows.map((r) => r.approvalDocId).filter((x): x is string => !!x);
    const docs = docIds.length
      ? await this.prisma.approvalDoc.findMany({
          where: { id: { in: docIds } },
          select: { id: true, docNo: true, status: true },
        })
      : [];
    const withDoc = await this.prisma.contractRevision.findMany({
      where: { contractId, OR: [{ docKey: { not: null } }, { docBytes: { not: null } }] },
      select: { id: true },
    });
    const hasDoc = new Set(withDoc.map((r) => r.id));
    return rows.map(({ docKey: _docKey, approvalDocId, ...r }) => ({
      ...r,
      hasDocument: hasDoc.has(r.id),
      approval: docs.find((d) => d.id === approvalDocId) ?? null,
    }));
  }

  /** 그때 계약서 문서(HTML) */
  async document(contractId: string, revisionId: string) {
    const r = await this.prisma.contractRevision.findFirst({
      where: { id: revisionId, contractId },
      select: { docBytes: true, docKey: true },
    });
    if (!r || (!r.docBytes && !r.docKey))
      throw new NotFoundException('이 이력에는 저장된 계약서가 없습니다.');
    const bytes = await this.store.read({ bytes: r.docBytes, storageKey: r.docKey });
    return bytes.toString('utf8');
  }

  /** 이 계약에 아직 결재 중인 금액 변경 요청이 있나 */
  async pendingPriceRequest(contractId: string) {
    const reqs = await this.prisma.contractRevision.findMany({
      where: { contractId, kind: 'PRICE_REQUEST', approvalDocId: { not: null } },
      select: { approvalDocId: true },
    });
    if (!reqs.length) return null;
    return this.prisma.approvalDoc.findFirst({
      where: { id: { in: reqs.map((r) => r.approvalDocId!) }, status: 'PENDING' },
      select: { id: true, docNo: true },
    });
  }
}
