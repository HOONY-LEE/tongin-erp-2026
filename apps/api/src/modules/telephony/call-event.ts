/**
 * 수신 알림 해석 — 연동처마다 다른 모양을 한 가지로 맞춘다.
 *
 * - TWILIO: 폼 본문(From·To·CallSid·CallStatus). 무료 체험 번호로 걸어 시험할 때
 * - GENERIC: 통신사 CTI·교환기·안드로이드 자동화 앱(MacroDroid 등)이 보내는 JSON 또는 주소 뒤 ?from=
 *   { from | caller | number | phone, event?(ringing|answered|ended|missed), callId?, to?, extension? }
 */
export type CallEventKind = 'ringing' | 'answered' | 'ended' | 'missed';

export interface ParsedCallEvent {
  provider: 'TWILIO' | 'GENERIC';
  externalId: string | null;
  from: string;
  to: string | null;
  extension: string | null;
  event: CallEventKind;
}

/** +82 10-1234-5678 → 01012345678. 발신번호 표시 제한·치환 안 된 자리표시자는 빈 값 */
export function normalizeCaller(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2);
  return d.length >= 3 ? d.slice(0, 15) : '';
}

const pick = (src: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = src[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 200);
    if (typeof v === 'number') return String(v);
  }
  return null;
};

const TWILIO_STATUS: Record<string, CallEventKind> = {
  queued: 'ringing',
  ringing: 'ringing',
  'in-progress': 'answered',
  completed: 'ended',
  busy: 'missed',
  'no-answer': 'missed',
  failed: 'missed',
  canceled: 'missed',
};

function genericEvent(raw: string | null): CallEventKind {
  const v = (raw ?? '').toLowerCase();
  if (/answer|connect|in-?progress|통화/.test(v)) return 'answered';
  if (/miss|no-?answer|busy|cancel|부재/.test(v)) return 'missed';
  if (/end|hang|complete|disconnect|종료/.test(v)) return 'ended';
  return 'ringing';
}

export function parseCallEvent(
  body: Record<string, unknown> | undefined,
  query: Record<string, unknown> | undefined,
): ParsedCallEvent {
  const src = { ...(query ?? {}), ...(body ?? {}) };
  if (typeof src.CallSid === 'string') {
    return {
      provider: 'TWILIO',
      externalId: src.CallSid,
      from: normalizeCaller(src.From ?? src.Caller),
      to: normalizeCaller(src.To ?? src.Called) || null,
      extension: null,
      event: TWILIO_STATUS[String(src.CallStatus ?? 'ringing')] ?? 'ringing',
    };
  }
  return {
    provider: 'GENERIC',
    externalId: pick(src, ['callId', 'call_id', 'uniqueid', 'uniqueId', 'id']),
    from: normalizeCaller(pick(src, ['from', 'caller', 'callerId', 'cid', 'number', 'phone'])),
    to: normalizeCaller(pick(src, ['to', 'called', 'dnis'])) || null,
    extension: pick(src, ['extension', 'ext', 'agent']),
    event: genericEvent(pick(src, ['event', 'status', 'type', 'state'])),
  };
}
