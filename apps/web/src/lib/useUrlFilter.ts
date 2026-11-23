import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FilterValues } from '../components/ui/FilterButton';

/** 목록 주소에 실어 보내는 처음 필터 — `?f=` + JSON(FilterValues). 대시보드 위젯에서 눌러 들어올 때 */
export function filterHref(path: string, f: FilterValues): string {
  const clean = Object.fromEntries(
    Object.entries(f).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)),
  );
  return Object.keys(clean).length
    ? `${path}?f=${encodeURIComponent(JSON.stringify(clean))}`
    : path;
}

const parse = (raw: string | null): FilterValues => {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: FilterValues = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === 'string') out[k] = x;
      else if (Array.isArray(x)) out[k] = x.filter((s): s is string => typeof s === 'string');
      else if (x && typeof x === 'object') {
        const d = x as Record<string, unknown>;
        out[k] = {
          ...(typeof d.from === 'string' && { from: d.from }),
          ...(typeof d.to === 'string' && { to: d.to }),
          ...(typeof d.on === 'string' && { on: d.on }),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
};

/**
 * 목록 화면의 필터 상태 — 주소에 `?f=`가 있으면 그것으로 시작하고, 주소에서는 지운다
 * (새로 고침·뒤로 가기에 같은 필터가 다시 걸려 헷갈리지 않게, 필터는 화면에 남는다).
 */
export function useUrlFilter() {
  const [params, setParams] = useSearchParams();
  const [flt, setFlt] = useState<FilterValues>(() => parse(params.get('f')));
  useEffect(() => {
    if (!params.has('f')) return;
    const next = new URLSearchParams(params);
    next.delete('f');
    setParams(next, { replace: true });
  }, [params, setParams]);
  return [flt, setFlt] as const;
}
