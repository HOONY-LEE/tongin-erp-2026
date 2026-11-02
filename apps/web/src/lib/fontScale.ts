/**
 * 글자 크기 — 프로필·설정의 작게/중간/크게. html[data-font-size]가 --font-scale을 바꾸고,
 * CSS의 모든 font-size는 calc(Npx * var(--font-scale))로 그 배율을 따른다.
 * 화면 코드(인라인 style)에서 글자 크기를 줄 땐 fs(13)처럼 쓴다.
 */
export const fs = (px: number) => `calc(${px}px * var(--font-scale, 1))`;
