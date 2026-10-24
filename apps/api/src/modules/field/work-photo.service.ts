import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  WORK_PHOTO_MAX_BYTES,
  type AuthPrincipal,
  type WorkPhotoKind,
  type WorkPhotoMeta,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkOrderService } from '../work-order/work-order.service';
import { FieldService } from './field.service';

/** 받는 형식 — 화면이 JPEG로 줄여 올리지만, 그대로 올리는 경우를 위해 PNG·WebP도 받는다 */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 사진을 올리거나 지울 수 있는 작업 상태 — 완료·취소 뒤에는 기록으로 남긴다 */
const EDITABLE_STATUS = ['ASSIGNED', 'IN_PROGRESS'];

/** 파일 앞부분(매직 바이트)으로 실제 형식을 판별한다 — 선언한 mediaType만 믿지 않는다 */
function sniff(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  // HEIC/HEIF(아이폰 원본) — ISO BMFF 'ftyp' 상자의 브랜드로 판별
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  return null;
}

/**
 * 현장 작업 사진 — 데모 규모라 내용은 DB(bytea)에 둔다(AI 파일과 같은 방식).
 * 접근 규칙:
 *  - 현장(올리기·지우기·목록): 현장 화면과 같은 범위(본인 배정 / 전속업체 소속 / 관리자 조직 범위)
 *  - 관리자 목록: 작업 상세와 같은 범위(조직 스코프 + 전속업체 소속)
 *  - 이미지 내려받기: 둘 중 하나만 맞으면 된다
 */
@Injectable()
export class WorkPhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly field: FieldService,
    private readonly workOrders: WorkOrderService,
  ) {}

  private toMeta(
    p: {
      id: string;
      workOrderId: string;
      kind: string;
      caption: string | null;
      mediaType: string;
      size: number;
      width: number | null;
      height: number | null;
      uploadedByUserId: string;
      createdAt: Date;
      uploadedBy: { loginId: string; employee: { name: string } | null };
    },
    principal: AuthPrincipal,
  ): WorkPhotoMeta {
    return {
      id: p.id,
      workOrderId: p.workOrderId,
      kind: p.kind as WorkPhotoKind,
      caption: p.caption,
      mediaType: p.mediaType,
      size: p.size,
      width: p.width,
      height: p.height,
      uploadedBy: p.uploadedBy.employee?.name ?? p.uploadedBy.loginId,
      mine: p.uploadedByUserId === principal.userId,
      createdAt: p.createdAt.toISOString(),
    };
  }

  private readonly metaSelect = {
    id: true,
    workOrderId: true,
    kind: true,
    caption: true,
    mediaType: true,
    size: true,
    width: true,
    height: true,
    uploadedByUserId: true,
    createdAt: true,
    uploadedBy: { select: { loginId: true, employee: { select: { name: true } } } },
  } as const;

  private async listOf(workOrderId: string, principal: AuthPrincipal): Promise<WorkPhotoMeta[]> {
    const rows = await this.prisma.workPhoto.findMany({
      where: { workOrderId },
      select: this.metaSelect,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toMeta(r, principal));
  }

  /** 현장 화면 — 내 작업의 사진 */
  async listForField(workOrderId: string, principal: AuthPrincipal) {
    await this.field.assertAccess(workOrderId, principal);
    return this.listOf(workOrderId, principal);
  }

  /** 관리자 화면 — 작업 상세와 같은 범위 */
  async listForStaff(workOrderId: string, principal: AuthPrincipal) {
    await this.workOrders.findOne(workOrderId, principal);
    return this.listOf(workOrderId, principal);
  }

  async upload(
    workOrderId: string,
    principal: AuthPrincipal,
    input: {
      kind: WorkPhotoKind;
      caption?: string;
      mediaType: string;
      data: string;
      width?: number;
      height?: number;
    },
  ): Promise<WorkPhotoMeta> {
    const wo = await this.field.assertAccess(workOrderId, principal);
    if (!EDITABLE_STATUS.includes(wo.status)) {
      throw new BadRequestException('완료되었거나 취소된 작업에는 사진을 올릴 수 없습니다.');
    }
    const bytes = Buffer.from(input.data, 'base64');
    if (!bytes.length) throw new BadRequestException('사진 내용이 비어 있습니다.');
    if (bytes.length > WORK_PHOTO_MAX_BYTES) {
      throw new BadRequestException(
        `사진이 너무 큽니다(${(bytes.length / 1048576).toFixed(1)}MB, 최대 ${WORK_PHOTO_MAX_BYTES / 1048576}MB).`,
      );
    }
    const actual = sniff(bytes);
    if (actual === 'image/heic') {
      throw new BadRequestException(
        'HEIC 사진은 바로 올릴 수 없습니다. 카메라 설정에서 "높은 호환성"을 켜거나 앱의 "사진 찍기"로 다시 올려 주세요.',
      );
    }
    if (!actual || !(ACCEPTED as readonly string[]).includes(actual)) {
      throw new BadRequestException('JPEG·PNG·WebP 사진만 올릴 수 있습니다.');
    }
    const caption = input.caption?.trim() || null;
    const row = await this.prisma.workPhoto.create({
      data: {
        workOrderId,
        kind: input.kind,
        caption,
        mediaType: actual, // 실제 형식으로 저장(선언값과 달라도 안전하게)
        size: bytes.length,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: new Uint8Array(bytes),
        uploadedByUserId: principal.userId,
      },
      select: this.metaSelect,
    });
    return this.toMeta(row, principal);
  }

  /** 지우기 — 같은 작업에 배정된 사람이면 누구나(흐린 사진 정리), 완료 전까지만 */
  async remove(workOrderId: string, photoId: string, principal: AuthPrincipal) {
    const wo = await this.field.assertAccess(workOrderId, principal);
    const p = await this.prisma.workPhoto.findUnique({
      where: { id: photoId },
      select: { workOrderId: true },
    });
    if (!p || p.workOrderId !== workOrderId)
      throw new NotFoundException('사진을 찾을 수 없습니다.');
    if (!EDITABLE_STATUS.includes(wo.status)) {
      throw new BadRequestException('완료되었거나 취소된 작업의 사진은 지울 수 없습니다.');
    }
    await this.prisma.workPhoto.delete({ where: { id: photoId } });
    return { ok: true };
  }

  /** 이미지 내용 — 현장 범위 또는 관리자 범위 중 하나라도 맞으면. 범위 밖은 없는 것처럼 404 */
  async bytes(photoId: string, principal: AuthPrincipal) {
    const p = await this.prisma.workPhoto.findUnique({
      where: { id: photoId },
      select: { workOrderId: true, mediaType: true, bytes: true },
    });
    if (!p) throw new NotFoundException('사진을 찾을 수 없습니다.');
    const ok =
      (await this.field.canAccess(p.workOrderId, principal)) ||
      (await this.workOrders.findOne(p.workOrderId, principal).then(
        () => true,
        () => false,
      ));
    if (!ok) throw new NotFoundException('사진을 찾을 수 없습니다.');
    return { mediaType: p.mediaType, bytes: Buffer.from(p.bytes) };
  }

  /** 작업 후 사진 수 — 완료할 때 "사진 없이 완료" 안내용 */
  countAfter(workOrderId: string) {
    return this.prisma.workPhoto.count({ where: { workOrderId, kind: 'AFTER' } });
  }
}
