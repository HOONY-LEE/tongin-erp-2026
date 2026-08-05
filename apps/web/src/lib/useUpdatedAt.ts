import { useState } from 'react';

/** PageHeader의 새로고침 아이콘·마지막 업데이트 시각 표시용. load() 성공 시 touch()를 호출한다. */
export function useUpdatedAt() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const touch = () => setUpdatedAt(new Date());
  return { updatedAt, touch };
}
