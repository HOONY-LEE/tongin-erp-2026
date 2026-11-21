import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import styles from './DatePicker.module.css';

/**
 * 날짜 고르기 — 브라우저 기본 달력 대신 앱 공통(애플 느낌) 달력.
 * 값은 브라우저 date 입력과 같은 글자: 'YYYY-MM-DD'(mode='month'면 'YYYY-MM'), 비우면 ''.
 * 입력칸 모양은 공통 Input과 같고, 누르면 아래(자리가 없으면 위)에 달력이 뜬다.
 */
export interface DatePickerProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  mode?: 'date' | 'month';
  placeholder?: string;
  disabled?: boolean;
  /** 고를 수 있는 처음·끝(같은 형식) */
  min?: string;
  max?: string;
  /** 지우기(×) — 날짜는 기본 켬, 월은 기본 끔 */
  clearable?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
  /** 위에 붙는 이름(공통 Input의 label과 같은 모양) */
  label?: ReactNode;
  id?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const ym = (y: number, m: number) => `${y}-${p2(m + 1)}`;
const parse = (v: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v ?? '');
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: m[3] ? Number(m[3]) : 1 } : null;
};

export function DatePicker({
  value,
  onChange,
  mode = 'date',
  placeholder,
  disabled,
  min,
  max,
  clearable: clearableProp,
  size = 'md',
  className,
  style,
  label,
  id,
  'aria-label': ariaLabel,
  autoFocus,
}: DatePickerProps) {
  const { t, i18n } = useTranslation();
  // 월 고르기는 보통 필터라 비우지 않는다(날짜는 지우기 가능)
  const clearable = clearableProp ?? mode === 'date';
  const lang = i18n.language === 'zh' ? 'zh-CN' : i18n.language === 'en' ? 'en-US' : 'ko-KR';
  const autoId = useId();
  const btnId = id ?? (label ? autoId : undefined);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cur = parse(value);
  const today = new Date();
  // 보고 있는 달(날짜 모드) · 해(월 모드)
  const [view, setView] = useState(() => ({
    y: cur?.y ?? today.getFullYear(),
    m: cur?.m ?? today.getMonth(),
  }));
  /** 키보드로 옮겨 다니는 날 */
  const [focusDay, setFocusDay] = useState<string | null>(null);

  const openPicker = () => {
    if (disabled) return;
    const c = parse(value);
    setView({ y: c?.y ?? today.getFullYear(), m: c?.m ?? today.getMonth() });
    setFocusDay(mode === 'date' ? value || ymd(today) : null);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  // 자리 잡기 — 입력칸 바로 아래, 화면 밖이면 위·왼쪽으로 당긴다
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const w = pop.current?.offsetWidth ?? 280;
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
  }, [open, view.y, view.m]);

  // 바깥을 누르면 닫는다
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

  const inRange = (v: string) =>
    (!min || v >= min.slice(0, v.length)) && (!max || v <= max.slice(0, v.length));
  const pick = (v: string) => {
    if (!inRange(v)) return;
    onChange(v);
    close();
  };

  const title = useMemo(
    () =>
      mode === 'month'
        ? new Intl.DateTimeFormat(lang, { year: 'numeric' }).format(new Date(view.y, 0, 1))
        : new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long' }).format(
            new Date(view.y, view.m, 1),
          ),
    [lang, mode, view.y, view.m],
  );
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(lang, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 7 + i)));
  }, [lang]);
  const monthNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(lang, { month: 'short' });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(2024, i, 1)));
  }, [lang]);

  // 6주(42칸) — 앞뒤 달의 날은 흐리게
  const days = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const start = new Date(view.y, view.m, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { d, v: ymd(d), out: d.getMonth() !== view.m };
    });
  }, [view.y, view.m]);

  const shift = (n: number) =>
    setView((x) => {
      if (mode === 'month') return { ...x, y: x.y + n };
      const d = new Date(x.y, x.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // 키보드 — 화살표로 날 옮기기, Enter 고르기, Esc 닫기, PageUp/Down 달 넘기기
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (mode !== 'date' || !focusDay) return;
    const f = parse(focusDay)!;
    const move: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in move || e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const d =
        e.key === 'PageUp' || e.key === 'PageDown'
          ? new Date(f.y, f.m + (e.key === 'PageUp' ? -1 : 1), f.d)
          : new Date(f.y, f.m, f.d + move[e.key]);
      setFocusDay(ymd(d));
      setView({ y: d.getFullYear(), m: d.getMonth() });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(focusDay);
    }
  };
  useEffect(() => {
    if (open) pop.current?.focus();
  }, [open]);

  const todayV = mode === 'month' ? ym(today.getFullYear(), today.getMonth()) : ymd(today);
  const shown = value ? value : '';

  return (
    <span className={label ? styles.labeled : styles.bare}>
      {label && (
        <label htmlFor={btnId} className={styles.label}>
          {label}
        </label>
      )}
      <span className={`${styles.field} ${styles[size]} ${className ?? ''}`} style={style}>
        <button
          ref={btn}
          id={btnId}
          type="button"
          className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={
            ariaLabel ?? (mode === 'month' ? t('picker.pickMonth') : t('picker.pickDate'))
          }
          autoFocus={autoFocus}
          onClick={() => (open ? close() : openPicker())}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              openPicker();
            }
          }}
        >
          <span className={shown ? styles.value : styles.placeholder}>
            {shown || placeholder || (mode === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD')}
          </span>
          <CalendarDays size={15} className={styles.icon} aria-hidden />
        </button>
        {clearable && shown && !disabled && (
          <button
            type="button"
            className={styles.clear}
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
            className={styles.pop}
            data-floating=""
            role="dialog"
            aria-label={mode === 'month' ? t('picker.pickMonth') : t('picker.pickDate')}
            tabIndex={-1}
            onKeyDown={onKey}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
          >
            <div className={styles.head}>
              <b>{title}</b>
              <span className={styles.nav}>
                <button type="button" aria-label={t('picker.prev')} onClick={() => shift(-1)}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" aria-label={t('picker.next')} onClick={() => shift(1)}>
                  <ChevronRight size={16} />
                </button>
              </span>
            </div>
            {mode === 'month' ? (
              <div className={styles.months}>
                {monthNames.map((name, i) => {
                  const v = ym(view.y, i);
                  return (
                    <button
                      key={v}
                      type="button"
                      disabled={!inRange(v)}
                      className={[
                        styles.month,
                        v === shown ? styles.selected : '',
                        v === todayV ? styles.today : '',
                      ].join(' ')}
                      onClick={() => pick(v)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.grid} role="grid">
                {weekdays.map((w, i) => (
                  <span
                    key={i}
                    className={`${styles.dow} ${i === 0 ? styles.sun : i === 6 ? styles.sat : ''}`}
                  >
                    {w}
                  </span>
                ))}
                {days.map(({ d, v, out }) => (
                  <button
                    key={v}
                    type="button"
                    role="gridcell"
                    tabIndex={-1}
                    disabled={!inRange(v)}
                    aria-selected={v === shown}
                    className={[
                      styles.day,
                      out ? styles.out : '',
                      d.getDay() === 0 ? styles.sun : d.getDay() === 6 ? styles.sat : '',
                      v === todayV ? styles.today : '',
                      v === shown ? styles.selected : '',
                      v === focusDay ? styles.focused : '',
                    ].join(' ')}
                    onClick={() => pick(v)}
                    onMouseEnter={() => setFocusDay(v)}
                  >
                    {d.getDate()}
                  </button>
                ))}
              </div>
            )}
            <div className={styles.foot}>
              <button type="button" className={styles.footBtn} onClick={() => pick(todayV)}>
                {mode === 'month' ? t('picker.thisMonth') : t('picker.today')}
              </button>
              {clearable && (
                <button
                  type="button"
                  className={`${styles.footBtn} ${styles.footMuted}`}
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
