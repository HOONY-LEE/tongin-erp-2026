import { useCallback, useState } from 'react';

/**
 * PageHeader의 새로고침 아이콘·마지막 업데이트 시각 표시용. load() 성공 시 touch()를 호출한다.
 * 처음 값은 화면을 연 시각 — 화면을 열면 곧바로 불러오므로(새로고침에서만 touch하는 화면도 시각이 빈칸이 되지 않게)
 */
export function useUpdatedAt() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(() => new Date());
  // 안정된 함수여야 한다 — load의 useCallback 의존성에 들어가므로, 매 렌더 새로 만들면
  // touch → 리렌더 → load 변경 → useEffect 재실행으로 목록을 끝없이 다시 불러온다
  const touch = useCallback(() => setUpdatedAt(new Date()), []);
  return { updatedAt, touch };
}
