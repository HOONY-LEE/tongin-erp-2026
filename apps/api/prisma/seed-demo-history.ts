/**
 * 시드(추가, 한 번만) — 2025-01-01부터 오늘까지의 '지난 실적'을 만든다. 대시보드 추이(주·월·연)·지점별·
 * 상품별·경로별·분포 차트가 의미 있게 보이도록. 실데이터 이관 전 시연용이다.
 *
 *   pnpm --filter @tongin/api demo:seed:history     # 만들기(돌릴 때마다 지우고 다시 만든다)
 *   pnpm --filter @tongin/api demo:clear:history    # 지우기(실운영 전환 때)
 *
 * - 접수 3천여 건: 2~3월·8~9월 성수기, 월말 몰림, 주말 적음, 2026년은 조금 늘어난다
 * - 지점마다 가중치(바쁜 지점이 있다), 서울·경기 출발이 많다. 경로·지점마다 계약 전환율이 다르다(35~55%)
 * - 접수 → 견적 → 계약(계약금) → 작업오더(이사일) → 잔금, 일부 취소. 작업 뒤 A/S, 상담 중 CS 접수
 * - 지난 건은 끝난 상태(완료·취소), 최근 몇 주만 진행 중 — 오늘을 기준으로 단계를 정한다
 * - 리빙·케어는 seed-demo-services.ts처럼 접수(예상 금액)만 — 견적·계약은 이사·기업이전만
 *
 * 표시: 옛 번호(legacy_no)가 'HS-'로 시작한다(고객 HS-CU…, 접수 HS-RC…, 견적 HS-ES…, 계약 HS-CT…,
 * 작업 HS-WO…, A/S·CS HS-AS…/HS-CS…). 화면 번호는 앱과 같은 규칙(next_doc_no)으로 그날 날짜에 붙는다.
 * 돌릴 때마다 이 표시가 붙은 행만 지우고(clear-demo-history.ts) 같은 난수 씨앗으로 다시 만든다 — 결과가 같다.
 * 고객은 가상 인물, 전화번호는 010-009x-xxxx(가운데가 0으로 시작 — 실제로 쓰이지 않는 번호대).
 *
 * seed-demo.ts(지점·직원)·seed-demo-catalog.ts·seed-demo-services.ts(상품)를 먼저 돌려야 한다.
 */
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { HISTORY_MARK, clearDemoHistory } from './clear-demo-history';

const prisma = new PrismaClient();

// ── 날짜 — 하루를 '1970-01-01부터 며칠째(한국 날짜)'인 정수로 다룬다 ──
const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1) / DAY;
const TODAY = Math.floor((Date.now() + 9 * 3600_000) / DAY);
/** DATE 칸 — UTC 자정(다른 시드와 같은 규칙) */
const dateOf = (dn: number) => new Date(dn * DAY);
/** 한국 시각 h:m의 순간 */
const ts = (dn: number, h: number, m = 0) => new Date(dn * DAY + (h - 9) * 3600_000 + m * 60_000);
const ymd = (dn: number) => dateOf(dn).toISOString().slice(0, 10);
const ymOf = (dn: number) => {
  const d = dateOf(dn);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
};
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

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
const rnd = mulberry32(20250101);
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

// ── 계절 — 달 가운데 값을 이어 매끄럽게(2~3월·8~9월 성수기) ──
const MONTH_FACTOR = [0.78, 1.2, 1.42, 1.02, 0.95, 0.84, 0.88, 1.18, 1.38, 1.04, 0.9, 0.74];
function season(dn: number) {
  const { y, m, d } = ymOf(dn);
  const len = lastDayOfMonth(y, m);
  const pos = (d - 0.5) / len - 0.5; // -0.5 ~ 0.5 (달 가운데 0)
  const other = (m + (pos < 0 ? 11 : 1)) % 12;
  const t = Math.abs(pos);
  return MONTH_FACTOR[m] * (1 - t) + MONTH_FACTOR[other] * t;
}
const PEAK_MONTHS = new Set([1, 2, 7, 8]);

// ── 지역 — 지점 이름의 지역어로 출발지 시도를 고른다(seed-demo-leads.ts와 같은 표를 줄인 것) ──
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

