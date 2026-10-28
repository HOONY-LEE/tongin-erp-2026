import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from '@sunghoon_lee/akron-ui';
import { Checkbox } from '../ui';
import styles from './filterMenu.module.css';

/**
 * 작은 드롭다운 필터 버튼 — "지역 ▾"처럼 자리를 조금만 차지하고, 누르면 아래로 펼친다.
 * 고른 게 있으면 버튼에 개수(또는 요약)가 붙고 강조된다.
 */
export function FilterPopover({
  label,
  summary,
  active,
  width = 240,
  children,
}: {
  label: string;
  /** 버튼 라벨 옆에 붙일 요약(예: "2", "서울 외 1") */
  summary?: string;
  active: boolean;
  width?: number;
  children: ReactNode;
}) {
  return (
    <Popover
      side="bottom"
      align="start"
      width={width}
      className={styles.panel}
      trigger={
        <button type="button" className={`${styles.trigger} ${active ? styles.on : ''}`}>
          {label}
          {summary && <span className={styles.count}>{summary}</span>}
          <ChevronDown size={14} aria-hidden />
        </button>
      }
    >
      {children}
    </Popover>
  );
}

/** 여러 개 고르는 드롭다운 필터(지역·접수상태·등급) */
export function FilterMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 1,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  /** 선택지가 많으면(시·도 17개) 2~3열로 */
  columns?: 1 | 2 | 3;
}) {
  const toggle = (v: T, on: boolean) => onChange(on ? [...value, v] : value.filter((x) => x !== v));
  return (
    <FilterPopover
      label={label}
      summary={value.length ? String(value.length) : undefined}
      active={value.length > 0}
      width={columns === 1 ? 200 : columns * 120}
    >
      <div className={styles.list} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {options.map((o) => (
          <label key={o.value} className={styles.item}>
            <Checkbox
              checked={value.includes(o.value)}
              onCheckedChange={(c) => toggle(o.value, c === true)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {value.length > 0 && (
        <button type="button" className={styles.clear} onClick={() => onChange([])}>
          선택 해제
        </button>
      )}
    </FilterPopover>
  );
}
