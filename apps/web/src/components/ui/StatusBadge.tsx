import { Badge } from '@sunghoon_lee/akron-ui';
import type { BadgeColor } from './types';

export type StatusMap = Record<string, { label: string; color: BadgeColor }>;

/** 상태코드 → 라벨·색 매핑 배지 (공통). */
export function StatusBadge({ value, map }: { value: string; map: StatusMap }) {
  const s = map[value];
  return (
    <Badge color={s?.color ?? 'neutral'} variant="subtle">
      {s?.label ?? value}
    </Badge>
  );
}
