import KoreanLunarCalendar from 'korean-lunar-calendar';

/**
 * 손 없는 날 — 음력 날짜 끝자리가 9·0인 날(음력 9·10·19·20·29·30일).
 * 이사 업계에서 '손(귀신)이 없어 이사하기 좋은 날'로 많이 찾는다.
 * 음력은 한국천문연구원 자료를 담은 korean-lunar-calendar로 바꾼다(1000~2050년).
 */
const lunar = new KoreanLunarCalendar();
const cache = new Map<string, boolean>();

export function isSonEomneunNal(d: Date): boolean {
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let ok = false;
  // 범위를 벗어난 해는 false를 돌려준다
  if (lunar.setSolarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())) {
    const day = lunar.getLunarCalendar().day;
    ok = day % 10 === 9 || day % 10 === 0;
  }
  cache.set(key, ok);
  return ok;
}

/** 손 없는 날 날짜 글자색(주황) */
export const SON_COLOR = 'var(--ark-color-warning-600, #ea580c)';
