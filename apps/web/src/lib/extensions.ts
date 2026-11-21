import i18n from '../i18n';
import { useEffect, useState } from 'react';
import { api } from './api';

/** 내선(돌려주기 연락처) — 사무실 직원·부서. number = 돌려줄 실제 번호(숫자만) */
export interface Extension {
  id: string;
  /** 내선 주인(직원) — 이으면 label·dept는 직원 정보 */
  employeeId: string | null;
  label: string;
  dept: string | null;
  extNo: string | null;
  number: string;
  memo: string | null;
}

let cache: Extension[] | null = null;
const listeners = new Set<(x: Extension[]) => void>();
/** 내선 목록을 다시 읽어 화면 곳곳(콘솔 목록·통화 막대)에 함께 반영 */
export async function reloadExtensions() {
  cache = await api<Extension[]>('/cs-transfer-targets').catch(() => []);
  listeners.forEach((l) => l(cache!));
  return cache;
}
export function useExtensions() {
  const [list, setList] = useState<Extension[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setList);
    void reloadExtensions();
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}
/** 화면 표시 이름 — 홍길동 과장(영업팀) */
export const extName = (x: Extension) => (x.dept ? `${x.label}(${x.dept})` : x.label);

/**
 * 지금 통화를 이 번호로 돌려주고, 성공하면 콜에 넘긴 곳을 남긴다.
 * 결과 문구를 돌려준다(알림은 부르는 쪽에서).
 */
/**
 * 돌려주기 잠금 — 시험 기간에는 실제로 넘기지 않는다(목록·검색은 그대로).
 * 실통화 시험을 마치면 false로 바꾼다.
 */
export const TRANSFER_BLOCKED = true;

export async function transferTo(
  x: { label: string; dept?: string | null; number: string },
  customerPhone: string,
): Promise<{ ok: boolean; message: string }> {
  if (TRANSFER_BLOCKED)
    return {
      ok: false,
      message: i18n.t('cc.transferBlocked'),
    };
  const { transferCall } = await import('./softphone');
  const { formatPhone } = await import('./phone');
  const who = `${x.dept ? `${x.label}(${x.dept})` : x.label} ${formatPhone(x.number)}`;
  const r = await transferCall(x.number);
  if (!r.ok) return { ok: false, message: i18n.t('cc.transferFailedOf', { v0: r.reason ?? '' }) };
  void api('/cs-calls/transferred', {
    method: 'POST',
    body: JSON.stringify({ phone: customerPhone, to: who }),
  }).catch(() => undefined);
  return { ok: true, message: i18n.t('cc.transferred', { v0: who }) };
}

/** 한글 초성 — '홍길동' → 'ㅎㄱㄷ' */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const chosung = (s: string) =>
  [...s]
    .map((c) => {
      const n = c.charCodeAt(0) - 0xac00;
      return n >= 0 && n < 11172 ? CHO[Math.floor(n / 588)] : c;
    })
    .join('');

/** 내선 검색 — 이름·부서·메모(초성도), 내선번호·전화번호(숫자) */
export function searchExtensions(list: Extension[], q: string) {
  const k = q.trim().replace(/\s+/g, '');
  if (!k) return list;
  const d = k.replace(/\D/g, '');
  const onlyDigits = /^[\d-]+$/.test(k);
  const cho = /^[ㄱ-ㅎ]+$/.test(k);
  return list.filter((x) => {
    const text = `${x.label}${x.dept ?? ''}${x.memo ?? ''}`.replace(/\s+/g, '');
    if (!onlyDigits && text.includes(k)) return true;
    if (cho && chosung(text).includes(k)) return true;
    if (d && ((x.extNo ?? '').includes(d) || x.number.includes(d))) return true;
    return false;
  });
}
