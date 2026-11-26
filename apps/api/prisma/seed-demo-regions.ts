/**
 * 시드(추가, 한 번만) — 시연(2026-11-28)용 '지방 실적'. 앞선 시드는 지점 가중치가 서울·경기에 몰려
 * 대시보드의 시도별 매출·접수·고객(지도·순위)이 거의 수도권 둘만 보였다. 인천·부산·대구·대전·광주·제주 등
 * 모든 시도에 그럴듯한 접수·계약을 더해 지역 순위가 실제처럼 보이게 한다. 시연용이다.
 *
 *   pnpm --filter @tongin/api demo:seed:regions     # 만들기(이미 있으면 건너뛴다)
 *   pnpm --filter @tongin/api demo:clear:regions    # 지우기(실운영 전환 때)
 *
 * 시도별 위젯이 보는 칸(대시보드 revenue.byRegion·lead.byRegion·customer.byRegion, 통계 groupBy=region):
 * - 매출 = 서명 계약(contract.status SIGNED, signed_at 기간)의 total_amount를 접수의 출발지 시도(lead.from_sido)로 묶는다
 * - 접수 = lead.from_sido, 고객 = customer.sido. 값은 짧은 이름('서울'·'인천'·'제주' …, 지도와 같은 표기)
 * → 그래서 접수 출발지·고객 주소를 그 지역으로 넣고, 접수·계약은 그 지역의 실제 지점(이름으로 찾는다)에 붙인다.
 *   울산은 지점이 없어 가까운 부산(해운대·동래) 지점이 맡는다
 *
 * - 기간: 2026-06-01 ~ 2026-11-28(토) 18:00(한국 시간), 가을(9~11월)이 더 많다. '지금'은 이 끝 시각
 * - 시도마다 서명 계약 목표 건수(SIDO_PLAN)를 정해 두고, 놓친 접수(초기 취소·견적 뒤 취소)·진행 중 접수·
 *   계약 취소·리빙/케어 접수를 그 비율로 곁들인다 — 서울·경기가 여전히 1·2위, 인천이 3위(대략 10%),
 *   부산·대구·대전·광주가 몇 %, 제주는 1~2%, 나머지 시도도 몇 건씩
 * - 접수 → 견적 → 계약(계약금) → 본사 승인 → 작업오더(이사일) → 잔금(seed-demo-recent-weeks.ts와 같은 흐름)
 *   · 최근 이틀 안에 서명한 계약 일부는 본사 승인 전(계약미승인 CONTRACT_PENDING)
 *   · 앞으로의 이사 — 작업오더 배정(ASSIGNED), 이사가 끝났는데 잔금이 안 들어온 건(미수금)도 조금
 *
 * 표시: id가 'd0d01028-5eed-'로 시작한다(clear-demo-regions.ts). 번호가 있는 표는 옛 번호도 'RG-'.
 * 화면 번호는 앱과 같은 규칙(next_doc_no)으로 그날 날짜에 붙는다. 같은 난수 씨앗이라 같은 DB면 결과가 같다.
 * 고객은 음절 목록으로 만든 가상 인물, 전화는 010-0096-xxxx(가운데가 0으로 시작 — 쓰이지 않는 번호대,
 * 다른 시드의 0000·0090·0097·0098·0099번대와 겹치지 않게).
 * 지점·직원·상품은 실행할 때 DB에서 찾는다(seed-demo.ts·seed-demo-catalog.ts를 먼저 돌려야 한다).
 * 실제로 문자·전화를 보내지 않는다 — 행만 넣는다.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { KR_HOLIDAYS } from '@tongin/shared';
import { RG_ID_PREFIX, RG_MARK, hasDemoRegions } from './clear-demo-regions';

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

/** 채울 첫날 — 2026-06-01 */
const FROM = dnOf(2026, 5, 1);
/** 마지막 날 — 2026-11-28(토). 이 날 18:00을 '지금'으로 본다 */
const TODAY = dnOf(2026, 10, 28);
const END_HOUR = 18;
const NOW = +ts(TODAY, END_HOUR);
/** 달마다 접수 비중(6월~11월) — 가을 이사철이 많고, 11월은 28일까지라 하루 비중이 크다 */
const MONTH_WEIGHT: Record<number, number> = {
  5: 0.85,
  6: 0.8,
  7: 0.75,
  8: 1.05,
  9: 1.25,
  10: 1.5,
};

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
const rnd = mulberry32(20261028);
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
const won = (n: number) => Math.round(n / 10_000) * 10_000;
/** 그날 h1~h2시 사이의 순간 — 마지막 날은 '지금'(18시)을 넘지 않게 */
const at = (dn: number, h1: number, h2: number) =>
  ts(dn, int(h1, dn === TODAY ? Math.min(h2, END_HOUR - 1) : h2), int(0, 59));
