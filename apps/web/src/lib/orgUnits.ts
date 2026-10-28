import { useCallback, useEffect, useState } from 'react';
import { cachedApi } from './api';

/** /org-units 한 행 — 조직도·본사/지점 구분에 쓰는 칸만 */
export interface OrgUnitRow {
  id: string;
  parentId: string | null;
  type: string;
  code: string;
  name: string;
  isActive: boolean;
  addr?: string | null;
  sido?: string | null;
  sigungu?: string | null;
}

/**
 * 본사 쪽 조직(그룹·법인·부서)인지. 지점(BRANCH)은 지점관리에서 다루고,
 * 조직관리·직원관리는 본사 조직과 본사 직원만 보여 준다.
 */
export const isHqUnit = (u: { type?: unknown }) => u.type !== 'BRANCH';

/** 조직 전체 목록(본사+지점). 같은 주소는 잠깐 캐시하고, 등록·수정하면 api()가 캐시를 비운다. */
export function useOrgUnits() {
  const [units, setUnits] = useState<OrgUnitRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setUnits(await cachedApi<OrgUnitRow[]>('/org-units'));
    } catch {
      setUnits([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { units, loaded, reload };
}
