/**
 * 연락처 — 저장은 숫자만(01052596024), 보일 때 하이픈(010-5259-6024).
 * 화면 입력칸(PhoneInput)·서버 DTO(@PhoneDigits)·문서·문자가 같이 쓴다.
 */
export const phoneDigits = (raw: string | null | undefined) => (raw ?? '').replace(/\D/g, '');

/** 숫자(또는 하이픈 섞인 값)를 자리에 맞춰 하이픈 넣기 */
export function formatPhone(raw: string | null | undefined): string {
  const digits = phoneDigits(raw);
  if (digits.startsWith('02')) {
    const v = digits.slice(0, 10);
    if (v.length <= 2) return v;
    if (v.length <= 5) return `${v.slice(0, 2)}-${v.slice(2)}`;
    if (v.length <= 9) return `${v.slice(0, 2)}-${v.slice(2, 5)}-${v.slice(5)}`;
    return `${v.slice(0, 2)}-${v.slice(2, 6)}-${v.slice(6, 10)}`;
  }
  // 전국 대표번호(1577·1588·1600 …) — 8자리, 4-4
  if (/^1[5-9]\d{2}/.test(digits)) {
    const v = digits.slice(0, 8);
    return v.length <= 4 ? v : `${v.slice(0, 4)}-${v.slice(4)}`;
  }
  // 안심번호(0502~0508) — 0504-1234-5678(12자리) · 0505-123-4567(11자리)
  if (/^050\d/.test(digits)) {
    const v = digits.slice(0, 12);
    if (v.length <= 4) return v;
    if (v.length <= 8) return `${v.slice(0, 4)}-${v.slice(4)}`;
    if (v.length <= 11) return `${v.slice(0, 4)}-${v.slice(4, 7)}-${v.slice(7)}`;
    return `${v.slice(0, 4)}-${v.slice(4, 8)}-${v.slice(8)}`;
  }
  if (/^01[016789]/.test(digits)) {
    const v = digits.slice(0, 11);
    if (v.length <= 3) return v;
    if (v.length <= 6) return `${v.slice(0, 3)}-${v.slice(3)}`;
    // 옛 10자리(011-123-4567)는 3-3-4, 11자리는 3-4-4
    if (v.length <= 10) return `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6)}`;
    return `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7, 11)}`;
  }
  const v = digits.slice(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0, 3)}-${v.slice(3)}`;
  if (v.length <= 10) return `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6)}`;
  return `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7, 11)}`;
}
