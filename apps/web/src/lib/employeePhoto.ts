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

// ── 사진 있는 직원 목록(id → 바뀐 시각) — 한 번 받아 두고, 사진을 바꾸면 고친다 ──
let index: Record<string, string> | null = null;
let indexLoad: Promise<void> | null = null;
const listeners = new Set<() => void>();
function loadIndex() {
  if (!indexLoad) {
    const token = getToken();
    indexLoad = fetch('/api/employees/photos', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
      .catch(() => ({}))
      .then((m) => {
        index = m;
        listeners.forEach((f) => f());
      });
  }
  return indexLoad;
}
/** 이 직원 사진의 바뀐 시각(사진 없으면 null) — 목록을 받기 전엔 undefined */
function useIndexed(id: string | null | undefined, skip: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (skip || !id) return;
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    void loadIndex();
    return () => {
      listeners.delete(f);
    };
  }, [id, skip]);
  if (skip || !id) return undefined;
  return index ? (index[id] ?? null) : undefined;
}

/** 방금 올린(지운) 사진 — 내려받지 않고 화면에서 만든 이미지를 그대로 쓰고, 목록도 고친다 */
export function primeEmployeePhoto(id: string, ver: string | null, objectUrl?: string) {
  if (ver && objectUrl) cache.set(key(id, ver), Promise.resolve(objectUrl));
  if (index) {
    if (ver) index[id] = ver;
    else delete index[id];
  }
  listeners.forEach((f) => f());
}

/**
 * 사진 주소(없으면 null). photoAt을 주면 그걸, 안 주면(undefined) 사진 있는 직원 목록에서 찾는다 —
 * 그래서 어디서든 직원 id만 넘기면 사진이 붙는다.
 */
export function useEmployeePhoto(id: string | null | undefined, photoAt?: string | null) {
  const indexed = useIndexed(id, photoAt !== undefined);
  const ver = photoAt !== undefined ? photoAt : indexed;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !ver) {
      setUrl(null);
      return;
    }
    let alive = true;
    void fetchPhoto(id, ver).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id, ver]);
  return url;
}
