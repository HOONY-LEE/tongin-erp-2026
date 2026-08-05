/** 숫자만 입력해도 자동으로 하이픈을 넣어준다 (010-5259-6024 형식). */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('02')) {
    const v = digits.slice(0, 10);
    if (v.length <= 2) return v;
    if (v.length <= 5) return `${v.slice(0, 2)}-${v.slice(2)}`;
    if (v.length <= 9) return `${v.slice(0, 2)}-${v.slice(2, 5)}-${v.slice(5)}`;
    return `${v.slice(0, 2)}-${v.slice(2, 6)}-${v.slice(6, 10)}`;
  }
  if (/^01[016789]/.test(digits)) {
    const v = digits.slice(0, 11);
    if (v.length <= 3) return v;
    if (v.length <= 7) return `${v.slice(0, 3)}-${v.slice(3)}`;
    return `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7, 11)}`;
  }
  const v = digits.slice(0, 10);
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0, 3)}-${v.slice(3)}`;
  return `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6, 10)}`;
}
