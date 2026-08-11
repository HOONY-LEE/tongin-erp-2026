// 한국어 조사 처리 — 코드로 만든 문구가 "상담배정(으)로"처럼 어색해지지 않도록.

/** 마지막 글자의 받침 코드(0이면 받침 없음). 한글이 아니면 null. */
function jongseong(word: string): number | null {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return code % 28;
}

/** 로 / 으로 */
export function josaRo(word: string): string {
  const j = jongseong(word);
  if (j === null) return '(으)로';
  // 받침이 없거나 ㄹ(8) 받침이면 '로'
  return j === 0 || j === 8 ? '로' : '으로';
}

/** 을 / 를 */
export function josaEul(word: string): string {
  const j = jongseong(word);
  if (j === null) return '을(를)';
  return j === 0 ? '를' : '을';
}
