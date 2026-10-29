import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';

/** 이 주체가 권한 코드를 가졌나('*'는 전부) — 본인 일은 권한 없이 되는 화면에서 서비스가 직접 따진다 */
export function hasPerm(p: AuthPrincipal | null | undefined, code: string): boolean {
  return !!p && (p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes(code));
}

/** 'YYYY-MM-DD' → DATE 컬럼 값. undefined는 그대로(안 바꿈), null은 지움 */
export function dateOrNull(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
}
