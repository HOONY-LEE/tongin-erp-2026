import { useEffect, useRef } from 'react';
import type { StatusMap } from '../components/ui';
import { getToken } from './api';

/** 콜팝업 — 서버(TelephonyHub)가 보내는 신호. 고객 정보는 없고, 받은 쪽이 통화 ID로 다시 묻는다 */
export interface CallSignal {
  type: 'ringing' | 'updated' | 'ended' | 'ping';
  callId?: string;
}

export interface CallCustomer {
  id: string;
  name: string;
  phone: string | null;
  grade: string | null;
  gradeName: string | null;
  zipcode: string | null;
  addr: string | null;
  addrDetail: string | null;
  ownerOrgName: string | null;
  createdAt: string;
  leadCount: number;
  contractCount: number;
  recentLeads: {
    id: string;
    leadNo: string;
    status: string;
    serviceLine: string | null;
    moveDate: string | null;
    createdAt: string;
    orgUnitName: string;
  }[];
  tickets: {
    id: string;
    ticketNo: string;
    kind: string;
    subject: string;
    status: string;
    createdAt: string;
  }[];
}

export interface CallContext {
  call: {
    id: string;
    fromNumber: string;
    toNumber: string | null;
    lineName: string | null;
    provider: string;
    status: string;
    startedAt: string;
    answeredAt: string | null;
    endedAt: string | null;
    answeredByUserId: string | null;
    answeredBy: string | null;
    memo: string | null;
    leadId: string | null;
  };
  customers: CallCustomer[];
  hiddenMatches: number;
  previousCalls: { id: string; status: string; startedAt: string; memo: string | null }[];
}

export const CALL_STATUS: StatusMap = {
  RINGING: { label: '울리는 중', color: 'warning' },
  ANSWERED: { label: '응대 중', color: 'info' },
  ENDED: { label: '응대함', color: 'success' },
  MISSED: { label: '부재중', color: 'error' },
};

/** 콜팝업에서 접수 등록으로 — 접수 화면이 이 주소를 읽어 등록 창을 채워 연다 */
export function newLeadPath(p: { phone: string; name?: string | null; callId: string }) {
  const q = new URLSearchParams({ new: '1', phone: p.phone, callId: p.callId });
  if (p.name) q.set('name', p.name);
  return `/leads?${q.toString()}`;
}

export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/**
 * 콜팝업 실시간 스트림(SSE). EventSource는 Authorization 머리글을 못 실어서 fetch로 읽는다.
 * 끊기면 2초 → 최대 30초 간격으로 다시 붙는다.
 */
export function useCallStream(enabled: boolean, onSignal: (s: CallSignal) => void) {
  const cb = useRef(onSignal);
  cb.current = onSignal;

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let ctrl: AbortController | null = null;
    let wait = 2000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      ctrl = new AbortController();
      try {
        const res = await fetch('/api/telephony/stream', {
          headers: { Authorization: `Bearer ${getToken() ?? ''}`, Accept: 'text/event-stream' },
          signal: ctrl.signal,
        });
        // 권한이 없거나 로그아웃 — 다시 붙지 않는다
        if (res.status === 401 || res.status === 403) return;
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        wait = 2000;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = chunk
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trim())
              .join('');
            if (!data) continue;
            try {
              const s = JSON.parse(data) as CallSignal;
              if (s.type !== 'ping') cb.current(s);
            } catch {
              // 모양이 틀린 줄은 버린다
            }
          }
        }
      } catch {
        if (stop) return;
      }
      if (stop) return;
      timer = setTimeout(() => void connect(), wait);
      wait = Math.min(wait * 2, 30_000);
    };
    void connect();
    return () => {
      stop = true;
      ctrl?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}
