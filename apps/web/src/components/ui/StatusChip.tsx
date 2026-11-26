import type { CSSProperties, ReactNode } from 'react';

/**
 * 상태 칩(공통) — 애플 시스템 색의 옅은 바탕 + 진한 글자 알약(clean-theme.css .sft-chip).
 * 접수 상태·상담 콜 상태 등 상태값은 모두 이걸 쓴다. 색은 lib/palette.ts의 APPLE.
 */
export function StatusChip({
  color,
  children,
  solid,
  mono,
}: {
  color: string;
  children: ReactNode;
  /** 꽉 찬 바탕(흰 글자) */
  solid?: boolean;
  /** 검정 계열 칩 — 어두운 화면에서는 밝게 뒤집는다 */
  mono?: boolean;
}) {
  return (
    <span
      className={['sft-chip', solid && 'sft-chip--solid', mono && 'sft-chip--mono']
        .filter(Boolean)
        .join(' ')}
      style={{ '--chip': color } as CSSProperties}
    >
      {children}
    </span>
  );
}
