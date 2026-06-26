// 주소 필드 키 헬퍼 — FormModal(저장 키 산출)과 AddressField(입력 바인딩)에서 공용.
// prefix가 빈 문자열이면 단일 주소(zipcode, addr…), 'from'/'to'면 접두(fromZipcode…).
export const ADDRESS_PARTS = [
  'zipcode',
  'addr',
  'addrDetail',
  'sido',
  'sigungu',
  'lat',
  'lng',
] as const;
export type AddressPart = (typeof ADDRESS_PARTS)[number];

export function addrKey(prefix: string, part: AddressPart): string {
  if (!prefix) return part;
  return prefix + part.charAt(0).toUpperCase() + part.slice(1);
}
