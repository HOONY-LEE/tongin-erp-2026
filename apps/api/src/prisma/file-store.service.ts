import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaService } from './prisma.service';

/** 파일 내용을 담는 행 — bytes(DB 안) 또는 storageKey(S3) 중 하나 */
export type StoredFile = { bytes?: Uint8Array | null; storageKey?: string | null };

const PREFIX = 'files/';
/** 지운 파일을 S3에서 치우기 전 여유 — 막 올린(아직 행이 안 생긴) 파일을 건드리지 않게 */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** 파일을 담는 표 — 옮기기·정리할 때 차례로 돈다 */
const TABLES = [
  'work_photo',
  'ai_file',
  'agent_reference_file',
  'approval_attachment',
  'drive_content',
] as const;

/**
 * 파일 저장소. FILE_BUCKET이 있으면 S3(서울)에, 없으면 예전처럼 DB 안에 둔다(로컬 개발).
 * S3 키는 내용의 SHA-256 — 같은 파일은 한 번만 저장되고, 사본 만들기는 키만 복사한다.
 * 그래서 행을 지워도 바로 S3에서 지우지 않고, 하루 한 번 아무 행도 안 쓰는 키만 치운다
 * (버킷 버전 관리가 켜져 있어 치운 파일도 30일은 되살릴 수 있다).
 */
@Injectable()
export class FileStoreService implements OnModuleInit {
  private readonly log = new Logger('FileStore');
  private readonly bucket = process.env.FILE_BUCKET || '';
  private readonly s3 = this.bucket
    ? new S3Client({ region: process.env.FILE_BUCKET_REGION || 'ap-northeast-2' })
    : null;

  constructor(private readonly prisma: PrismaService) {}

  get enabled() {
    return !!this.s3;
  }

  /** 새 파일 — 행에 넣을 값({ bytes } 또는 { storageKey })을 돌려준다 */
  async put(
    buf: Buffer | Uint8Array,
    mediaType?: string,
  ): Promise<{ bytes: Uint8Array<ArrayBuffer> | null; storageKey: string | null }> {
    const data = Buffer.from(buf);
    if (!this.s3) return { bytes: new Uint8Array(data), storageKey: null };
    const key = PREFIX + createHash('sha256').update(data).digest('hex');
    const exists = await this.s3
      .send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: mediaType || 'application/octet-stream',
        }),
      );
    }
    return { bytes: null, storageKey: key };
  }

  /** 행의 파일 내용 */
  async read(row: StoredFile): Promise<Buffer> {
    if (row.bytes) return Buffer.from(row.bytes);
    if (!row.storageKey) throw new NotFoundException('파일 내용이 없습니다.');
    if (!this.s3) throw new NotFoundException('파일 저장소에 연결되어 있지 않습니다.');
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: row.storageKey }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  /** 사본 — 내용은 그대로, 키(또는 바이트)만 복사 */
  copyOf(row: { bytes: Uint8Array<ArrayBuffer> | null; storageKey: string | null }) {
    return { bytes: row.bytes, storageKey: row.storageKey };
  }

  onModuleInit() {
    if (!this.s3) return;
    // 서버 시작을 막지 않게 뒤에서 — DB 안에 남은 파일을 S3로 옮기고, 하루 한 번 정리
    setTimeout(() => void this.migrate().then(() => this.sweep()), 10_000);
    setInterval(() => void this.sweep(), 24 * 60 * 60 * 1000).unref();
  }

  /** DB 안(bytes)에 있는 파일을 S3로 옮긴다 — 몇 개씩, 끝날 때까지 */
  async migrate() {
    let moved = 0;
    try {
      for (const t of TABLES) {
        const pk = t === 'drive_content' ? 'item_id' : 'id';
        for (;;) {
          const rows = await this.prisma.$queryRawUnsafe<{ pk: string; bytes: Uint8Array }[]>(
            `SELECT "${pk}"::text AS pk, bytes FROM "${t}" WHERE bytes IS NOT NULL AND storage_key IS NULL LIMIT 20`,
          );
          if (!rows.length) break;
          for (const r of rows) {
            const { storageKey } = await this.put(r.bytes);
            await this.prisma.$executeRawUnsafe(
              `UPDATE "${t}" SET storage_key = $1, bytes = NULL WHERE "${pk}"::text = $2`,
              storageKey,
              r.pk,
            );
            moved++;
          }
        }
      }
      if (moved) this.log.log(`DB 안의 파일 ${moved}개를 S3로 옮김`);
    } catch (e) {
      this.log.warn(`S3로 옮기기 중단: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 어느 행도 안 쓰는 S3 파일 치우기(하루 지난 것만) */
  async sweep() {
    if (!this.s3) return;
    try {
      const used = new Set<string>();
      for (const t of TABLES) {
        const rows = await this.prisma.$queryRawUnsafe<{ k: string }[]>(
          `SELECT DISTINCT storage_key AS k FROM "${t}" WHERE storage_key IS NOT NULL`,
        );
        for (const r of rows) used.add(r.k);
      }
      // 직원 프로필 사진·계약서 수정 이력 문서(칸 이름이 다르다)
      const photos = await this.prisma.$queryRawUnsafe<{ k: string }[]>(
        `SELECT photo_key AS k FROM employee WHERE photo_key IS NOT NULL
         UNION SELECT doc_key FROM contract_revision WHERE doc_key IS NOT NULL`,
      );
      for (const r of photos) used.add(r.k);
      const cutoff = Date.now() - ORPHAN_GRACE_MS;
      const stale: string[] = [];
      let token: string | undefined;
      do {
        const page = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: PREFIX,
            ContinuationToken: token,
          }),
        );
        for (const o of page.Contents ?? []) {
          if (o.Key && !used.has(o.Key) && (o.LastModified?.getTime() ?? 0) < cutoff)
            stale.push(o.Key);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      for (let i = 0; i < stale.length; i += 1000) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: stale.slice(i, i + 1000).map((Key) => ({ Key })) },
          }),
        );
      }
      if (stale.length) this.log.log(`쓰지 않는 S3 파일 ${stale.length}개 정리`);
    } catch (e) {
      this.log.warn(`S3 정리 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
