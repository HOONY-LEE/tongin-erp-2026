import { useEffect, useState } from 'react';
import { getToken } from './api';

/**
 * 직원 프로필 사진 — <img src>는 로그인 헤더를 못 보내서 인증 fetch로 받아 blob URL로 쓴다.
 * 사진이 바뀌면 photoAt(바뀐 시각)이 달라지므로 (직원, photoAt)마다 한 번만 받는다.
 */
const cache = new Map<string, Promise<string | null>>();
const key = (id: string, ver: string) => `${id}@${ver}`;

function fetchPhoto(id: string, ver: string): Promise<string | null> {
  const k = key(id, ver);
  let p = cache.get(k);
  if (!p) {
    const token = getToken();
    p = fetch(`/api/employees/${id}/photo?v=${encodeURIComponent(ver)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => (res.ok ? URL.createObjectURL(await res.blob()) : null))
      .catch(() => null);
    p.then((u) => u === null && cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

/** 방금 올린 사진은 내려받지 않고 화면에서 만든 이미지를 그대로 */
export function primeEmployeePhoto(id: string, ver: string, objectUrl: string) {
  cache.set(key(id, ver), Promise.resolve(objectUrl));
}

/** 사진 주소(없으면 null) — photoAt이 없으면 사진이 없는 직원이라 받지 않는다 */
export function useEmployeePhoto(
  id: string | null | undefined,
  photoAt: string | null | undefined,
) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !photoAt) {
      setUrl(null);
      return;
    }
    let alive = true;
    void fetchPhoto(id, photoAt).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id, photoAt]);
  return url;
}
