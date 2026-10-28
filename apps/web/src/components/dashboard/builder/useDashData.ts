import { useEffect, useMemo, useRef, useState } from 'react';
import type { DashDataResult, DashItem } from '@tongin/shared';
import { DASH_WIDGET_MAP } from '@tongin/shared';
import { api } from '../../../lib/api';

/**
 * 위젯 데이터 한꺼번에 불러오기 — 위젯·기간·지표가 바뀐 것만 다시 부른다(위치·크기만 바뀌면 그대로).
 * refreshKey가 바뀌면 전부 다시.
 */
export function useDashData(items: DashItem[], refreshKey = 0) {
  const [results, setResults] = useState<Record<string, DashDataResult>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const cache = useRef(new Map<string, DashDataResult>());
  const sig = (it: DashItem) => `${it.widget}|${it.period ?? ''}|${it.metric ?? ''}`;
  const want = useMemo(
    () =>
      items.filter((it) => {
        const s = DASH_WIDGET_MAP.get(it.widget)?.shape;
        return s && s !== 'text' && s !== 'embed';
      }),
    [items],
  );
  const key = want.map((it) => `${it.id}:${sig(it)}`).join(',');
  const lastRefresh = useRef(refreshKey);
  // 처음 열 때는 바로 묻고, 그 뒤 편집 중 연달아 바뀔 때만 잠깐 모아서 묻는다
  const fetchedOnce = useRef(false);

  useEffect(() => {
    if (lastRefresh.current !== refreshKey) {
      cache.current.clear();
      lastRefresh.current = refreshKey;
    }
    // 같은 위젯·옵션은 캐시로 바로 보여 주고, 처음 보는 것만 서버에 묻는다
    const missing = want.filter((it) => !cache.current.has(sig(it)));
    const fromCache = () => {
      const out: Record<string, DashDataResult> = {};
      for (const it of want) {
        const hit = cache.current.get(sig(it));
        if (hit) out[it.id] = hit;
      }
      return out;
    };
    setResults(fromCache());
    if (!missing.length) return;
    let alive = true;
    // 같은 위젯·옵션은 한 번만 묻는다
    const uniq = new Map(missing.map((it) => [sig(it), it]));
    setLoading(new Set(missing.map((it) => it.id)));
    const delay = fetchedOnce.current ? 150 : 0;
    fetchedOnce.current = true;
    const t = setTimeout(() => {
      api<Record<string, DashDataResult>>('/dashboards/data', {
        method: 'POST',
        body: JSON.stringify({
          items: [...uniq.entries()].map(([s, it]) => ({
            id: s,
            widget: it.widget,
            period: it.period,
            metric: it.metric,
          })),
        }),
      })
        .then((res) => {
          for (const [s, r] of Object.entries(res)) cache.current.set(s, r);
          if (alive) setResults(fromCache());
        })
        .catch((e) => {
          const err: DashDataResult = {
            ok: false,
            error: e instanceof Error ? e.message : '불러오지 못했습니다',
          };
          if (alive) {
            const out = fromCache();
            for (const it of missing) out[it.id] = err;
            setResults(out);
          }
        })
        .finally(() => alive && setLoading(new Set()));
    }, delay);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // key가 위젯 목록·옵션을 대표한다
  }, [key, refreshKey]);

  return { results, loading };
}
