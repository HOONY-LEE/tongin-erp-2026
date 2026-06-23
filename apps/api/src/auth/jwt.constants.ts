/** JWT 서명 시크릿 — 운영은 반드시 env(JWT_SECRET)로 주입. 시크릿은 레포 커밋 금지(개발원칙 §7). */
const FALLBACK = 'dev-insecure-secret-change-me';

export const JWT_SECRET = process.env.JWT_SECRET ?? FALLBACK;

if (JWT_SECRET === FALLBACK) {
  console.warn(
    '[auth] JWT_SECRET 미설정 — 개발용 기본 시크릿 사용 중. 운영 환경에서는 반드시 설정하세요.',
  );
}
