import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EstimateDetailData } from './types';

/**
 * 탭 하나의 입력 상태.
 * - 서버 데이터에서 폼 값을 만들고, 달라졌는지(dirty)를 비교로 판정한다.
 * - 서버 데이터가 새로 오면(다른 탭 저장 등) "이 탭에 저장 안 한 변경이 없을 때만" 다시 맞춘다 —
 *   그렇지 않으면 옵션 탭을 저장하는 순간 물품 탭에 입력하던 내용이 날아간다.
 */
export function useTabForm<T>(
  data: EstimateDetailData,
  derive: (d: EstimateDetailData) => T,
  onDirtyChange: (dirty: boolean) => void,
) {
  // derive는 렌더마다 새 함수일 수 있어 ref로 고정한다
  const deriveRef = useRef(derive);
  deriveRef.current = derive;

  const base = useMemo(() => deriveRef.current(data), [data]);
  const [form, setForm] = useState<T>(base);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(base), [form, base]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setForm(base);
  }, [base]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const reset = useCallback(() => setForm(base), [base]);
  /** 저장 직후 — 서버가 돌려준 값이 곧 새 기준이므로 폼도 그 값으로 맞춘다 */
  const accept = useCallback((next: EstimateDetailData) => {
    dirtyRef.current = false;
    setForm(deriveRef.current(next));
  }, []);

  return { form, setForm, dirty, reset, accept };
}
