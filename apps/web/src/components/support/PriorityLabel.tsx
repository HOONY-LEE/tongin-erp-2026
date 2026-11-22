import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** 우선순위 — 칩 대신 색 화살표 + 글자(높음 ↑ 빨강 · 보통 → 주황 · 낮음 ↓ 회색) */
const PRI = {
  HIGH: { Icon: ArrowUp, color: '#e5484d', key: 'support.high' },
  NORMAL: { Icon: ArrowRight, color: '#f59e0b', key: 'support.normal' },
  LOW: { Icon: ArrowDown, color: '#8b95a1', key: 'support.low' },
} as const;

export function PriorityLabel({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation();
  const p = PRI[(value ?? 'NORMAL') as keyof typeof PRI] ?? PRI.NORMAL;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <p.Icon size={15} strokeWidth={2.5} color={p.color} aria-hidden />
      {t(p.key)}
    </span>
  );
}