// ── 가상 고객 ──
const FAMILY = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남'.split('');
const GIVEN = (
  '민준 서연 도윤 하은 지호 수아 예준 지유 시우 서윤 주원 하린 지훈 채원 건우 다은 우진 예린 현우 소율 ' +
  '태윤 유나 성민 가은 준혁 지민 승현 수빈 은우 나연 재원 서진 동현 하윤 민서 영호 미경 정훈 혜진 상철'
).split(' ');
const phoneOf = (n: number) => `010009${String(n).padStart(5, '0')}`;

// ── 분포 ──
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
/** 경로 비중 — t: 0(2025-01) ~ 1(오늘). AI상담봇은 2025년 6월에 열려 점점 늘고, 전화는 조금 준다 */
function sourceWeights(dn: number): [Source, number][] {
  const t = (dn - START) / Math.max(1, TODAY - START);
  const bot = dn < Date.UTC(2025, 5, 1) / DAY ? 0 : 4 + 12 * t;
  return [
    ['PHONE', 34 - 10 * t],
    ['NAVER', 18],
    ['HOMEPAGE', 14],
    ['AIBOT', bot],
    ['INSTAGRAM', 5 + 6 * t],
    ['PARTNER', 10],
    ['WALK_IN', 4],
    ['SYSTEM', 4],
    ['ETC', 2],
  ];
}
/** 경로별 계약 전환율 */
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
const DEMO_LOGINS = ['dongseok_shin', 'inseok_choi', 'keunsung_choi', 'dongchul_kim', 'bongki_yoo'];

type Outcome = 'WON' | 'LOST_EARLY' | 'LOST_QUOTED' | 'CONTRACT_CANCELED';

