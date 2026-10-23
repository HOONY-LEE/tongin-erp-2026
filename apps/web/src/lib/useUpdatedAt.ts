import { useCallback, useState } from 'react';

/** PageHeader의 새로고침 아이콘·마지막 업데이트 시각 표시용. load() 성공 시 touch()를 호출한다. */
export function useUpdatedAt() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // 안정된 함수여야 한다 — load의 useCallback 의존성에 들어가므로, 매 렌더 새로 만들면
  // touch → 리렌더 → load 변경 → useEffect 재실행으로 목록을 끝없이 다시 불러온다
  const touch = useCallback(() => setUpdatedAt(new Date()), []);
  return { updatedAt, touch };
}
