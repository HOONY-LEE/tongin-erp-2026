/**
 * 한글 이름 → 로그인 ID(이름_성, 예: 이성훈 → sunghoon_lee).
 * 국어의 로마자 표기법 그대로가 아니라 여권·명함에서 흔히 쓰는 표기를 따른다(성 sung, 훈 hoon, 영 young, 희 hee).
 * 성은 관용 표기 표(이 lee, 김 kim, 박 park …), 이름은 음절마다 규칙으로 옮긴다. 어색한 이름은 OVERRIDE에 적는다.
 */

const SURNAME: Record<string, string> = {
  가: 'ka',
  강: 'kang',
  경: 'kyung',
  고: 'ko',
  곽: 'kwak',
  구: 'koo',
  권: 'kwon',
  김: 'kim',
  나: 'na',
  남: 'nam',
  노: 'noh',
  도: 'do',
  류: 'ryu',
  문: 'moon',
  민: 'min',
  박: 'park',
  배: 'bae',
  백: 'baek',
  변: 'byun',
  서: 'seo',
  석: 'seok',
  성: 'sung',
  손: 'son',
  송: 'song',
  신: 'shin',
  심: 'shim',
  안: 'ahn',
  양: 'yang',
  엄: 'eom',
  오: 'oh',
  왕: 'wang',
  우: 'woo',
  원: 'won',
  위: 'wi',
  유: 'yoo',
  윤: 'yoon',
  이: 'lee',
  인: 'in',
  임: 'lim',
  장: 'jang',
  전: 'jeon',
  정: 'jung',
  조: 'cho',
  주: 'joo',
  지: 'ji',
  진: 'jin',
  차: 'cha',
  채: 'chae',
  천: 'chun',
  최: 'choi',
  피: 'pi',
  하: 'ha',
  한: 'han',
  허: 'heo',
  홍: 'hong',
  황: 'hwang',
};

/** 규칙으로 옮기면 어색한 이름 — 전체 이름 그대로 */
const OVERRIDE: Record<string, string> = {};

const INITIAL = [
  'k',
  'kk',
  'n',
  'd',
  'tt',
  'r',
  'm',
  'b',
  'pp',
  's',
  'ss',
  '',
  'j',
  'jj',
  'ch',
  'k',
  't',
  'p',
  'h',
];
const VOWEL = [
  'a',
  'ae',
  'ya',
  'yae',
  'eo',
  'e',
  'yeo',
  'ye',
  'o',
  'wa',
  'wae',
  'oe',
  'yo',
  'u',
  'wo',
  'we',
  'wi',
  'yu',
  'eu',
  'ui',
  'i',
];
const FINAL = [
  '',
  'k',
  'k',
  'k',
  'n',
  'n',
  'n',
  't',
  'l',
  'k',
  'm',
  'l',
  'l',
  'l',
  'p',
  'l',
  'm',
  'p',
  'p',
  't',
  't',
  'ng',
  't',
  't',
  'k',
  't',
  'p',
  't',
];

// 모음 번호
const EO = 4,
  YEO = 6,
  U = 13,
  YU = 17,
  EUI = 19;
// 받침 번호
const N = 4,
  L = 8,
  NG = 21;
// 초성 번호
const IEUNG = 11;

function syllable(ch: string): string {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return '';
  const ini = Math.floor(code / 588);
  const vow = Math.floor((code % 588) / 28);
  const fin = code % 28;
  let v = VOWEL[vow];
  if (vow === EO && (fin === NG || fin === L || fin === N)) v = 'u'; // 성 sung, 철 chul, 선 sun
  if (vow === YEO && fin === NG) v = ini === IEUNG ? 'you' : 'yu'; // 영 young, 경 kyung
  if (vow === YEO && fin === N && ini !== IEUNG) v = 'yu'; // 현 hyun (연은 yeon)
  if (vow === U && fin !== NG) v = 'oo'; // 훈 hoon, 수 soo, 숙 sook
  if (vow === U && ini === IEUNG) v = `w${v}`; // 우 woo, 운 woon
  if (vow === YU && ini === IEUNG) v = 'yoo'; // 유 yoo, 윤 yoon
  if (vow === EUI && ini !== IEUNG) v = 'ee'; // 희 hee
  return INITIAL[ini] + v + FINAL[fin];
}

/** 이름(성 한 글자 + 이름) → '이름_성'. 영문 소문자·밑줄만 남긴다 */
export function romanizeName(name: string): string {
  if (OVERRIDE[name]) return OVERRIDE[name];
  const family = SURNAME[name[0]] ?? syllable(name[0]);
  const given = [...name.slice(1)].map(syllable).join('');
  return `${given}_${family}`.replace(/[^a-z_]/g, '');
}
