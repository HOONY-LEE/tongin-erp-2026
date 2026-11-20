import type { CSSProperties } from 'react';

/** 상태 표시 — 색 점(6px) + 글자. 표 안 상태 칩과 같은 모양(clean-theme.css .sft-td .sft-chip) */
export function StatusDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="sft-chip status-dot" style={{ '--dot': color } as CSSProperties}>
      {children}
    </span>
  );
}
