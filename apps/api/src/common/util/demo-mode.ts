/**
 * 시연 모드인지 — 데모 시드를 넣는 동안(DEMO_SEED가 off가 아님)은 시연 서버로 본다.
 * 실고객을 받기 시작할 때 DEMO_SEED=off로 바꾸면(render.yaml 안내) 로그인 화면의 데모 계정 목록이 사라지고,
 * 공개된 기본 비밀번호로는 로그인할 수 없다.
 */
export const isDemoMode = () => (process.env.DEMO_SEED ?? '').toLowerCase() !== 'off';

/**
 * 레포·로그인 화면 번들에 그대로 적혀 있어 누구나 아는 비밀번호(시드 기본값).
 * 실운영에서 이 값으로 로그인되면 아무나 그 계정으로 들어올 수 있다.
 */
export const PUBLIC_DEFAULT_PASSWORDS = ['admin1234', 'tongin1234!'];
