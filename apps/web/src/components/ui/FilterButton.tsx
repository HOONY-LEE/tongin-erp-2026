import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { ChoiceChips, CheckChips, type ChoiceOption } from './ChoiceChips';
import { DatePicker } from './DatePicker';
import styles from './FilterButton.module.css';

/**
 * 검색 옆 필터 — 앱 공통. 버튼을 누르면 날짜 범위·여러 개 고르기·하나 고르기 조건을 한 창에서 고른다.
 * 고르는 즉시 목록에 반영되고, 고른 조건 수가 버튼에 붙는다. 목록 거르기는 filterRows로.
 *
 *   const FIELDS: FilterField[] = [{ key: 'createdAt', label: '접수일', type: 'date' }, …];
 *   <DataTable filters={<FilterButton fields={FIELDS} value={f} onChange={setF} />} … />
 *   const shown = filterRows(rows, FIELDS, f, (r, key) => r[key]);
 */
/** on = 어느 날짜 칸으로 거를지(date 필드에 options가 있을 때, 비우면 첫 번째) */
export type DateRange = { from?: string; to?: string; on?: string };
export type FilterField =
  | { key: string; label: string; type: 'date'; options?: ChoiceOption[] }
  | { key: string; label: string; type: 'multi'; options: ChoiceOption[] }
  | { key: string; label: string; type: 'single'; options: ChoiceOption[] };
export type FilterValues = Record<string, DateRange | string[] | string | undefined>;

const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** 날짜 칸 값(ISO·Date·'YYYY-MM-DD') → 이 컴퓨터 기준 'YYYY-MM-DD' */
const dayOf = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : ymd(d);
};

const isOn = (f: FilterField, v: FilterValues[string]) => {
  if (f.type === 'date') {
    // 날짜 칸만 바꾸고 기간이 없으면 거르지 않는다
    const r = v as DateRange | undefined;
    return !!(r?.from || r?.to);
  }
  if (f.type === 'multi') return ((v as string[] | undefined) ?? []).length > 0;
  return !!v;
};

export const activeFilterCount = (fields: FilterField[], values: FilterValues) =>
  fields.filter((f) => isOn(f, values[f.key])).length;

/** 고른 조건에 맞는 행만 — get(row, key)는 그 조건 칸의 값(날짜는 ISO/'YYYY-MM-DD', 나머지는 문자열) */
export function filterRows<R>(
  rows: R[],
  fields: FilterField[],
  values: FilterValues,
  get: (row: R, key: string) => unknown,
): R[] {
  const on = fields.filter((f) => isOn(f, values[f.key]));
  if (!on.length) return rows;
  return rows.filter((row) =>
    on.every((f) => {
      const v = get(row, f.key);
      if (f.type === 'date') {
        const r = values[f.key] as DateRange;
        const d = dayOf(f.options?.length ? get(row, r.on ?? f.options[0].value) : v);
        if (!d) return false;
        return (!r.from || d >= r.from) && (!r.to || d <= r.to);
      }
      if (f.type === 'multi') return (values[f.key] as string[]).includes(String(v ?? ''));
      return String(v ?? '') === values[f.key];
    }),
  );
}

type PresetKey = 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth';
function datePresets(): { key: PresetKey; range: DateRange }[] {
  const now = new Date();
  const today = ymd(now);
  const back = (n: number) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  const y = now.getFullYear();
  const m = now.getMonth();
  return [
    { key: 'today', range: { from: today, to: today } },
    { key: 'last7', range: { from: back(6), to: today } },
    { key: 'last30', range: { from: back(29), to: today } },
    { key: 'thisMonth', range: { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) } },
    { key: 'lastMonth', range: { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) } },
  ];
}

