import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Trash2, X } from 'lucide-react';
import { WORK_PHOTO_KIND_LABEL, type WorkPhotoMeta } from '@tongin/shared';
import { Spinner } from '../ui';
import { usePhotoUrl } from './workPhotos';
import styles from './photos.module.css';

/** 올리는 중인 사진 — 줄인 로컬 이미지를 바로 보여 주고 위에 진행 표시 */
export interface PendingPhoto {
  key: string;
  localUrl: string;
  error?: string;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
};

function Thumb({ photo, onOpen }: { photo: WorkPhotoMeta; onOpen: () => void }) {
  const { url, failed } = usePhotoUrl(photo.id);
  return (
    <button
      type="button"
      className={styles.tile}
      onClick={onOpen}
      aria-label={`${WORK_PHOTO_KIND_LABEL[photo.kind]} 사진 크게 보기${photo.caption ? ` — ${photo.caption}` : ''}`}
    >
      {url ? (
        <img src={url} alt="" className={styles.img} />
      ) : failed ? (
        <ImageOff size={20} className={styles.muted} />
      ) : (
        <Spinner size="sm" />
      )}
      {photo.caption && <span className={styles.caption}>{photo.caption}</span>}
    </button>
  );
}

/**
 * 사진 격자 — 누르면 크게 보기(좌우 넘기기). onDelete가 있으면 크게 보기에서 지울 수 있다.
 * 현장·관리자 화면이 같이 쓴다.
 */
export function PhotoGrid({
  photos,
  pending = [],
  onDelete,
  emptyText = '사진이 없습니다',
}: {
  photos: WorkPhotoMeta[];
  pending?: PendingPhoto[];
  onDelete?: (photo: WorkPhotoMeta) => Promise<boolean>;
  emptyText?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  // 지워서 목록이 줄면 크게 보기 위치를 맞춘다
  useEffect(() => {
    if (open !== null && open >= photos.length) setOpen(photos.length ? photos.length - 1 : null);
  }, [open, photos.length]);

  if (!photos.length && !pending.length) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  return (
    <>
      <div className={styles.grid}>
        {photos.map((p, i) => (
          <Thumb key={p.id} photo={p} onOpen={() => setOpen(i)} />
        ))}
        {pending.map((p) => (
          <div key={p.key} className={styles.tile} aria-busy={!p.error}>
            <img src={p.localUrl} alt="" className={styles.img} style={{ opacity: 0.55 }} />
            <span className={styles.overlay}>
              {p.error ? <span className={styles.failText}>실패</span> : <Spinner size="sm" />}
            </span>
          </div>
        ))}
      </div>
      {open !== null && photos[open] && (
        <Lightbox
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  onDelete,
}: {
  photos: WorkPhotoMeta[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete?: (photo: WorkPhotoMeta) => Promise<boolean>;
}) {
  const photo = photos[index];
  const { url, failed } = usePhotoUrl(photo.id);
  const [busy, setBusy] = useState(false);
  const prev = useCallback(() => index > 0 && onIndex(index - 1), [index, onIndex]);
  const next = useCallback(
    () => index < photos.length - 1 && onIndex(index + 1),
    [index, photos.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  // 좌우로 밀어 넘기기(현장 폰)
  const [touchX, setTouchX] = useState<number | null>(null);

  const remove = async () => {
    if (!onDelete || busy) return;
    if (!window.confirm('이 사진을 지울까요? 지우면 되돌릴 수 없습니다.')) return;
    setBusy(true);
    try {
      if ((await onDelete(photo)) && photos.length <= 1) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      onClick={onClose}
      onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x = e.changedTouches[0]?.clientX;
        if (touchX !== null && x !== undefined) {
          if (x - touchX > 50) prev();
          else if (touchX - x > 50) next();
        }
        setTouchX(null);
      }}
    >
      <div className={styles.lbTop} onClick={(e) => e.stopPropagation()}>
        <span>
          {WORK_PHOTO_KIND_LABEL[photo.kind]} · {index + 1}/{photos.length}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          {onDelete && (
            <button
              type="button"
              className={styles.lbBtn}
              onClick={() => void remove()}
              disabled={busy}
              aria-label="사진 지우기"
            >
              {busy ? <Spinner size="sm" /> : <Trash2 size={20} />}
            </button>
          )}
          <button type="button" className={styles.lbBtn} onClick={onClose} aria-label="닫기">
            <X size={22} />
          </button>
        </span>
      </div>
      <div className={styles.lbStage}>
        {url ? (
          <img
            src={url}
            alt={photo.caption ?? WORK_PHOTO_KIND_LABEL[photo.kind]}
            className={styles.lbImg}
            onClick={(e) => e.stopPropagation()}
          />
        ) : failed ? (
          <span className={styles.lbInfo}>사진을 불러오지 못했습니다</span>
        ) : (
          <Spinner />
        )}
        {index > 0 && (
          <button
            type="button"
            className={`${styles.lbBtn} ${styles.lbPrev}`}
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="이전 사진"
          >
            <ChevronLeft size={28} />
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            type="button"
            className={`${styles.lbBtn} ${styles.lbNext}`}
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="다음 사진"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>
      <div className={styles.lbInfo} onClick={(e) => e.stopPropagation()}>
        {photo.caption && <div className={styles.lbCaption}>{photo.caption}</div>}
        <div>
          {photo.uploadedBy} · {when(photo.createdAt)}
        </div>
      </div>
    </div>
  );
}
