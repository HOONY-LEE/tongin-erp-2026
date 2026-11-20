/**
 * 날짜·시간 표기(앱 공통) — 표·목록·상세 어디서나 같은 모양.
 *   날짜: 2026-11-20      시간: 2026-11-20 16:14 (로그는 초까지 16:14:05)
 * 'YYYY-MM-DD'만 있는 값(날짜 칸)은 그대로, 시각(ISO)은 이 PC 시간대(한국)로 바꿔 쓴다.
 */
const p2 = (n: number) => String(n).padStart(2, '0');

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 2026-11-20 (값이 없으면 빈 글자) */
export function fmtDate(v: unknown): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = toDate(v);
  return d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : '';
}

/** 2026-11-20 16:14 (seconds면 16:14:05) */
export function fmtDateTime(v: unknown, opts?: { seconds?: boolean }): string {
  const d = toDate(v);
  if (!d) return '';
  const time = `${p2(d.getHours())}:${p2(d.getMinutes())}${opts?.seconds ? `:${p2(d.getSeconds())}` : ''}`;
  return `${fmtDate(d)} ${time}`;
}
