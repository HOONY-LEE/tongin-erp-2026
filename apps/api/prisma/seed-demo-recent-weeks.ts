/**
 * 시드(추가, 한 번만) — 시연(2026-11-28) 직전 '최근 9주'를 고르게 채운다. 앞선 지난 기록 시드는 돌린 날까지만
 * 만들어 2026-11-23 무렵에서 멈췄고, 주마다 건수가 들쭉날쭉했다. 주간 보고·대시보드·AI 비서가 "이번 주·지난주"를
 * 물었을 때 그럴듯한 숫자가 나오도록. 시연용이다.
 *
 *   pnpm --filter @tongin/api demo:seed:recent-weeks     # 만들기(이미 있으면 건너뛴다)
 *   pnpm --filter @tongin/api demo:clear:recent-weeks    # 지우기(실운영 전환 때)
 *
 * - 기간: 2026-09-28(월) ~ 2026-11-28(토) 18:00(한국 시간). '지금'은 이 끝 시각으로 보고 단계를 정한다
 *   (서버가 11/26~27에 돌아도 시연 당일까지의 모습이 된다)
 * - 접수: 주마다 목표 건수(60~110건, 주마다 다르게)에서 DB에 이미 있는 그 주 접수를 뺀 만큼만 더한다.
 *   지점마다·주마다 출렁임이 있다(바쁜 지점·조용한 주). 경로·지점마다 계약 전환율이 다르다(대략 30~45%)
 * - 접수 → 견적 → 계약(계약금) → 본사 승인 → 작업오더(이사일) → 잔금, 일부 취소(seed-demo-history.ts와 같은 흐름)
 *   · 최근 이틀 안에 서명한 계약 일부는 본사 승인 전(계약미승인 CONTRACT_PENDING)
 *   · 최근 며칠 접수 일부는 담당자 없음(접수·상담토스), 이번 주 미계약(접수~견적) 건이 남는다
 *   · 이사가 끝났는데 잔금이 안 들어온 건(미수금), 계약서만 보내고 계약금 대기인 건
 *   · 앞으로의 이사(11/29 ~ 12월) — 작업오더 배정(ASSIGNED), 당일 작업은 진행 중(IN_PROGRESS)
 * - A/S·CS: 상담 중 문의(CS), 이사 뒤 A/S. 최근 건은 아직 처리 중, 일부는 긴급(HIGH)
 * - 상담 콜: 전화 접수와 이어진 콜 + DB의 마지막 콜 뒤부터 문의·부재중 콜백·스팸(끝 무렵 몇 건은 콜백 대기)
 * - 확인콜(이사 이틀 전)·해피콜(이사 다음 날)
 * - 결재: 본사 직원의 결재 양식·일반 품의. DB의 마지막 결재 뒤로 평소만큼, 그 앞 주에는 조금만 더한다.
 *   최근 문서 일부는 결재 중 — 부서장(1단계)·대표(2단계) 결재함이 비지 않게 사람마다 몇 건씩 남긴다
 *
 * 표시: id가 'd0d01027-5eed-'로 시작한다(clear-demo-recent-weeks.ts). 번호가 있는 표는 옛 번호도 'RW-'.
 * 화면 번호는 앱과 같은 규칙(next_doc_no)으로 그날 날짜에 붙는다. 같은 난수 씨앗이라 같은 DB면 결과가 같다.
 * 고객은 음절 목록으로 만든 가상 인물, 전화는 010-0097-xxxx(가운데가 0으로 시작 — 쓰이지 않는 번호대,
 * 다른 시드의 0090~0096·0098·0099번대와 겹치지 않게).
 * 지점·직원·상품·거래처는 실행할 때 DB에서 찾는다(seed-demo.ts·seed-demo-catalog.ts를 먼저 돌려야 한다).
 * 실제로 문자·전화를 보내지 않는다 — 행만 넣는다.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { KR_HOLIDAYS } from '@tongin/shared';
import { RW_ID_PREFIX, RW_MARK, hasDemoRecentWeeks } from './clear-demo-recent-weeks';

const prisma = new PrismaClient();

// ── 날짜 — 하루를 '1970-01-01부터 며칠째(한국 날짜)'인 정수로 다룬다(seed-demo-history.ts와 같은 규칙) ──
const DAY = 86_400_000;
const dnOf = (y: number, m: number, d: number) => Date.UTC(y, m, d) / DAY;
/** DATE 칸 — UTC 자정(다른 시드와 같은 규칙) */
const dateOf = (dn: number) => new Date(dn * DAY);
/** 한국 시각 h:m의 순간 */
const ts = (dn: number, h: number, m = 0) => new Date(dn * DAY + (h - 9) * 3600_000 + m * 60_000);
const ymd = (dn: number) => dateOf(dn).toISOString().slice(0, 10);
const dnOfDate = (d: Date) => Math.floor((+d + 9 * 3600_000) / DAY);
const ymOf = (dn: number) => {
  const d = dateOf(dn);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
};
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const isWorkday = (dn: number) => {
  const w = ymOf(dn).w;
  return w !== 0 && w !== 6 && !KR_HOLIDAYS[ymd(dn)];
};

/** 채울 첫 주(월요일) — 2026-09-28 */
const FROM = dnOf(2026, 8, 28);
/** 마지막 날 — 2026-11-28(토). 이 날 18:00을 '지금'으로 본다 */
const TODAY = dnOf(2026, 10, 28);
const END_HOUR = 18;
const NOW = +ts(TODAY, END_HOUR);
/** 주마다 목표 접수 건수(월요일 시작 9주) — 주마다 다르게, 마지막 주는 토요일 18시까지 */
const WEEK_TARGETS = [74, 63, 88, 79, 102, 84, 93, 107, 104];
/**
 * 그 주에 이미 목표만큼 있어도 이만큼은 더한다(지점별 출렁임·전환이 보이게). 바로 앞 두 주는 더 많이 —
 * 앞선 시드의 접수는 돌린 날의 단계에 멈춰 있어, 이번 주의 견적·계약은 이 주들의 새 접수에서 나와야 한다
 */
const minAdd = (wi: number) =>
  wi === WEEK_TARGETS.length - 2 ? 24 : wi === WEEK_TARGETS.length - 3 ? 18 : 6;

