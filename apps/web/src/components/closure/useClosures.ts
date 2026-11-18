import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

export interface Closure {
  id: string;
  date: string;
  orgUnitId: string | null;
  orgName: string | null;
  /** CLOSED 마감 | SOON 마감 예정 */
  kind: 'CLOSED' | 'SOON';
  memo: string | null;
}
export interface ClosureData {
  closures: Closure[];
  counts: { date: string; leads: number }[];
}

/** YYYY-MM의 달력 칸 — 일요일부터, 앞뒤 달 날짜로 6주(42칸) */
export function monthGrid(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * 86400_000);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400_000);
    return { date: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === m - 1, dow: i % 7 };
  });
}
export const thisMonth = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
export const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
export const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** 한 달(달력 6주) 마감·이사 건수 */
export function useClosures(ym: string) {
  const [data, setData] = useState<ClosureData | null>(null);
  const load = useCallback(async () => {
    const g = monthGrid(ym);
    try {
      setData(
        await api<ClosureData>(`/move-closures?from=${g[0].date}&to=${g[g.length - 1].date}`),
      );
    } catch {
      setData({ closures: [], counts: [] });
    }
  }, [ym]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, reload: load };
}
