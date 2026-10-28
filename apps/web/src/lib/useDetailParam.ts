import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * 목록 → 상세를 주소(?detail=<id>)로 연다 — 상세 화면이 따로 라우트가 없는 목록(마스터·운영 목록)의 공통 방식.
 * 주소가 바뀌므로 뒤로가기·새로고침·헤더 탭 전환에도 상세가 유지된다.
 */
export function useDetailParam(key = 'detail') {
  const [params, setParams] = useSearchParams();
  const id = params.get(key);
  const open = useCallback(
    (next: string) =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set(key, next);
        return n;
      }),
    [key, setParams],
  );
  const close = useCallback(
    () =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete(key);
        return n;
      }),
    [key, setParams],
  );
  return { id, open, close };
}

/** 탭 컨테이너(상품관리·조직관리 등)의 탭을 주소(?tab=)에 둔다 — 상세에서 돌아와도 같은 탭 */
export function useTabParam<T extends string>(fallback: T, key = 'tab') {
  const [params, setParams] = useSearchParams();
  const tab = (params.get(key) as T | null) ?? fallback;
  const setTab = useCallback(
    (next: T) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.set(key, next);
          n.delete('detail');
          return n;
        },
        { replace: true },
      ),
    [key, setParams],
  );
  /** 상세가 열려 있으면 컨테이너는 머리글·탭을 감추고 상세만 보인다 */
  const inDetail = params.has('detail');
  return { tab, setTab, inDetail };
}