async function main() {
  const t0 = Date.now();
  if (TODAY <= START) throw new Error('오늘이 2025-01-01보다 앞 — 만들 기간이 없다');

  // ── 참조 — 계정이 켜진 지점장이 있는 지점(seed-demo-leads.ts와 같은 기준) ──
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
  const branchPick: [Branch, number][] = branches.map((b) => [b, b.weight]);

  // ── 이전 실행 지우기 ──
  const cleared = await clearDemoHistory(prisma);
  if (cleared.lead) console.log(`[demo-history] 이전 실행 지움 — 접수 ${cleared.lead}건 외`);

  // ── 생성(메모리) ──
  type Customer = Prisma.CustomerCreateManyInput & { id: string; leads: number; maxAmount: number };
  const customers: Customer[] = [];
  const leads: (Prisma.LeadCreateManyInput & { id: string })[] = [];
  const estimates: (Prisma.EstimateCreateManyInput & { id: string })[] = [];
  const contracts: (Prisma.ContractCreateManyInput & { id: string })[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const workOrders: (Prisma.WorkOrderCreateManyInput & { id: string })[] = [];
  const assignments: Prisma.WorkAssignmentCreateManyInput[] = [];
  const tickets: (Prisma.SupportTicketCreateManyInput & { kind: string })[] = [];
  const recentMovers: Customer[] = [];

  const seq = { cu: 0, rc: 0, es: 0, ct: 0, wo: 0, tk: 0 };
  const mark = (p: string, n: number) => `${HISTORY_MARK}${p}${String(n).padStart(5, '0')}`;
  const newCustomer = (b: Branch, created: Date, a: ReturnType<typeof address>): Customer => {
    const n = ++seq.cu;
    const c: Customer = {
      id: randomUUID(),
      legacyNo: mark('CU', n),
      name: one(FAMILY) + one(GIVEN),
      phonePrimary: phoneOf(n),
      grade: 'NORMAL',
      zipcode: a.zip,
      addr: a.addr,
      addrDetail: a.detail,
      sido: a.sido,
      sigungu: a.sigungu,
      ownerOrgId: b.orgUnitId,
      createdAt: created,
      leads: 0,
      maxAmount: 0,
    };
    customers.push(c);
    return c;
  };

  // 주마다 출렁임(주별 차트가 밋밋하지 않게)
  const weekNoise = new Map<number, number>();
  const BASE = 5.2;

  for (let dn = START; dn <= TODAY; dn++) {
    const { y, m, d, w } = ymOf(dn);
    const week = Math.floor((dn + 3) / 7);
    if (!weekNoise.has(week)) weekNoise.set(week, 0.84 + rnd() * 0.32);
    const growth = y >= 2026 ? 1.14 + 0.08 * (m / 11) : 1 + 0.04 * (m / 11);
    const weekday = w === 0 ? 0.42 : w === 6 ? 0.62 : w === 1 ? 1.15 : 1;
    const monthEnd = d > lastDayOfMonth(y, m) - 4 ? 1.22 : 1;
    const lambda = BASE * season(dn) * growth * weekday * monthEnd * weekNoise.get(week)!;
    const n = poisson(lambda);

    for (let k = 0; k < n; k++) {
      const b = pick(branchPick);
      const line = pick(LINES);
      const source = pick(sourceWeights(dn));
      // 접수 시각 — 낮 시간 위주, 홈페이지·AI상담봇은 저녁·밤에도
      const night = source === 'AIBOT' || source === 'HOMEPAGE' || source === 'INSTAGRAM';
      const hour = pick<number>([
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
      const createdAt = ts(dn, hour, int(0, 59));
      // 출발지 — 대개 지점 지역, 가끔 서울↔경기 이웃
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

      // 고객 — 리빙·케어는 최근 이사 고객이 다시 맡기는 일이 많다. 이사도 가끔 재이용
      const service = line === 'LIVING' || line === 'CARE';
      let customer: Customer;
      if (service && recentMovers.length && chance(0.4)) customer = one(recentMovers);
      else if (!service && customers.length > 200 && chance(0.04)) customer = one(customers);
      else customer = newCustomer(b, createdAt, from);
      customer.leads++;

      const no = ++seq.rc;
      const leadId = randomUUID();
      const consultDn = dn + (chance(0.7) ? 0 : 1);
      const base = {
        id: leadId,
        leadNo: '',
        legacyNo: mark('RC', no),
        customerId: customer.id,
        orgUnitId: b.orgUnitId,
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
          updatedAt: ts(Math.min(TODAY, status === 'DONE' ? serviceDn : dn + 1), 18),
        });
        continue;
      }

      // ── 이사·기업이전 ──
      const productCode = line === 'B2B_MOVING' ? 'P-OFFICE' : pick(MOVING_PRODUCTS);
      const [median, spread] = PRICE[productCode];
      const priceUp =
        (PEAK_MONTHS.has(m) ? 1.07 : 1) *
        (y >= 2026 ? 1.04 : 1) *
        (from.sido === '서울' ? 1.08 : 1);
      const quoteAmount = Math.min(
        line === 'B2B_MOVING' ? 80_000_000 : 30_000_000,
        Math.max(700_000, won(median * priceUp * Math.exp(spread * gauss()))),
      );
      // 이사일 — 접수 1~9주 뒤(기업이전은 더 길게), 넷 중 하나는 월말로 몰린다
      let moveDn =
        dn + 6 + Math.round((rnd() + rnd() + rnd()) * 18) + (line === 'B2B_MOVING' ? 20 : 0);
      if (chance(0.27)) {
        const mv = ymOf(moveDn);
        const end = moveDn - mv.d + lastDayOfMonth(mv.y, mv.m);
        const target = end - int(0, 2);
        if (target > dn + 5) moveDn = target;
      }
      const visitDn = Math.min(moveDn - 3, dn + int(1, 5));
      const quoteDn = visitDn;
      const signDn = Math.min(moveDn - 2, quoteDn + int(0, 7));

      const pWin = Math.min(0.8, CONV[source] * b.conv * (line === 'B2B_MOVING' ? 0.85 : 1));
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
      const woDn = Math.max(signDn + 1, moveDn - 10);
      const hasWo = outcome === 'WON' && woDn <= TODAY;
      const done = outcome === 'WON' && moveDn < TODAY;

      const status = canceled
        ? 'CANCELED'
        : done
          ? 'DONE'
          : hasWo
            ? 'WORK_TOSS'
            : signed
              ? 'CONTRACTED'
              : quoted
                ? 'QUOTED'
                : consultDn <= TODAY && dn < TODAY
                  ? 'CONSULT_TOSS'
                  : 'RECEIVED';
      const kind = canceled
        ? pick(
            CANCEL[
              outcome === 'LOST_EARLY' ? 'EARLY' : outcome === 'LOST_QUOTED' ? 'QUOTED' : 'CONTRACT'
            ].map(([k, r, wt]) => [[k, r] as const, wt] as const),
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
      leads.push({
        ...base,
        ownerEmpId: status === 'RECEIVED' ? null : b.empId,
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
        updatedAt: ts(lastDn, 18),
      });
      if (!quoted) continue;

      // ── 견적 ──
      const estId = randomUUID();
      const esNo = ++seq.es;
      const pyeong = productCode === 'P-OFFICE' ? int(40, 200) : int(12, 45);
      const deposit = won(quoteAmount * 0.1);
      estimates.push({
        id: estId,
        estimateNo: '',
        legacyNo: mark('ES', esNo),
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
        createdAt: ts(quoteDn, int(13, 18), int(0, 59)),
      });

      // 계약 — 서명 전이면 계약서만 보낸 상태(계약금 대기)
      const draft = !signed && !canceled && outcome === 'WON';
      if (!signed && !draft) continue;
      const total = won(quoteAmount * (chance(0.35) ? 0.93 + rnd() * 0.06 : 1));
      const dep = won(total * 0.1);
      const ctNo = ++seq.ct;
      const contractId = randomUUID();
      const sentAt = ts(quoteDn, int(17, 20), int(0, 59));
      const signedAt = signed ? ts(signDn, int(10, 21), int(0, 59)) : null;
      const contractCanceled = outcome === 'CONTRACT_CANCELED' && canceled;
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
        signedAt,
        signerName: signed ? customer.name : null,
        esignRef: signed ? `seed_hs_${ctNo}` : null,
        sentAt,
        approvedAt: signedAt ? new Date(signedAt.getTime() + int(1, 4) * 3600_000) : null,
        createdAt: sentAt,
      });
      customer.maxAmount = Math.max(customer.maxAmount, total);
      if (!service && done) recentMovers.push(customer);
      if (recentMovers.length > 300) recentMovers.shift();

      const depMethod = pick([
        ['VIRTUAL_ACCOUNT', 65],
        ['TRANSFER', 25],
        ['CARD', 10],
      ]);
      payments.push({
        contractId,
        kind: 'DEPOSIT',
        amount: dep,
        method: depMethod,
        pgProvider: depMethod === 'VIRTUAL_ACCOUNT' ? 'TOSS' : 'MANUAL',
        virtualAccount:
          depMethod === 'VIRTUAL_ACCOUNT' ? `가상은행 9${String(ctNo).padStart(7, '0')}` : null,
        status: contractCanceled ? 'CANCELED' : signed ? 'PAID' : 'PENDING',
        dueAt: ts((signed ? signDn : quoteDn) + 1, 23, 59),
        paidAt: signedAt,
        createdAt: sentAt,
      });
      if (!signed || contractCanceled) continue;
      const balMethod = pick([
        ['TRANSFER', 40],
        ['VIRTUAL_ACCOUNT', 30],
        ['CARD', 20],
        ['CASH', 10],
      ]);
      payments.push({
        contractId,
        kind: 'BALANCE',
        amount: total - dep,
        method: balMethod,
        pgProvider: balMethod === 'VIRTUAL_ACCOUNT' ? 'TOSS' : 'MANUAL',
        virtualAccount:
          balMethod === 'VIRTUAL_ACCOUNT' ? `가상은행 8${String(ctNo).padStart(7, '0')}` : null,
        status: done ? 'PAID' : 'PENDING',
        dueAt: ts(moveDn, 23, 59),
        paidAt: done ? ts(moveDn, int(15, 20), int(0, 59)) : null,
        createdAt: signedAt!,
      });

      // ── 작업오더 — 이사일에 ──
      if (!hasWo) continue;
      const woNo = ++seq.wo;
      const woId = randomUUID();
      workOrders.push({
        id: woId,
        workNo: '',
        legacyNo: mark('WO', woNo),
        contractId,
        leadId,
        orgUnitId: b.orgUnitId,
        scheduledDate: dateOf(moveDn),
        status: done ? 'DONE' : moveDn === TODAY ? 'IN_PROGRESS' : 'ASSIGNED',
        createdAt: ts(woDn, int(9, 17), int(0, 59)),
      });
      assignments.push(
        {
          workOrderId: woId,
          employeeId: b.empId,
          resourceType: 'CREW',
          scheduledAt: dateOf(moveDn),
        },
        {
          workOrderId: woId,
          resourceType: 'VEHICLE',
          resourceRef: `${total > 3_000_000 ? '5톤' : total > 1_500_000 ? '2.5톤' : '1톤'} 트럭 ${int(10, 99)}가${int(1000, 9999)}`,
          scheduledAt: dateOf(moveDn),
        },
      );

      // ── A/S — 이사 끝난 뒤 열에 하나 가까이 ──
      if (done && chance(0.08)) {
        const tDn = moveDn + int(1, 14);
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
    // ── CS — 상담·계약 중 문의(하루 평균 0.15건) ──
    if (leads.length && chance(0.15 * season(dn))) {
      const l = leads[leads.length - 1 - Math.floor(rnd() * Math.min(40, leads.length))];
      const category = pick([
        ['CONSULT', 50],
        ['COST', 30],
        ['ETC', 20],
      ]);
      const b = branches.find((x) => x.orgUnitId === l.orgUnitId)!;
      tickets.push(
        ticket('CS', dn, category, one(CS_SUBJECTS[category]), null, l.id, l.customerId ?? null, b),
      );
    }
  }

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
    const n = ++seq.tk;
    return {
      ticketNo: '',
      legacyNo: mark(kind, n),
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
      priority: pick([
        ['HIGH', 20],
        ['NORMAL', 65],
        ['LOW', 15],
      ]),
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
      createdAt: ts(dn, int(9, 18), int(0, 59)),
    };
  }

  // 고객 등급 — 재이용·큰 금액 고객
  for (const c of customers) {
    c.grade =
      c.maxAmount >= 8_000_000 ? (chance(0.5) ? 'VIP' : 'GOLD') : c.leads >= 2 ? 'GOLD' : 'NORMAL';
  }

  // ── 화면 번호 — 앱과 같은 next_doc_no로, 날짜·시각 순서대로 ──
  async function assignNo<T extends { createdAt?: Date | string | null }>(
    rows: T[],
    prefix: (r: T) => string,
    set: (r: T, no: string) => void,
  ) {
    const groups = new Map<string, T[]>();
    for (const r of rows) {
      const p = prefix(r);
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p)!.push(r);
    }
    for (const [p, list] of groups) {
      list.sort((a, b) => +new Date(a.createdAt!) - +new Date(b.createdAt!));
      const days = list.map((r) => ymd(Math.floor((+new Date(r.createdAt!) + 9 * 3600_000) / DAY)));
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
    (r, no) => (r.leadNo = no),
  );
  await assignNo(
    estimates,
    () => 'ES',
    (r, no) => (r.estimateNo = no),
  );
  await assignNo(
    contracts,
    () => 'CT',
    (r, no) => (r.contractNo = no),
  );
  await assignNo(
    workOrders,
    () => 'WO',
    (r, no) => (r.workNo = no),
  );
  await assignNo(
    tickets,
    (r) => r.kind,
    (r, no) => (r.ticketNo = no),
  );

  // ── 넣기 ──
  const chunk = async <T>(rows: T[], fn: (data: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 1000) await fn(rows.slice(i, i + 1000));
  };
  await prisma.$transaction(
    async (tx) => {
      await chunk(
        customers.map(({ leads: _l, maxAmount: _m, ...c }) => c),
        (data) => tx.customer.createMany({ data }),
      );
      await chunk(leads, (data) => tx.lead.createMany({ data }));
      await chunk(estimates, (data) => tx.estimate.createMany({ data }));
      await chunk(contracts, (data) => tx.contract.createMany({ data }));
      await chunk(payments, (data) => tx.payment.createMany({ data }));
      await chunk(workOrders, (data) => tx.workOrder.createMany({ data }));
      await chunk(assignments, (data) => tx.workAssignment.createMany({ data }));
      await chunk(tickets, (data) => tx.supportTicket.createMany({ data }));
    },
    { timeout: 300_000, maxWait: 30_000 },
  );

  const signedCount = contracts.filter((c) => c.status === 'SIGNED').length;
  console.log(
    `[demo-history] ${ymd(START)} ~ ${ymd(TODAY)} — 고객 ${customers.length} · 접수 ${leads.length} · ` +
      `견적 ${estimates.length} · 계약 ${contracts.length}(서명 ${signedCount}) · 결제 ${payments.length} · ` +
      `작업오더 ${workOrders.length} · 배정 ${assignments.length} · A/S·CS ${tickets.length} ` +
      `(지점 ${branches.length}곳, ${Math.round((Date.now() - t0) / 100) / 10}초)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
