/**
 * 화면(네임스페이스)별 번역 묶음 — 한 파일에 ko·en·zh를 함께 둔다.
 * en·zh는 ko와 키가 똑같아야 한다(빠지거나 남는 키는 타입 오류).
 */
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

export interface Ns<T> {
  ko: T;
  en: Shape<T>;
  zh: Shape<T>;
}

export function defineNs<const T extends Record<string, unknown>>(m: Ns<T>): Ns<T> {
  return m;
}
