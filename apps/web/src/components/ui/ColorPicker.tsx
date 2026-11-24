import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Pipette } from 'lucide-react';
import styles from './ColorPicker.module.css';

/**
 * 색 고르기 — 피그마처럼 채도·밝기 판 + 색상 띠 + HEX 입력 + 자주 쓰는 색.
 * 값은 '#rrggbb'. 단추 모양은 부르는 쪽이 children으로 그린다.
 */
export interface ColorPickerProps {
  value: string | null | undefined;
  onChange: (hex: string) => void;
  /** 아래 줄에 깔리는 자주 쓰는 색 */
  presets?: { hex: string; label: string }[];
  className?: string;
  style?: CSSProperties;
  title?: string;
  'aria-label'?: string;
  children?: ReactNode;
}

type Hsv = { h: number; s: number; v: number };

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export const isHex = (s: unknown): s is string =>
  typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (k: number) => {
    const kk = (k + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1));
  };
  return (
    '#' +
    [f(5), f(3), f(1)]
      .map((x) =>
        Math.round(x * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

export function ColorPicker({
  value,
  onChange,
  presets = [],
  className,
  style,
  title,
  children,
  ...rest
}: ColorPickerProps) {
  const { t } = useTranslation();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(isHex(value) ? value : '#fc753c'));
  const [text, setText] = useState('');

  // 열 때 지금 값으로 맞춘다(회색이면 색상 띠 위치는 그대로 둔다)
  useEffect(() => {
    if (!open) return;
    const hex = isHex(value) ? value : hsvToHex(hsv);
    const next = hexToHsv(hex);
    setHsv((p) => (next.s === 0 || next.v === 0 ? { ...next, h: p.h } : next));
    setText(hex.slice(1).toUpperCase());
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const w = pop.current?.offsetWidth ?? 240;
      const h = pop.current?.offsetHeight ?? 320;
      const below = r.bottom + 6 + h <= window.innerHeight - 8;
      const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const n = e.target as Node;
      if (pop.current?.contains(n) || btn.current?.contains(n)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const commit = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setText(hex.slice(1).toUpperCase());
    onChange(hex);
  };
  const setHex = (hex: string) => {
    const next = hexToHsv(hex);
    setHsv((p) => (next.s === 0 || next.v === 0 ? { ...next, h: p.h } : next));
    setText(hex.slice(1).toUpperCase());
    onChange(hex.toLowerCase());
  };

  // 끌기 — 판과 띠 공통
  const drag = (apply: (x: number, y: number) => void) => (e: RPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      apply(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height));
    };
    move(e);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const cur = hsvToHex(hsv);
  const eyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={className}
        style={style}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={rest['aria-label']}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className={styles.pop}
            data-floating=""
            role="dialog"
            aria-label={t('picker.pickColor')}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
          >
            <div
              className={styles.sv}
              style={{ background: hueHex }}
              onPointerDown={drag((x, y) => commit({ ...hsv, s: x, v: 1 - y }))}
            >
              <span
                className={styles.svThumb}
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: cur }}
              />
            </div>
            <div className={styles.row}>
              {eyeDropper && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  title={t('picker.eyeDropper')}
                  aria-label={t('picker.eyeDropper')}
                  onClick={async () => {
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const r = await new (window as any).EyeDropper().open();
                      if (isHex(r?.sRGBHex)) setHex(r.sRGBHex);
                    } catch {
                      /* 취소 */
                    }
                  }}
                >
                  <Pipette size={14} />
                </button>
              )}
              <div
                className={styles.hue}
                role="slider"
                aria-label={t('picker.hue')}
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={Math.round(hsv.h)}
                tabIndex={0}
                onKeyDown={(e) => {
                  const d = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
                  if (!d) return;
                  e.preventDefault();
                  commit({ ...hsv, h: (hsv.h + d + 360) % 360 });
                }}
                onPointerDown={drag((x) => commit({ ...hsv, h: Math.min(359.9, x * 360) }))}
              >
                <span
                  className={styles.hueThumb}
                  style={{ left: `${(hsv.h / 360) * 100}%`, background: hueHex }}
                />
              </div>
            </div>
            <div className={styles.row}>
              <span className={styles.chip} style={{ background: cur }} />
              <span className={styles.hash}>#</span>
              <input
                className={styles.hex}
                value={text}
                maxLength={7}
                spellCheck={false}
                aria-label="HEX"
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                  setText(v.toUpperCase());
                  if (v.length === 6) setHex(`#${v}`);
                }}
                onBlur={() => setText(cur.slice(1).toUpperCase())}
              />
            </div>
            {presets.length > 0 && (
              <div className={styles.presets}>
                {presets.map((p) => (
                  <button
                    key={p.hex + p.label}
                    type="button"
                    className={styles.preset}
                    style={{ background: p.hex }}
                    title={p.label}
                    aria-label={p.label}
                    onClick={() => setHex(p.hex)}
                  />
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
