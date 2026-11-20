import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, RotateCw, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button, Modal } from '../ui';
import styles from './PhotoCropModal.module.css';

/** 자르는 칸(정사각형) 크기와 저장 크기 */
const VP = 280;
const OUT = 512;
const MAX_ZOOM = 4;

type Img = { el: HTMLImageElement; url: string; w: number; h: number };

/**
 * 프로필 사진 자르기 — 사진 고르기(끌어다 놓기도) → 끌어서 위치, 확대 막대·휠·핀치로 크기, 90° 회전
 * → 원 안이 프로필로 저장된다(정사각형 512px JPEG, 표시는 원형).
 */
export function PhotoCropModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  /** 잘라 만든 사진(JPEG base64, 미리보기용 blob URL) */
  onSave: (jpegBase64: string, previewUrl: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<Img | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0); // 0 | 90 | 180 | 270
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // 닫으면 비운다
  useEffect(() => {
    if (open) return;
    setImg((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return null;
    });
    setError(null);
  }, [open]);

  /** 돌린 뒤의 가로·세로 */
  const dims = img ? (rot % 180 === 0 ? { w: img.w, h: img.h } : { w: img.h, h: img.w }) : null;
  /** 칸을 꽉 채우는 기본 배율 × 확대 */
  const scale = dims ? Math.max(VP / dims.w, VP / dims.h) * zoom : 1;

  /** 사진이 칸 밖으로 빠져 빈 곳이 생기지 않게 */
  const clamp = useCallback(
    (p: { x: number; y: number }, s = scale) => {
      if (!dims) return p;
      const mx = Math.max(0, (dims.w * s - VP) / 2);
      const my = Math.max(0, (dims.h * s - VP) / 2);
      return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
    },
    [dims, scale],
  );

  useEffect(() => {
    setPos((p) => clamp(p));
  }, [clamp]);

  const load = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError(
        file.type === 'image/heic' || /\.heic$/i.test(file.name)
          ? 'HEIC 사진은 바로 쓸 수 없습니다. JPG·PNG로 바꿔 올려 주세요.'
          : 'JPG·PNG·WebP 사진만 쓸 수 있습니다.',
      );
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('20MB보다 작은 사진을 골라 주세요.');
      return;
    }
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg((cur) => {
        if (cur) URL.revokeObjectURL(cur.url);
        return { el, url, w: el.naturalWidth, h: el.naturalHeight };
      });
      setZoom(1);
      setRot(0);
      setPos({ x: 0, y: 0 });
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      setError('사진을 열 수 없습니다.');
    };
    el.src = url;
  };

  const setZoomKeep = (z: number) => setZoom(Math.min(MAX_ZOOM, Math.max(1, z)));

  // ── 끌어서 옮기기 · 두 손가락 핀치 ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current = null;
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setZoomKeep((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
    } else if (drag.current) {
      const d = drag.current;
      setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!img) return;
    setZoomKeep(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  };

  /** 미리보기·저장에 같은 변환 — 칸 크기 size 기준 */
  const transform = (size: number) =>
    `translate(-50%, -50%) translate(${(pos.x * size) / VP}px, ${(pos.y * size) / VP}px) rotate(${rot}deg) scale(${(scale * size) / VP})`;

  const save = async () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(OUT / 2, OUT / 2);
    ctx.scale(OUT / VP, OUT / VP);
    ctx.translate(pos.x, pos.y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img.el, -img.w / 2, -img.h / 2);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) return setError('사진을 만들지 못했습니다.');
    const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    setSaving(true);
    try {
      await onSave(base64, URL.createObjectURL(blob));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const picture = (size: number) =>
    img && (
      <img
        src={img.url}
        alt=""
        draggable={false}
        className={styles.img}
        style={{ width: img.w, height: img.h, transform: transform(size) }}
      />
    );

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="프로필 사진"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!img || saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(e) => {
          load(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className={styles.wrap}>
        <div
          className={`${styles.stage} ${dragOver ? styles.stageDrop : ''} ${img ? styles.stageReady : ''}`}
          style={{ width: VP, height: VP }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            load(e.dataTransfer.files?.[0]);
          }}
          onClick={() => !img && fileRef.current?.click()}
        >
          {img ? (
            <>
              {picture(VP)}
              {/* 원 밖은 어둡게 — 원 안이 프로필로 보인다 */}
              <div className={styles.mask} aria-hidden />
            </>
          ) : (
            <div className={styles.empty}>
              <ImagePlus size={28} aria-hidden />
              <b>사진 고르기</b>
              <span>누르거나 여기로 끌어다 놓으세요</span>
            </div>
          )}
        </div>

        <div className={styles.side}>
          <div className={styles.previews}>
            {[72, 40].map((s) => (
              <div key={s} className={styles.preview} style={{ width: s, height: s }}>
                {picture(s)}
              </div>
            ))}
          </div>
          <p className={styles.hint}>
            사진을 끌어서 위치를 맞추고, 아래 막대나 마우스 휠로 크기를 조절하세요.
          </p>
          <div className={styles.zoom}>
            <button
              type="button"
              aria-label="축소"
              disabled={!img}
              onClick={() => setZoomKeep(zoom - 0.2)}
            >
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={!img}
              onChange={(e) => setZoomKeep(Number(e.target.value))}
              aria-label="확대"
            />
            <button
              type="button"
              aria-label="확대"
              disabled={!img}
              onClick={() => setZoomKeep(zoom + 0.2)}
            >
              <ZoomIn size={16} />
            </button>
          </div>
          <div className={styles.tools}>
            <Button
              variant="outline"
              size="sm"
              disabled={!img}
              onClick={() => setRot((r) => (r + 90) % 360)}
            >
              <RotateCw size={14} /> 90° 회전
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!img}
              onClick={() => {
                setZoom(1);
                setRot(0);
                setPos({ x: 0, y: 0 });
              }}
            >
              <Undo2 size={14} /> 처음대로
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={14} /> 다른 사진
            </Button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
