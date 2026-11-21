import type { ReactNode } from 'react';
import styles from './ChoiceChips.module.css';

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface Common<T extends string> {
  options: ChoiceOption<T>[];
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * 하나 고르기(라디오) — 앱 공통. 내용 폭만큼의 칩으로, 줄 전체를 차지하는 SegmentedControl과 달리
 * 폼 안에서 여러 줄로 감긴다. 방향키로 옮겨 다닌다.
 */
export function ChoiceChips<T extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  disabled,
  className,
  'aria-label': ariaLabel,
}: Common<T> & { value: T | '' | null | undefined; onChange: (v: T) => void }) {
  const move = (from: number, step: number) => {
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const o = options[(from + step * k + n * k) % n];
      if (!o.disabled) return onChange(o.value);
    }
  };
  return (
    <div
      className={`${styles.chips} ${size === 'sm' ? styles.sm : ''} ${className ?? ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o, i) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!value && i === 0) ? 0 : -1}
            disabled={disabled || o.disabled}
            className={`${styles.chip} ${on ? styles.on : ''}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const step =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0;
              if (!step) return;
              e.preventDefault();
              move(i, step);
              const box = e.currentTarget.parentElement;
              requestAnimationFrame(() =>
                box?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(),
              );
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 여러 개 고르기(체크) — 같은 모양의 칩, 누를 때마다 켜고 끈다 */
export function CheckChips<T extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  disabled,
  className,
  'aria-label': ariaLabel,
}: Common<T> & { value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div
      className={`${styles.chips} ${size === 'sm' ? styles.sm : ''} ${className ?? ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={disabled || o.disabled}
            className={`${styles.chip} ${on ? styles.on : ''}`}
            onClick={() =>
              onChange(
                on
                  ? value.filter((x) => x !== o.value)
                  : options
                      .filter((x) => x.value === o.value || value.includes(x.value))
                      .map((x) => x.value),
              )
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
