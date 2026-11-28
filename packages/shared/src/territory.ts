/**
 * 지점 담당 영역 — 시·군·구 단위. 키는 '시도|시군구'(예: '서울|강남구', '경기|성남시 분당구').
 * 지도는 통계청 2018 행정구역 경계라, 그 뒤 바뀐 구역은 옛 이름으로 바꿔 찾는다.
 */
export const territoryKey = (sido: string, sigungu: string) => `${sido}|${sigungu}`;

/** 2018 뒤에 바뀐 구역 → 지도(2018)의 구역 */
const TERRITORY_ALIAS: Record<string, string> = {
  '인천|제물포구': '인천|중구',
  '인천|영종구': '인천|중구',
  '인천|검단구': '인천|서구',
  '대구|군위군': '경북|군위군',
};

/**
 * 주소(시도·시군구)로 찾아볼 영역 키 — 앞에서부터 먼저 맞는 것.
 * '화성시 동탄구'처럼 지도에 없는 구는 시('화성시')로, '수원시'처럼 구가 없으면 그 시의 구들로(서버가 처리).
 */
export function territoryCandidates(sido?: string | null, sigungu?: string | null): string[] {
  const s = (sido ?? '').trim();
  const g = (sigungu ?? '').trim().replace(/\s+/g, ' ');
  if (!s || !g) return [];
  const exact = territoryKey(s, g);
  const out = [exact];
  if (TERRITORY_ALIAS[exact]) out.push(TERRITORY_ALIAS[exact]);
  // 세종은 시군구가 '세종시'·'세종특별자치시' 등으로 온다 — 지도는 '세종시' 하나
  if (s === '세종') out.push(territoryKey('세종', '세종시'));
  const city = g.match(/^(\S+시) \S+구$/)?.[1];
  if (city) out.push(territoryKey(s, city));
  return out;
}
