import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Clock, X } from 'lucide-react';
import dp from './DatePicker.module.css';
import styles from './TimePicker.module.css';

/**
 * 시각 고르기 — 브라우저 기본 시각 입력 대신 앱 공통(날짜 고르기와 같은 모양).
 * 값은 'HH:mm'(24시간), 비우면 ''. 누르면 시·분 두 줄 목록이 뜨고, 분을 고르면 닫힌다.
 */
export interface TimePickerProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 분 간격(기본 5분) — 지금 값이 간격에 안 맞아도 목록에 넣어 보여 준다 */
  minuteStep?: number;
  /** 지우기(×) — 기본 끔 */
  clearable?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
  label?: ReactNode;
  id?: string;
  'aria-label'?: string;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const parse = (v: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(v ?? '');
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
};

export function TimePicker({
  value,
  onChange,
  placeholder,
  disabled,
  minuteStep = 5,
  clearable = false,
  size = 'md',
  className,
  style,
  label,
  id,
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const { t } = useTranslation();
  const autoId = useId();
  const btnId = id ?? (label ? autoId : undefined);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const hourCol = useRef<HTMLDivElement>(null);
  const minCol = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cur = parse(value);
  /** 시를 먼저 골랐을 때(분은 아직) */
  const [hour, setHour] = useState<number | null>(null);
  const shownHour = hour ?? cur?.h ?? null;

  const minutes = (() => {
    const list = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
    if (cur && !list.includes(cur.m)) list.push(cur.m);
    return list.sort((a, b) => a - b);
  })();

  const close = (refocus = true) => {
    setOpen(false);
    setHour(null);
    if (refocus) btn.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const w = pop.current?.offsetWidth ?? 180;
      const h = pop.current?.offsetHeight ?? 260;
      const below = r.bottom + 6 + h <= window.innerHeight - 8;
      setPos({
        top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h),
        left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // 열면 고른 시·분이 목록 가운데 오게
  useEffect(() => {
    if (!open) return;
    pop.current?.focus();
    for (const col of [hourCol.current, minCol.current]) {
      const on = col?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (col && on) col.scrollTop = on.offsetTop - col.clientHeight / 2 + on.offsetHeight / 2;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const n = e.target as Node;
      if (pop.current?.contains(n) || btn.current?.contains(n)) return;
      close(false);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const pickHour = (h: number) => {
    setHour(h);
    // 분이 이미 있으면 시만 바꿔 바로 반영(창은 열어 둔다)
    onChange(`${p2(h)}:${p2(cur?.m ?? 0)}`);
  };
  const pickMinute = (m: number) => {
    const h = shownHour ?? 9;
    onChange(`${p2(h)}:${p2(m)}`);
    close();
  };
  const now = () => {
    const d = new Date();
    onChange(`${p2(d.getHours())}:${p2(d.getMinutes())}`);
    close();
  };

  const shown = cur ? `${p2(cur.h)}:${p2(cur.m)}` : '';

  return (
    <span className={label ? dp.labeled : dp.bare}>
      {label && (
        <label htmlFor={btnId} className={dp.label}>
          {label}
        </label>
      )}
      <span className={`${dp.field} ${dp[size]} ${className ?? ''}`} style={style}>
        <button
          ref={btn}
          id={btnId}
          type="button"
          className={`${dp.trigger} ${open ? dp.triggerOpen : ''}`}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel ?? t('picker.pickTime')}
          onClick={() => (open ? close() : !disabled && setOpen(true))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className={shown ? dp.value : dp.placeholder}>
            {shown || placeholder || '--:--'}
          </span>
          <Clock size={15} className={dp.icon} aria-hidden />
        </button>
        {clearable && shown && !disabled && (
          <button
            type="button"
            className={dp.clear}
            aria-label={t('picker.clear')}
            onClick={() => onChange('')}
          >
            <X size={13} />
          </button>
        )}
      </span>
      {open &&
        createPortal(
          <div
            ref={pop}
            className={`${dp.pop} ${styles.pop}`}
            data-floating=""
            role="dialog"
            aria-label={t('picker.pickTime')}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
          >
            <div className={styles.cols}>
              <div
                ref={hourCol}
                className={styles.col}
                role="listbox"
                aria-label={t('picker.hour')}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <button
                    key={h}
                    type="button"
                    role="option"
                    aria-selected={h === shownHour}
                    className={`${styles.item} ${h === shownHour ? styles.on : ''}`}
                    onClick={() => pickHour(h)}
                  >
                    {p2(h)}
                  </button>
                ))}
              </div>
              <div
                ref={minCol}
                className={styles.col}
                role="listbox"
                aria-label={t('picker.minute')}
              >
                {minutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={!!cur && m === cur.m}
                    className={`${styles.item} ${cur && m === cur.m ? styles.on : ''}`}
                    onClick={() => pickMinute(m)}
                  >
                    {p2(m)}
                  </button>
                ))}
              </div>
            </div>
            <div className={dp.foot}>
              <button type="button" className={dp.footBtn} onClick={now}>
                {t('picker.now')}
              </button>
              {clearable && (
                <button
                  type="button"
                  className={`${dp.footBtn} ${dp.footMuted}`}
                  onClick={() => {
                    onChange('');
                    close();
                  }}
                >
                  {t('picker.clear')}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
