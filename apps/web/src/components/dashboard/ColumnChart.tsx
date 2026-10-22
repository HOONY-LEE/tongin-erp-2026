import { useState } from 'react';
import styles from './dashboard.module.css';

export interface ColumnItem {
  key: string;
  label: string;
  value: number;
  /** 막대 위에 직접 쓸 값(없으면 value) */
  valueLabel?: string;
  /** 값 아래 작게(예: 비율) */
  subLabel?: string;
  /** 마우스를 올리면 보이는 설명 줄 */
  tip?: string[];
}

/**
 * 세로 막대 — 단일 계열(범례 대신 카드 제목이 무엇을 그렸는지 말한다).
 * 값은 막대 위에 직접 쓰고, 마우스를 올리면 자세한 값이 뜬다. 높이는 부모(.plotBox)가 정한다.
 */
export function ColumnChart({ items, label }: { items: ColumnItem[]; label: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; it: ColumnItem } | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className={styles.empty}>데이터가 없습니다</div>;
  return (
    <div className={styles.plot} onMouseLeave={() => setTip(null)}>
      <div className={styles.columns} role="list" aria-label={label}>
        {items.map((it) => (
          <div
            key={it.key}
            role="listitem"
            aria-label={`${it.label} ${it.valueLabel ?? it.value}`}
            className={styles.column}
            onMouseMove={(e) => {
              const box = (
                e.currentTarget.closest(`.${styles.plot}`) as HTMLElement
              ).getBoundingClientRect();
              setTip({ x: e.clientX - box.left, y: e.clientY - box.top, it });
            }}
          >
            <div className={styles.colValue}>
              {it.valueLabel ?? it.value.toLocaleString()}
              {it.subLabel && <span className={styles.colSub}>{it.subLabel}</span>}
            </div>
            <div className={styles.colTrack}>
              <div
                className={styles.colBar}
                style={{ height: `${(it.value / max) * 100}%`, minHeight: it.value ? 3 : 0 }}
              />
            </div>
            <div className={styles.colLabel} title={it.label}>
              {it.label}
            </div>
          </div>
        ))}
      </div>
      {tip && (
        <div className={styles.tip} style={{ left: tip.x + 12, top: tip.y + 12 }} role="tooltip">
          <div className={styles.tipTitle}>{tip.it.label}</div>
          {(tip.it.tip ?? [tip.it.valueLabel ?? String(tip.it.value)]).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
