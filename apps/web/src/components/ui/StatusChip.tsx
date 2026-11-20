import type { CSSProperties, ReactNode } from 'react';

/**
 * 상태 칩(공통) — 애플 시스템 색의 옅은 바탕 + 진한 글자 알약(clean-theme.css .sft-chip).
 * 접수 상태·상담 콜 상태 등 상태값은 모두 이걸 쓴다. 색은 lib/palette.ts의 APPLE.
 */
export function StatusChip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="sft-chip" style={{ '--chip': color } as CSSProperties}>
      {children}
    </span>
  );
}
