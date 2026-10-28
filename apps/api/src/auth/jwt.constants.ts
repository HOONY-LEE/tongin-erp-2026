/** JWT 서명 시크릿 — 운영은 반드시 env(JWT_SECRET)로 주입. 시크릿은 레포 커밋 금지(개발원칙 §7). */
const FALLBACK = 'dev-insecure-secret-change-me';

export const JWT_SECRET = process.env.JWT_SECRET ?? FALLBACK;

if (JWT_SECRET === FALLBACK) {
  if (process.env.NODE_ENV === 'production') {
    // 운영에서 빠지면 누구나 토큰을 위조할 수 있다 — 서버는 띄우되(시연 중단 방지) 오류로 크게 남긴다
    console.error(
      '[auth] ERROR: 운영 환경(NODE_ENV=production)인데 JWT_SECRET이 설정되지 않았습니다. 공개된 기본 시크릿으로 토큰을 서명하고 있어 위조가 가능합니다. 즉시 JWT_SECRET을 설정하세요.',
    );
  } else {
    console.warn(
      '[auth] JWT_SECRET 미설정 — 개발용 기본 시크릿 사용 중. 운영 환경에서는 반드시 설정하세요.',
    );
  }
}
