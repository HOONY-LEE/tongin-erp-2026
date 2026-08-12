import { useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * 목록 엔드포인트를 Select 옵션({value,label})으로 변환하는 훅.
 * filter는 옵션으로 변환하기 전 원본 행에 적용한다(예: 거래처 유형으로 걸러내기).
 */
export function useOptions(
  path: string,
  labelKey: string,
  valueKey = 'id',
  filter?: (row: Record<string, unknown>) => boolean,
) {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  // filter는 렌더마다 새 함수라 의존성에서 제외 — 경로가 같으면 다시 부르지 않는다
  const filterRef = useRef(filter);
  filterRef.current = filter;
  useEffect(() => {
    api<Record<string, unknown>[]>(path)
      .then((rows) =>
        setOpts(
          rows
            .filter((r) => filterRef.current?.(r) ?? true)
            .map((r) => ({ value: String(r[valueKey]), label: String(r[labelKey]) })),
        ),
      )
      .catch(() => setOpts([]));
  }, [path, labelKey, valueKey]);
  return opts;
}
