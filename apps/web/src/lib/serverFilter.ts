import type { FilterValues } from '../components/ui';

/**
 * 목록 서버 거르기 — 필터(FilterButton) 값과 검색어를 주소 조건으로(`f=<JSON>&q=`).
 * 서버는 apps/api/src/common/list-filter.ts(listWhere)로 받는다.
 */
export const LIST_LIMIT = 1000;

export function filterQuery(
  values: FilterValues,
  q = '',
  extra: Record<string, string | undefined | null> = {},
): string {
  const p = new URLSearchParams();
  const f = Object.fromEntries(
    Object.entries(values).filter(([, v]) => {
      if (v === undefined || v === '') return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return !!(v.from || v.to);
      return true;
    }),
  );
  if (Object.keys(f).length) p.set('f', JSON.stringify(f));
  if (q.trim()) p.set('q', q.trim());
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
