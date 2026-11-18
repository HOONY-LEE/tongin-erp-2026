import { ListFilter } from 'lucide-react';
import { Popover } from '@sunghoon_lee/akron-ui';
import { Button, Input } from '../../components/ui';
import styles from '../callcenter.module.css';

export interface DateRange {
  from: string;
  to: string;
}

/** 한국 날짜(YYYY-MM-DD) — 오늘에서 n일 전 */
const kDay = (offset = 0) =>
  new Date(Date.now() + 9 * 3600_000 - offset * 86400_000).toISOString().slice(0, 10);
const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: '오늘', range: () => ({ from: kDay(), to: kDay() }) },
  { label: '어제', range: () => ({ from: kDay(1), to: kDay(1) }) },
  { label: '최근 7일', range: () => ({ from: kDay(6), to: kDay() }) },
  { label: '최근 30일', range: () => ({ from: kDay(29), to: kDay() }) },
  {
    label: '이번 달',
    range: () => ({ from: `${kDay().slice(0, 8)}01`, to: kDay() }),
  },
];
const short = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

/** 콜 목록 필터 — 필터 아이콘을 누르면 통화 날짜(빠른 선택·직접 입력) */
export function DateFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  const active = !!(value.from || value.to);
  const summary = active
    ? value.from === value.to
      ? short(value.from)
      : `${value.from ? short(value.from) : ''}~${value.to ? short(value.to) : ''}`
    : null;
  return (
    <Popover
      side="bottom"
      align="end"
      width={300}
      className={styles.filterPanel}
      trigger={
        <button
          type="button"
          className={`${styles.filterBtn} ${active ? styles.filterOn : ''}`}
          aria-label="필터"
          title="필터 — 통화 날짜"
        >
          <ListFilter size={16} />
          {summary && <span>{summary}</span>}
        </button>
      }
    >
      <div className={styles.filterBody}>
        <b className={styles.filterTitle}>통화 날짜</b>
        <div className={styles.filterPresets}>
          {PRESETS.map((p) => {
            const r = p.range();
            const on = r.from === value.from && r.to === value.to;
            return (
              <button
                key={p.label}
                type="button"
                className={on ? styles.presetOn : ''}
                onClick={() => onChange(r)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className={styles.filterDates}>
          <Input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            aria-label="시작일"
          />
          <span>~</span>
          <Input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            aria-label="종료일"
          />
        </div>
        {active && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ from: '', to: '' })}>
            날짜 필터 지우기
          </Button>
        )}
      </div>
    </Popover>
  );
}