function DateField({
  value,
  onChange,
  targets,
}: {
  value: DateRange | undefined;
  onChange: (v: DateRange | undefined) => void;
  targets?: ChoiceOption[];
}) {
  const { t } = useTranslation();
  const presets = datePresets();
  const picked = presets.find((p) => p.range.from === value?.from && p.range.to === value?.to);
  // 날짜 칸 고르기(접수일·이사일…)는 기간을 비워도 기억한다
  const set = (r: DateRange) => onChange(r.from || r.to || r.on ? r : undefined);
  const on = value?.on ?? targets?.[0]?.value;
  return (
    <>
      {targets && targets.length > 1 && (
        <ChoiceChips
          value={on}
          onChange={(v) => set({ ...value, on: v === targets[0].value ? undefined : v })}
          options={targets}
        />
      )}
      <ChoiceChips
        size="sm"
        value={picked?.key ?? ''}
        onChange={(k) => {
          // 고른 기간을 한 번 더 누르면 풀린다
          const p = presets.find((x) => x.key === k)!;
          set(picked?.key === k ? { on: value?.on } : { ...p.range, on: value?.on });
        }}
        options={presets.map((p) => ({ value: p.key, label: t(`filter.${p.key}`) }))}
      />
      <div className={styles.range}>
        <DatePicker
          size="sm"
          value={value?.from ?? ''}
          max={value?.to || undefined}
          placeholder={t('filter.from')}
          aria-label={t('filter.from')}
          onChange={(v) => set({ ...value, from: v || undefined })}
        />
        ~
        <DatePicker
          size="sm"
          value={value?.to ?? ''}
          min={value?.from || undefined}
          placeholder={t('filter.to')}
          aria-label={t('filter.to')}
          onChange={(v) => set({ ...value, to: v || undefined })}
        />
      </div>
    </>
  );
}

/** 선택지가 많으면(지점·거래처 수백 곳) 찾기 칸으로 좁히고, 고른 것은 늘 보이게 */
const MANY = 16;
function MultiField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ChoiceOption[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useTranslation();
  const [find, setFind] = useState('');
  const many = options.length > MANY;
  const k = find.trim().toLowerCase();
  const shown = !many
    ? options
    : options.filter(
        (o) => value.includes(o.value) || (k && String(o.label).toLowerCase().includes(k)),
      );
  return (
    <>
      {many && (
        <input
          className={styles.find}
          type="search"
          value={find}
          placeholder={t('filter.find', { v0: options.length })}
          aria-label={label}
          onChange={(e) => setFind(e.target.value)}
        />
      )}
      {shown.length > 0 && (
        <CheckChips
          size="sm"
          aria-label={label}
          value={value}
          onChange={onChange}
          options={shown.slice(0, 60)}
        />
      )}
    </>
  );
}

export function FilterButton({
  fields,
  value,
  onChange,
  limited,
}: {
  fields: FilterField[];
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  /** 서버가 한도(1,000건)까지 보냈다 — 버튼 옆에 '조건을 좁혀 주세요' */
  limited?: boolean;
}) {
  const { t } = useTranslation();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const count = activeFilterCount(fields, value);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const w = pop.current?.offsetWidth ?? 400;
      setPos({
        top: r.bottom + 6,
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

  useEffect(() => {
    if (!open) return;
    pop.current?.focus();
    const down = (e: MouseEvent) => {
      const n = e.target as Element;
      // 창 안의 날짜 달력(포털)은 바깥이 아니다
      if (pop.current?.contains(n) || btn.current?.contains(n) || n.closest?.('[data-floating]'))
        return;
      close(false);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const set = (key: string, v: FilterValues[string]) => onChange({ ...value, [key]: v });

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`${styles.trigger} ${open ? styles.open : ''} ${count ? styles.active : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <SlidersHorizontal size={15} aria-hidden />
        {t('filter.button')}
        {count > 0 && <span className={styles.count}>{count}</span>}
      </button>
      {limited && <span className={styles.limited}>{t('filter.limited')}</span>}
      {open &&
        createPortal(
          <div
            ref={pop}
            className={styles.pop}
            role="dialog"
            aria-label={t('filter.title')}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
          >
            <div className={styles.head}>
              {t('filter.title')}
              <button
                type="button"
                className={styles.reset}
                disabled={!count}
                onClick={() => onChange({})}
              >
                <RotateCcw size={13} aria-hidden />
                {t('filter.reset')}
              </button>
            </div>
            <div className={styles.body}>
              {fields.map((f) => (
                <div key={f.key} className={styles.field}>
                  <span className={styles.label}>{f.label}</span>
                  {f.type === 'date' ? (
                    <DateField
                      targets={f.options}
                      value={value[f.key] as DateRange | undefined}
                      onChange={(v) => set(f.key, v)}
                    />
                  ) : f.type === 'multi' ? (
                    <MultiField
                      label={f.label}
                      value={(value[f.key] as string[] | undefined) ?? []}
                      onChange={(v) => set(f.key, v.length ? v : undefined)}
                      options={f.options}
                    />
                  ) : (
                    <ChoiceChips
                      size="sm"
                      aria-label={f.label}
                      value={(value[f.key] as string | undefined) ?? '__all'}
                      onChange={(v) => set(f.key, v === '__all' ? undefined : v)}
                      options={[{ value: '__all', label: t('filter.all') }, ...f.options]}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
