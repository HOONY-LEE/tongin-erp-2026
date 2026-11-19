import { useEffect, useState } from 'react';
import { api } from './api';

/** 내선(돌려주기 연락처) — 사무실 직원·부서. number = 돌려줄 실제 번호(숫자만) */
export interface Extension {
  id: string;
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
export async function transferTo(
  x: { label: string; dept?: string | null; number: string },
  customerPhone: string,
): Promise<{ ok: boolean; message: string }> {
  const { transferCall } = await import('./softphone');
  const { formatPhone } = await import('./phone');
  const who = `${x.dept ? `${x.label}(${x.dept})` : x.label} ${formatPhone(x.number)}`;
  const r = await transferCall(x.number);
  if (!r.ok) return { ok: false, message: `돌려주지 못했습니다 — ${r.reason ?? ''}` };
  void api('/cs-calls/transferred', {
    method: 'POST',
    body: JSON.stringify({ phone: customerPhone, to: who }),
  }).catch(() => undefined);
  return { ok: true, message: `${who}에게 돌려줬습니다` };
}
