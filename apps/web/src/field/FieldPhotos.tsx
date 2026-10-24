import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Images } from 'lucide-react';
import {
  WORK_PHOTO_KINDS,
  WORK_PHOTO_KIND_LABEL,
  type WorkPhotoKind,
  type WorkPhotoMeta,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { Button, Input, SegmentedControl, Spinner, useToast } from '../components/ui';
import { PhotoGrid, type PendingPhoto } from '../components/photos/PhotoGrid';
import {
  blobToBase64,
  forgetPhotoUrl,
  preparePhoto,
  primePhotoUrl,
} from '../components/photos/workPhotos';
import styles from '../components/photos/photos.module.css';

export type PhotoCounts = Record<WorkPhotoKind, number>;

const countBy = (photos: WorkPhotoMeta[]): PhotoCounts => {
  const c: PhotoCounts = { BEFORE: 0, AFTER: 0, DAMAGE: 0, ETC: 0 };
  photos.forEach((p) => (c[p.kind] = (c[p.kind] ?? 0) + 1));
  return c;
};

/**
 * 작업 사진 — 작업 전·후, 파손·하자를 찍어 남긴다(현장 폰).
 * 사진은 폰에서 긴 변 1600px JPEG로 줄여 한 장씩 올린다(모바일 데이터 절약).
 */
export function FieldPhotos({
  workOrderId,
  editable,
  initialKind = 'BEFORE',
  onCounts,
}: {
  workOrderId: string;
  /** 완료·취소된 작업은 보기만 */
  editable: boolean;
  initialKind?: WorkPhotoKind;
  onCounts?: (c: PhotoCounts) => void;
}) {
  const toast = useToast();
  const [photos, setPhotos] = useState<WorkPhotoMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<WorkPhotoKind>(initialKind);
  const [caption, setCaption] = useState('');
  const [pending, setPending] = useState<(PendingPhoto & { kind: WorkPhotoKind })[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setPhotos(await api<WorkPhotoMeta[]>(`/field/work-orders/${workOrderId}/photos`));
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '사진 목록을 불러오지 못했습니다',
      });
    } finally {
      setLoading(false);
    }
  }, [workOrderId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onCounts?.(countBy(photos));
  }, [photos, onCounts]);

  /** 고른 사진을 한 장씩 줄여서 올린다 — 실패한 장만 알려 주고 나머지는 계속 */
  const upload = async (files: File[], forKind: WorkPhotoKind, note: string) => {
    let ok = 0;
    for (const file of files) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let localUrl: string | null = null;
      try {
        const prepared = await preparePhoto(file);
        localUrl = URL.createObjectURL(prepared.blob);
        const url = localUrl;
        setPending((p) => [...p, { key, localUrl: url, kind: forKind }]);
        const meta = await api<WorkPhotoMeta>(`/field/work-orders/${workOrderId}/photos`, {
          method: 'POST',
          body: JSON.stringify({
            kind: forKind,
            caption: note || undefined,
            mediaType: 'image/jpeg',
            data: await blobToBase64(prepared.blob),
            width: prepared.width,
            height: prepared.height,
          }),
        });
        primePhotoUrl(meta.id, url); // 방금 올린 사진은 다시 내려받지 않는다
        setPending((p) => p.filter((x) => x.key !== key));
        setPhotos((ps) => [...ps, meta]);
        ok++;
      } catch (e) {
        const msg =
          e instanceof ApiError || e instanceof Error ? e.message : '사진을 올리지 못했습니다';
        toast({ type: 'error', title: `${file.name || '사진'}: ${msg}` });
        setPending((p) => p.map((x) => (x.key === key ? { ...x, error: msg } : x)));
        // 실패한 칸은 잠깐 보여 주고 치운다
        const failedUrl = localUrl;
        setTimeout(() => {
          setPending((p) => p.filter((x) => x.key !== key));
          if (failedUrl) URL.revokeObjectURL(failedUrl);
        }, 4000);
      }
    }
    if (ok > 0) {
      toast({
        type: 'success',
        title: `${WORK_PHOTO_KIND_LABEL[forKind]} 사진 ${ok}장을 올렸습니다`,
      });
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 사진을 다시 골라도 change가 나게
    if (!files.length) return;
    const note = caption.trim();
    setCaption('');
    void upload(files, kind, note);
  };

  const remove = async (photo: WorkPhotoMeta) => {
    try {
      await api(`/field/work-orders/${workOrderId}/photos/${photo.id}`, { method: 'DELETE' });
      forgetPhotoUrl(photo.id);
      setPhotos((ps) => ps.filter((p) => p.id !== photo.id));
      toast({ type: 'success', title: '사진을 지웠습니다' });
      return true;
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '사진을 지우지 못했습니다',
      });
      return false;
    }
  };

  const counts = countBy(photos);
  const shown = photos.filter((p) => p.kind === kind);
  const shownPending = pending.filter((p) => p.kind === kind);
  const uploading = pending.some((p) => !p.error);

  return (
    <section
      style={{
        padding: 16,
        borderRadius: 12,
        border: '1px solid var(--ark-color-gray-200)',
        background: 'var(--ark-color-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
        작업 사진 ({photos.length})
        {uploading && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--ark-color-text-tertiary)',
            }}
          >
            올리는 중…
          </span>
        )}
      </h2>

      <SegmentedControl
        fullWidth
        className={styles.kindTabs}
        value={kind}
        onChange={(v) => setKind(v as WorkPhotoKind)}
        options={WORK_PHOTO_KINDS.map((k) => ({
          value: k,
          label: (
            <span className={styles.kindLabel}>
              {WORK_PHOTO_KIND_LABEL[k]}
              <span className={styles.count}>{counts[k]}</span>
            </span>
          ),
        }))}
      />

      {editable && (
        <>
          <Input
            inputSize="lg"
            placeholder="사진 설명(선택) — 예: 거실 장식장 모서리 찍힘"
            value={caption}
            maxLength={200}
            onChange={(e) => setCaption(e.target.value)}
            aria-label="사진 설명"
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              size="lg"
              onClick={() => cameraRef.current?.click()}
              style={{ flex: 2, height: 52, fontSize: 16, fontWeight: 700 }}
            >
              <Camera size={20} style={{ marginRight: 6 }} />
              {WORK_PHOTO_KIND_LABEL[kind]} 사진 찍기
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => albumRef.current?.click()}
              style={{ flex: 1, height: 52, fontSize: 15 }}
            >
              <Images size={18} style={{ marginRight: 6 }} />
              앨범
            </Button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={onPick}
          />
          <input ref={albumRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
        </>
      )}

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <Spinner size="sm" />
        </div>
      ) : (
        <PhotoGrid
          photos={shown}
          pending={shownPending}
          onDelete={editable ? remove : undefined}
          emptyText={`${WORK_PHOTO_KIND_LABEL[kind]} 사진이 없습니다`}
        />
      )}
    </section>
  );
}
