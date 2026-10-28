import { useEffect, useState } from 'react';
import { ApiError, getToken, setToken, toApiError } from '../../lib/api';

/**
 * 작업 사진 공통 — 이미지 받기(blob URL 캐시)와 올리기 전 줄이기.
 *
 * <img src>는 Authorization 헤더를 못 보내므로 인증 fetch로 받아 blob URL로 띄운다.
 * 한 번 받은 사진은 탭이 살아 있는 동안 메모리에 두고(사진은 바뀌지 않는다), 서버도
 * private 캐시 헤더를 줘서 다시 열어도 데이터를 덜 쓴다.
 */

const urlCache = new Map<string, Promise<string>>();

/** 한꺼번에 받는 수 제한 — 현장 모바일 데이터에서 목록 열자마자 수십 장이 몰리지 않게 */
const MAX_PARALLEL = 4;
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function fetchPhoto(id: string): Promise<string> {
  const token = getToken();
  const res = await slot(() =>
    fetch(`/api/work-photos/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('tongin:unauthorized'));
    throw new ApiError(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.', 'UNAUTHORIZED');
  }
  if (!res.ok) throw await toApiError(res, `/work-photos/${id}`);
  return URL.createObjectURL(await res.blob());
}

/** 사진 blob URL — 실패하면 캐시에서 빼서 다음에 다시 시도한다 */
export function photoUrl(id: string): Promise<string> {
  let p = urlCache.get(id);
  if (!p) {
    p = fetchPhoto(id);
    p.catch(() => urlCache.delete(id));
    urlCache.set(id, p);
  }
  return p;
}

/** 방금 올린 사진은 내려받지 않고 화면에 있던 로컬 이미지를 그대로 쓴다 */
export function primePhotoUrl(id: string, objectUrl: string) {
  urlCache.set(id, Promise.resolve(objectUrl));
}

/** 지운 사진의 blob URL 정리 */
export function forgetPhotoUrl(id: string) {
  const p = urlCache.get(id);
  urlCache.delete(id);
  void p?.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
}

export function usePhotoUrl(id: string | null): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ id: string | null; url: string | null; failed: boolean }>({
    id: null,
    url: null,
    failed: false,
  });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    photoUrl(id).then(
      (url) => alive && setState({ id, url, failed: false }),
      () => alive && setState({ id, url: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  return state.id === id ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}

// ── 올리기 전 줄이기 ──

/** 긴 변 최대 픽셀 — 현장 확인·분쟁 증빙에 충분하고 한 장 0.3~0.6MB 정도 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/** EXIF 회전을 반영해 디코딩 — createImageBitmap(from-image)이 되면 그걸로, 아니면 <img>(브라우저 기본이 EXIF 반영) */
async function decode(
  file: File,
): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    } catch {
      // 옵션 미지원·형식 미지원 → <img>로 다시 시도
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return {
      src: img,
      w: img.naturalWidth,
      h: img.naturalHeight,
      done: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** 사진 파일 → 긴 변 1600px JPEG. 열 수 없는 형식은 한국어 안내로 실패 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error(
      isHeic(file)
        ? 'HEIC 사진은 이 브라우저에서 열 수 없습니다. "사진 찍기"로 다시 찍거나 JPEG로 올려 주세요.'
        : '사진을 열 수 없습니다. JPEG·PNG 사진인지 확인해 주세요.',
    );
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.w, decoded.h));
    const width = Math.max(1, Math.round(decoded.w * scale));
    const height = Math.max(1, Math.round(decoded.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('사진을 줄이지 못했습니다.');
    // JPEG엔 투명이 없다 — PNG 투명 영역이 검게 나오지 않게 흰 바탕
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.src, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('사진을 줄이지 못했습니다.');
    return { blob, width, height };
  } finally {
    decoded.done();
  }
}

/** Blob → base64(데이터 URL 머리 제외) */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',', 2)[1] ?? '');
    r.onerror = () => reject(r.error ?? new Error('사진을 읽지 못했습니다.'));
    r.readAsDataURL(blob);
  });
}
