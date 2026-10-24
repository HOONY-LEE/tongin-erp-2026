import type { CSSProperties } from 'react';
import styles from './skeleton.module.css';

/**
 * 스켈레톤 — 데이터가 오기 전 글자·숫자 자리를 연한 상자로 채워 '곧 뜬다'를 보여 준다(토스 앱처럼).
 * 화면 읽기 프로그램에는 '불러오는 중'으로 한 번만 알린다(상자 하나하나는 숨김).
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      className={styles.box}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}

/** 여러 줄 글 — 마지막 줄은 짧게 */
export function SkeletonText({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
  return (
    <span className={styles.stack} style={{ gap }} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />
      ))}
    </span>
  );
}

/** 표 자리 — 툴바·머리줄·행 */
export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  // 열마다 폭을 조금씩 달리해 진짜 표처럼 보이게
  const widths = ['70%', '55%', '80%', '45%', '65%', '50%', '75%'];
  return (
    <div className={styles.table} role="status" aria-label="불러오는 중">
      <div className={styles.toolbar}>
        <Skeleton width={220} height={32} radius={8} />
        <Skeleton width={90} height={32} radius={8} />
      </div>
      <div className={styles.thead}>
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} width="40%" height={12} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.tr}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} width={widths[(r + c) % widths.length]} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 상세 화면 자리 — 제목·태그·카드 몇 개 */
export function PageSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className={styles.page} role="status" aria-label="불러오는 중">
      <div className={styles.header}>
        <Skeleton width={260} height={28} radius={8} />
        <span className={styles.row}>
          <Skeleton width={70} height={22} radius={999} />
          <Skeleton width={120} height={22} radius={999} />
        </span>
      </div>
      <Skeleton height={44} radius={12} />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton width={140} height={18} />
          <div className={styles.grid}>
            {Array.from({ length: 6 }, (_, k) => (
              <span key={k} className={styles.stack}>
                <Skeleton width={70} height={11} />
                <Skeleton width={k % 2 ? '70%' : '90%'} height={16} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
