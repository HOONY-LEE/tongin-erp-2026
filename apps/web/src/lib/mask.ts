/**
 * 개인정보 가리기 — 표에서 고른 칸(전화·주소·이름)을 화면이나 내려받기 파일에서 가린다.
 * 기본은 다 보인다. 가린 값은 화면 글자만 바꾼다(서버 데이터는 그대로).
 */
export type MaskKind = 'phone' | 'address' | 'name';

export const MASK_KIND_LABEL: Record<MaskKind, string> = {
  phone: '전화번호',
  address: '주소',
  name: '이름',
};

/** 칸 제목으로 어떤 정보인지 짐작한다 — 맞지 않으면 Column.mask로 지정하거나 false로 끈다 */
export function guessMaskKind(title: string): MaskKind | null {
  const t = title.replace(/\s/g, '');
  if (/전화|연락처|휴대폰|핸드폰|phone/i.test(t)) return 'phone';
  if (/주소|출발지|도착지|^출발$|^도착$|address/i.test(t)) return 'address';
  if (/고객명|^고객$|이름|성명|신청자|받는사람/.test(t)) return 'name';
  return null;
}

/** 010-1234-5678 → 010-****-5678 (글자 속 번호마다) */
export function maskPhone(s: string): string {
  const out = s.replace(/(\+?\d[\d\s-]{7,}\d)/g, (m) => {
    const d = m.replace(/\D/g, '');
    if (d.length < 9) return m;
    return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
  });
  return out;
}

/** 서울 용산구 이촌로 62 105동 603호 → 서울 용산구 *** (시·도 + 시·군·구까지만) */
export function maskAddress(s: string): string {
  const parts = s.trim().split(/\s+/);
  if (parts.length <= 1) return s ? '***' : s;
  const keep = [parts[0]];
  for (const p of parts.slice(1, 3)) {
    if (/(시|군|구)$/.test(p)) keep.push(p);
    else break;
  }
  return `${keep.join(' ')} ***`;
}

/** 홍길동 → 홍*동, 김민 → 김*, 남궁민수 → 남**수 */
export function maskName(s: string): string {
  const t = s.trim();
  const chars = [...t];
  if (chars.length <= 1) return t;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

export function maskValue(kind: MaskKind, s: string): string {
  // 빈 칸 표시('-' 등 글자·숫자가 없는 값)는 그대로
  if (!s || !/[\p{L}\p{N}]/u.test(s)) return s;
  if (kind === 'phone') return maskPhone(s);
  if (kind === 'address') return maskAddress(s);
  return maskName(s);
}
