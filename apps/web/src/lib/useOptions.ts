import { useEffect, useState } from 'react';
import { api } from './api';

/** 목록 엔드포인트를 Select 옵션({value,label})으로 변환하는 훅. */
export function useOptions(path: string, labelKey: string, valueKey = 'id') {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<Record<string, unknown>[]>(path)
      .then((rows) =>
        setOpts(rows.map((r) => ({ value: String(r[valueKey]), label: String(r[labelKey]) }))),
      )
      .catch(() => setOpts([]));
  }, [path, labelKey, valueKey]);
  return opts;
}