const capNow = (d: Date) => new Date(Math.min(NOW, +d));

// ── 표시 id — 'd0d01028-5eed-<표 2자리>00-8000-<순번 12자리>' ──
const TABLE_CODE = {
  cu: '01',
  ld: '02',
  es: '03',
  ct: '04',
  pm: '05',
  wo: '06',
  wa: '07',
} as const;
type TableKey = keyof typeof TABLE_CODE;
const idSeq: Partial<Record<TableKey, number>> = {};
function oid(table: TableKey) {
  const n = (idSeq[table] = (idSeq[table] ?? 0) + 1);
  return `${RG_ID_PREFIX}-${TABLE_CODE[table]}00-8000-${n.toString(16).padStart(12, '0')}`;
}
const mark = (p: string, n: number) => `${RG_MARK}${p}${String(n).padStart(5, '0')}`;

// ── 지역 — 시도마다 시군구·도로·우편번호 앞자리와 맡을 지점(이름) ──
type Area = { sido: string; sigungu: string; zip: string; roads: string[]; branch: RegExp };
const A = (
  sido: string,
  sigungu: string,
  zip: string,
  branch: RegExp,
  ...roads: string[]
): Area => ({
  sido,
  sigungu,
  zip,
  roads,
  branch,
});
type Plan = {
  sido: string;
  /** 서명 계약 목표 건수(이번 시드가 더하는 몫) */
  won: number;
  /** 금액 배율 — 수도권보다 조금 낮게, 제주는 바닷길 운송비로 높게 */
  price: number;
  /** 계약 전환율 성향 — 놓친 접수 수 = 계약 × (1/전환율 − 1) */
  conv: number;
  areas: [Area, number][];
};
const SIDO_PLAN: Plan[] = [
  {
    sido: '인천',
    won: 84,
    price: 1.0,
    conv: 0.44,
    areas: [
      [A('인천', '연수구', '21', /인천송도/, '컨벤시아대로', '송도과학로', '아트센터대로'), 30],
      [A('인천', '서구', '22', /인천서구/, '청라커낼로', '봉오대로', '중봉대로'), 22],
      [A('인천', '남동구', '21', /인천송도/, '인주대로', '논현로', '예술로'), 16],
      [A('인천', '부평구', '21', /인천서구/, '부평대로', '경원대로', '마장로'), 14],
      [A('인천', '미추홀구', '22', /인천송도/, '인하로', '경인로'), 9],
      [A('인천', '계양구', '21', /인천서구/, '계양대로', '봉오대로'), 7],
      [A('인천', '중구', '22', /인천송도/, '영종대로', '하늘중앙로'), 5],
      [A('인천', '옹진군', '23', /연평|백령/, '백령로', '연평로'), 1],
    ],
  },
  {
    sido: '부산',
    won: 30,
    price: 0.95,
    conv: 0.42,
    areas: [
      [A('부산', '해운대구', '48', /해운대/, '해운대로', '센텀중앙로', '좌동순환로'), 30],
      [A('부산', '수영구', '48', /해운대/, '광안해변로', '수영로'), 14],
      [A('부산', '동래구', '47', /부산동래/, '충렬대로', '명륜로', '온천장로'), 20],
      [A('부산', '연제구', '47', /부산동래/, '중앙대로', '월드컵대로'), 12],
      [A('부산', '부산진구', '47', /부산동래/, '서면로', '가야대로'), 14],
      [A('부산', '남구', '48', /해운대/, '용호로', '수영로'), 10],
    ],
  },
  {
    sido: '대구',
    won: 26,
    price: 0.93,
    conv: 0.41,
    areas: [
      [A('대구', '수성구', '42', /대구수성/, '달구벌대로', '동대구로', '범안로'), 36],
      [A('대구', '달서구', '42', /대구달서/, '월배로', '달서대로', '상화로'), 30],
      [A('대구', '북구', '41', /대구수성/, '칠곡중앙대로', '동천로'), 16],
      [A('대구', '동구', '41', /대구수성/, '동대구로', '혁신대로'), 18],
    ],
  },
  {
    sido: '대전',
    won: 17,
    price: 0.92,
    conv: 0.43,
    areas: [
      [A('대전', '유성구', '34', /대전|유성/, '대학로', '한밭대로', '엑스포로'), 45],
      [A('대전', '서구', '35', /대전|유성/, '둔산로', '계룡로', '대덕대로'), 40],
      [A('대전', '대덕구', '34', /대전|유성/, '한밭대로', '대전로'), 15],
    ],
  },
  {
    sido: '광주',
    won: 18,
    price: 0.9,
    conv: 0.4,
    areas: [
      [A('광주', '광산구', '62', /광주광산/, '임방울대로', '수완로', '첨단중앙로'), 50],
      [A('광주', '서구', '61', /광주광산/, '상무대로', '치평로'), 30],
      [A('광주', '북구', '61', /광주광산/, '서하로', '첨단과기로'), 20],
    ],
  },
  {
    sido: '울산',
    won: 12,
    price: 0.94,
    conv: 0.4,
    areas: [
      [A('울산', '남구', '44', /해운대/, '삼산로', '번영로', '문수로'), 45],
      [A('울산', '중구', '44', /해운대/, '태화로', '종가로'), 25],
      [A('울산', '북구', '44', /부산동래/, '산업로', '진장로'), 15],
      [A('울산', '울주군', '44', /부산동래/, '구영로', '언양로'), 15],
    ],
  },
  {
    sido: '경남',
    won: 11,
    price: 0.9,
    conv: 0.4,
    areas: [
      [A('경남', '창원시', '51', /창원/, '중앙대로', '원이대로', '창원대로'), 60],
      [A('경남', '김해시', '50', /창원/, '김해대로', '금관대로'), 25],
      [A('경남', '진주시', '52', /창원/, '진양호로', '에나로'), 15],
    ],
  },
  {
    sido: '경북',
    won: 5,
    price: 0.88,
    conv: 0.4,
    areas: [
      [A('경북', '포항시', '37', /포항|경주/, '포스코대로', '대잠길'), 45],
      [A('경북', '경주시', '38', /포항|경주/, '태종로', '알천북로'), 20],
      [A('경북', '경산시', '38', /경산/, '중앙로', '대학로'), 25],
      [A('경북', '구미시', '39', /경산/, '송정대로', '구미대로'), 10],
    ],
  },
  {
    sido: '충남',
    won: 5,
    price: 0.88,
    conv: 0.42,
    areas: [
      [A('충남', '천안시', '31', /천안/, '불당대로', '번영로'), 60],
      [A('충남', '아산시', '31', /아산/, '배방로', '시민로'), 40],
    ],
  },
  {
    sido: '충북',
    won: 7,
    price: 0.87,
    conv: 0.41,
    areas: [
      [A('충북', '청주시', '28', /청주/, '직지대로', '가로수로', '오창중앙로'), 75],
      [A('충북', '충주시', '27', /충주/, '중앙로', '충원대로'), 25],
    ],
  },
  {
    sido: '강원',
    won: 6,
    price: 0.87,
    conv: 0.4,
    areas: [
      [A('강원', '춘천시', '24', /춘천/, '중앙로', '퇴계로', '후석로'), 40],
      [A('강원', '원주시', '26', /원주/, '단구로', '시청로', '혁신로'), 45],
      [A('강원', '강릉시', '25', /원주/, '경강로', '하슬라로'), 15],
    ],
  },
  {
    sido: '전북',
    won: 7,
    price: 0.86,
    conv: 0.4,
    areas: [
      [A('전북', '전주시', '54', /전주|덕진/, '백제대로', '기린대로', '송천중앙로'), 70],
      [A('전북', '익산시', '54', /전주|덕진/, '익산대로', '무왕로'), 15],
      [A('전북', '군산시', '54', /전주|덕진/, '조촌로', '수송로'), 15],
    ],
  },
  {
    sido: '전남',
    won: 8,
    price: 0.86,
    conv: 0.39,
    areas: [
      [A('전남', '나주시', '58', /나주/, '빛가람로', '전력로'), 30],
      [A('전남', '순천시', '57', /나주/, '연향번영길', '왕지로'), 30],
      [A('전남', '여수시', '59', /나주/, '좌수영로', '시청로'), 20],
      [A('전남', '목포시', '58', /광주광산/, '영산로', '백년대로'), 20],
    ],
  },
  {
    sido: '세종',
    won: 6,
    price: 0.92,
    conv: 0.43,
    areas: [[A('세종', '세종시', '30', /세종/, '한누리대로', '도움로', '보듬로'), 1]],
  },
  {
    sido: '제주',
    won: 12,
    price: 1.15,
    conv: 0.4,
    areas: [
      [A('제주', '제주시', '63', /제주/, '연북로', '노형로', '첨단로'), 70],
      [A('제주', '서귀포시', '63', /제주/, '중앙로', '일주동로'), 30],
    ],
  },
];
/** 도착지 — 대개 같은 시도, 일부는 서울·경기나 다른 지방으로 */
const CAPITAL_DEST: Area[] = [
  A('서울', '강남구', '06', /-/, '테헤란로', '논현로'),
  A('서울', '송파구', '05', /-/, '올림픽로', '송파대로'),
  A('서울', '마포구', '04', /-/, '마포대로', '월드컵북로'),
  A('경기', '성남시 분당구', '13', /-/, '판교역로', '정자일로'),
  A('경기', '수원시 영통구', '16', /-/, '광교중앙로', '영통로'),
  A('경기', '고양시 일산동구', '10', /-/, '호수로', '중앙로'),
];
function address(r: Area) {
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
/** 010-0096-xxxx(가운데가 0으로 시작 — 실제로 쓰이지 않는 번호대). 다른 시드와 겹치지 않게 0096번대만 */
const fakePhone = (n: number) => `0100096${String(n % 10_000).padStart(4, '0')}`;
let phoneNo = 0;
const nextPhone = () => fakePhone(++phoneNo);

// ── 분포(seed-demo-recent-weeks.ts와 같은 표) ──
type Source =
  | 'PHONE'
  | 'NAVER'
  | 'HOMEPAGE'
  | 'AIBOT'
  | 'INSTAGRAM'
  | 'PARTNER'
  | 'WALK_IN'
  | 'SYSTEM'
  | 'ETC';
const SOURCE_WEIGHTS: [Source, number][] = [
  ['PHONE', 26],
  ['NAVER', 20],
  ['HOMEPAGE', 14],
  ['AIBOT', 15],
  ['INSTAGRAM', 9],
  ['PARTNER', 8],
  ['WALK_IN', 4],
  ['SYSTEM', 3],
  ['ETC', 1],
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
    ['타사 계약', '지역 업체와 이미 계약', 20],
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

/** 접수 결과 — OPEN은 아직 진행 중(최근 접수), SERVICE는 리빙·케어 접수 */
type Outcome = 'WON' | 'LOST_EARLY' | 'LOST_QUOTED' | 'CONTRACT_CANCELED' | 'OPEN' | 'SERVICE';

async function main() {
  const t0 = Date.now();
  if (await hasDemoRegions(prisma)) {
    console.log('[demo-regions] 이미 있다 — 건너뜀(다시 만들려면 먼저 demo:clear:regions)');
    return;
  }

  // ════════════════ 참조 ════════════════
  // 지점 — 이름으로 찾고, 담당은 그 지점의 직원(계정이 켜진 사람 먼저). 지방 지점에 직원이 없으면 그 지역은 건너뛴다
  const branchRows = await prisma.orgUnit.findMany({
    where: { type: 'BRANCH', isActive: true },
    select: {
      id: true,
      name: true,
      employees: {
        where: { isActive: true },
        select: {
          id: true,
          empNo: true,
          appUsers: { where: { isActive: true }, select: { id: true } },
        },
        orderBy: { empNo: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  });
  type Branch = { orgUnitId: string; name: string; empId: string };
  const branchFor = new Map<RegExp, Branch | null>();
  const resolve = (re: RegExp): Branch | null => {
    if (branchFor.has(re)) return branchFor.get(re)!;
    const hit = branchRows
      .filter((o) => re.test(o.name) && o.employees.length)
      .map((o) => ({
        o,
        emp: o.employees.find((e) => e.appUsers.length) ?? o.employees[0],
        user: o.employees.some((e) => e.appUsers.length),
      }))
      .sort((a, b) => Number(b.user) - Number(a.user))[0];
    const b = hit ? { orgUnitId: hit.o.id, name: hit.o.name, empId: hit.emp.id } : null;
    branchFor.set(re, b);
    return b;
  };
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
  const partners = await prisma.partner.findMany({
    where: { type: { in: ['AFFILIATE', 'EXCLUSIVE'] }, isActive: true },
    select: { id: true },
    orderBy: { code: 'asc' },
  });

  // 날짜 비중 — 달 비중 × 요일(월요일·월말 많고 일요일 적다)
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
    return base * (d > lastDayOfMonth(y, m) - 4 ? 1.2 : 1) * (MONTH_WEIGHT[m] ?? 1);
  };
  const allDays: [number, number][] = [];
  for (let dn = FROM; dn <= TODAY; dn++) allDays.push([dn, dayWeight(dn)]);
  /** 서명까지 가려면 마지막 날 전에 접수돼야 한다 */
  const wonDays = allDays.filter(([dn]) => dn <= TODAY - 1);
  /** 아직 진행 중인 접수는 최근 2주 */
  const openDays = allDays.filter(([dn]) => dn >= TODAY - 13);

  // ════════════════ 접수 → 견적 → 계약 → 결제 → 작업 ════════════════
  type Customer = Prisma.CustomerCreateManyInput & { id: string };
  type Lead = Prisma.LeadCreateManyInput & { id: string; createdAt: Date; status: string };
  const customers: Customer[] = [];
  const leads: Lead[] = [];
  const estimates: (Prisma.EstimateCreateManyInput & { id: string; createdAt: Date })[] = [];
  const contracts: (Prisma.ContractCreateManyInput & { id: string; createdAt: Date })[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const workOrders: (Prisma.WorkOrderCreateManyInput & { id: string; createdAt: Date })[] = [];
  const assignments: Prisma.WorkAssignmentCreateManyInput[] = [];
  const seq = { cu: 0, rc: 0, es: 0, ct: 0, wo: 0 };
  const planLog: string[] = [];

  for (const plan of SIDO_PLAN) {
    const areas = plan.areas
      .map(([a, w]) => [a, w, resolve(a.branch)] as const)
      .filter(([, , b]) => b);
    if (!areas.length) {
      console.warn(`[demo-regions] ${plan.sido} — 맡을 지점(직원 있는)이 없어 건너뜀`);
      continue;
    }
    const areaPick = areas.map(([a, w, b]) => [[a, b!] as const, w] as const);
    // 결과 목록 — 서명 계약 목표만큼 WON, 전환율로 놓친 접수, 그 밖에 계약 취소·진행 중·리빙/케어
    const lost = Math.round(plan.won * (1 / plan.conv - 1));
    const outcomes: Outcome[] = [
      ...Array<Outcome>(plan.won).fill('WON'),
      ...Array<Outcome>(Math.round(lost * 0.45)).fill('LOST_EARLY'),
      ...Array<Outcome>(lost - Math.round(lost * 0.45)).fill('LOST_QUOTED'),
      ...Array<Outcome>(Math.max(1, Math.round(plan.won * 0.05))).fill('CONTRACT_CANCELED'),
      ...Array<Outcome>(Math.max(1, Math.round(plan.won * 0.18))).fill('OPEN'),
      ...Array<Outcome>(Math.max(1, Math.round(plan.won * 0.12))).fill('SERVICE'),
    ];
    planLog.push(`${plan.sido} ${plan.won}/${outcomes.length}`);

    for (const outcome of outcomes) {
      const [area, b] = pick(areaPick);
      const dn = pick(outcome === 'OPEN' ? openDays : outcome === 'WON' ? wonDays : allDays);
      const source = pick(SOURCE_WEIGHTS);
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
      ]);
      if (dn === TODAY) hour = Math.min(hour, END_HOUR - 2);
      const createdAt = ts(dn, hour, int(0, 59));
      const from = address(area);
      const toArea = chance(0.82)
        ? pick(areaPick)[0]
        : chance(0.6)
          ? one(CAPITAL_DEST)
          : one(one(SIDO_PLAN).areas)[0];
      const to = address(toArea);

      const customer: Customer = {
        id: oid('cu'),
        legacyNo: mark('CU', ++seq.cu),
        name: one(FAMILY) + one(GIVEN),
        phonePrimary: nextPhone(),
        grade: 'NORMAL',
        zipcode: from.zip,
        addr: from.addr,
        addrDetail: from.detail,
        sido: from.sido,
        sigungu: from.sigungu,
        ownerOrgId: b.orgUnitId,
        createdAt,
      };
      customers.push(customer);

      const leadId = oid('ld');
      const line =
        outcome === 'SERVICE'
          ? chance(0.6)
            ? 'LIVING'
            : 'CARE'
          : chance(0.05) && outcome !== 'OPEN'
            ? 'B2B_MOVING'
            : 'MOVING';
      const base = {
        id: leadId,
        leadNo: '',
        legacyNo: mark('RC', ++seq.rc),
        customerId: customer.id,
        orgUnitId: b.orgUnitId,
        partnerId: source === 'PARTNER' && partners.length ? one(partners).id : null,
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
      if (outcome === 'SERVICE') {
        const [code, name, price] = one(SERVICE_PRODUCTS[line]);
        const amount = won(price * Math.exp(0.3 * gauss()));
        const serviceDn = dn + int(3, 25);
        const ok = chance(0.65);
        const cancelDn = dn + int(1, 6);
        const status =
          !ok && cancelDn <= TODAY
            ? 'CANCELED'
            : serviceDn < TODAY && ok
              ? 'DONE'
              : dn + 1 <= TODAY && ok
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
      const quoteAmount = Math.min(
        line === 'B2B_MOVING' ? 60_000_000 : 25_000_000,
        Math.max(700_000, won(median * plan.price * Math.exp(spread * gauss()))),
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
      const visitDn = Math.min(moveDn - 3, TODAY, dn + int(0, 4));
      const quoteDn = visitDn;
      // 서명 — 견적 0~7일 뒤. WON은 반드시 마지막 날까지 서명한다(시도별 계약 건수가 목표대로 나오게)
      let signDn = Math.min(moveDn - 2, quoteDn + int(0, 7));
      if (outcome === 'WON') signDn = Math.min(signDn, TODAY);
      const cancelDn =
        outcome === 'LOST_EARLY'
          ? dn + int(1, 10)
          : outcome === 'LOST_QUOTED'
            ? quoteDn + int(3, 18)
            : outcome === 'CONTRACT_CANCELED'
              ? signDn + int(2, Math.max(2, moveDn - signDn - 1))
              : Infinity;
      const canceled = cancelDn <= TODAY;
      // 진행 중(OPEN) 접수는 접수·상담·견적 단계에 머문다 — 일부는 계약서만 보냈다
      const openStage =
        outcome === 'OPEN'
          ? pick([
              ['RECEIVED', 25],
              ['CONSULT_TOSS', 30],
              ['QUOTED', 35],
              ['DRAFT', 10],
            ] as const)
          : null;
      const quoted =
        outcome !== 'LOST_EARLY' &&
        quoteDn <= TODAY &&
        (openStage === null || openStage === 'QUOTED' || openStage === 'DRAFT');
      const signed = (outcome === 'WON' || outcome === 'CONTRACT_CANCELED') && signDn <= TODAY;
      const unapproved = outcome === 'WON' && signed && signDn >= TODAY - 2 && chance(0.45);
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
                  : openStage === 'RECEIVED'
                    ? 'RECEIVED'
                    : 'CONSULT_TOSS';
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
        updatedAt: capNow(new Date(Math.max(+createdAt + 60_000, +ts(lastDn, 17, int(0, 59))))),
      });
      if (!quoted) continue;

      // ── 견적 ──
      const estId = oid('es');
      const pyeong = productCode === 'P-OFFICE' ? int(40, 200) : int(12, 45);
      const deposit = won(quoteAmount * 0.1);
      const quotedAt = capNow(new Date(Math.max(+createdAt + 30 * 60_000, +at(quoteDn, 13, 18))));
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
        createdAt: quotedAt,
      });

      // ── 계약 — 서명 전이면 계약서만 보낸 상태(계약금 대기) ──
      const draft = !signed && !canceled && openStage === 'DRAFT';
      if (!signed && !draft) continue;
      const total = won(quoteAmount * (chance(0.35) ? 0.93 + rnd() * 0.06 : 1));
      const dep = won(total * 0.1);
      const ctNo = ++seq.ct;
      const contractId = oid('ct');
      const sentAt = capNow(new Date(+quotedAt + int(20, 180) * 60_000));
      const signedAt = signed
        ? capNow(new Date(Math.max(+sentAt + 10 * 60_000, +at(signDn, 10, 21))))
        : null;
      const contractCanceled = outcome === 'CONTRACT_CANCELED' && canceled;
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
        signedAt,
        signerName: signed ? customer.name : null,
        esignRef: signed ? `seed_rg_${ctNo}` : null,
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
          depMethod === 'VIRTUAL_ACCOUNT' ? `가상은행 5${String(ctNo).padStart(7, '0')}` : null,
        status: contractCanceled ? 'CANCELED' : signed ? 'PAID' : 'PENDING',
        dueAt: ts((signed ? signDn : quoteDn) + 1, 23, 59),
        paidAt: signedAt,
        createdAt: sentAt,
      });
      if (!signed || contractCanceled) continue;
      // 잔금 — 이사 날 받는다. 최근 이사 일부는 아직 안 들어왔다(미수금)
      const unpaid = done && chance(moveDn >= TODAY - 21 ? 0.18 : 0.04);
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
          balMethod === 'VIRTUAL_ACCOUNT' ? `가상은행 4${String(ctNo).padStart(7, '0')}` : null,
        status: done && !unpaid ? 'PAID' : 'PENDING',
        dueAt: ts(moveDn, 23, 59),
        paidAt: done && !unpaid ? capNow(at(moveDn, 15, 20)) : null,
        createdAt: signedAt!,
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
    }
  }
  leads.sort((a, b) => +a.createdAt - +b.createdAt);

  // ════════════════ 화면 번호 — 앱과 같은 next_doc_no로, 날짜·시각 순서대로 ════════════════
  async function assignNo<T>(
    rows: T[],
    prefix: string,
    atOf: (r: T) => Date,
    set: (r: T, no: string) => void,
  ) {
    const list = [...rows].sort((a, b) => +atOf(a) - +atOf(b));
    if (!list.length) return;
    const days = list.map((r) => ymd(dnOfDate(atOf(r))));
    const out = await prisma.$queryRawUnsafe<{ no: string }[]>(
      `SELECT next_doc_no($1, u.d::date) AS no FROM unnest($2::text[]) WITH ORDINALITY AS u(d, i) ORDER BY u.i`,
      prefix,
      days,
    );
    list.forEach((r, i) => set(r, out[i].no));
  }
  await assignNo(
    leads,
    'RC',
    (r) => r.createdAt,
    (r, no) => (r.leadNo = no),
  );
  await assignNo(
    estimates,
    'ES',
    (r) => r.createdAt,
    (r, no) => (r.estimateNo = no),
  );
  await assignNo(
    contracts,
    'CT',
    (r) => r.createdAt,
    (r, no) => (r.contractNo = no),
  );
  await assignNo(
    workOrders,
    'WO',
    (r) => r.createdAt,
    (r, no) => (r.workNo = no),
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
    },
    { timeout: 300_000, maxWait: 30_000 },
  );

  const cnt = <T extends { status?: unknown }>(xs: T[], s: string) =>
    xs.filter((x) => x.status === s).length;
  const signedSum = contracts
    .filter((c) => c.status === 'SIGNED')
    .reduce((s, c) => s + Number(c.totalAmount), 0);
  console.log(`[demo-regions] 시도별 서명 목표/접수 — ${planLog.join(' · ')}`);
  console.log(
    `[demo-regions] ${ymd(FROM)} ~ ${ymd(TODAY)} ${END_HOUR}시 — 고객 ${customers.length} · ` +
      `접수 ${leads.length}(취소 ${cnt(leads, 'CANCELED')}·계약미승인 ${cnt(leads, 'CONTRACT_PENDING')}) · ` +
      `견적 ${estimates.length} · 계약 ${contracts.length}(서명 ${cnt(contracts, 'SIGNED')}, ` +
      `${Math.round(signedSum / 1_000_000).toLocaleString()}백만 원) · 결제 ${payments.length} · ` +
      `작업오더 ${workOrders.length} (${Math.round((Date.now() - t0) / 100) / 10}초)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