// ── 난수(씨앗 고정) ──
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261128);
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;
function pick<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) < 0) return v;
  return items[items.length - 1][0];
}
const one = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
function gauss() {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}
function poisson(lambda: number) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
}
/** 문자열 → 0~1(지점별 고정 성향) */
function hash01(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
const won = (n: number) => Math.round(n / 10_000) * 10_000;
const round = (n: number, unit: number) => Math.max(unit, Math.round(n / unit) * unit);
/** 그날 h1~h2시 사이의 순간 — 마지막 날은 '지금'(18시)을 넘지 않게 */
const at = (dn: number, h1: number, h2: number) =>
  ts(dn, int(h1, dn === TODAY ? Math.min(h2, END_HOUR - 1) : h2), int(0, 59));
const capNow = (d: Date) => new Date(Math.min(NOW, +d));

// ── 표시 id — 'd0d01027-5eed-<표 2자리>00-8000-<순번 12자리>' ──
const TABLE_CODE = {
  cu: '01',
  ld: '02',
  es: '03',
  ct: '04',
  pm: '05',
  wo: '06',
  wa: '07',
  tk: '08',
  call: '09',
  fu: '0a',
  ad: '0b',
  as: '0c',
  un: '0d',
} as const;
type TableKey = keyof typeof TABLE_CODE;
const idSeq: Partial<Record<TableKey, number>> = {};
function oid(table: TableKey) {
  const n = (idSeq[table] = (idSeq[table] ?? 0) + 1);
  return `${RW_ID_PREFIX}-${TABLE_CODE[table]}00-8000-${n.toString(16).padStart(12, '0')}`;
}
const mark = (p: string, n: number) => `${RW_MARK}${p}${String(n).padStart(5, '0')}`;

// ── 지역 — 지점 이름의 지역어로 출발지 시도를 고른다(seed-demo-history.ts와 같은 표) ──
type Region = { sido: string; sigungu: string; zip: string; roads: string[] };
const R = (sido: string, sigungu: string, zip: string, ...roads: string[]): Region => ({
  sido,
  sigungu,
  zip,
  roads,
});
const REGIONS: [RegExp, Region][] = [
  [
    /강남|압구정|청담|일원|논현|신사|도곡|대치|개포|삼성|역삼|수서|VIP/,
    R('서울', '강남구', '06', '테헤란로', '논현로', '선릉로'),
  ],
  [/서초|양재|반포|잠원|방배/, R('서울', '서초구', '06', '서초대로', '반포대로', '양재대로')],
  [/송파|잠실|가락|석촌|방이|신천|위례/, R('서울', '송파구', '05', '올림픽로', '송파대로')],
  [/강동/, R('서울', '강동구', '05', '천호대로', '고덕로')],
  [/마포|공덕/, R('서울', '마포구', '04', '마포대로', '월드컵북로')],
  [/목동|이촌|용산/, R('서울', '용산구', '04', '한강대로', '이촌로')],
  [/성동/, R('서울', '성동구', '04', '왕십리로', '성수일로')],
  [/광진/, R('서울', '광진구', '05', '능동로', '광나루로')],
  [/동작/, R('서울', '동작구', '07', '상도로', '노량진로')],
  [/영등포|여의도/, R('서울', '영등포구', '07', '여의대로', '영등포로')],
  [/은평/, R('서울', '은평구', '03', '진관2로', '통일로')],
  [/방학|노원|상계/, R('서울', '노원구', '01', '동일로', '상계로')],
  [/성북|길음/, R('서울', '성북구', '02', '삼양로', '동소문로')],
  [/중구|명동/, R('서울', '중구', '04', '퇴계로', '을지로')],
  [/강서|마곡/, R('서울', '강서구', '07', '마곡중앙로', '공항대로')],
  [/미아/, R('서울', '강북구', '01', '도봉로', '솔매로')],
  [/분당|판교|정자|수내|서현|이매|야탑/, R('경기', '성남시 분당구', '13', '판교역로', '정자일로')],
  [/수원|영통|권선|광교/, R('경기', '수원시 영통구', '16', '광교중앙로', '영통로')],
  [/용인|상현|기흥|수지|동천|죽전|보정/, R('경기', '용인시 수지구', '16', '포은대로', '수지로')],
  [/일산|고양|덕양/, R('경기', '고양시 일산동구', '10', '호수로', '중앙로')],
  [/파주/, R('경기', '파주시', '10', '회동길', '금정로')],
  [/김포/, R('경기', '김포시', '10', '김포한강4로', '사우중로')],
  [/의정부|양주/, R('경기', '의정부시', '11', '시민로', '평화로')],
  [/남양주/, R('경기', '남양주시', '12', '경춘로', '다산중앙로')],
  [/하남/, R('경기', '하남시', '12', '미사강변대로', '신장로')],
  [/안양/, R('경기', '안양시 동안구', '14', '시민대로', '평촌대로')],
  [/부천|광명/, R('경기', '부천시', '14', '길주로', '중동로')],
  [/평택/, R('경기', '평택시', '17', '평택로', '중앙로')],
  [/동탄/, R('경기', '화성시', '18', '동탄대로', '동탄순환대로')],
  [/오산/, R('경기', '오산시', '18', '오산로', '성호대로')],
  [/과천/, R('경기', '과천시', '13', '중앙로', '별양로')],
  [/경기광주/, R('경기', '광주시', '12', '경충대로', '역동로')],
  [/인천|송도/, R('인천', '연수구', '21', '컨벤시아대로', '송도과학로')],
  [/대전|유성|둔산/, R('대전', '유성구', '34', '대학로', '한밭대로')],
  [/대구|달서|수성/, R('대구', '수성구', '42', '달구벌대로', '동대구로')],
  [/부산|해운대|동래/, R('부산', '해운대구', '48', '해운대로', '센텀중앙로')],
  [/광주|광산/, R('광주', '광산구', '62', '임방울대로', '수완로')],
  [/전주|덕진/, R('전북', '전주시 덕진구', '54', '백제대로', '기린대로')],
  [/청주|오창/, R('충북', '청주시 흥덕구', '28', '직지대로', '가로수로')],
  [/충주/, R('충북', '충주시', '27', '중앙로', '충원대로')],
  [/천안/, R('충남', '천안시 서북구', '31', '불당대로', '번영로')],
  [/아산/, R('충남', '아산시', '31', '배방로', '시민로')],
  [/세종/, R('세종', '세종시', '30', '한누리대로', '도움로')],
  [/춘천/, R('강원', '춘천시', '24', '중앙로', '퇴계로')],
  [/원주/, R('강원', '원주시', '26', '단구로', '시청로')],
  [/제주/, R('제주', '제주시', '63', '연북로', '노형로')],
  [/포항|경주/, R('경북', '포항시 남구', '37', '포스코대로', '대잠길')],
  [/경산/, R('경북', '경산시', '38', '중앙로', '대학로')],
  [/창원/, R('경남', '창원시 성산구', '51', '중앙대로', '원이대로')],
  [/나주/, R('전남', '나주시', '58', '빛가람로', '전력로')],
];
const regionOf = (name: string) => REGIONS.find(([re]) => re.test(name))?.[1] ?? REGIONS[0][1];
const SEOUL = REGIONS.filter(([, r]) => r.sido === '서울').map(([, r]) => r);
const GYEONGGI = REGIONS.filter(([, r]) => r.sido === '경기').map(([, r]) => r);
function address(r: Region) {
  return {
    zip: `${r.zip}${String(int(100, 998)).padStart(3, '0')}`,
    addr: `${r.sido} ${r.sigungu} ${one(r.roads)} ${int(10, 299)}`,
    detail: `${int(101, 112)}동 ${int(2, 25)}0${int(1, 4)}호`,
    sido: r.sido,
    sigungu: r.sigungu.split(' ')[0],
  };
}

// ── 가상 고객 — 음절 목록(seed-demo-history.ts와 같은 표) ──
const FAMILY = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남'.split('');
const GIVEN = (
  '민준 서연 도윤 하은 지호 수아 예준 지유 시우 서윤 주원 하린 지훈 채원 건우 다은 우진 예린 현우 소율 ' +
  '태윤 유나 성민 가은 준혁 지민 승현 수빈 은우 나연 재원 서진 동현 하윤 민서 영호 미경 정훈 혜진 상철'
).split(' ');
/** 010-0097-xxxx(가운데가 0으로 시작 — 실제로 쓰이지 않는 번호대). 다른 시드와 겹치지 않게 0097번대만 */
const fakePhone = (n: number) => `0100097${String(n % 10_000).padStart(4, '0')}`;
let phoneNo = 0;
const nextPhone = () => fakePhone(++phoneNo);

// ── 분포(seed-demo-history.ts의 최근 비중) ──
const SOURCES = [
  'PHONE',
  'NAVER',
  'HOMEPAGE',
  'AIBOT',
  'INSTAGRAM',
  'PARTNER',
  'WALK_IN',
  'SYSTEM',
  'ETC',
] as const;
type Source = (typeof SOURCES)[number];
const SOURCE_WEIGHTS: [Source, number][] = [
  ['PHONE', 24],
  ['NAVER', 18],
  ['HOMEPAGE', 14],
  ['AIBOT', 16],
  ['INSTAGRAM', 11],
  ['PARTNER', 10],
  ['WALK_IN', 4],
  ['SYSTEM', 4],
  ['ETC', 2],
];
/** 경로별 계약 전환율(seed-demo-history.ts와 같은 값 — 아래에서 주·지점 성향을 곱한다) */
const CONV: Record<Source, number> = {
  PHONE: 0.52,
  NAVER: 0.4,
  HOMEPAGE: 0.45,
  AIBOT: 0.37,
  INSTAGRAM: 0.34,
  PARTNER: 0.6,
  WALK_IN: 0.56,
  SYSTEM: 0.46,
  ETC: 0.32,
};
const LINES: [string, number][] = [
  ['MOVING', 78],
  ['B2B_MOVING', 7],
  ['LIVING', 9],
  ['CARE', 6],
];
const MOVING_PRODUCTS: [string, number][] = [
  ['P-HOME', 60],
  ['P-HALF', 30],
  ['P-STORE', 10],
];
/** 상품별 금액 가운데 값(원)·퍼짐 */
const PRICE: Record<string, [number, number]> = {
  'P-HOME': [2_300_000, 0.42],
  'P-HALF': [1_350_000, 0.38],
  'P-STORE': [3_200_000, 0.45],
  'P-OFFICE': [9_000_000, 0.6],
};
const SERVICE_PRODUCTS: Record<string, [string, string, number][]> = {
  LIVING: [
    ['P-LV-CLEAN', '입주청소', 380_000],
    ['P-LV-ORG', '정리수납', 450_000],
  ],
  CARE: [
    ['P-CR-AIRCON', '에어컨 분해세척', 150_000],
    ['P-CR-SICKHOUSE', '새집증후군 시공', 300_000],
  ],
};
const CANCEL: Record<'EARLY' | 'QUOTED' | 'CONTRACT', [string, string, number][]> = {
  EARLY: [
    ['연락 불가', '세 번 통화 시도, 문자에도 답 없음', 30],
    ['고객 취소', '이사 계획이 미뤄졌다고 함', 25],
    ['타사 계약', '다른 업체와 이미 계약', 20],
    ['중복 접수', '가족이 따로 접수한 건과 중복', 10],
    ['이사일 마감', '요청 날짜 작업 마감', 10],
    ['기타', '단순 가격 문의', 5],
  ],
  QUOTED: [
    ['타사 계약', '견적 비교 후 타사 선택', 45],
    ['고객 취소', '견적 금액 부담으로 보류', 30],
    ['연락 불가', '견적 발송 후 연락 두절', 10],
    ['기타', '직접 이사하기로 함', 15],
  ],
  CONTRACT: [
    ['고객 취소', '입주 일정 변경으로 계약 취소(계약금 환불)', 70],
    ['기타', '매매 계약 파기로 이사 취소', 30],
  ],
};
const AS_SUBJECTS: Record<string, string[]> = {
  WORK: [
    '가구 모서리 찍힘',
    '냉장고 문 수평 불량',
    '바닥 긁힘 보상 요청',
    '장롱 조립 마감 불량',
    '세탁기 배수 연결 확인',
  ],
  COST: ['추가 요금 문의', '사다리차 비용 정산 문의', '영수증 재발행 요청'],
  CONSULT: ['작업자 응대 불만', '도착 시간 지연 문의'],
  ETC: ['분실 물품 확인 요청', '폐기물 수거 일정 문의'],
};
const CS_SUBJECTS: Record<string, string[]> = {
  CONSULT: ['견적 방문 일정 변경', '상담 직원 변경 요청', '이사 날짜 변경 문의'],
  COST: ['계약금 환불 문의', '견적 금액 재확인 요청', '카드 결제 가능 여부'],
  ETC: ['보관이사 기간 연장 문의', '포장재 미리 받기 문의'],
};
/** 로그인 화면 데모 지점장 — 이 지점들은 더 바쁘게(seed-demo-history.ts와 같은 목록) */
const DEMO_LOGINS = ['dongseok_shin', 'inseok_choi', 'keunsung_choi', 'dongchul_kim', 'bongki_yoo'];

type Outcome = 'WON' | 'LOST_EARLY' | 'LOST_QUOTED' | 'CONTRACT_CANCELED';
type Emp = {
  id: string;
  name: string;
  orgUnitId: string;
  orgType: string;
  orgName: string;
  orgCode: string;
  rank: number;
  userId: string | null;
};

async function main() {
  const t0 = Date.now();
  if (await hasDemoRecentWeeks(prisma)) {
    console.log(
      '[demo-recent-weeks] 이미 있다 — 건너뜀(다시 만들려면 먼저 demo:clear:recent-weeks)',
    );
    return;
  }

  // ════════════════ 참조 ════════════════
  // 지점 — 계정이 켜진 지점장이 있는 지점(seed-demo-history.ts와 같은 기준)
  const managers = await prisma.employee.findMany({
    where: {
      isActive: true,
      orgUnit: { type: 'BRANCH', isActive: true },
      appUsers: { some: { isActive: true } },
    },
    select: {
      id: true,
      orgUnitId: true,
      orgUnit: { select: { name: true } },
      appUsers: { select: { loginId: true } },
    },
    orderBy: { empNo: 'asc' },
  });
  const branchMap = new Map<string, (typeof managers)[number]>();
  for (const m of managers) if (!branchMap.has(m.orgUnitId)) branchMap.set(m.orgUnitId, m);
  if (!branchMap.size) {
    console.error(
      '계정이 있는 지점이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed` 를 돌려야 한다',
    );
    process.exit(1);
  }
  const products = new Map(
    (await prisma.product.findMany({ select: { id: true, code: true } })).map((p) => [
      p.code,
      p.id,
    ]),
  );
  if (!products.get('P-HOME')) {
    console.error(
      '상품이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed:catalog` 를 돌려야 한다',
    );
    process.exit(1);
  }
  const productId = (code: string) => products.get(code) ?? products.get('P-HOME')!;

  // 지점 가중치 — 이름 해시로 순위를 정하고(바쁜 지점이 있게), 서울·경기·데모 로그인 지점은 더 바쁘게
  const branches = [...branchMap.values()]
    .map((m) => ({
      empId: m.id,
      orgUnitId: m.orgUnitId,
      name: m.orgUnit.name,
      region: regionOf(m.orgUnit.name),
      demo: m.appUsers.some((u) => DEMO_LOGINS.includes(u.loginId)),
      h: hash01(m.orgUnit.name),
    }))
    .sort((a, b) => a.h - b.h)
    .map((b, rank) => ({
      ...b,
      weight:
        (1 / Math.pow(rank + 4, 0.9)) *
        (['서울', '경기'].includes(b.region.sido) ? 1.7 : 1) *
        (b.demo ? 2 : 1),
      conv: 0.82 + 0.36 * hash01(`${b.name}#conv`),
    }));
  type Branch = (typeof branches)[number];
  const branchById = new Map(branches.map((b) => [b.orgUnitId, b]));

  // 제휴 접수(경로 PARTNER)에 이을 제휴사·전속 계약사
  const partners = await prisma.partner.findMany({
    where: { type: { in: ['AFFILIATE', 'EXCLUSIVE'] }, isActive: true },
    select: { id: true, type: true },
    orderBy: { code: 'asc' },
  });
  const partnerPick = partners.map(
    (p) => [p.id, (p.type === 'AFFILIATE' ? 1 : 0.4) * (0.5 + hash01(p.id))] as const,
  );

  // 본사 직원 — 상담 콜·확인콜 담당, 결재(결재 서비스 headOf와 같은 규칙)
  const orgs = await prisma.orgUnit.findMany({
    select: { id: true, parentId: true, type: true, name: true, code: true },
  });
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const parents = new Map(orgs.map((o) => [o.id, o.parentId]));
  const empRows = await prisma.employee.findMany({
    where: { isActive: true, orgUnit: { isActive: true } },
    select: {
      id: true,
      name: true,
      orgUnitId: true,
      position: { select: { sortOrder: true } },
      appUsers: {
        where: { isActive: true, principalType: 'HUMAN' },
        select: { id: true },
        orderBy: { loginId: 'asc' },
        take: 1,
      },
    },
    orderBy: [{ empNo: 'asc' }, { id: 'asc' }],
  });
  const emps: Emp[] = empRows.map((e) => {
    const o = orgById.get(e.orgUnitId)!;
    return {
      id: e.id,
      name: e.name,
      orgUnitId: e.orgUnitId,
      orgType: o.type,
      orgName: o.name,
      orgCode: o.code,
      rank: e.position?.sortOrder ?? 9999,
      userId: e.appUsers[0]?.id ?? null,
    };
  });
  const hqEmps = emps.filter((e) => e.orgType !== 'BRANCH');
  const hqPool = hqEmps.length ? hqEmps : emps;
  const byOrg = new Map<string, Emp[]>();
  for (const e of emps) {
    if (!byOrg.has(e.orgUnitId)) byOrg.set(e.orgUnitId, []);
    byOrg.get(e.orgUnitId)!.push(e);
  }
  const deptEmps = (re: RegExp, codes: string[] = []) => {
    const xs = hqEmps.filter((e) => re.test(e.orgName) || codes.includes(e.orgCode));
    return xs.length ? xs : hqPool;
  };
  const csEmps = deptEmps(/고객관리|홈플래너/, ['DEPT-CS', 'DEPT-HOME']);
  const groupOrg = orgs.find((o) => o.name === '통인그룹') ?? orgs.find((o) => o.type === 'GROUP');
  const mgmtOrg =
    orgs.find((o) => o.name === '경영관리') ?? orgs.find((o) => o.code === 'DEPT-MGMT');
  const headOf = (orgId: string | null | undefined, exclude: Set<string>) => {
    const seen = new Set<string>();
    for (let cur = orgId ?? null; cur && !seen.has(cur); cur = parents.get(cur) ?? null) {
      seen.add(cur);
      const top = (byOrg.get(cur) ?? [])
        .filter((e) => !exclude.has(e.id))
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))[0];
      if (top) return top;
    }
    return null;
  };

  // 주마다 이미 있는 접수 수(한국 시간 월요일 시작)
  const weekRows = await prisma.$queryRawUnsafe<{ wk: string; n: number }[]>(
    `SELECT to_char(date_trunc('week', created_at AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS wk,
            COUNT(*)::int AS n
       FROM lead WHERE created_at >= $1 AND created_at < $2 GROUP BY 1`,
    ts(FROM, 0),
    ts(FROM + WEEK_TARGETS.length * 7, 0),
  );
  const haveByWeek = new Map(weekRows.map((r) => [r.wk, r.n]));
  // 상담 콜·결재는 DB의 마지막 기록 뒤부터 평소만큼(앞선 시드가 멈춘 곳에서 이어서)
  const lastCall = await prisma.csCall.aggregate({ _max: { receivedAt: true } });
  const lastCallAt = +(lastCall._max.receivedAt ?? ts(FROM, 0));
  const lastDoc = await prisma.approvalDoc.aggregate({ _max: { submittedAt: true } });
  const lastDocAt = +(lastDoc._max.submittedAt ?? ts(FROM, 0));

  // ════════════════ 1. 접수 → 견적 → 계약 → 결제 → 작업 ════════════════
  type Customer = Prisma.CustomerCreateManyInput & { id: string };
  type Lead = Prisma.LeadCreateManyInput & { id: string; createdAt: Date; status: string };
  const customers: Customer[] = [];
  const leads: Lead[] = [];
  const estimates: (Prisma.EstimateCreateManyInput & { id: string; createdAt: Date })[] = [];
  const contracts: (Prisma.ContractCreateManyInput & { id: string; createdAt: Date })[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const workOrders: (Prisma.WorkOrderCreateManyInput & { id: string; createdAt: Date })[] = [];
  const assignments: Prisma.WorkAssignmentCreateManyInput[] = [];
  const tickets: (Prisma.SupportTicketCreateManyInput & { kind: string; createdAt: Date })[] = [];
  const seq = { cu: 0, rc: 0, es: 0, ct: 0, wo: 0, tk: 0 };

  const newCustomer = (b: Branch, created: Date, a: ReturnType<typeof address>): Customer => {
    const c: Customer = {
      id: oid('cu'),
      legacyNo: mark('CU', ++seq.cu),
      name: one(FAMILY) + one(GIVEN),
      phonePrimary: nextPhone(),
      grade: 'NORMAL',
      zipcode: a.zip,
      addr: a.addr,
      addrDetail: a.detail,
      sido: a.sido,
      sigungu: a.sigungu,
      ownerOrgId: b.orgUnitId,
      createdAt: created,
    };
    customers.push(c);
    return c;
  };

  function ticket(
    kind: string,
    dn: number,
    category: string,
    subject: string,
    contractId: string | null,
    leadId: string,
    customerId: string | null,
    b: Branch,
  ) {
    const age = TODAY - dn;
    const priority = pick([
      ['HIGH', 20],
      ['NORMAL', 65],
      ['LOW', 15],
    ]);
    const status =
      age > 14
        ? pick([
            ['CLOSED', 70],
            ['RESOLVED', 25],
            ['CANCELED', 5],
          ])
        : age > 3
          ? pick([
              ['RESOLVED', 50],
              ['IN_PROGRESS', 40],
              ['CLOSED', 10],
            ])
          : pick([
              ['RECEIVED', 60],
              ['IN_PROGRESS', 40],
            ]);
    return {
      id: oid('tk'),
      ticketNo: '',
      legacyNo: mark(kind, ++seq.tk),
      kind,
      customerId,
      contractId,
      leadId,
      orgUnitId: b.orgUnitId,
      category,
      channel: pick([
        ['PHONE', 60],
        ['KAKAO', 25],
        ['EMAIL', 10],
        ['VISIT', 5],
      ]),
      subject,
      content: `${subject} — 고객 요청 내용 확인`,
      priority,
      status,
      assigneeEmpId: status === 'RECEIVED' ? null : b.empId,
      resolution:
        status === 'RESOLVED' || status === 'CLOSED'
          ? kind === 'AS'
            ? one([
                '현장 방문 수리 완료',
                '보상금 지급으로 종결',
                '재설치 완료',
                '고객 안내로 종결',
              ])
            : one(['안내 완료', '일정 변경 처리', '환불 처리 완료'])
          : null,
      createdAt: at(dn, 9, 18),
    };
  }

  /** 하루 접수 비중 — 월요일·월말 많고 일요일 적다. 마지막 날(토)은 시연 날이라 평일만큼 */
  const dayWeight = (dn: number) => {
    const { y, m, d, w } = ymOf(dn);
    const base =
      dn === TODAY
        ? 0.95
        : w === 0
          ? 0.42
          : w === 6
            ? 0.62
            : KR_HOLIDAYS[ymd(dn)]
              ? 0.5
              : w === 1
                ? 1.15
                : 1;
    return base * (d > lastDayOfMonth(y, m) - 4 ? 1.2 : 1);
  };

  const weekLog: string[] = [];
  for (const [wi, target] of WEEK_TARGETS.entries()) {
    const ws = FROM + wi * 7;
    const days: [number, number][] = [];
    for (let dn = ws; dn < ws + 7 && dn <= TODAY; dn++) days.push([dn, dayWeight(dn)]);
    const have = haveByWeek.get(ymd(ws)) ?? 0;
    const n = Math.max(minAdd(wi), target - have);
    weekLog.push(`${ymd(ws).slice(5)} ${have}→${have + n}`);
    // 이번 주 지점 출렁임 — 같은 지점도 주마다 바쁘거나 조용하다
    const branchPick: [Branch, number][] = branches.map((b) => [
      b,
      b.weight * (0.45 + 1.2 * hash01(`${b.name}#${ws}`)),
    ]);
    // 이번 주 전환 성향 — 주마다 계약 전환율이 조금씩 다르다
    const weekConv = 0.85 + 0.3 * rnd();

    for (let k = 0; k < n; k++) {
      const dn = pick(days);
      const b = pick(branchPick);
      const line = pick(LINES);
      const source = pick(SOURCE_WEIGHTS);
      // 접수 시각 — 낮 시간 위주, 홈페이지·AI상담봇은 저녁·밤에도(마지막 날은 18시 전)
      const night = source === 'AIBOT' || source === 'HOMEPAGE' || source === 'INSTAGRAM';
      let hour = pick<number>([
        [9, 8],
        [10, 14],
        [11, 13],
        [12, 6],
        [13, 9],
        [14, 12],
        [15, 11],
        [16, 9],
        [17, 7],
        [18, 4],
        [19, night ? 5 : 1],
        [20, night ? 5 : 0.5],
        [21, night ? 4 : 0],
        [22, night ? 3 : 0],
        [23, night ? 2 : 0],
      ]);
      if (dn === TODAY) hour = Math.min(hour, END_HOUR - 1);
      const createdAt = ts(dn, hour, int(0, 59));
      const fromRegion = chance(0.88)
        ? b.region
        : b.region.sido === '서울'
          ? one(GYEONGGI)
          : b.region.sido === '경기'
            ? one(SEOUL)
            : b.region;
      const toRegion = chance(0.8)
        ? fromRegion
        : pick<Region>([
            [one(SEOUL), 40],
            [one(GYEONGGI), 40],
            [one(REGIONS)[1], 20],
          ]);
      const from = address(fromRegion);
      const to = address(toRegion);
      // 고객 — 대개 새 고객, 리빙·케어는 가끔 이번 기간 이사 고객이 다시 맡긴다
      const service = line === 'LIVING' || line === 'CARE';
      const earlier =
        service && chance(0.3)
          ? customers.filter((c) => +new Date(c.createdAt!) < +createdAt - DAY).slice(-200)
          : [];
      const customer = earlier.length ? one(earlier) : newCustomer(b, createdAt, from);

      const leadId = oid('ld');
      const consultDn = dn + (chance(0.7) ? 0 : 1);
      const recent = dn >= TODAY - 2;
      const base = {
        id: leadId,
        leadNo: '',
        legacyNo: mark('RC', ++seq.rc),
        customerId: customer.id,
        orgUnitId: b.orgUnitId,
        partnerId: source === 'PARTNER' && partnerPick.length ? pick(partnerPick) : null,
        source,
        serviceLine: line,
        fromZipcode: from.zip,
        fromAddr: from.addr,
        fromAddrDetail: from.detail,
        fromSido: from.sido,
        fromSigungu: from.sigungu,
        createdAt,
      };

      // ── 리빙·케어 — 접수(예상 금액)만 ──
      if (service) {
        const [code, name, price] = one(SERVICE_PRODUCTS[line]);
        const amount = won(price * Math.exp(0.3 * gauss()));
        const serviceDn = dn + int(3, 25);
        const ok = chance(0.62);
        const cancelDn = dn + int(1, 6);
        const status =
          !ok && cancelDn <= TODAY
            ? 'CANCELED'
            : serviceDn < TODAY && ok
              ? 'DONE'
              : consultDn + 1 <= TODAY && ok
                ? 'CONTRACTED'
                : 'RECEIVED';
        leads.push({
          ...base,
          ownerEmpId: status === 'RECEIVED' ? null : b.empId,
          status,
          moveDate: dateOf(serviceDn),
          expectedAmount: amount,
          productNote: name,
          customerRequest: code === 'P-CR-AIRCON' ? `스탠드 ${int(1, 2)}대` : `${int(18, 45)}평`,
          ...(status === 'CANCELED'
            ? { cancelKind: '고객 취소', cancelReason: '일정이 맞지 않아 취소' }
            : {}),
          updatedAt: capNow(ts(Math.min(TODAY, status === 'DONE' ? serviceDn : dn + 1), 17)),
        });
        continue;
      }

      // ── 이사·기업이전 ──
      const productCode = line === 'B2B_MOVING' ? 'P-OFFICE' : pick(MOVING_PRODUCTS);
      const [median, spread] = PRICE[productCode];
      const priceUp = 1.04 * (from.sido === '서울' ? 1.08 : 1);
      const quoteAmount = Math.min(
        line === 'B2B_MOVING' ? 80_000_000 : 30_000_000,
        Math.max(700_000, won(median * priceUp * Math.exp(spread * gauss()))),
      );
      // 이사일 — 접수 1~9주 뒤(기업이전은 더 길게), 넷 중 하나는 월말로 몰린다
      let moveDn =
        dn + 6 + Math.round((rnd() + rnd() + rnd()) * 16) + (line === 'B2B_MOVING' ? 20 : 0);
      if (chance(0.27)) {
        const mv = ymOf(moveDn);
        const end = moveDn - mv.d + lastDayOfMonth(mv.y, mv.m);
        const target = end - int(0, 2);
        if (target > dn + 5) moveDn = target;
      }
      // 이번 주 접수는 시연 날까지 단계가 보이게 빠르게(방문 견적 0~2일, 서명 0~3일 뒤), 조금 더 계약된다
      const fast = dn >= TODAY - 5;
      const visitDn = Math.min(moveDn - 3, dn + (fast ? int(0, 2) : int(1, 5)));
      const quoteDn = visitDn;
      let signDn = Math.min(moveDn - 2, quoteDn + (fast ? int(0, 3) : int(0, 7)));
      // 지난주 접수는 대개 이번 주에 고민 끝에 서명하고, 조금 더 계약된다 — 앞선 시드의 멈춘 접수 몫을 메운다
      if (dn >= TODAY - 12 && dn < TODAY - 5 && chance(0.7))
        signDn = Math.min(moveDn - 2, Math.max(signDn, TODAY - 5 + int(0, 5)));
      const catchUp = fast ? 1.25 : dn < TODAY - 5 && signDn >= TODAY - 5 ? 1.4 : 1;
      const pWin = Math.min(
        0.75,
        CONV[source] * b.conv * weekConv * 0.86 * catchUp * (line === 'B2B_MOVING' ? 0.85 : 1),
      );
      const outcome: Outcome = chance(pWin)
        ? chance(0.06)
          ? 'CONTRACT_CANCELED'
          : 'WON'
        : chance(0.45)
          ? 'LOST_EARLY'
          : 'LOST_QUOTED';
      const cancelDn =
        outcome === 'LOST_EARLY'
          ? dn + int(1, 10)
          : outcome === 'LOST_QUOTED'
            ? quoteDn + int(3, 18)
            : outcome === 'CONTRACT_CANCELED'
              ? signDn + int(2, Math.max(2, moveDn - signDn - 1))
              : Infinity;
      const canceled = cancelDn <= TODAY;
      const quoted = outcome !== 'LOST_EARLY' && quoteDn <= TODAY;
      const signed = (outcome === 'WON' || outcome === 'CONTRACT_CANCELED') && signDn <= TODAY;
      // 최근 이틀 안에 서명한 계약 일부는 아직 본사 승인 전(계약미승인)
      const unapproved = outcome === 'WON' && signed && signDn >= TODAY - 2 && chance(0.45);
      // 작업오더 — 대개 승인 뒤 곧바로, 나머지는 이사 열흘 전쯤
      const woDn = chance(0.8) ? signDn + int(0, 2) : Math.max(signDn + 1, moveDn - 10);
      const hasWo = outcome === 'WON' && signed && !unapproved && woDn <= TODAY && woDn <= moveDn;
      const doneToday = moveDn === TODAY && chance(0.5);
      const done = hasWo && (moveDn < TODAY || doneToday);

      const status = canceled
        ? 'CANCELED'
        : done
          ? 'DONE'
          : hasWo
            ? 'WORK_TOSS'
            : unapproved
              ? 'CONTRACT_PENDING'
              : signed
                ? 'CONTRACTED'
                : quoted
                  ? 'QUOTED'
                  : consultDn <= TODAY && !(recent && chance(0.35))
                    ? 'CONSULT_TOSS'
                    : 'RECEIVED';
      const kind = canceled
        ? pick(
            CANCEL[
              outcome === 'LOST_EARLY' ? 'EARLY' : outcome === 'LOST_QUOTED' ? 'QUOTED' : 'CONTRACT'
            ].map(([k2, r, wt]) => [[k2, r] as const, wt] as const),
          )
        : null;
      const lastDn = Math.min(
        TODAY,
        canceled
          ? cancelDn
          : done
            ? moveDn
            : hasWo
              ? woDn
              : signed
                ? signDn
                : quoted
                  ? quoteDn
                  : dn,
      );
      // 담당자 — 접수 단계는 비어 있고, 최근 상담토스 일부도 아직 지점에서 담당을 안 정했다
      const noOwner = status === 'RECEIVED' || (status === 'CONSULT_TOSS' && recent && chance(0.4));
      leads.push({
        ...base,
        ownerEmpId: noOwner ? null : b.empId,
        status,
        toZipcode: to.zip,
        toAddr: to.addr,
        toAddrDetail: to.detail,
        toSido: to.sido,
        toSigungu: to.sigungu,
        moveDate: dateOf(moveDn),
        visitDate: quoted ? dateOf(visitDn) : null,
        expectedAmount: won(quoteAmount * (0.9 + rnd() * 0.2)),
        ...(kind ? { cancelKind: kind[0], cancelReason: kind[1] } : {}),
        updatedAt: capNow(new Date(Math.max(+createdAt + 60_000, +ts(lastDn, 17, int(0, 59))))),
      });
      if (!quoted) continue;

      // ── 견적 ──
      const estId = oid('es');
      const pyeong = productCode === 'P-OFFICE' ? int(40, 200) : int(12, 45);
      const deposit = won(quoteAmount * 0.1);
      const quotedAt = new Date(Math.max(+createdAt + 30 * 60_000, +at(quoteDn, 13, 18)));
      estimates.push({
        id: estId,
        estimateNo: '',
        legacyNo: mark('ES', ++seq.es),
        leadId,
        customerId: customer.id,
        orgUnitId: b.orgUnitId,
        productId: productId(productCode),
        estimatorEmpId: b.empId,
        fromZipcode: from.zip,
        fromAddr: from.addr,
        fromAddrDetail: from.detail,
        fromSido: from.sido,
        fromSigungu: from.sigungu,
        fromPyeong: pyeong,
        fromAccess: pick([
          ['ELEVATOR', 60],
          ['LADDER', 25],
          ['STAIRS', 15],
        ]),
        toZipcode: to.zip,
        toAddr: to.addr,
        toAddrDetail: to.detail,
        toSido: to.sido,
        toSigungu: to.sigungu,
        toPyeong: pyeong + int(-5, 8),
        toAccess: pick([
          ['ELEVATOR', 65],
          ['LADDER', 30],
          ['STAIRS', 5],
        ]),
        totalCbm: Math.round((quoteAmount / int(55_000, 75_000)) * 10) / 10,
        baseAmount: won(quoteAmount * 0.85),
        moveAmount: won(quoteAmount * 0.9),
        totalAmount: quoteAmount,
        depositAmount: deposit,
        balanceAmount: quoteAmount - deposit,
        status: 'QUOTED',
        createdAt: capNow(quotedAt),
      });

      // ── 계약 — 서명 전이면 계약서만 보낸 상태(계약금 대기) ──
      const draft = !signed && !canceled && outcome === 'WON';
      if (!signed && !draft) continue;
      const total = won(quoteAmount * (chance(0.35) ? 0.93 + rnd() * 0.06 : 1));
      const dep = won(total * 0.1);
      const ctNo = ++seq.ct;
      const contractId = oid('ct');
      const sentAt = capNow(new Date(+quotedAt + int(20, 180) * 60_000));
      const signedAt = signed
        ? new Date(Math.max(+sentAt + 10 * 60_000, +at(signDn, 10, 21)))
        : null;
      const contractCanceled = outcome === 'CONTRACT_CANCELED' && canceled;
      // 본사 승인 — 서명·계약금 뒤 몇 시간 안에(계약미승인 건은 아직)
      const approvedAt =
        signedAt && !unapproved ? capNow(new Date(+signedAt + int(1, 4) * 3600_000)) : null;
      contracts.push({
        id: contractId,
        contractNo: '',
        legacyNo: mark('CT', ctNo),
        estimateId: estId,
        leadId,
        customerId: customer.id,
        orgUnitId: b.orgUnitId,
        contractDate: dateOf(signed ? signDn : quoteDn),
        totalAmount: total,
        depositRatio: 0.1,
        depositAmount: dep,
        balanceAmount: total - dep,
        status: contractCanceled ? 'CANCELED' : signed ? 'SIGNED' : 'DRAFT',
        signedAt: signedAt ? capNow(signedAt) : null,
        signerName: signed ? customer.name : null,
        esignRef: signed ? `seed_rw_${ctNo}` : null,
        sentAt,
        approvedAt,
        createdAt: sentAt,
      });

      const depMethod = pick([
        ['VIRTUAL_ACCOUNT', 65],
        ['TRANSFER', 25],
        ['CARD', 10],
      ]);
      payments.push({
        id: oid('pm'),
        contractId,
        kind: 'DEPOSIT',
        amount: dep,
        method: depMethod,
        pgProvider: depMethod === 'VIRTUAL_ACCOUNT' ? 'TOSS' : 'MANUAL',
        virtualAccount:
          depMethod === 'VIRTUAL_ACCOUNT' ? `가상은행 7${String(ctNo).padStart(7, '0')}` : null,
        status: contractCanceled ? 'CANCELED' : signed ? 'PAID' : 'PENDING',
        dueAt: ts((signed ? signDn : quoteDn) + 1, 23, 59),
        paidAt: signedAt ? capNow(signedAt) : null,
        createdAt: sentAt,
      });
      if (!signed || contractCanceled) continue;
      // 잔금 — 이사 날 받는다. 최근 이사 일부는 아직 안 들어왔다(미수금)
      const unpaid = done && chance(moveDn >= TODAY - 21 ? 0.2 : 0.04);
      const balMethod = pick([
        ['TRANSFER', 40],
        ['VIRTUAL_ACCOUNT', 30],
        ['CARD', 20],
        ['CASH', 10],
      ]);
      payments.push({
        id: oid('pm'),
        contractId,
        kind: 'BALANCE',
        amount: total - dep,
        method: balMethod,
        pgProvider: balMethod === 'VIRTUAL_ACCOUNT' ? 'TOSS' : 'MANUAL',
        virtualAccount:
          balMethod === 'VIRTUAL_ACCOUNT' ? `가상은행 6${String(ctNo).padStart(7, '0')}` : null,
        status: done && !unpaid ? 'PAID' : 'PENDING',
        dueAt: ts(moveDn, 23, 59),
        paidAt: done && !unpaid ? at(moveDn, 15, 20) : null,
        createdAt: capNow(signedAt!),
      });

      // ── 작업오더 — 이사일에 ──
      if (!hasWo) continue;
      const woId = oid('wo');
      workOrders.push({
        id: woId,
        workNo: '',
        legacyNo: mark('WO', ++seq.wo),
        contractId,
        leadId,
        orgUnitId: b.orgUnitId,
        partnerId: null,
        scheduledDate: dateOf(moveDn),
        status: done ? 'DONE' : moveDn === TODAY ? 'IN_PROGRESS' : 'ASSIGNED',
        createdAt: capNow(
          new Date(Math.max(+(approvedAt ?? signedAt!) + 1800_000, +at(woDn, 9, 17))),
        ),
      });
      assignments.push(
        {
          id: oid('wa'),
          workOrderId: woId,
          employeeId: b.empId,
          resourceType: 'CREW',
          scheduledAt: dateOf(moveDn),
        },
        {
          id: oid('wa'),
          workOrderId: woId,
          resourceType: 'VEHICLE',
          resourceRef: `${total > 3_000_000 ? '5톤' : total > 1_500_000 ? '2.5톤' : '1톤'} 트럭 ${int(10, 99)}가${int(1000, 9999)}`,
          scheduledAt: dateOf(moveDn),
        },
      );

      // ── A/S — 이사 끝난 뒤 열에 하나쯤 ──
      if (done && chance(0.1)) {
        const tDn = moveDn + int(1, 10);
        if (tDn <= TODAY) {
          const category = pick([
            ['WORK', 55],
            ['COST', 20],
            ['CONSULT', 10],
            ['ETC', 15],
          ]);
          tickets.push(
            ticket(
              'AS',
              tDn,
              category,
              one(AS_SUBJECTS[category]),
              contractId,
              leadId,
              customer.id,
              b,
            ),
          );
        }
      }
    }
  }
  leads.sort((a, b) => +a.createdAt - +b.createdAt);

  // ── CS — 상담·계약 중 문의(평일 하루 0.9건쯤), 그날까지 들어온 최근 접수에 잇는다 ──
  for (let dn = FROM; dn <= TODAY; dn++) {
    const lam = (isWorkday(dn) || dn === TODAY ? 0.9 : 0.4) * (dn >= TODAY - 6 ? 1.3 : 1);
    const pool = leads.filter(
      (l) => dnOfDate(l.createdAt) <= dn && dnOfDate(l.createdAt) > dn - 21,
    );
    for (let i = poisson(lam); i > 0 && pool.length; i--) {
      const l = one(pool);
      const category = pick([
        ['CONSULT', 50],
        ['COST', 30],
        ['ETC', 20],
      ]);
      const t = ticket(
        'CS',
        dn,
        category,
        one(CS_SUBJECTS[category]),
        null,
        l.id,
        l.customerId ?? null,
        branchById.get(l.orgUnitId)!,
      );
      if (+t.createdAt < +l.createdAt) t.createdAt = new Date(+l.createdAt + int(30, 240) * 60_000);
      t.createdAt = capNow(t.createdAt);
      tickets.push(t);
    }
  }
  // 이번 주 긴급(HIGH) 미처리 건이 적어도 4건은 보이게
  const thisWeek = TODAY - 5;
  const urgent = tickets.filter(
    (t) =>
      dnOfDate(t.createdAt) >= thisWeek &&
      t.priority === 'HIGH' &&
      ['RECEIVED', 'IN_PROGRESS'].includes(t.status as string),
  ).length;
  for (const t of tickets
    .filter((x) => dnOfDate(x.createdAt) >= TODAY - 3 && x.priority !== 'HIGH')
    .slice(0, Math.max(0, 4 - urgent))) {
    t.priority = 'HIGH';
    t.status = 'RECEIVED';
    t.assigneeEmpId = null;
    t.resolution = null;
  }

  // ════════════════ 2. 상담 콜 · 확인콜·해피콜 ════════════════
  type Call = Prisma.CsCallCreateManyInput & { id: string; receivedAt: Date };
  const calls: Call[] = [];
  const custById = new Map(customers.map((c) => [c.id, c]));
  const addCall = (c: Omit<Call, 'id'>) => {
    if (+c.receivedAt > NOW) return;
    calls.push({ id: oid('call'), ...c });
  };
  const csAgent = () => one(csEmps);
  // 전화로 들어온 접수 — 상담하며 접수를 등록했다
  for (const l of leads) {
    if (l.source !== 'PHONE') continue;
    const rec = new Date(+l.createdAt - int(3, 25) * 60_000);
    const assigned = new Date(+rec + int(5, 40) * 1000);
    const dur = int(150, 900);
    const c = l.customerId ? custById.get(l.customerId) : undefined;
    addCall({
      phone: c?.phonePrimary ?? nextPhone(),
      status: 'DONE',
      agentEmpId: csAgent().id,
      customerId: l.customerId,
      leadId: l.id,
      channel: '대표번호',
      memo: one([
        '이사 상담 후 접수 등록',
        '방문 견적 일정 잡음',
        '포장이사 견적 상담',
        '반포장 상담 — 접수',
      ]),
      attempts: 0,
      receivedAt: rec,
      assignedAt: assigned,
      doneAt: new Date(+assigned + dur * 1000 + 60_000),
      endedAt: new Date(+assigned + dur * 1000),
      durationSec: dur,
    });
  }
  // 문의·부재중 콜백·스팸 — DB의 마지막 콜 뒤부터(앞선 시드가 멈춘 곳에서 이어서)
  const CALL_MEMO_INQ = [
    '이사 날짜 변경 문의',
    '견적 금액 문의',
    '잔금 결제 방법 문의',
    'A/S 접수 문의',
    '보관 이사 기간 연장 문의',
    '작업 시간 확인',
    '추가 짐(가전) 반영 문의',
    '입주청소 결합 가능 여부',
  ];
  const CALL_MEMO_NEW = [
    '가격만 문의 — 방문 견적 안내',
    '타사 견적과 비교 중',
    '이사 날짜 미정 — 다음 달 재연락',
    '원룸 이사 가능 지역 문의',
    '해외 이사 가능 여부 문의',
  ];
  for (let dn = Math.max(FROM, dnOfDate(new Date(lastCallAt))); dn <= TODAY; dn++) {
    const w = ymOf(dn).w;
    const lam = dn === TODAY ? 7 : w === 0 ? 0.6 : w === 6 ? 3 : KR_HOLIDAYS[ymd(dn)] ? 1 : 9;
    for (let i = poisson(lam); i > 0; i--) {
      const rec = at(dn, 8, 19);
      if (+rec <= lastCallAt) continue;
      const kind = pick([
        ['INQ', 45],
        ['NEW', 25],
        ['MISSED', 20],
        ['SPAM', 10],
      ] as const);
      const c = kind === 'INQ' && customers.length ? one(customers) : null;
      const phone = c?.phonePrimary ?? nextPhone();
      if (NOW - +rec < 20 * 3600_000 && kind !== 'SPAM' && chance(0.35)) {
        // 아직 콜백 못 한 콜
        addCall({
          phone,
          status: 'OUTCALL',
          customerId: c?.id ?? null,
          channel: '대표번호(부재중)',
          attempts: chance(0.3) ? 1 : 0,
          receivedAt: rec,
        });
        continue;
      }
      if (kind === 'SPAM') {
        addCall({
          phone,
          status: 'CANCELED',
          channel: '대표번호',
          memo: one(['광고 전화', '잘못 건 전화', '무응답 — 끊김']),
          attempts: 0,
          receivedAt: rec,
          doneAt: capNow(new Date(+rec + int(1, 30) * 60_000)),
        });
        continue;
      }
      const missed = kind === 'MISSED';
      const assigned = capNow(
        new Date(+rec + (missed ? int(10, 150) * 60_000 : int(5, 40) * 1000)),
      );
      const dur = int(40, kind === 'NEW' ? 420 : 300);
      addCall({
        phone,
        status: 'DONE',
        agentEmpId: csAgent().id,
        customerId: c?.id ?? null,
        channel: missed ? '대표번호(부재중)' : '대표번호',
        memo: missed
          ? `콜백 — ${one(CALL_MEMO_INQ.concat(CALL_MEMO_NEW))}`
          : one(c ? CALL_MEMO_INQ : CALL_MEMO_NEW),
        request: chance(0.2)
          ? one(['오전 통화 선호', '문자로 견적서 요청', '주말 방문 견적 희망'])
          : null,
        attempts: missed ? int(1, 2) : 0,
        receivedAt: rec,
        assignedAt: assigned,
        doneAt: new Date(+assigned + dur * 1000 + 30_000),
        endedAt: new Date(+assigned + dur * 1000),
        durationSec: dur,
      });
    }
  }
  calls.sort((a, b) => +a.receivedAt - +b.receivedAt);
  // 최근 8일 콜은 통화 ID 자리를 채워 둔다 — 화면이 한국AI통신에 가상 번호로 녹취를 찾으러 가지 않게
  for (const c of calls)
    if (c.assignedAt && +c.assignedAt > NOW - 8 * DAY) {
      c.katCallSid = `DEMO-RW-${c.id.slice(-12)}`;
      c.durationSec = null;
    }

  const followups: Prisma.CsFollowupCreateManyInput[] = [];
  for (const l of leads) {
    if (!l.moveDate || l.serviceLine === 'LIVING' || l.serviceLine === 'CARE') continue;
    const mdn = Math.round(+new Date(l.moveDate) / DAY);
    if (['DONE', 'WORK_TOSS', 'CONTRACTED', 'CONTRACT_PENDING'].includes(l.status)) {
      // 확인콜 — 이사 이틀 전
      const cdn = mdn - 2;
      if (cdn <= TODAY && cdn >= dnOfDate(l.createdAt)) {
        const by = csAgent();
        if (chance(0.15) && cdn < TODAY)
          followups.push({
            id: oid('fu'),
            leadId: l.id,
            kind: 'CONFIRM',
            result: 'NO_ANSWER',
            employeeId: by.id,
            memo: '부재 — 문자 남김',
            at: ts(cdn, int(10, 13), int(0, 59)),
          });
        if (cdn < TODAY || chance(0.5))
          followups.push({
            id: oid('fu'),
            leadId: l.id,
            kind: 'CONFIRM',
            result: 'DONE',
            employeeId: by.id,
            memo: one([
              '이사 시간·인원 재확인',
              '엘리베이터 사용 예약 확인',
              '주차 공간 확인 요청',
              '잔금 결제 방법 안내',
              null,
            ]),
            at: capNow(ts(cdn, int(14, 17), int(0, 59))),
          });
      }
    }
    if (l.status === 'DONE') {
      // 해피콜 — 이사 다음 날(일부는 연결 안 됨)
      const hdn = mdn + int(1, 2);
      if (hdn > TODAY || !chance(0.85)) continue;
      const by = csAgent();
      if (chance(0.25))
        followups.push({
          id: oid('fu'),
          leadId: l.id,
          kind: 'HAPPY',
          result: 'NO_ANSWER',
          employeeId: by.id,
          at: at(hdn, 10, 12),
        });
      if (chance(0.92))
        followups.push({
          id: oid('fu'),
          leadId: l.id,
          kind: 'HAPPY',
          result: 'DONE',
          employeeId: by.id,
          memo: pick([
            ['만족 — 기사님 친절', 30],
            ['만족 — 시간 약속 잘 지킴', 20],
            ['보통 — 마무리 정리 아쉬움', 10],
            ['소파 모서리 긁힘 문의 → A/S 안내', 5],
            ['재이용 의사 있음, 지인 소개 약속', 10],
            [null, 25],
          ] as const),
          at: at(hdn, 13, 17),
        });
    }
  }

  // ════════════════ 3. 결재 — 본사 직원의 결재 양식·일반 품의 ════════════════
  type Doc = Prisma.ApprovalDocCreateManyInput & { id: string; submittedAt: Date };
  const docs: Doc[] = [];
  const steps: Prisma.ApprovalStepCreateManyInput[] = [];
  const notifications: Prisma.UserNotificationCreateManyInput[] = [];
  const notify = (
    emp: Emp | null | undefined,
    n: Omit<Prisma.UserNotificationCreateManyInput, 'id' | 'userId'> & { createdAt: Date },
  ) => {
    if (!emp?.userId || +n.createdAt < NOW - 21 * DAY || +n.createdAt > NOW) return;
    const readAt =
      n.kind !== 'APPROVAL_REQUEST' && (+n.createdAt < NOW - 2 * DAY || chance(0.4))
        ? capNow(new Date(+n.createdAt + int(5, 600) * 60_000))
        : null;
    notifications.push({ id: oid('un'), userId: emp.userId, readAt, ...n });
  };
  const lineOf = new Map<string, { approvers: Emp[]; cc: Emp | null }>();
  /** 결재선 — 소속 조직장 → 그룹 대표, 참조는 경영관리 조직장(seed-demo-history-more.ts와 같은 규칙) */
  const approvalLine = (e: Emp) => {
    let l = lineOf.get(e.id);
    if (!l) {
      const used = new Set([e.id]);
      const approvers: Emp[] = [];
      for (const org of [e.orgUnitId, groupOrg?.id]) {
        const h = headOf(org, used);
        if (h) {
          used.add(h.id);
          approvers.push(h);
        }
      }
      const cc = mgmtOrg ? headOf(mgmtOrg.id, new Set([e.id])) : null;
      l = { approvers, cc: cc && !approvers.some((a) => a.id === cc.id) ? cc : null };
      lineOf.set(e.id, l);
    }
    return l;
  };
  const DOC_KIND: Record<string, string> = { GENERAL: '일반 품의' };
  /**
   * 결재 문서 + 단계. outcome은 바라는 결과 — 결재 시각이 '지금'을 넘거나 holdAt 단계에 이르면
   * 그 단계에서 결재 중(PENDING)으로 멈춘다.
   */
  const addDoc = (o: {
    requester: Emp;
    docType: string;
    title: string;
    content?: string | null;
    payload?: Prisma.InputJsonValue;
    submittedAt: Date;
    outcome: 'APPROVED' | 'REJECTED' | 'CANCELED';
    rejectComment?: string;
    holdAt?: number;
  }) => {
    const { approvers, cc } = approvalLine(o.requester);
    const id = oid('ad');
    const sub = +o.submittedAt;
    const stepRows: Prisma.ApprovalStepCreateManyInput[] = [];
    let status: string = o.outcome;
    let currentSeq: number | null = null;
    let completedAt: Date | null = null;
    let t = sub;
    const rejectAt = o.outcome === 'REJECTED' ? (approvers.length > 1 && chance(0.3) ? 1 : 0) : -1;
    const cancelAt = o.outcome === 'CANCELED' ? 0 : -1;
    let stopped = false;
    // 최근 나흘 안에 올린 문서는 일부가 아직 결재 중(결재함에 할 일이 보이게)
    const fresh = NOW - sub < 4 * DAY;
    const holdAt = o.holdAt ?? (fresh && chance(0.5) ? int(0, approvers.length - 1) : -1);
    approvers.forEach((a, k) => {
      const base = { id: oid('as'), docId: id, seq: k + 1, kind: 'APPROVER', approverEmpId: a.id };
      if (stopped) {
        stepRows.push({ ...base, status: 'WAITING' });
        return;
      }
      const turnAt = t;
      t += int(20, 60 * 26) * 60_000;
      if (t > NOW || k === holdAt) {
        status = 'PENDING';
        currentSeq = k + 1;
        stopped = true;
        stepRows.push({ ...base, status: 'PENDING' });
        notify(a, {
          kind: 'APPROVAL_REQUEST',
          title: `결재 요청 · ${o.title}`,
          body: `${o.requester.name}님의 ${DOC_KIND[o.docType] ?? '결재 양식'} 문서를 결재할 차례입니다.`,
          link: `/approvals?box=todo&detail=${id}`,
          actorName: o.requester.name,
          entityType: 'approval_doc',
          entityId: id,
          createdAt: new Date(turnAt),
        });
        return;
      }
      if (k === cancelAt) {
        stopped = true;
        completedAt = new Date(Math.min(t, sub + int(1, 20) * 3600_000, NOW));
        stepRows.push({ ...base, status: 'WAITING' });
        return;
      }
      if (k === rejectAt) {
        stopped = true;
        completedAt = new Date(t);
        stepRows.push({
          ...base,
          status: 'REJECTED',
          comment: o.rejectComment ?? '보완 후 다시 올려 주세요.',
          actedAt: new Date(t),
        });
        return;
      }
      stepRows.push({ ...base, status: 'APPROVED', actedAt: new Date(t) });
      if (k === approvers.length - 1) completedAt = new Date(t);
    });
    if (!approvers.length) {
      status = o.outcome === 'CANCELED' ? 'CANCELED' : 'APPROVED';
      completedAt = new Date(sub);
    }
    if (cc)
      stepRows.push({
        id: oid('as'),
        docId: id,
        seq: approvers.length + 1,
        kind: 'CC',
        approverEmpId: cc.id,
        status: 'WAITING',
      });
    steps.push(...stepRows);
    docs.push({
      id,
      docNo: '',
      legacyNo: mark('AP', docs.length + 1),
      docType: o.docType,
      title: o.title.slice(0, 200),
      content: o.content ?? null,
      payload: o.payload,
      requesterEmpId: o.requester.id,
      orgUnitId: o.requester.orgUnitId,
      status,
      currentSeq,
      submittedAt: o.submittedAt,
      completedAt: status === 'PENDING' ? null : completedAt,
    });
    if (status !== 'PENDING' && completedAt)
      notify(o.requester, {
        kind: 'APPROVAL_RESULT',
        title: `${status === 'APPROVED' ? '승인 완료' : status === 'REJECTED' ? '반려' : '회수됨'} · ${o.title}`,
        body: null,
        link: `/approvals?box=mine&detail=${id}`,
        entityType: 'approval_doc',
        entityId: id,
        createdAt: completedAt,
      });
    return { id, status, approvers };
  };

  const forms = await prisma.approvalForm.findMany({
    where: { kind: 'CUSTOM', isActive: true },
    select: { id: true, name: true, fields: true },
    orderBy: { sortOrder: 'asc' },
  });
  type Field = { id: string; type: string; label: string; options?: string[] };
  const formWeight = (name: string) =>
    /지출/.test(name) ? 8 : /구매/.test(name) ? 4 : /출장|재택|외근/.test(name) ? 3 : 1;
  // 이름이 같은 양식(예: 시험용 사본)은 처음 것만
  const formPick = forms
    .filter((f, i) => forms.findIndex((g) => g.name === f.name) === i)
    .map((f) => [f, formWeight(f.name)] as const);
  const PAYEES = ['카카오T', '주유소', '편의점', '한식당', '문구점', '쿠팡', '다이소', '주차장'];
  const ITEMS = [
    '포장 박스(대) 300개',
    '테이프 디스펜서 10개',
    '업무용 노트북 1대',
    '모니터 2대',
    '안전화 10켤레',
    '작업용 장갑 50켤레',
    '보양재(엘리베이터용) 20장',
  ];
  /** 양식 항목 값(seed-demo-history-more.ts와 같은 규칙을 줄인 것) */
  const valueFor = (f: Field, form: string, dn: number, me: Emp): unknown => {
    const key = `${f.id} ${f.label}`;
    switch (f.type) {
      case 'date':
        return /필요|needed/i.test(key) ? ymd(dn + int(3, 14)) : ymd(dn - int(0, 5));
      case 'daterange': {
        const from = dn + int(1, 10);
        return { from: ymd(from), to: ymd(from + int(0, 2)) };
      }
      case 'money':
        return /지출/.test(form)
          ? round(int(8_000, 250_000), 1_000)
          : /구매/.test(form)
            ? round(int(50_000, 3_000_000), 10_000)
            : round(int(100_000, 800_000), 10_000);
      case 'number':
        return int(1, 20);
      case 'select':
        return f.options?.length ? one(f.options) : undefined;
      case 'multiselect':
        return f.options?.length ? f.options.filter(() => chance(0.4)).slice(0, 2) : undefined;
      case 'checkbox':
        return chance(0.5);
      case 'person': {
        const other = one(byOrg.get(me.orgUnitId)?.filter((x) => x.id !== me.id) ?? []);
        return other ? [{ id: other.id, name: other.name }] : undefined;
      }
      case 'text':
      case 'textarea':
        if (/payee|사용처/i.test(key)) return one(PAYEES);
        if (/item|품목/i.test(key)) return one(ITEMS);
        if (/vendor|구매처/i.test(key))
          return one(['쿠팡 비즈', '오피스디포', '지역 철물점', '포장재 공급사']);
        if (/why|사유/i.test(key))
          return one(['기존 물품 노후', '성수기 대비 재고 확보', '신규 입사자 지급', '파손 교체']);
        if (/place|출장지/i.test(key))
          return one(['부산 지점', '대구 지점', '광주 지점', '대전 지점', '코엑스 박람회']);
        if (/purpose|목적/i.test(key))
          return one(['지점 현장 점검', '가맹 상담 미팅', '기업 이전 현장 실사']);
        if (/plan|계획/i.test(key))
          return one(['견적서 정리·고객 콜백', '주간 보고서 작성', '가맹 자료 정리']);
        if (/detail|내용/i.test(key))
          return one([
            '현장 점검 이동 택시비',
            '야간 작업 식대',
            '고객 미팅 주차비',
            '포장 자재 긴급 구매',
          ]);
        return `${f.label} — ${one(['정상 처리', '내부 검토 완료', '첨부 참고'])}`;
      default:
        return undefined;
    }
  };
  const GENERAL_TITLES = [
    '판촉물 제작 품의',
    '성수기 임시 인력 채용 품의',
    '사무실 복합기 교체 품의',
    '가맹점 간담회 개최 품의',
    '보관 창고 임대 연장 품의',
    '고객 사은품(정리함) 구매 품의',
    '직원 안전 교육 외부 강사 섭외 품의',
    '연말 고객 감사 이벤트 품의',
    '12월 성수기 차량 추가 임차 품의',
  ];
  const submitDoc = (me: Emp, submittedAt: Date, holdAt?: number) => {
    const dn = dnOfDate(submittedAt);
    const outcome = pick([
      ['APPROVED', 90],
      ['REJECTED', 5],
      ['CANCELED', 5],
    ] as const);
    if (formPick.length && chance(0.75)) {
      const form = pick(formPick);
      const values: Record<string, unknown> = {};
      for (const f of (Array.isArray(form.fields) ? form.fields : []) as Field[]) {
        const v = valueFor(f, form.name, dn, me);
        if (v !== undefined && !(Array.isArray(v) && !v.length)) values[f.id] = v;
      }
      return addDoc({
        requester: me,
        docType: 'FORM',
        title: `${form.name} — ${me.name}`,
        payload: {
          formId: form.id,
          formName: form.name,
          fields: form.fields as Prisma.InputJsonValue,
          values: values as Prisma.InputJsonValue,
        },
        submittedAt,
        outcome: holdAt !== undefined ? 'APPROVED' : outcome,
        rejectComment: one([
          '증빙(영수증)을 첨부해 주세요.',
          '예산 초과 — 금액 조정 바랍니다.',
          '다음 달 예산으로 올려 주세요.',
        ]),
        holdAt,
      });
    }
    const { m } = ymOf(dn);
    const title = `${m + 1}월 ${one(GENERAL_TITLES)}`;
    return addDoc({
      requester: me,
      docType: 'GENERAL',
      title,
      content: `${title}의 건으로 아래와 같이 품의하오니 검토 후 결재 바랍니다.\n\n1. 목적: ${one(['업무 효율 개선', '성수기 대비', '고객 만족도 향상', '안전 사고 예방'])}\n2. 예상 비용: ${round(int(300_000, 12_000_000), 10_000).toLocaleString('ko-KR')}원\n3. 일정: ${ymd(dn + int(7, 30))}까지`,
      submittedAt,
      outcome: holdAt !== undefined ? 'APPROVED' : outcome === 'CANCELED' ? 'APPROVED' : outcome,
      rejectComment: '비용 근거 보완 후 다시 올려 주세요.',
      holdAt,
    });
  };
  // 결재 올리는 사람 — 결재선이 있는 본사 직원
  const requesters = hqPool.filter((e) => approvalLine(e).approvers.length > 0);
  if (requesters.length) {
    for (let dn = FROM; dn <= TODAY; dn++) {
      if (!isWorkday(dn)) continue;
      // DB의 마지막 결재 뒤로는 평소만큼(하루 2~3건), 그 앞 주에는 조금만 더한다
      const lam = +ts(dn, 18) > lastDocAt ? 2.6 : 0.45;
      for (let i = poisson(lam); i > 0; i--) {
        const sub = at(dn, 9, 18);
        if (+sub <= lastDocAt && lam > 1) continue;
        submitDoc(one(requesters), sub);
      }
    }
    // 결재함이 비지 않게 — 부서장(그 부서 직원의 1단계)은 1건 이상, 그룹 대표(2단계)는 3건 이상 결재 중
    const pendingBy = new Map<string, number>();
    for (const s of steps)
      if (s.status === 'PENDING')
        pendingBy.set(s.approverEmpId, (pendingBy.get(s.approverEmpId) ?? 0) + 1);
    const recentDays = [TODAY - 3, TODAY - 2, TODAY - 1].filter(isWorkday);
    const lastWorkdays = recentDays.length ? recentDays : [TODAY - 1];
    const ceo = groupOrg ? headOf(groupOrg.id, new Set()) : null;
    const targets: { a: Emp; seq: number; want: number; reqs: Emp[] }[] = [];
    for (const org of orgs) {
      if (org.type === 'BRANCH' || org.id === groupOrg?.id) continue;
      const head = headOf(org.id, new Set());
      if (!head?.userId || head.orgUnitId !== org.id || head.id === ceo?.id) continue;
      // 부서장이 1단계인 그 부서 직원
      const reqs = requesters.filter(
        (e) => e.orgUnitId === org.id && approvalLine(e).approvers[0]?.id === head.id,
      );
      if (reqs.length) targets.push({ a: head, seq: 0, want: 1, reqs });
    }
    if (ceo?.userId) {
      const reqs = requesters.filter((e) => approvalLine(e).approvers[1]?.id === ceo.id);
      if (reqs.length) targets.push({ a: ceo, seq: 1, want: 3, reqs });
    }
    for (const { a, seq: k, want, reqs } of targets) {
      for (let i = pendingBy.get(a.id) ?? 0; i < want; i++) {
        submitDoc(one(reqs), at(one(lastWorkdays), 9, 17), k);
        pendingBy.set(a.id, (pendingBy.get(a.id) ?? 0) + 1);
      }
    }
  }

  // ════════════════ 화면 번호 — 앱과 같은 next_doc_no로, 날짜·시각 순서대로 ════════════════
  async function assignNo<T>(
    rows: T[],
    prefix: (r: T) => string,
    atOf: (r: T) => Date,
    set: (r: T, no: string) => void,
  ) {
    const groups = new Map<string, T[]>();
    for (const r of rows) {
      const p = prefix(r);
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p)!.push(r);
    }
    for (const [p, list] of groups) {
      list.sort((a, b) => +atOf(a) - +atOf(b));
      const days = list.map((r) => ymd(dnOfDate(atOf(r))));
      const out = await prisma.$queryRawUnsafe<{ no: string }[]>(
        `SELECT next_doc_no($1, u.d::date) AS no FROM unnest($2::text[]) WITH ORDINALITY AS u(d, i) ORDER BY u.i`,
        p,
        days,
      );
      list.forEach((r, i) => set(r, out[i].no));
    }
  }
  await assignNo(
    leads,
    () => 'RC',
    (r) => r.createdAt,
    (r, no) => (r.leadNo = no),
  );
  await assignNo(
    estimates,
    () => 'ES',
    (r) => r.createdAt,
    (r, no) => (r.estimateNo = no),
  );
  await assignNo(
    contracts,
    () => 'CT',
    (r) => r.createdAt,
    (r, no) => (r.contractNo = no),
  );
  await assignNo(
    workOrders,
    () => 'WO',
    (r) => r.createdAt,
    (r, no) => (r.workNo = no),
  );
  await assignNo(
    tickets,
    (r) => r.kind,
    (r) => r.createdAt,
    (r, no) => (r.ticketNo = no),
  );
  await assignNo(
    docs,
    () => 'AP',
    (r) => r.submittedAt,
    (r, no) => (r.docNo = no),
  );

  // ════════════════ 넣기 ════════════════
  const chunk = async <T>(rows: T[], fn: (data: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 1000) await fn(rows.slice(i, i + 1000));
  };
  await prisma.$transaction(
    async (tx) => {
      await chunk(customers, (data) => tx.customer.createMany({ data }));
      await chunk(leads, (data) => tx.lead.createMany({ data }));
      await chunk(estimates, (data) => tx.estimate.createMany({ data }));
      await chunk(contracts, (data) => tx.contract.createMany({ data }));
      await chunk(payments, (data) => tx.payment.createMany({ data }));
      await chunk(workOrders, (data) => tx.workOrder.createMany({ data }));
      await chunk(assignments, (data) => tx.workAssignment.createMany({ data }));
      await chunk(tickets, (data) => tx.supportTicket.createMany({ data }));
      await chunk(calls, (data) => tx.csCall.createMany({ data }));
      await chunk(followups, (data) => tx.csFollowup.createMany({ data }));
      await chunk(docs, (data) => tx.approvalDoc.createMany({ data }));
      await chunk(steps, (data) => tx.approvalStep.createMany({ data }));
      await chunk(notifications, (data) => tx.userNotification.createMany({ data }));
    },
    { timeout: 300_000, maxWait: 30_000 },
  );

  const cnt = <T extends { status?: unknown }>(xs: T[], s: string) =>
    xs.filter((x) => x.status === s).length;
  console.log(`[demo-recent-weeks] 주별 접수(있던 것→채운 뒤) — ${weekLog.join(' · ')}`);
  console.log(
    `[demo-recent-weeks] ${ymd(FROM)} ~ ${ymd(TODAY)} ${END_HOUR}시 — 고객 ${customers.length} · ` +
      `접수 ${leads.length}(접수 ${cnt(leads, 'RECEIVED')}·계약미승인 ${cnt(leads, 'CONTRACT_PENDING')}) · ` +
      `견적 ${estimates.length} · 계약 ${contracts.length}(서명 ${cnt(contracts, 'SIGNED')}) · ` +
      `결제 ${payments.length}(대기 ${cnt(payments, 'PENDING')}) · 작업오더 ${workOrders.length} · ` +
      `A/S·CS ${tickets.length} · 콜 ${calls.length} · 확인콜 ${followups.length} · ` +
      `결재 ${docs.length}(결재 중 ${cnt(docs, 'PENDING')}) · 알림 ${notifications.length} ` +
      `(${Math.round((Date.now() - t0) / 100) / 10}초)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
