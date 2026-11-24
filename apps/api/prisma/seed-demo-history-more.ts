/**
 * 시드(추가, 한 번만) — 2025-01-01부터 오늘까지 '나머지 메뉴의 지난 기록'을 만든다. 운영(시연) 서버에서
 * 비어 있던 메뉴(거래처·청구·결재·휴가·근태·인사 기록·상담 콜·확인콜·영업 CRM·캠페인·팀 업무·공지·
 * 지점 관리 기록·이사 마감·가맹점 계약 정보·알림)가 의미 있게 보이도록. 시연용이다.
 *
 *   pnpm --filter @tongin/api demo:seed:history-more     # 만들기(이미 있으면 건너뛴다)
 *   pnpm --filter @tongin/api demo:clear:history-more    # 지우기(실운영 전환 때)
 *
 * - 거래처: 전속 계약사(임직원 이사)·기업이전 거래처·제휴사·외주 용역 — 가상 회사. 제휴 접수(경로 PARTNER)에 이어 붙인다
 * - 청구: 전속 계약사 월별 청구 + 기업이전 건별 청구(seed-demo-history-ops.ts와 같은 규칙). 운영 쪽 시드가 이미
 *   청구를 만든 환경(id 'd0d01025-5eed-' 청구가 있음)에서는 만들지 않는다 — 두 번 들어가지 않게
 * - 결재·휴가·근태: 본사 직원의 연차·반차(입사일 기준 연차를 넘지 않게), 결재 양식(지출·구매·출장·재택),
 *   일반 품의, 퇴근 누락 정정. 근태는 근무일마다(휴가·공휴일 빼고), 가끔 지각·조퇴·누락
 * - 인사: 입사·전보·승진 이력, 입사 체크리스트, 휴가 종류·전사 결재선·체크리스트 항목·수당 규정(없을 때만)
 * - 상담 콜: 전화 접수와 이어진 콜 + 문의·부재중 콜백·스팸. 이사 확인콜(이사 이틀 전)·해피콜(이사 다음 날)
 * - 영업 CRM(가맹·기업영업)·캠페인·팀 업무(댓글·이력)·공지·지점 관리 기록·이사 마감(지점별 꽉 찬 날)
 * - 가맹점 계약 정보: 비어 있는 지점만(가맹비·보증금·상호사용료·계약 기간, 일부 재계약 대상)
 * - 알림: 최근 3주 결재 요청·결과, 업무 배정, 최근 공지
 *
 * 표시: id가 'd0d01026-5eed-'로 시작한다(clear-demo-history-more.ts). 청구·결재의 옛 번호는 'HM-'.
 * 화면 번호는 앱과 같은 규칙(next_doc_no)으로 그날 날짜에 붙는다. 같은 난수 씨앗이라 같은 DB면 결과가 같다.
 * 사람 이름·회사 이름은 음절 목록으로 만든 가상 이름, 전화는 010-0098-xxxx(가운데가 0으로 시작 — 쓰이지 않는 번호대).
 * 직원·조직·고객·접수는 실행할 때 DB에서 찾는다(seed-demo.ts·seed-demo-history.ts를 먼저 돌려야 한다).
 * 실제로 문자·전화를 보내지 않는다 — 행만 넣는다.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { KR_HOLIDAYS, leaveEntitlement } from '@tongin/shared';
import {
  MORE_BIZ_MARK,
  MORE_ID_PREFIX,
  MORE_MARK,
  hasDemoHistoryMore,
} from './clear-demo-history-more';
import { OPS_ID_PREFIX } from './clear-demo-history-ops';

const prisma = new PrismaClient();

// ── 날짜 — 하루를 '1970-01-01부터 며칠째(한국 날짜)'인 정수로 다룬다(seed-demo-history.ts와 같은 규칙) ──
const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1) / DAY;
const NOW = Date.now();
const TODAY = Math.floor((NOW + 9 * 3600_000) / DAY);
const dateOf = (dn: number) => new Date(dn * DAY);
/** 한국 시각 h:m의 순간 */
const ts = (dn: number, h: number, m = 0) => new Date(dn * DAY + (h - 9) * 3600_000 + m * 60_000);
const ymd = (dn: number) => dateOf(dn).toISOString().slice(0, 10);
const dnOfDate = (d: Date) => Math.floor((+d + 9 * 3600_000) / DAY);
const dnOfYmd = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / DAY;
const ymOf = (dn: number) => {
  const d = dateOf(dn);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
};
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const dnOf = (y: number, m: number, d: number) => Date.UTC(y, m, d) / DAY;
const isWeekend = (dn: number) => {
  const w = ymOf(dn).w;
  return w === 0 || w === 6;
};
/** 2025년 공휴일(공유 표 KR_HOLIDAYS는 2026년부터라 여기 덧붙인다) */
const HOLIDAYS = new Set([
  '2025-01-01',
  '2025-01-27',
  '2025-01-28',
  '2025-01-29',
  '2025-01-30',
  '2025-03-01',
  '2025-03-03',
  '2025-05-05',
  '2025-05-06',
  '2025-06-03',
  '2025-06-06',
  '2025-08-15',
  '2025-10-03',
  '2025-10-06',
  '2025-10-07',
  '2025-10-08',
  '2025-10-09',
  '2025-12-25',
  ...Object.keys(KR_HOLIDAYS),
]);
const isWorkday = (dn: number) => !isWeekend(dn) && !HOLIDAYS.has(ymd(dn));
const weekdayOnOrAfter = (dn: number) => {
  while (!isWorkday(dn)) dn++;
  return dn;
};
const minTs = (d: Date) => new Date(Math.min(NOW, +d));

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
const rnd = mulberry32(20261124);
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;
function pick<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) < 0) return v;
  return items[items.length - 1][0];
}
const one = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
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
function hash01(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
const round = (n: number, unit: number) => Math.max(unit, Math.round(n / unit) * unit);

// ── 표시 id — 'd0d01026-5eed-<표 2자리>00-8000-<순번 12자리>' ──
const TABLE_CODE = {
  ptn: '01',
  inv: '02',
  rcp: '03',
  pc: '04',
  cr: '05',
  hrp: '06',
  lt: '07',
  alt: '08',
  hct: '09',
  eci: '0a',
  eh: '0b',
  lr: '0c',
  la: '0d',
  ad: '0e',
  as: '0f',
  att: '10',
  call: '11',
  fu: '12',
  crm: '13',
  cra: '14',
  cmp: '15',
  cmr: '16',
  tt: '17',
  ttc: '18',
  tte: '19',
  ntc: '1a',
  bc: '1b',
  mc: '1c',
  un: '1d',
} as const;
type TableKey = keyof typeof TABLE_CODE;
const idSeq: Partial<Record<TableKey, number>> = {};
function oid(table: TableKey) {
  const n = (idSeq[table] = (idSeq[table] ?? 0) + 1);
  return `${MORE_ID_PREFIX}-${TABLE_CODE[table]}00-8000-${n.toString(16).padStart(12, '0')}`;
}
const mark = (p: string, n: number) => `${MORE_MARK}${p}${String(n).padStart(5, '0')}`;

// ── 계절 — 이사 성수기(2~3월·8~9월), 2026년은 조금 늘어난다 ──
const MONTH_FACTOR = [0.78, 1.2, 1.42, 1.02, 0.95, 0.84, 0.88, 1.18, 1.38, 1.04, 0.9, 0.74];
function season(dn: number) {
  const { y, m, d } = ymOf(dn);
  const len = lastDayOfMonth(y, m);
  const pos = (d - 0.5) / len - 0.5;
  const other = (m + (pos < 0 ? 11 : 1)) % 12;
  const t = Math.abs(pos);
  return MONTH_FACTOR[m] * (1 - t) + MONTH_FACTOR[other] * t;
}
const growth = (dn: number) => 1 + 0.12 * ((dn - START) / Math.max(1, TODAY - START));

// ── 가상 이름 — 음절 목록(seed-demo-history.ts와 같은 표) ──
const FAMILY = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남'.split('');
const GIVEN = (
  '민준 서연 도윤 하은 지호 수아 예준 지유 시우 서윤 주원 하린 지훈 채원 건우 다은 우진 예린 현우 소율 ' +
  '태윤 유나 성민 가은 준혁 지민 승현 수빈 은우 나연 재원 서진 동현 하윤 민서 영호 미경 정훈 혜진 상철'
).split(' ');
const personName = () => `${one(FAMILY)}${one(GIVEN)}`;
/** 010-0098-xxxx(가운데가 0으로 시작 — 실제로 쓰이지 않는 번호대). 다른 시드(0090~0099번대)와 겹치지 않게 */
const fakePhone = (n: number) => `0100098${String(n % 10_000).padStart(4, '0')}`;
let phoneNo = 0;
const nextPhone = () => fakePhone(++phoneNo);
const PRE = (
  '한솔 가온 누리 다온 라온 미르 빛나 새벽 소담 아름 온결 이룸 지음 하람 해든 도담 마루 바름 별하 ' +
  '시온 여울 윤슬 초록 태솔 푸른 하늬 한별 혜윰 가람 나래 다솜 로아 보람 새온 아라 이든 진솔 차오'
).split(' ');
const REGIONS = [
  '서울 강남',
  '서울 마포',
  '서울 영등포',
  '서울 송파',
  '서울 성동',
  '서울 구로',
  '경기 성남',
  '경기 판교',
  '경기 수원',
  '경기 화성',
  '경기 김포',
  '인천 송도',
  '대전 유성',
  '부산 해운대',
  '대구 수성',
  '광주 서구',
  '충북 청주',
  '충남 천안',
  '경남 창원',
];

type Emp = {
  id: string;
  name: string;
  orgUnitId: string;
  orgType: string;
  orgName: string;
  orgCode: string;
  hire: string | null;
  empNo: string | null;
  positionId: string | null;
  rank: number;
  userId: string | null;
};

async function main() {
  const t0 = Date.now();
  if (TODAY <= START) throw new Error('오늘이 2025-01-01보다 앞 — 만들 기간이 없다');
  if (await hasDemoHistoryMore(prisma)) {
    console.log(
      '[demo-history-more] 이미 있다 — 건너뜀(다시 만들려면 먼저 demo:clear:history-more)',
    );
    return;
  }

  // ════════════════ 참조 ════════════════
  const orgs = await prisma.orgUnit.findMany({
    select: { id: true, parentId: true, type: true, name: true, code: true, isActive: true },
    orderBy: { code: 'asc' },
  });
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const parents = new Map(orgs.map((o) => [o.id, o.parentId]));
  const empRows = await prisma.employee.findMany({
    where: { isActive: true, orgUnit: { isActive: true } },
    select: {
      id: true,
      name: true,
      orgUnitId: true,
      hireDate: true,
      empNo: true,
      positionId: true,
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
      hire: e.hireDate ? e.hireDate.toISOString().slice(0, 10) : null,
      empNo: e.empNo,
      positionId: e.positionId,
      rank: e.position?.sortOrder ?? 9999,
      userId: e.appUsers[0]?.id ?? null,
    };
  });
  if (!emps.length) {
    console.error('직원이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed` 를 돌려야 한다');
    process.exit(1);
  }
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
  const mgmtEmps = deptEmps(/경영관리|본사/, ['DEPT-MGMT', 'HQ-OFFICE']);
  const b2bEmps = deptEmps(/기업영업/, ['DEPT-B2B']);
  const franEmps = deptEmps(/가맹/, ['DEPT-FRAN']);
  const mktEmps = deptEmps(/마케팅/, ['DEPT-MKT']);
  const branches = orgs
    .filter((o) => o.type === 'BRANCH' && o.isActive)
    .map((o) => ({
      id: o.id,
      name: o.name,
      w: 0.4 + 1.2 * hash01(o.id),
      emps: byOrg.get(o.id) ?? [],
    }));
  const branchPick = branches.map((b) => [b, b.w] as const);
  const groupOrg = orgs.find((o) => o.name === '통인그룹') ?? orgs.find((o) => o.type === 'GROUP');
  const mgmtOrg =
    orgs.find((o) => o.name === '경영관리') ?? orgs.find((o) => o.code === 'DEPT-MGMT');

  /** 결재 서비스 headOf와 같은 규칙 — 그 조직(없으면 상위)의 가장 높은 직책 재직자 */
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

  // 가상 고객·지난 접수(seed-demo-history.ts)
  const customers = await prisma.customer.findMany({
    where: { legacyNo: { startsWith: 'HS-' }, phonePrimary: { not: null } },
    select: { id: true, name: true, phonePrimary: true, ownerOrgId: true, createdAt: true },
    orderBy: { legacyNo: 'asc' },
  });
  const leads = await prisma.lead.findMany({
    where: { legacyNo: { startsWith: 'HS-' } },
    select: {
      id: true,
      status: true,
      moveDate: true,
      createdAt: true,
      customerId: true,
      orgUnitId: true,
      source: true,
      partnerId: true,
    },
    orderBy: { legacyNo: 'asc' },
  });
  const custById = new Map(customers.map((c) => [c.id, c]));

  // ── 화면 번호 — 앱과 같은 next_doc_no로, 날짜·시각 순서대로 ──
  async function assignNo<T>(
    rows: T[],
    prefix: string,
    at: (r: T) => Date,
    set: (r: T, no: string) => void,
  ) {
    const list = [...rows].sort((a, b) => +at(a) - +at(b));
    for (let i = 0; i < list.length; i += 5000) {
      const part = list.slice(i, i + 5000);
      const days = part.map((r) => ymd(dnOfDate(at(r))));
      const out = await prisma.$queryRawUnsafe<{ no: string }[]>(
        `SELECT next_doc_no($1, u.d::date) AS no FROM unnest($2::text[]) WITH ORDINALITY AS u(d, i) ORDER BY u.i`,
        prefix,
        days,
      );
      part.forEach((r, k) => set(r, out[k].no));
    }
  }

  const notifications: Prisma.UserNotificationCreateManyInput[] = [];
  const notify = (
    emp: Emp | null | undefined,
    n: Omit<Prisma.UserNotificationCreateManyInput, 'id' | 'userId'> & { createdAt: Date },
  ) => {
    if (!emp?.userId || +n.createdAt < NOW - 21 * DAY || +n.createdAt > NOW) return;
    const readAt =
      n.kind !== 'APPROVAL_REQUEST' && (+n.createdAt < NOW - 2 * DAY || chance(0.4))
        ? new Date(Math.min(NOW, +n.createdAt + int(5, 600) * 60_000))
        : null;
    notifications.push({ id: oid('un'), userId: emp.userId, readAt, ...n });
  };

  // ════════════════ 1. 거래처 ════════════════
  const existingCodes = await prisma.partner.findMany({
    where: { code: { startsWith: 'PTN-' } },
    select: { code: true },
  });
  let ptnNo = existingCodes.reduce((mx, p) => Math.max(mx, Number(p.code.slice(4)) || 0), 0);
  type Ptn = Prisma.PartnerCreateManyInput & { id: string; name: string; type: string };
  const partners: Ptn[] = [];
  const addPartner = (
    type: string,
    name: string,
    extra: Partial<Prisma.PartnerCreateManyInput> = {},
  ) => {
    const p: Ptn = {
      id: oid('ptn'),
      type,
      code: `PTN-${String(++ptnNo).padStart(4, '0')}`,
      name,
      phone: nextPhone(),
      isActive: true,
      createdAt: ts(START - int(20, 700), int(9, 18), int(0, 59)),
      ...extra,
    };
    partners.push(p);
    return p;
  };
  // 전속 계약사(임직원 이사) — 월별로 모아 청구한다
  for (const n of [
    '한결테크',
    '대양모빌리티',
    '누리생명',
    '세진E&C',
    '푸름바이오',
    '하늬항공서비스',
    '동솔물산',
    '새봄리테일',
    '온새미텔레콤',
    '라온케미칼',
    '은빛모터스',
    '정담푸드',
    '한울금융',
    '가람에너지공사',
  ])
    addPartner('EXCLUSIVE', n, {
      contractStatus: pick([
        ['ACTIVE', 6],
        ['AUTO_RENEW', 3],
        ['NEW', 1],
      ] as const),
      benefit: one([
        '임직원 이사비 15% 할인, 포장 박스 20개 무상',
        '임직원 이사비 10% 할인, 입주청소 5만 원 할인',
        '지방 발령 이사 거리 할증 면제',
        '임직원 이사 월말 일괄 청구(회사 부담 70%)',
      ]),
      intake: one(['인사팀 공문 접수', '전용 접수 페이지', '본사 전담 상담']),
    });
  // 기업이전 거래처 — 사무실·연구소 이전을 건별로 청구
  for (const n of [
    '아라소프트',
    '비전랩스',
    '코어파이낸스',
    '다온엔지니어링',
    '스카이로직스',
    '해솔메디칼',
    '마루디자인',
    '그린웨이브',
    '이음컨설팅',
    '시그마정밀',
    '나래물류',
    '휴먼링크',
    '라임게임즈',
    '블루오션해운',
    '청솔법무법인',
    '도담회계법인',
  ])
    addPartner('B2B_CLIENT', n, {
      memo: one([null, '연 1~2회 층간 이동', '지사 확장 중', '전산실 이전은 야간 작업']),
    });
  // 제휴사 — 회원 이사(접수 경로 '제휴')
  for (const [n, benefit] of [
    ['모아카드 멤버십', '[제휴]혜택 : 이사비 10% 할인(카드 결제 시)'],
    ['행복포인트몰', '[제휴]혜택 : 이사비 5% 할인 + 포인트 2만 점'],
    ['안심부동산 플랫폼', '[제휴]혜택 : 계약 고객 이사비 7% 할인'],
    ['집꾸미기 인테리어', '[제휴]혜택 : 인테리어 고객 보관이사 보관료 1개월 무료'],
    ['우리동네 맘카페', '[제휴]혜택 : 회원 이사비 5% 할인, 입주청소 연계 할인'],
    ['새집 분양 커뮤니티', '[제휴]혜택 : 입주 단지 단체 이사 특가'],
    ['든든공제회', '[제휴]혜택 : 회원 이사비 10% 할인(가격표 없음)'],
    ['바른복지몰', '[제휴]혜택 : 복지몰 결제 시 이사비 8% 할인'],
    ['이사모아 앱', '[제휴]혜택 : 앱 예약 고객 사은품(정리함 세트)'],
    ['해피웨딩 플래너', '[제휴]혜택 : 신혼 이사 10% 할인 + 에어컨 세척 할인'],
    ['포근 아파트 관리단', '[제휴]혜택 : 단지 주민 엘리베이터 사용료 지원'],
    ['쉼표 리조트 회원', '[제휴]혜택 : 회원 이사비 5% 할인'],
  ] as const)
    addPartner('AFFILIATE', n, {
      contractStatus: pick([
        ['ACTIVE', 7],
        ['AUTO_RENEW', 2],
        ['NEW', 1],
        ['ENDED', 1],
      ] as const),
      benefit,
      intake: one(['어플(CS 연동)/본사접수', '온라인/전화접수', '본사접수', '전용 링크 접수']),
    });
  // 외주 용역 — 작업을 맡기는 전속 용역업체(청구 대상 아님)
  for (const n of [
    '바른손 사다리',
    '우리 에어컨 설비',
    '정리왕 수납',
    '깨끗한 입주청소',
    '튼튼 피아노 운송',
    '안전 폐기물 수거',
  ])
    addPartner('OUTSOURCE', n);
  for (const p of partners.slice(-8)) if (chance(0.5)) p.createdAt = ts(int(START, TODAY - 30), 10);
  const ptnOf = (type: string) => partners.filter((p) => p.type === type);

  // 제휴 접수(경로 PARTNER)에 제휴사·전속 계약사를 잇는다 — 비어 있는 것만
  const leadPartner: { id: string; partnerId: string }[] = [];
  const affPick = [
    ...ptnOf('AFFILIATE').map((p) => [p, 0.5 + hash01(p.id)] as const),
    ...ptnOf('EXCLUSIVE').map((p) => [p, 0.4 * (0.5 + hash01(p.id))] as const),
  ];
  for (const l of leads)
    if (l.source === 'PARTNER' && !l.partnerId)
      leadPartner.push({ id: l.id, partnerId: pick(affPick).id });

  // 가격 조건 — 제휴사 할인
  const priceConds: Prisma.PriceConditionCreateManyInput[] = [];
  for (const p of ptnOf('AFFILIATE')) {
    const rate = one([5, 7, 10, 10, 15]);
    priceConds.push({
      id: oid('pc'),
      partnerId: p.id,
      name: `${p.name} 회원 ${rate}% 할인`,
      discountType: 'RATE',
      discountValue: rate,
      validFrom: dateOf(START),
      validTo: p.contractStatus === 'ENDED' ? dateOf(TODAY - int(10, 120)) : null,
      isActive: p.contractStatus !== 'ENDED',
    });
  }
  for (const p of ptnOf('EXCLUSIVE').slice(0, 5))
    priceConds.push({
      id: oid('pc'),
      partnerId: p.id,
      name: `${p.name} 임직원 이사 정액 할인`,
      discountType: 'AMOUNT',
      discountValue: one([50_000, 100_000, 150_000]),
      validFrom: dateOf(START),
    });

  // ════════════════ 2. 청구(거래처) ════════════════
  type Inv = Prisma.InvoiceCreateManyInput & { createdAt: Date };
  const invoices: Inv[] = [];
  const receipts: Prisma.InvoiceReceiptCreateManyInput[] = [];
  const opsInvoices = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM invoice WHERE id BETWEEN $1::uuid AND $2::uuid`,
    `${OPS_ID_PREFIX}-0000-0000-000000000000`,
    `${OPS_ID_PREFIX}-ffff-ffff-ffffffffffff`,
  );
  const skipInvoices = opsInvoices[0].n > 0;
  if (!skipInvoices && branches.length) {
    const billable = [...ptnOf('EXCLUSIVE'), ...ptnOf('B2B_CLIENT')].map((p) => ({
      ...p,
      org: branches[Math.floor(hash01(p.id + 'org') * branches.length)].id,
      moves: p.type === 'EXCLUSIVE' ? 1 + 6 * hash01(p.id + 'vol') : 0,
    }));
    let invNo = 0;
    const addInvoice = (
      p: (typeof billable)[number],
      issueDn: number,
      title: string,
      amount: number,
    ) => {
      const due = issueDn + 30;
      const created = issueDn - int(0, 3);
      const fresh = issueDn > TODAY - 3;
      let status: string;
      if (issueDn > TODAY) status = 'DRAFT';
      else if (chance(0.025)) status = 'CANCELED';
      else if (fresh && chance(0.4)) status = 'DRAFT';
      else if (due < TODAY - 20) status = chance(0.95) ? 'COLLECTED' : 'ISSUED';
      else if (due < TODAY) status = chance(0.7) ? 'COLLECTED' : 'ISSUED';
      else status = chance(0.25) ? 'COLLECTED' : 'ISSUED';
      const id = oid('inv');
      const issuedAt = status === 'DRAFT' ? null : minTs(ts(issueDn, int(9, 17), int(0, 59)));
      invoices.push({
        id,
        invoiceNo: '',
        legacyNo: mark('IV', ++invNo),
        partnerId: p.id,
        orgUnitId: p.org,
        title,
        amount,
        status,
        issuedAt,
        dueDate: dateOf(due),
        memo: status === 'CANCELED' ? '금액 정정으로 재발행' : null,
        createdAt: minTs(ts(Math.min(created, TODAY), int(9, 17), int(0, 59))),
      });
      if (!issuedAt) return;
      const lastDay = Math.min(TODAY, due + 25);
      if (status === 'COLLECTED') {
        const split = chance(0.2);
        const first = split ? round(amount * (0.3 + 0.4 * rnd()), 10_000) : amount;
        const d1 = Math.min(lastDay, issueDn + int(7, 35));
        receipts.push({
          id: oid('rcp'),
          invoiceId: id,
          amount: first,
          method: pick([
            ['TRANSFER', 92],
            ['CARD', 6],
            ['CASH', 2],
          ]),
          receivedAt: minTs(ts(Math.max(issueDn, d1), int(10, 16), int(0, 59))),
          memo: split ? '1차 입금' : null,
        });
        if (split)
          receipts.push({
            id: oid('rcp'),
            invoiceId: id,
            amount: amount - first,
            method: 'TRANSFER',
            receivedAt: minTs(
              ts(Math.min(lastDay, Math.max(d1, issueDn) + int(5, 20)), int(10, 16)),
            ),
            memo: '잔액 입금',
          });
      } else if (status === 'ISSUED' && issueDn < TODAY - 10 && chance(0.3)) {
        receipts.push({
          id: oid('rcp'),
          invoiceId: id,
          amount: round(amount * (0.2 + 0.4 * rnd()), 10_000),
          method: 'TRANSFER',
          receivedAt: minTs(ts(Math.min(TODAY, issueDn + int(5, 30)), int(10, 16))),
          memo: '부분 입금',
        });
      }
    };
    const exclusive = billable.filter((p) => p.type === 'EXCLUSIVE');
    const b2b = billable.filter((p) => p.type === 'B2B_CLIENT');
    for (let y = 2025; y <= ymOf(TODAY).y; y++)
      for (let m = 0; m < 12; m++) {
        const first = dnOf(y, m, 1);
        if (first > TODAY) break;
        const issueDn = weekdayOnOrAfter(first + int(1, 6));
        const prevSeason = season(first - 10);
        for (const p of exclusive) {
          // 지난달 임직원 이사 건수 → 월별 청구
          const moves = poisson(p.moves * prevSeason * growth(first));
          if (!moves) continue;
          const amount = round(moves * (1_600_000 + 1_400_000 * rnd()), 10_000);
          const pm = m === 0 ? 12 : m;
          addInvoice(p, issueDn, `${p.name} ${pm}월 임직원 이사(${moves}건)`, amount);
        }
        // 기업이전(사무실 이사) 건별 청구 — 달에 몇 건
        for (let k = poisson(5 * season(first)); k > 0; k--) {
          const p = one(b2b.length ? b2b : exclusive);
          const dn = weekdayOnOrAfter(first + int(0, lastDayOfMonth(y, m) - 1));
          if (dn > TODAY) continue;
          addInvoice(
            p,
            dn,
            `${p.name} ${one(['본사', '지사', '연구소', '물류센터', '영업소'])} 사무실 이전`,
            round(4_000_000 + 26_000_000 * rnd() ** 2, 100_000),
          );
        }
      }
    await assignNo(
      invoices,
      'IV',
      (r) => r.createdAt,
      (r, no) => (r.invoiceNo = no),
    );
  }

  // ════════════════ 3. 인사 기준정보(없을 때만) ════════════════
  const leaveTypesNew: Prisma.LeaveTypeCreateManyInput[] = [];
  const LEAVE_TYPES = [
    { code: 'ANNUAL', name: '연차', unitDays: 1, deducts: true, paid: true, sortOrder: 10 },
    { code: 'HALF_AM', name: '오전 반차', unitDays: 0.5, deducts: true, paid: true, sortOrder: 20 },
    { code: 'HALF_PM', name: '오후 반차', unitDays: 0.5, deducts: true, paid: true, sortOrder: 30 },
    { code: 'QUARTER', name: '반반차', unitDays: 0.25, deducts: true, paid: true, sortOrder: 35 },
    { code: 'SICK', name: '병가', unitDays: 1, deducts: false, paid: false, sortOrder: 40 },
    { code: 'FAMILY', name: '경조 휴가', unitDays: 1, deducts: false, paid: true, sortOrder: 50 },
    { code: 'OFFICIAL', name: '공가', unitDays: 1, deducts: false, paid: true, sortOrder: 60 },
  ];
  const curTypes = await prisma.leaveType.findMany({
    select: { id: true, code: true, name: true, unitDays: true, deducts: true },
  });
  const leaveType = new Map(
    curTypes.map((t) => [
      t.code,
      { id: t.id, name: t.name, unitDays: Number(t.unitDays), deducts: t.deducts },
    ]),
  );
  for (const t of LEAVE_TYPES)
    if (!leaveType.has(t.code)) {
      const id = oid('lt');
      leaveTypesNew.push({ id, ...t });
      leaveType.set(t.code, { id, name: t.name, unitDays: t.unitDays, deducts: t.deducts });
    }

  const lineTemplates: Prisma.ApprovalLineTemplateCreateManyInput[] = [];
  if (groupOrg && mgmtOrg) {
    const steps = [
      { kind: 'APPROVER', resolver: 'DEPT_HEAD', orgUnitId: null, employeeId: null },
      { kind: 'APPROVER', resolver: 'ORG_HEAD', orgUnitId: groupOrg.id, employeeId: null },
      { kind: 'CC', resolver: 'ORG_HEAD', orgUnitId: mgmtOrg.id, employeeId: null },
    ];
    const have = await prisma.approvalLineTemplate.findMany({
      where: { orgUnitId: null },
      select: { docType: true },
    });
    for (const docType of ['LEAVE', 'ATTENDANCE_FIX', 'GENERAL'])
      if (!have.some((h) => h.docType === docType))
        lineTemplates.push({
          id: oid('alt'),
          docType,
          orgUnitId: null,
          name: '전사 기본',
          steps: steps as Prisma.InputJsonValue,
        });
  }

  const checklistTpl: Prisma.HrChecklistTemplateCreateManyInput[] = [];
  const CHECKLIST: Record<'ONBOARD' | 'OFFBOARD', string[]> = {
    ONBOARD: [
      '근로계약서 작성·보관',
      '4대보험 취득 신고',
      'ERP 계정 발급·권한 그룹 지정',
      '비품 지급(PC·명함·출입카드)',
      '보안서약서·개인정보 동의서',
    ],
    OFFBOARD: [
      '사직서 수령',
      '4대보험 상실 신고',
      'ERP 계정 비활성 확인',
      '비품 회수(PC·출입카드)',
      '퇴직금·연차수당 정산',
    ],
  };
  let onboardTitles = (
    await prisma.hrChecklistTemplate.findMany({
      where: { kind: 'ONBOARD', isActive: true },
      select: { title: true },
      orderBy: { sortOrder: 'asc' },
    })
  ).map((x) => x.title);
  for (const kind of ['ONBOARD', 'OFFBOARD'] as const)
    if (!(await prisma.hrChecklistTemplate.count({ where: { kind } })))
      CHECKLIST[kind].forEach((title, i) =>
        checklistTpl.push({ id: oid('hct'), kind, title, sortOrder: (i + 1) * 10 }),
      );
  if (!onboardTitles.length) onboardTitles = CHECKLIST.ONBOARD;

  const hrPolicies: Prisma.HrPolicyCreateManyInput[] = [];
  if (!(await prisma.hrPolicy.count()))
    for (const p of [
      ['계약 매출 인센티브(직원)', 'INCENTIVE', 'EMPLOYEE', 'CONTRACT_REVENUE', 'RATE', 0.015, 10],
      [
        '계약 건당 수당(직원)',
        'INCENTIVE',
        'EMPLOYEE',
        'CONTRACT_COUNT',
        'FIXED_PER_UNIT',
        30_000,
        20,
      ],
      ['입금 매출 장려금(지점)', 'INCENTIVE', 'BRANCH', 'PAID_REVENUE', 'RATE', 0.005, 30],
      [
        '작업 완료 건당 수당(지점)',
        'INCENTIVE',
        'BRANCH',
        'DONE_COUNT',
        'FIXED_PER_UNIT',
        10_000,
        40,
      ],
      ['A/S 발생 패널티(지점)', 'PENALTY', 'BRANCH', 'AS_COUNT', 'FIXED_PER_UNIT', 50_000, 50],
    ] as const)
      hrPolicies.push({
        id: oid('hrp'),
        name: p[0],
        kind: p[1],
        targetType: p[2],
        metric: p[3],
        calcType: p[4],
        value: p[5],
        priority: p[6],
        createdAt: ts(START - 10, 10),
      });

  const commissionRules: Prisma.CommissionRuleCreateManyInput[] = [];
  if (!(await prisma.commissionRule.count())) {
    const rules: [string, string | null, string | null, string, number, number][] = [
      ['기본 가맹 수수료(전체)', null, null, 'RATE', 0.08, 0],
      ['기업이전 수수료', 'B2B_MOVING', null, 'RATE', 0.06, 10],
      ['리빙케어 수수료', 'LIVING', null, 'RATE', 0.12, 10],
      ['케어 서비스 수수료', 'CARE', null, 'RATE', 0.12, 10],
      ['제휴 접수 수수료', null, 'PARTNER', 'RATE', 0.1, 20],
      ['본사 배정(전화) 건당', null, 'PHONE', 'FIXED', 30_000, 15],
    ];
    for (const [name, serviceLine, source, calcType, v, priority] of rules)
      commissionRules.push({
        id: oid('cr'),
        name,
        serviceLine,
        source,
        calcType,
        rate: calcType === 'RATE' ? v : null,
        fixedAmount: calcType === 'FIXED' ? v : null,
        priority,
        createdAt: ts(START - 5, 11),
      });
  }

  // ════════════════ 4. 인사 이력·입사 체크리스트 ════════════════
  const histories: Prisma.EmployeeHistoryCreateManyInput[] = [];
  const checklistItems: Prisma.EmployeeChecklistItemCreateManyInput[] = [];
  const positions = await prisma.position.findMany({
    where: { isActive: true },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  });
  const hqDepts = [...new Set(hqEmps.map((e) => e.orgUnitId))].filter(
    (id) => orgById.get(id)?.type === 'DEPT',
  );
  const adminUser = mgmtEmps.find((e) => e.userId)?.userId ?? null;
  const hireOf = (e: Emp) => {
    if (e.hire) return e.hire;
    const y = Number(e.empNo?.slice(0, 4));
    return y >= 1980 && y <= 2100 ? `${y}-03-02` : null;
  };
  for (const e of emps) {
    const hire = hireOf(e);
    if (!hire) continue;
    histories.push({
      id: oid('eh'),
      employeeId: e.id,
      kind: 'JOIN',
      toOrgId: e.orgUnitId,
      toPositionId: e.positionId,
      effectiveDate: dateOf(dnOfYmd(hire)),
      note: e.orgType === 'BRANCH' ? '가맹점 개설' : '신규 입사',
      createdByUserId: adminUser,
      createdAt: minTs(ts(Math.max(dnOfYmd(hire), START - 30), 10)),
    });
    const hireDn = dnOfYmd(hire);
    if (e.orgType === 'BRANCH') continue;
    // 정기 인사(1월 2일) — 승진·전보
    for (const y of [2025, 2026]) {
      const eff = weekdayOnOrAfter(dnOf(y, 0, 2));
      if (eff > TODAY || eff < hireDn + 365) continue;
      if (chance(0.12) && e.positionId) {
        const idx = positions.findIndex((p) => p.id === e.positionId);
        const lower = positions[idx + 1];
        if (idx >= 0 && lower && lower.sortOrder < 90)
          histories.push({
            id: oid('eh'),
            employeeId: e.id,
            kind: 'POSITION',
            fromPositionId: lower.id,
            toPositionId: e.positionId,
            effectiveDate: dateOf(eff),
            note: `${y}년 정기 승진`,
            createdByUserId: adminUser,
            createdAt: ts(eff - 3, 15),
          });
      } else if (chance(0.08) && hqDepts.length > 1) {
        const from = one(hqDepts.filter((d) => d !== e.orgUnitId));
        if (from)
          histories.push({
            id: oid('eh'),
            employeeId: e.id,
            kind: 'TRANSFER',
            fromOrgId: from,
            toOrgId: e.orgUnitId,
            effectiveDate: dateOf(eff),
            note: `${y}년 정기 인사 — 부서 이동`,
            createdByUserId: adminUser,
            createdAt: ts(eff - 3, 15),
          });
      }
    }
    // 2025년 뒤 입사자 — 입사 체크리스트
    if (hireDn >= START && hireDn <= TODAY)
      onboardTitles.forEach((title, i) => {
        const done = hireDn + int(0, 10);
        checklistItems.push({
          id: oid('eci'),
          employeeId: e.id,
          kind: 'ONBOARD',
          title,
          sortOrder: (i + 1) * 10,
          doneAt: done < TODAY - 1 || chance(0.5) ? minTs(ts(done, int(10, 17))) : null,
          doneByUserId: adminUser,
          createdAt: ts(hireDn, 9, 30),
        });
      });
  }

  // ════════════════ 5. 결재·휴가·근태 ════════════════
  type Doc = Prisma.ApprovalDocCreateManyInput & { id: string; submittedAt: Date };
  const docs: Doc[] = [];
  const steps: Prisma.ApprovalStepCreateManyInput[] = [];
  const leaveReqs: Prisma.LeaveRequestCreateManyInput[] = [];
  const lineOf = new Map<string, { approvers: Emp[]; cc: Emp | null }>();
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
  const DOC_KIND: Record<string, string> = {
    LEAVE: '휴가 신청',
    ATTENDANCE_FIX: '근태 정정',
    GENERAL: '일반 품의',
  };
  let apNo = 0;
  /**
   * 결재 문서 + 단계. outcome은 바라는 결과 — 결재 시각이 지금을 넘으면 그 단계에서 결재 중(PENDING)으로 멈춘다.
   * 돌려주는 값은 실제 상태.
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
    id?: string;
    /** 휴가 시작일(며칠째) — 아직 오지 않은 휴가는 결재 중인 것이 많다 */
    startsAt?: number;
  }) => {
    const { approvers, cc } = approvalLine(o.requester);
    const id = o.id ?? oid('ad');
    const sub = +o.submittedAt;
    const stepRows: Prisma.ApprovalStepCreateManyInput[] = [];
    let status: string = o.outcome;
    let currentSeq: number | null = null;
    let completedAt: Date | null = null;
    let t = sub;
    const rejectAt = o.outcome === 'REJECTED' ? (approvers.length > 1 && chance(0.3) ? 1 : 0) : -1;
    const cancelAt = o.outcome === 'CANCELED' ? 0 : -1;
    let stopped = false;
    // 최근 며칠 안에 올린 문서는 일부가 아직 결재 중(결재함에 할 일이 보이게)
    const fresh = NOW - sub < 7 * DAY || (o.startsAt !== undefined && o.startsAt > TODAY);
    const holdAt = fresh && chance(0.6) ? int(0, approvers.length - 1) : -1;
    approvers.forEach((a, k) => {
      const base = { id: oid('as'), docId: id, seq: k + 1, kind: 'APPROVER', approverEmpId: a.id };
      if (stopped) {
        stepRows.push({ ...base, status: 'WAITING' });
        return;
      }
      const turnAt = t; // 이 단계가 결재 차례가 된 시각
      t += int(20, 60 * 26) * 60_000;
      if (t > NOW || k === holdAt) {
        // 아직 결재 차례
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
        // 결재 전에 올린 사람이 회수
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
      // 결재할 사람이 없으면 바로 승인(앱과 같다)
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
      legacyNo: mark('AP', ++apNo),
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
    return status;
  };

  // ── 5-1. 휴가 — 본사 직원. 입사일 기준 연차를 넘지 않게, 여름·연말에 많이 ──
  const LEAVE_SEASON = [0.9, 0.9, 0.7, 0.8, 1.2, 1.0, 1.6, 1.9, 0.8, 1.2, 0.9, 1.5];
  const REASONS: Record<string, string[]> = {
    ANNUAL: [
      '개인 사유',
      '가족 여행',
      '이사',
      '자녀 학교 행사',
      '병원 진료',
      '휴식',
      '가족 행사',
      '여름 휴가',
    ],
    HALF: ['병원 진료', '은행 업무', '관공서 방문', '자녀 등원', '개인 사유', '차량 정비'],
    SICK: ['감기 몸살', '장염', '허리 통증 치료', '수술 후 회복'],
    FAMILY: ['본인 결혼', '조부모 상', '부모 회갑', '자녀 출생'],
    OFFICIAL: ['예비군 훈련', '민방위 교육', '법원 출석', '건강검진'],
  };
  /** 직원별 승인 휴가 날짜 — 근태에서 그날을 비우거나 반나절만 */
  const leaveDay = new Map<string, 'FULL' | 'AM' | 'PM' | 'Q'>();
  const usedBy = new Map<string, number>(); // `${empId}|${기간 시작}` → 쓴 연차
  for (const e of hqEmps) {
    const hire = hireOf(e);
    const hireDn = hire ? dnOfYmd(hire) : START;
    const taken = new Set<number>();
    for (let dn = Math.max(START, hireDn + 20); dn <= TODAY + 30; dn++) {
      if (!isWorkday(dn) || taken.has(dn)) continue;
      let p = 0.034 * LEAVE_SEASON[ymOf(dn).m] * (0.7 + 0.6 * hash01(e.id));
      if (dn > TODAY) p *= Math.max(0.15, 1 - (dn - TODAY) / 30);
      if (!chance(p)) continue;
      const code = pick([
        ['ANNUAL', 55],
        ['HALF_AM', 14],
        ['HALF_PM', 14],
        ['QUARTER', 4],
        ['SICK', 6],
        ['FAMILY', 3],
        ['OFFICIAL', 4],
      ] as const);
      const type = leaveType.get(code);
      if (!type) continue;
      const half = type.unitDays < 1;
      let len = 1;
      if (code === 'ANNUAL')
        len = pick([
          [1, 60],
          [2, 20],
          [3, 12],
          [5, 8],
        ] as const);
      else if (code === 'FAMILY') len = int(1, 5);
      else if (code === 'SICK') len = int(1, 3);
      const days: number[] = [];
      for (let d = dn; days.length < len && d < dn + len + 6; d++)
        if (isWorkday(d)) {
          if (taken.has(d)) break;
          days.push(d);
        }
      const total = half ? type.unitDays : days.length;
      // 연차 한도 — 입사일 기준 기간(입사일이 없으면 그해)에 생긴 연차의 90%까지만
      const ent = e.hire
        ? leaveEntitlement(e.hire, ymd(dn))
        : { periodStart: `${ymOf(dn).y}-01-01`, days: 15 };
      const key = `${e.id}|${ent.periodStart}`;
      if (type.deducts && (usedBy.get(key) ?? 0) + total > ent.days * 0.9) continue;
      // 신청일 — 병가는 그날·다음 날, 나머지는 며칠 전
      const subDn = Math.max(START, code === 'SICK' ? dn + int(0, 1) : dn - int(1, 20));
      const submittedAt = ts(subDn, int(8, 18), int(0, 59));
      if (+submittedAt > NOW) continue;
      const past = dn < TODAY;
      const outcome = pick([
        ['APPROVED', past ? 92 : 85],
        ['REJECTED', 3],
        ['CANCELED', past ? 5 : 6],
      ] as const);
      const start = ymd(days[0]);
      const end = ymd(days[days.length - 1]);
      const period = start === end ? start : `${start} ~ ${end}`;
      const reason = one(
        REASONS[code === 'ANNUAL' ? 'ANNUAL' : half ? 'HALF' : code] ?? REASONS.ANNUAL,
      );
      const reqId = oid('lr');
      const docId = oid('ad');
      const status = addDoc({
        id: docId,
        requester: e,
        docType: 'LEAVE',
        title: `${e.name} ${type.name} (${period}, ${total}일)`,
        content: reason,
        payload: {
          leaveRequestId: reqId,
          leaveType: type.name,
          startDate: start,
          endDate: end,
          days: total,
          deducts: type.deducts,
        },
        submittedAt,
        outcome,
        startsAt: days[0],
        rejectComment: one([
          '월말 마감 날이라 다음 주로 조정 부탁드립니다.',
          '같은 날 팀 휴가자가 많아 조정 부탁드립니다.',
          '성수기라 일정 조정 바랍니다.',
        ]),
      });
      const slot =
        code === 'HALF_AM'
          ? 'AM'
          : code === 'HALF_PM'
            ? 'PM'
            : code === 'QUARTER'
              ? one(['Q1', 'Q4'])
              : null;
      leaveReqs.push({
        id: reqId,
        employeeId: e.id,
        leaveTypeId: type.id,
        startDate: dateOf(days[0]),
        endDate: dateOf(days[days.length - 1]),
        days: total,
        slot,
        reason,
        status,
        approvalDocId: docId,
        createdAt: submittedAt,
      });
      if (status === 'APPROVED' || status === 'PENDING') {
        if (type.deducts) usedBy.set(key, (usedBy.get(key) ?? 0) + total);
        for (const d of days) taken.add(d);
      }
      if (status === 'APPROVED')
        for (const d of days)
          leaveDay.set(
            `${e.id}|${d}`,
            slot === 'AM' ? 'AM' : slot === 'PM' ? 'PM' : slot ? 'Q' : 'FULL',
          );
    }
  }

  // ── 5-2. 연차 조정 — 입사일이 없는 직원은 해마다 15일 부여(잔여가 음수로 보이지 않게), 포상·정정 몇 건 ──
  const adjustments: Prisma.LeaveAdjustmentCreateManyInput[] = [];
  for (const e of hqEmps) {
    if (!e.hire)
      for (let y = 2025; y <= ymOf(TODAY).y; y++)
        adjustments.push({
          id: oid('la'),
          employeeId: e.id,
          days: 15,
          reason: `${y}년 연차 부여(입사일 미등록 — 연 15일)`,
          effectiveDate: dateOf(dnOf(y, 0, 1)),
          createdByUserId: adminUser,
          createdAt: ts(weekdayOnOrAfter(dnOf(y, 0, 2)), 10),
        });
    if (chance(0.25)) {
      const dn = weekdayOnOrAfter(int(START + 30, TODAY - 5));
      const [days, reason] = one([
        [1, '우수 사원 포상 휴가'],
        [2, '성수기 주말 근무 보상 휴가'],
        [1, '장기근속 포상'],
        [-0.5, '반차 중복 신청 정정'],
        [-1, '무단 결근 연차 차감'],
      ] as const);
      adjustments.push({
        id: oid('la'),
        employeeId: e.id,
        days,
        reason,
        effectiveDate: dateOf(dn),
        createdByUserId: adminUser,
        createdAt: ts(dn, int(10, 17)),
      });
    }
  }

  // ── 5-3. 근태 — 본사 직원 근무일마다. 대부분 정시, 가끔 지각·조퇴·퇴근 누락(→ 근태 정정 결재) ──
  const attendance: Prisma.AttendanceRecordCreateManyInput[] = [];
  const nowMin = Math.floor(((NOW + 9 * 3600_000) % DAY) / 60_000);
  for (const e of hqEmps) {
    const hire = hireOf(e);
    const hireDn = hire ? dnOfYmd(hire) : START;
    const punctual = hash01(e.id + 'late');
    for (let dn = Math.max(START, hireDn); dn <= TODAY; dn++) {
      if (!isWorkday(dn)) continue;
      const leave = leaveDay.get(`${e.id}|${dn}`);
      if (leave === 'FULL') continue;
      const jitter = int(0, 19);
      let inMin = 8 * 60 + 30 + jitter + Math.round(punctual * 8);
      let outMin = 18 * 60 + 2 + int(0, 40) + (season(dn) > 1.2 && chance(0.3) ? int(30, 150) : 0);
      let noOut = false;
      const r = rnd();
      if (leave === 'AM') inMin = 13 * 60 + 40 + jitter;
      else if (leave === 'PM') outMin = 14 * 60 + jitter;
      else if (r < 0.006)
        continue; // 결근(드물게)
      else if (r < 0.006 + 0.03 + 0.06 * punctual) inMin = 9 * 60 + 2 + int(0, 40);
      else if (r < 0.12) outMin = 16 * 60 + 30 + int(0, 60);
      else if (r < 0.135) noOut = true;
      if (dn === TODAY && inMin > nowMin) continue;
      const rec: Prisma.AttendanceRecordCreateManyInput = {
        id: oid('att'),
        employeeId: e.id,
        workDate: dateOf(dn),
        clockIn: ts(dn, 0, inMin),
        clockOut: noOut || (dn === TODAY && outMin > nowMin) ? null : ts(dn, 0, outMin),
        source: 'WEB',
        createdAt: ts(dn, 0, inMin),
      };
      attendance.push(rec);
      // 퇴근 누락 → 다음 근무일에 근태 정정 결재. 승인되면 기록을 고친다
      const fixDn = weekdayOnOrAfter(dn + 1);
      if (noOut && fixDn < TODAY && chance(0.8)) {
        const subDn = fixDn;
        const fixOut = `${String(Math.floor(outMin / 60)).padStart(2, '0')}:${String(outMin % 60).padStart(2, '0')}`;
        const inHHMM = `${String(Math.floor(inMin / 60)).padStart(2, '0')}:${String(inMin % 60).padStart(2, '0')}`;
        const reason = one([
          '퇴근 버튼 누락',
          '외근 후 바로 퇴근',
          '현장 지원 후 직퇴',
          'PC 종료 후 퇴근 미기록',
        ]);
        const status = addDoc({
          requester: e,
          docType: 'ATTENDANCE_FIX',
          title: `${e.name} 근태 정정 (${ymd(dn)} 출근 ${inHHMM} / 퇴근 ${fixOut})`,
          content: reason,
          payload: {
            workDate: ymd(dn),
            clockIn: inHHMM,
            clockOut: fixOut,
            reason,
            before: { clockIn: inHHMM, clockOut: null },
          },
          submittedAt: ts(subDn, int(9, 11), int(0, 59)),
          outcome: chance(0.96) ? 'APPROVED' : 'REJECTED',
          rejectComment: '시각 확인이 어렵습니다. 증빙과 함께 다시 올려 주세요.',
        });
        if (status === 'APPROVED') {
          rec.clockOut = ts(dn, 0, outMin);
          rec.source = 'FIX';
          rec.note = '퇴근 누락 정정(결재 승인)';
        }
      }
    }
  }

  // ── 5-4. 결재 양식(지출·구매·출장·재택) · 일반 품의 ──
  const forms = await prisma.approvalForm.findMany({
    where: { kind: 'CUSTOM', isActive: true },
    select: { id: true, name: true, fields: true },
    orderBy: { sortOrder: 'asc' },
  });
  type Field = { id: string; type: string; label: string; options?: string[] };
  const formWeight = (name: string) =>
    /지출/.test(name)
      ? 8
      : /구매/.test(name)
        ? 4
        : /출장/.test(name)
          ? 3
          : /재택|외근/.test(name)
            ? 3
            : 1;
  // 이름이 같은 양식(예: 시험용 사본)은 처음 것만
  const formPick = forms
    .filter((f, i) => forms.findIndex((g) => g.name === f.name) === i)
    .map((f) => [f, formWeight(f.name)] as const);
  const PAYEES = [
    '카카오T',
    '주유소',
    '편의점',
    '한식당',
    '문구점',
    '쿠팡',
    '다이소',
    '철물점',
    '고속도로 통행료',
    '주차장',
  ];
  const ITEMS = [
    '포장 박스(대) 300개',
    '테이프 디스펜서 10개',
    '업무용 노트북 1대',
    '모니터 2대',
    '사무용 의자 3개',
    '레이저 프린터 토너',
    '안전화 10켤레',
    '작업용 장갑 50켤레',
    '명함 인쇄 5통',
    '이사 차량 블랙박스',
    '보양재(엘리베이터용) 20장',
  ];
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
          return one(['쿠팡 비즈', '오피스디포', '지역 철물점', '포장재 공급사', '전자랜드']);
        if (/why|사유/i.test(key))
          return one(['기존 물품 노후', '성수기 대비 재고 확보', '신규 입사자 지급', '파손 교체']);
        if (/place|출장지/i.test(key))
          return one([
            '부산 지점',
            '대구 지점',
            '광주 지점',
            '대전 지점',
            '청주 지점',
            '코엑스 박람회',
            '제주 지점',
          ]);
        if (/purpose|목적/i.test(key))
          return one([
            '지점 현장 점검',
            '가맹 상담 미팅',
            '기업 이전 현장 실사',
            '신규 지점 오픈 지원',
            '박람회 부스 운영',
          ]);
        if (/plan|계획/i.test(key))
          return one([
            '견적서 정리·고객 콜백',
            '주간 보고서 작성',
            '가맹 자료 정리',
            '캠페인 문안 작성',
            '현장 직출 후 고객 미팅',
          ]);
        if (/detail|내용/i.test(key))
          return one([
            '현장 점검 이동 택시비',
            '야간 작업 식대',
            '고객 미팅 주차비',
            '포장 자재 긴급 구매',
            '지점 교육 다과',
            '거래처 방문 교통비',
          ]);
        return `${f.label} — ${one(['정상 처리', '내부 검토 완료', '첨부 참고'])}`;
      default:
        return undefined;
    }
  };
  const GENERAL_TITLES = [
    '판촉물 제작 품의',
    '차량 리스 계약 연장 품의',
    '성수기 임시 인력 채용 품의',
    '사무실 복합기 교체 품의',
    '가맹점 간담회 개최 품의',
    '이사·인테리어 박람회 참가 품의',
    '보관 창고 임대 연장 품의',
    '고객 사은품(정리함) 구매 품의',
    '직원 안전 교육 외부 강사 섭외 품의',
    '홈페이지 유지보수 계약 품의',
  ];
  for (let dn = START; dn <= TODAY; dn++) {
    if (!isWorkday(dn)) continue;
    for (let i = poisson(1.1 * growth(dn)); i > 0; i--) {
      if (!formPick.length) break;
      const form = pick(formPick);
      const me = one(hqPool);
      const values: Record<string, unknown> = {};
      for (const f of (Array.isArray(form.fields) ? form.fields : []) as Field[]) {
        const v = valueFor(f, form.name, dn, me);
        if (v !== undefined && !(Array.isArray(v) && !v.length)) values[f.id] = v;
      }
      addDoc({
        requester: me,
        docType: 'FORM',
        title: `${form.name} — ${me.name}`,
        payload: {
          formId: form.id,
          formName: form.name,
          fields: form.fields as Prisma.InputJsonValue,
          values: values as Prisma.InputJsonValue,
        },
        submittedAt: ts(dn, int(9, 18), int(0, 59)),
        outcome: pick([
          ['APPROVED', 90],
          ['REJECTED', 5],
          ['CANCELED', 5],
        ] as const),
        rejectComment: one([
          '증빙(영수증)을 첨부해 주세요.',
          '예산 초과 — 금액 조정 바랍니다.',
          '다음 달 예산으로 올려 주세요.',
        ]),
      });
    }
    if (chance(0.22)) {
      const me = one(mgmtEmps.concat(hqPool.slice(0, 10)));
      const { m } = ymOf(dn);
      const title = `${m + 1}월 ${one(GENERAL_TITLES)}`;
      addDoc({
        requester: me,
        docType: 'GENERAL',
        title,
        content: `${title}의 건으로 아래와 같이 품의하오니 검토 후 결재 바랍니다.\n\n1. 목적: ${one(['업무 효율 개선', '성수기 대비', '고객 만족도 향상', '안전 사고 예방'])}\n2. 예상 비용: ${round(int(300_000, 12_000_000), 10_000).toLocaleString('ko-KR')}원\n3. 일정: ${ymd(dn + int(7, 30))}까지`,
        submittedAt: ts(dn, int(9, 17), int(0, 59)),
        outcome: chance(0.9) ? 'APPROVED' : 'REJECTED',
        rejectComment: '비용 근거 보완 후 다시 올려 주세요.',
      });
    }
  }
  await assignNo(
    docs,
    'AP',
    (r) => r.submittedAt,
    (r, no) => (r.docNo = no),
  );

  // ════════════════ 6. 상담 콜 · 확인콜·해피콜 ════════════════
  type Call = Prisma.CsCallCreateManyInput & { id: string; receivedAt: Date };
  const calls: Call[] = [];
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
  const addCall = (c: Omit<Call, 'id'>) => {
    if (+c.receivedAt > NOW) return;
    calls.push({ id: oid('call'), ...c });
  };
  const csAgent = () => one(csEmps);
  // 전화로 들어온 접수 — 상담하며 접수를 등록했다
  for (const l of leads) {
    if (l.source !== 'PHONE' || +l.createdAt < dateOf(START).getTime()) continue;
    const rec = new Date(+l.createdAt - int(3, 25) * 60_000);
    const assigned = new Date(+rec + int(5, 40) * 1000);
    const dur = int(150, 900);
    const c = l.customerId ? custById.get(l.customerId) : undefined;
    addCall({
      phone: c?.phonePrimary?.replace(/\D/g, '') ?? nextPhone(),
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
  // 문의·부재중 콜백·스팸
  for (let dn = START; dn <= TODAY; dn++) {
    const w = ymOf(dn).w;
    const lam =
      (w === 0 ? 0.6 : w === 6 ? 3 : HOLIDAYS.has(ymd(dn)) ? 1 : 9) * season(dn) * growth(dn);
    for (let i = poisson(lam); i > 0; i--) {
      const rec = ts(dn, int(8, 19), int(0, 59));
      const kind = pick([
        ['INQ', 45],
        ['NEW', 25],
        ['MISSED', 20],
        ['SPAM', 10],
      ] as const);
      const c = kind === 'INQ' && customers.length ? one(customers) : null;
      const phone = c?.phonePrimary?.replace(/\D/g, '') ?? nextPhone();
      const recent = NOW - +rec < 20 * 3600_000;
      if (recent && kind !== 'SPAM' && chance(0.35)) {
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
          doneAt: new Date(+rec + int(1, 30) * 60_000),
        });
        continue;
      }
      const missed = kind === 'MISSED';
      const assigned = new Date(+rec + (missed ? int(10, 150) * 60_000 : int(5, 40) * 1000));
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
  // 최근 8일 콜은 통화 ID 자리를 채워 둔다 — 화면이 한국AI통신에 가상 번호로 녹취를 찾으러 가지 않게(녹취 없음으로 보인다)
  for (const c of calls)
    if (c.assignedAt && +c.assignedAt > NOW - 8 * DAY) {
      c.katCallSid = `DEMO-${c.id.slice(-12)}`;
      c.durationSec = null;
    }

  const followups: Prisma.CsFollowupCreateManyInput[] = [];
  for (const l of leads) {
    if (!l.moveDate) continue;
    const mdn = Math.round(+l.moveDate / DAY);
    if (mdn < START + 2) continue;
    const confirmStatuses = ['DONE', 'WORK_TOSS', 'CONTRACTED', 'CONTRACT_PENDING', 'IN_PROGRESS'];
    if (confirmStatuses.includes(l.status)) {
      // 확인콜 — 이사 이틀 전
      const cdn = mdn - 2;
      if (cdn <= TODAY) {
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
            at: minTs(ts(cdn, int(14, 18), int(0, 59))),
          });
      }
    }
    if (l.status === 'DONE' || l.status === 'WORK_TOSS') {
      // 해피콜 — 이사 다음 날(일부는 연결 안 됨)
      const hdn = mdn + int(1, 2);
      if (hdn >= TODAY || !chance(0.85)) continue;
      const by = csAgent();
      const tries = chance(0.25) ? int(1, 2) : 0;
      for (let k = 0; k < tries; k++)
        followups.push({
          id: oid('fu'),
          leadId: l.id,
          kind: 'HAPPY',
          result: 'NO_ANSWER',
          employeeId: by.id,
          at: ts(hdn + k, int(10, 12), int(0, 59)),
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
          at: ts(hdn + tries, int(13, 18), int(0, 59)),
        });
    }
  }

  // ════════════════ 7. 이사 마감 — 지점별 꽉 찬 날(월말·금토·성수기) ════════════════
  const closures: Prisma.MoveClosureCreateManyInput[] = [];
  const closureSeen = new Set(
    (await prisma.moveClosure.findMany({ select: { date: true, orgUnitId: true } })).map(
      (c) => `${c.orgUnitId}|${c.date.toISOString().slice(0, 10)}`,
    ),
  );
  for (const b of branches) {
    for (let dn = START; dn <= TODAY + 45; dn++) {
      const { y, m, d, w } = ymOf(dn);
      const endOfMonth = d > lastDayOfMonth(y, m) - 3;
      const p =
        0.006 * b.w * season(dn) ** 2.2 * (w === 5 || w === 6 ? 2.6 : 1) * (endOfMonth ? 2.4 : 1);
      if (!chance(p) || closureSeen.has(`${b.id}|${ymd(dn)}`)) continue;
      closureSeen.add(`${b.id}|${ymd(dn)}`);
      const future = dn > TODAY;
      closures.push({
        id: oid('mc'),
        date: dateOf(dn),
        orgUnitId: b.id,
        kind: future ? (chance(0.55) ? 'CLOSED' : 'SOON') : chance(0.9) ? 'CLOSED' : 'SOON',
        memo: chance(0.3)
          ? one(['차량 전부 배차 완료', '기사 인원 부족', '대형 이사 2건', '사다리차 예약 마감'])
          : null,
        createdBy: b.emps[0]?.id ?? null,
        createdAt: minTs(ts(dn - int(1, 14), int(9, 18), int(0, 59))),
      });
    }
  }

  // ════════════════ 8. 영업 CRM — 가맹 모집 · 기업영업 ════════════════
  const crmLeads: (Prisma.CrmLeadCreateManyInput & { createdAt: Date })[] = [];
  const crmActs: Prisma.CrmActivityCreateManyInput[] = [];
  const B2B_OPEN = ['LEAD', 'CONTACTED', 'MEETING', 'SURVEY', 'QUOTED', 'NEGOTIATING'];
  const FRAN_OPEN = ['NEW', 'CONTACTED', 'CONSULTING', 'MEETING', 'CONTRACTING'];
  const ACT_TEXT: Record<string, string[]> = {
    LEAD: ['홈페이지 기업이전 문의', 'DB 발굴 — 이전 예정 기사 확인', '입찰 공고 확인'],
    NEW: ['홈페이지 가맹 문의', '창업 박람회 명함 수집', '기존 가맹점 소개'],
    CONTACTED: ['첫 통화 — 담당자 확인', '회사 소개서 메일 발송', '가맹 안내서 문자 발송'],
    CONSULTING: ['수수료 구조·초도 비용 상담', '지역 독점 범위 문의'],
    MEETING: ['본사 방문 미팅', '현장 미팅 — 요구사항 정리', '화상 미팅'],
    SURVEY: ['현장 실사 — 전산 장비 특수 포장 필요', '현장 실사 — 층간 이동 동선 확인'],
    QUOTED: ['견적서 제출', '수정 견적 제출'],
    NEGOTIATING: ['단가 조정 요청 받음', '결제 조건 협의'],
    CONTRACTING: ['가맹 계약서 초안 전달', '계약 조건 최종 협의'],
    WON: ['수주 확정 — 일정 확정', '계약 체결 — 교육 일정 안내'],
    LOST: ['타사 선택', '예산 문제로 중단'],
    HOLD: ['일정이 내년으로 연기', '내부 검토 중 — 보류'],
  };
  const b2bClients = ptnOf('B2B_CLIENT');
  for (const pipeline of ['B2B', 'FRANCHISE'] as const) {
    const owners = pipeline === 'B2B' ? b2bEmps : franEmps;
    const open = pipeline === 'B2B' ? B2B_OPEN : FRAN_OPEN;
    for (let dn = START; dn <= TODAY; dn++) {
      if (!isWorkday(dn)) continue;
      for (
        let i = poisson((pipeline === 'B2B' ? 0.3 : 0.2) * season(dn) * growth(dn));
        i > 0;
        i--
      ) {
        const createdAt = ts(dn, int(9, 18), int(0, 59));
        if (+createdAt > NOW) continue;
        const owner = one(owners);
        const final = pick([
          ['WON', pipeline === 'B2B' ? 24 : 18],
          ['LOST', 34],
          ['HOLD', 12],
          ['OPEN', 30],
        ] as const);
        const L = int(20, pipeline === 'B2B' ? 120 : 90);
        const age = TODAY - dn;
        let reached: number; // 진행 단계 몇 번째까지 왔나
        let stage: string;
        if (final === 'OPEN' || age < L) {
          const maxIdx =
            final === 'LOST' || final === 'HOLD' ? int(1, open.length - 2) : open.length - 1;
          reached = Math.min(maxIdx, Math.floor((Math.min(age, L) / L) * open.length));
          if (final === 'OPEN' && age >= L) reached = int(1, open.length - 1);
          stage = open[reached];
        } else {
          reached = final === 'WON' ? open.length - 1 : int(1, open.length - 2);
          stage = final;
        }
        const id = oid('crm');
        const region = one(REGIONS);
        const contact = personName();
        const company =
          pipeline === 'B2B'
            ? `${one(PRE)}${one(['테크', '소프트', '바이오', '물산', '정밀', '엔지니어링', '디자인', '컨설팅', '로지스', '파이낸스', '미디어', '헬스케어', '에너지', '건설', '식품', '전자', '네트웍스'])}`
            : chance(0.3)
              ? `${contact}(개인)`
              : `${one(PRE)}${one(['이사', '익스프레스', '무빙', '운송', '물류', '용달'])}`;
        const amount =
          pipeline === 'B2B'
            ? round(15_000_000 + 300_000_000 * rnd() ** 2.5, 1_000_000)
            : round(int(25, 35) * 1_000_000, 1_000_000);
        const isOpen = open.includes(stage);
        const end = Math.min(TODAY, dn + L);
        crmLeads.push({
          id,
          pipeline,
          companyName: company,
          contactName: contact,
          contactTitle:
            pipeline === 'B2B'
              ? one([
                  '총무팀장',
                  '총무 과장',
                  '경영지원 팀장',
                  '관리부장',
                  '총무 대리',
                  'IT 인프라 팀장',
                ])
              : '대표',
          phone: nextPhone(),
          region,
          source:
            pipeline === 'B2B'
              ? pick([
                  ['INBOUND', 30],
                  ['OUTBOUND', 20],
                  ['REFERRAL', 15],
                  ['BID', 12],
                  ['EXISTING', 10],
                  ['PARTNER', 5],
                  ['DB', 8],
                ] as const)
              : pick([
                  ['INBOUND', 35],
                  ['DB', 20],
                  ['OUTBOUND', 15],
                  ['REFERRAL', 15],
                  ['EXPO', 12],
                  ['ETC', 3],
                ] as const),
          stage,
          interest:
            stage === 'WON'
              ? 'A'
              : pick([
                  ['A', 3],
                  ['B', 5],
                  ['C', 2],
                ] as const),
          ownerEmpId: owner.id,
          amount,
          expectedAt: dateOf(dn + L + int(10, 60)),
          nextActionAt: isOpen ? dateOf(TODAY + int(1, 14)) : null,
          nextAction: isOpen
            ? one(ACT_TEXT[stage] ?? ['재연락']).replace(/ —.*/, '') + ' 후속'
            : null,
          lostReason: stage === 'LOST' || stage === 'HOLD' ? one(ACT_TEXT[stage]) : null,
          fields:
            pipeline === 'B2B'
              ? {
                  industry: one([
                    'IT',
                    '제조',
                    '금융',
                    '의료기기',
                    '바이오',
                    '유통',
                    '물류',
                    '공공기관',
                    '법률·회계',
                  ]),
                  employees: int(20, 400),
                  area: int(50, 1500),
                  moveScope: one([
                    '사무실 전체',
                    '일부 층·부서',
                    '전산·서버',
                    '공장·창고',
                    '연구소·실험실',
                  ]),
                  fromAddr: region,
                  toAddr: one(REGIONS),
                  decisionMaker: one(['총무팀장', '경영지원본부장', '대표이사']),
                }
              : {
                  currentBiz: one([
                    '개인 이사업체 3년',
                    '용달 운영',
                    '화물 기사',
                    '청소·정리수납',
                    '이삿짐센터 7년',
                  ]),
                  trucks: int(1, 6),
                  capital: one(['3천만 원', '5천만 원', '7천만 원', '1억 원']),
                },
          branchId:
            pipeline === 'FRANCHISE' && stage === 'WON' && branches.length
              ? one(branches).id
              : null,
          partnerId:
            pipeline === 'B2B' && stage === 'WON' && b2bClients.length ? one(b2bClients).id : null,
          createdByUserId: owner.userId,
          createdAt,
          updatedAt: minTs(ts(end, 17)),
        });
        // 상담 기록 — 단계가 바뀔 때마다 STAGE + 그 단계 활동
        const path = open.slice(0, reached + 1).concat(isOpen ? [] : [stage]);
        const span = Math.max(1, end - dn);
        path.forEach((s, k) => {
          const at = minTs(ts(dn + Math.floor((span * k) / path.length), int(9, 18), int(0, 59)));
          if (k > 0)
            crmActs.push({
              id: oid('cra'),
              leadId: id,
              kind: 'STAGE',
              fromStage: path[k - 1],
              toStage: s,
              actorUserId: owner.userId,
              actorName: owner.name,
              at,
            });
          crmActs.push({
            id: oid('cra'),
            leadId: id,
            kind:
              k === 0
                ? 'MEMO'
                : s === 'MEETING' || s === 'SURVEY'
                  ? 'MEETING'
                  : s === 'QUOTED' || s === 'CONTRACTING'
                    ? 'EMAIL'
                    : one(['CALL', 'CALL', 'SMS']),
            content: one(ACT_TEXT[s] ?? ['통화']),
            actorUserId: owner.userId,
            actorName: owner.name,
            at: minTs(new Date(+at + 60_000)),
          });
        });
      }
    }
  }
  crmLeads.sort((a, b) => +a.createdAt - +b.createdAt);

  // ════════════════ 9. 캠페인(문자·알림톡) — 실제로 보내지 않는다 ════════════════
  const campaigns: Prisma.CampaignCreateManyInput[] = [];
  const recipients: Prisma.CampaignRecipientCreateManyInput[] = [];
  const CAMPAIGNS: [number[], string, string, string][] = [
    // 달(0~11), 이름, 채널, 본문
    [
      [0, 1],
      '봄 이사 시즌 조기 예약 할인',
      'SMS',
      '{고객명}님, 봄 이사 시즌 조기 예약 시 이사비 10% 할인해 드립니다. 통인익스프레스',
    ],
    [
      [2],
      '신학기 원룸 이사 특가',
      'SMS',
      '{고객명}님, 3월 원룸·소형 이사 특가 안내드립니다. 통인익스프레스',
    ],
    [
      [3, 4],
      '에어컨 분해세척 사전 예약',
      'ALIMTALK',
      '{고객명}님, 여름 전 에어컨 분해세척 사전 예약 시 20% 할인!',
    ],
    [
      [5],
      '장마철 보관이사 안내',
      'SMS',
      '{고객명}님, 습기 걱정 없는 항온항습 보관이사를 안내드립니다.',
    ],
    [
      [6, 7],
      '가을 이사 성수기 예약 오픈',
      'ALIMTALK',
      '{고객명}님, 9~10월 이사 예약이 열렸습니다. 원하는 날짜를 먼저 잡으세요.',
    ],
    [
      [8],
      '추석 연휴 전후 이사 특가',
      'SMS',
      '{고객명}님, 추석 연휴 전후 평일 이사 특가를 안내드립니다.',
    ],
    [
      [9],
      '입주청소 결합 할인',
      'ALIMTALK',
      '{고객명}님, 이사와 입주청소를 함께 예약하면 청소비 15% 할인!',
    ],
    [
      [10, 11],
      '재이용 고객 감사 쿠폰',
      'SMS',
      '{고객명}님, 다시 찾아 주셔서 감사합니다. 재이용 고객 5만 원 할인 쿠폰을 드립니다.',
    ],
    [
      [11],
      '연말 사무실 이전 상담',
      'SMS',
      '{고객명}님, 연말·연초 사무실 이전 무료 현장 상담을 신청하세요.',
    ],
    [
      [0, 3, 6, 9],
      '이사 후 정리수납 서비스 안내',
      'ALIMTALK',
      '{고객명}님, 새집 정리가 막막하다면 정리수납 전문가가 도와드립니다.',
    ],
  ];
  const marketer = one(mktEmps);
  for (let y = 2025; y <= ymOf(TODAY).y; y++)
    for (let m = 0; m < 12; m++) {
      const first = dnOf(y, m, 1);
      if (first > TODAY + 10) break;
      for (const [months, name, channel, message] of CAMPAIGNS) {
        if (!months.includes(m)) continue;
        const sendDn = weekdayOnOrAfter(first + int(2, 20));
        const id = oid('cmp');
        const at = ts(sendDn, one([10, 11, 14]), 0);
        const future = +at > NOW;
        const status = future
          ? chance(0.7)
            ? 'SCHEDULED'
            : 'DRAFT'
          : chance(0.03)
            ? 'CANCELED'
            : 'SENT';
        const pool = customers.filter((c) => +c.createdAt < +at);
        const want = status === 'SENT' ? int(60, 220) : status === 'CANCELED' ? 0 : int(80, 200);
        const chosen = new Set<string>();
        for (let k = 0; k < want * 3 && chosen.size < Math.min(want, pool.length); k++)
          chosen.add(one(pool).id);
        let sent = 0;
        let failed = 0;
        for (const cid of chosen) {
          const c = custById.get(cid)!;
          const ok = !chance(0.03);
          if (status === 'SENT' && ok) sent++;
          else if (status === 'SENT') failed++;
          recipients.push({
            id: oid('cmr'),
            campaignId: id,
            customerId: cid,
            name: c.name,
            phone: c.phonePrimary!.replace(/\D/g, ''),
            status: status === 'SENT' ? (ok ? 'SENT' : 'FAILED') : 'PENDING',
            reason:
              status === 'SENT' && !ok
                ? one(['수신 거부 번호', '없는 번호(결번)', '단말기 꺼짐'])
                : null,
            sentAt: status === 'SENT' && ok ? new Date(+at + int(1, 300) * 1000) : null,
          });
        }
        campaigns.push({
          id,
          name: `${y % 100}년 ${m + 1}월 ${name}`,
          channel,
          periodStart: dateOf(sendDn),
          periodEnd: dateOf(sendDn + int(14, 40)),
          message,
          title: channel === 'ALIMTALK' ? name : null,
          isAd: true,
          optOutText: '무료수신거부 080-000-0000',
          fallbackSms: true,
          filters: { note: '지난 이사 고객 중 수신 동의' },
          status,
          scheduledAt: status === 'SCHEDULED' ? at : null,
          recipientCount: chosen.size,
          sentCount: sent,
          failedCount: failed,
          sentAt: status === 'SENT' ? at : null,
          createdBy: marketer.userId,
          createdAt: minTs(new Date(+at - int(2, 10) * DAY)),
        });
      }
    }

  // ════════════════ 10. 팀 업무(댓글·이력) ════════════════
  type Task = Prisma.TeamTaskCreateManyInput & { createdAt: Date };
  const tasks: Task[] = [];
  const taskComments: Prisma.TeamTaskCommentCreateManyInput[] = [];
  const taskEvents: Prisma.TeamTaskEventCreateManyInput[] = [];
  const TASKS: [RegExp, string[]][] = [
    [
      /고객관리|홈플래너/,
      [
        '해피콜 불만 건 정리',
        '상담 스크립트 개정',
        '부재중 콜백 누락 점검',
        '확인콜 일정표 정리',
        'VOC 월간 보고',
      ],
    ],
    [
      /경영관리|본사/,
      [
        '월 마감 정산 검토',
        '법인카드 사용 내역 정리',
        '차량 보험 갱신',
        '급여 대장 검토',
        '세금계산서 발행 점검',
        '비품 재고 조사',
      ],
    ],
    [
      /마케팅/,
      [
        '네이버 광고 키워드 정리',
        '인스타그램 콘텐츠 제작',
        '캠페인 문안 작성',
        '블로그 후기 이벤트',
        '광고 성과 리포트',
      ],
    ],
    [
      /디자인/,
      [
        '전단지 시안 작업',
        '차량 랩핑 디자인 수정',
        '홈페이지 배너 교체',
        '견적서 양식 디자인 개선',
      ],
    ],
    [
      /가맹/,
      [
        '가맹 상담 자료 업데이트',
        '신규 지점 오픈 지원',
        '가맹점 정기 점검 일정',
        '재계약 대상 지점 연락',
      ],
    ],
    [
      /기업영업/,
      ['기업 이전 제안서 작성', '입찰 서류 준비', '거래처 정기 방문', '현장 실사 보고서 정리'],
    ],
    [/전속|제휴/, ['제휴사 혜택 정리', '전속 계약사 월 청구 대사', '신규 제휴 제안 검토']],
    [/무브제/, ['무브제 컨시어지 고객 응대', '서비스 안내 페이지 수정']],
    [/./, ['주간 업무 보고', '업무 매뉴얼 정리', '회의록 공유', '교육 자료 준비']],
  ];
  const COMMENTS = [
    '확인했습니다.',
    '내일까지 정리해서 공유드릴게요.',
    '자료 첨부했습니다. 검토 부탁드립니다.',
    '일정 조금 미뤄도 될까요?',
    '완료했습니다.',
    '수정본 올렸습니다.',
    '관련 부서와 협의 중입니다.',
  ];
  const teams = [...new Set(hqEmps.map((e) => e.orgUnitId))]
    .map((id) => ({ id, emps: byOrg.get(id)!, name: orgById.get(id)!.name }))
    .filter((t) => t.emps.length);
  const teamPick = teams.map((t) => [t, Math.sqrt(t.emps.length)] as const);
  const projectOf = (dn: number) => {
    const { y, m } = ymOf(dn);
    const xs: string[] = [];
    if (m <= 2) xs.push('봄 성수기 대비');
    if (m >= 6 && m <= 8) xs.push('가을 성수기 대비');
    if (m >= 10) xs.push('연말 프로모션', `${y + 1} 사업계획`);
    if (y === 2026 && m >= 7) xs.push('ERP 전환');
    xs.push('가맹 모집', '기업 이전', '무브제 컨시어지');
    return chance(0.45) ? one(xs) : null;
  };
  if (teams.length)
    for (let dn = START; dn <= TODAY; dn++) {
      if (!isWorkday(dn)) continue;
      for (let i = poisson(1.7 * growth(dn)); i > 0; i--) {
        const team = pick(teamPick);
        const assignee = one(team.emps);
        const requester = chance(0.6)
          ? (headOf(team.id, new Set([assignee.id])) ?? assignee)
          : assignee;
        const createdAt = ts(dn, int(9, 18), int(0, 59));
        if (+createdAt > NOW) continue;
        const titles = TASKS.find(([re]) => re.test(team.name))![1];
        const { m } = ymOf(dn);
        const title = `${m + 1}월 ${one(titles)}`;
        const id = oid('tt');
        const doneDn = dn + (chance(0.15) ? int(15, 80) : int(1, 14));
        const hold = chance(0.05);
        let status: string;
        if (hold) status = 'HOLD';
        else if (doneDn < TODAY) status = 'DONE';
        else status = dn < TODAY - 1 || chance(0.5) ? 'IN_PROGRESS' : 'TODO';
        const doneAt = status === 'DONE' ? ts(doneDn, int(10, 18), int(0, 59)) : null;
        tasks.push({
          id,
          title,
          description: chance(0.4) ? `${title} 관련 진행 사항을 정리해 주세요.` : null,
          teamOrgId: team.id,
          assigneeEmpId: assignee.id,
          requesterEmpId: requester.id,
          project: projectOf(dn),
          status,
          priority: pick([
            ['A', 2],
            ['B', 5],
            ['C', 3],
          ] as const),
          dueDate: chance(0.65) ? dateOf(dn + int(2, 21)) : null,
          doneAt,
          createdByUserId: requester.userId,
          createdAt,
          updatedAt: doneAt ?? minTs(ts(Math.min(TODAY, dn + int(0, 5)), 17)),
        });
        const actor = (e: Emp) => ({ actorUserId: e.userId, actorName: e.name });
        taskEvents.push({
          id: oid('tte'),
          taskId: id,
          kind: 'CREATED',
          ...actor(requester),
          createdAt,
        });
        taskEvents.push({
          id: oid('tte'),
          taskId: id,
          kind: 'ASSIGNED',
          toValue: assignee.id,
          ...actor(requester),
          createdAt: new Date(+createdAt + 1000),
        });
        notify(assignee, {
          kind: 'TASK_ASSIGNED',
          title: `업무 배정 · ${title}`,
          body: `${requester.name}님이 업무를 맡겼습니다.`,
          link: `/tasks?detail=${id}`,
          actorName: requester.name,
          entityType: 'team_task',
          entityId: id,
          createdAt,
        });
        if (status !== 'TODO') {
          const startAt = minTs(ts(Math.min(dn + int(0, 2), TODAY), int(9, 18), int(0, 59)));
          taskEvents.push({
            id: oid('tte'),
            taskId: id,
            kind: 'STATUS',
            fromValue: 'TODO',
            toValue: 'IN_PROGRESS',
            ...actor(assignee),
            createdAt: new Date(Math.max(+startAt, +createdAt + 60_000)),
          });
          if (status === 'DONE' || status === 'HOLD')
            taskEvents.push({
              id: oid('tte'),
              taskId: id,
              kind: 'STATUS',
              fromValue: 'IN_PROGRESS',
              toValue: status,
              note: status === 'HOLD' ? one(['우선순위 조정', '상대 회신 대기']) : null,
              ...actor(assignee),
              createdAt: doneAt ?? minTs(ts(Math.min(TODAY, dn + int(3, 10)), 15)),
            });
        }
        for (let k = poisson(0.9); k > 0; k--) {
          const by = chance(0.6) ? assignee : requester;
          taskComments.push({
            id: oid('ttc'),
            taskId: id,
            authorEmpId: by.id,
            authorUserId: by.userId,
            body: one(COMMENTS),
            createdAt: minTs(new Date(+createdAt + int(30, 60 * 24 * 5) * 60_000)),
          });
        }
      }
    }
  tasks.sort((a, b) => +a.createdAt - +b.createdAt);

  // ════════════════ 11. 공지 ════════════════
  const notices: Prisma.NoticeCreateManyInput[] = [];
  const noticeOrgs: Prisma.NoticeOrgUnitCreateManyInput[] = [];
  const NOTICES: [number[] | null, string, string][] = [
    [
      [0],
      '연말정산 서류 제출 안내',
      '연말정산 간소화 자료와 부양가족 서류를 이달 말까지 경영관리로 제출해 주세요.',
    ],
    [
      [0, 1],
      '설 연휴 근무·배차 안내',
      '설 연휴 전후 이사 물량이 몰립니다. 지점별 배차표를 확인하고 연휴 당직을 정해 주세요.',
    ],
    [
      [1, 7],
      '성수기 대비 안전 교육 실시',
      '성수기 전 전 직원·기사 안전 교육을 실시합니다. 지점별 일정은 첨부를 참고해 주세요.',
    ],
    [
      [2],
      '정기 주주총회 및 인사 발령 안내',
      '정기 인사 발령 내용을 안내드립니다. 부서 이동 대상자는 인수인계를 마쳐 주세요.',
    ],
    [
      [3],
      '개인정보 보호 교육(필수) 안내',
      '고객 개인정보 취급 교육을 이달 안에 수료해 주세요. 미수료자는 시스템 접근이 제한됩니다.',
    ],
    [
      [4],
      '종합소득세 신고 안내(가맹점)',
      '가맹점 사장님들은 5월 종합소득세 신고 기한을 꼭 지켜 주세요.',
    ],
    [[5, 6], '하계 휴가 사용 안내', '7~8월 하계 휴가는 팀별로 겹치지 않게 미리 신청해 주세요.'],
    [
      [6, 7],
      '폭염 대비 작업 수칙',
      '한낮(12~15시) 작업 시 휴식 시간을 늘리고 물·식염 포도당을 꼭 챙겨 주세요.',
    ],
    [
      [8, 9],
      '추석 연휴 배차 및 고객 안내',
      '추석 연휴 기간 이사 예약 현황을 확인하고 고객 안내 문자를 미리 보내 주세요.',
    ],
    [
      [10],
      '연말 프로모션 시행 안내',
      '연말 재이용 고객 할인 프로모션을 시행합니다. 상담 시 쿠폰 적용 여부를 꼭 확인해 주세요.',
    ],
    [
      [11],
      '연말 연차 사용 촉진 안내',
      '남은 연차는 12월 31일까지 사용해 주세요. 미사용 연차는 이월되지 않습니다.',
    ],
    [
      [11],
      '송년회 일정 안내',
      '올해 송년회 일정과 장소를 안내드립니다. 참석 여부를 회신해 주세요.',
    ],
    [
      null,
      '고객 파손 접수 처리 절차 재안내',
      '파손 접수 시 사진·내역을 당일 등록하고 보험 처리 여부를 본사와 협의해 주세요.',
    ],
    [
      null,
      '차량 정기 점검 일정 안내',
      '이번 달 차량 정기 점검 일정입니다. 점검일에는 배차에서 빼 주세요.',
    ],
    [
      null,
      '포장 자재 발주 마감 시간 변경',
      '자재 발주는 매일 오후 3시에 마감합니다. 이후 발주는 다음 날 출고됩니다.',
    ],
    [
      null,
      '신규 지점 오픈 소식',
      '새 가맹점이 문을 열었습니다. 권역 배정이 바뀌는 지점은 접수 배정 기준을 확인해 주세요.',
    ],
    [
      null,
      '고객 만족도 조사 결과 공유',
      '지난달 해피콜 만족도 결과를 공유합니다. 우수 지점은 포상 예정입니다.',
    ],
    [
      null,
      '사내 시스템 점검 안내',
      '토요일 밤 사내 시스템 점검이 있습니다. 점검 시간에는 접속이 안 될 수 있습니다.',
    ],
  ];
  const noticeAuthors = mgmtEmps.concat(franEmps.slice(0, 2), csEmps.slice(0, 2));
  for (let y = 2025; y <= ymOf(TODAY).y; y++)
    for (let m = 0; m < 12; m++) {
      const first = dnOf(y, m, 1);
      if (first > TODAY) break;
      const seasonal = NOTICES.filter(([ms]) => ms?.includes(m));
      const general = NOTICES.filter(([ms]) => !ms);
      const list = seasonal.concat(
        Array.from({ length: int(2, 4) }, () => one(general)).filter(
          (x, i, a) => a.indexOf(x) === i,
        ),
      );
      for (const [, title, body] of list) {
        const dn = weekdayOnOrAfter(first + int(0, lastDayOfMonth(y, m) - 3));
        const createdAt = ts(dn, int(9, 17), int(0, 59));
        if (+createdAt > NOW) continue;
        const author = one(noticeAuthors);
        const id = oid('ntc');
        const toOrg = chance(0.25) && branches.length;
        notices.push({
          id,
          title,
          body,
          audience: toOrg ? 'ORG' : 'ALL',
          pinned: false,
          authorEmpId: author.id,
          authorUserId: author.userId,
          createdAt,
          updatedAt: createdAt,
        });
        if (toOrg) {
          const picked = new Set<string>();
          for (let k = int(3, 12); k > 0; k--) picked.add(one(branches).id);
          for (const orgUnitId of picked) noticeOrgs.push({ noticeId: id, orgUnitId });
        } else if (NOW - +createdAt < 7 * DAY)
          for (const e of hqEmps)
            notify(e, {
              kind: 'NOTICE',
              title: `공지 · ${title}`,
              body: body.slice(0, 80),
              link: `/notices?detail=${id}`,
              actorName: author.name,
              entityType: 'notice',
              entityId: id,
              createdAt,
            });
      }
    }

  // ════════════════ 12. 지점 관리 기록(점검·위반·보험·소송·재계약·민원) ════════════════
  const branchCases: Prisma.BranchCaseCreateManyInput[] = [];
  const CASES: [string, number, string[], [number, number] | null][] = [
    [
      'INSPECTION',
      30,
      [
        '정기 현장점검 — 차량·장비 상태',
        '정기 현장점검 — 작업자 복장·안전교육',
        '창고 위생·보관 상태 점검',
        '포장 자재 재고 점검',
      ],
      null,
    ],
    [
      'COMPLAINT',
      25,
      [
        '작업자 불친절 민원',
        '추가 요금 과다 청구 민원',
        '작업 후 쓰레기 방치 민원',
        '약속 시간 지연 민원',
        '견적과 다른 인원 투입 민원',
      ],
      [0, 300_000],
    ],
    [
      'INSURANCE',
      20,
      [
        '고객 가구 파손 보험 처리',
        '엘리베이터 벽면 긁힘 배상',
        '냉장고 운반 중 도어 찌그러짐',
        'TV 액정 파손 배상',
        '바닥 마루 찍힘 배상',
      ],
      [200_000, 3_000_000],
    ],
    [
      'ILLEGAL',
      8,
      ['권역 외 영업 접수', '타 브랜드 명의 영업 의심', '본사 미등록 차량 운행'],
      null,
    ],
    [
      'RENEWAL',
      10,
      ['가맹 계약 만료 재계약 협의', '재계약 — 점주 변경 동반', '가맹 재계약 완료'],
      null,
    ],
    [
      'LAWSUIT',
      3,
      ['고객 손해배상 청구 소송', '전 직원 임금 청구 건', '하도급 대금 분쟁'],
      [3_000_000, 30_000_000],
    ],
  ];
  const caseOwners = franEmps.concat(mgmtEmps.slice(0, 2));
  for (let dn = START; dn <= TODAY; dn++) {
    if (!isWorkday(dn) || !branches.length) continue;
    for (let i = poisson(0.45 * season(dn)); i > 0; i--) {
      const [kind, , titles, amt] = pick(CASES.map((c) => [c, c[1]] as const));
      const b = pick(branchPick);
      const age = TODAY - dn;
      const status =
        age > 60
          ? chance(0.92)
            ? 'CLOSED'
            : 'IN_PROGRESS'
          : age > 14
            ? pick([
                ['CLOSED', 50],
                ['IN_PROGRESS', 40],
                ['OPEN', 10],
              ] as const)
            : pick([
                ['OPEN', 50],
                ['IN_PROGRESS', 45],
                ['CLOSED', 5],
              ] as const);
      const createdAt = ts(dn, int(9, 18), int(0, 59));
      const by = one(caseOwners);
      const title = one(titles);
      branchCases.push({
        id: oid('bc'),
        branchId: b.id,
        kind,
        title,
        content: `${b.name} — ${title}. ${one(['고객 연락 후 경위 확인', '사진 자료 받음', '점주와 통화 완료', '본사 검토 필요', '다음 점검 때 재확인'])}`,
        status,
        occurredAt: dateOf(dn - int(0, 3)),
        dueDate: dateOf(dn + int(7, 45)),
        assigneeEmpId: by.id,
        amount: amt ? round(int(amt[0], amt[1]), 10_000) : null,
        createdByUserId: by.userId,
        createdAt,
        updatedAt: minTs(ts(Math.min(TODAY, dn + int(0, 30)), 17)),
      });
    }
  }

  // ════════════════ 13. 가맹점 계약 정보 — 비어 있는 지점만 ════════════════
  const franchiseInfos: Prisma.FranchiseInfoCreateManyInput[] = [];
  const haveInfo = new Set(
    (await prisma.franchiseInfo.findMany({ select: { orgUnitId: true } })).map((f) => f.orgUnitId),
  );
  let bizNo = 0;
  for (const b of branches) {
    if (haveInfo.has(b.id)) continue;
    const owner = [...b.emps].sort((a, c) => a.rank - c.rank)[0];
    const startDn = owner?.hire
      ? Math.max(dnOfYmd(owner.hire), dnOf(2012, 0, 1))
      : dnOf(2016 + int(0, 9), int(0, 11), 1);
    // 5년 계약을 갱신해 왔다 — 지금 계약 기간
    let cs = startDn;
    while (cs + 5 * 365 < TODAY - int(0, 120)) cs += 5 * 365;
    const ce = cs + 5 * 365 - 1;
    const recent = cs > TODAY - 60;
    const status = recent && chance(0.5) ? 'PREPARING' : chance(0.03) ? 'SUSPENDED' : 'OPERATING';
    franchiseInfos.push({
      orgUnitId: b.id,
      status,
      ownerName: owner?.name ?? personName(),
      ownerPhone: nextPhone(),
      bizNo: `${MORE_BIZ_MARK}${String(++bizNo).padStart(5, '0')}`,
      contractStart: dateOf(cs),
      contractEnd: dateOf(ce),
      franchiseFee: round(int(25, 35) * 1_000_000, 1_000_000),
      feePaidAt: recent && chance(0.4) ? null : dateOf(cs - int(0, 20)),
      deposit: 10_000_000,
      depositPaidAt: recent && chance(0.3) ? null : dateOf(cs - int(0, 20)),
      royalty: round(int(30, 60) * 10_000, 50_000),
      memo:
        ce - TODAY < 90
          ? '재계약 협의 예정'
          : chance(0.2)
            ? one(['상호사용료 CMS 자동이체', '보증금 분할 납부 완료', '권역 조정 이력 있음'])
            : null,
      updatedByUserId: adminUser,
      updatedAt: ts(Math.min(TODAY, cs + int(0, 30)), 11),
    });
  }

  // ════════════════ 넣기 ════════════════
  const chunk = async <T>(rows: T[], fn: (data: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 1000) await fn(rows.slice(i, i + 1000));
  };
  docs.sort((a, b) => +a.submittedAt - +b.submittedAt);
  await prisma.$transaction(
    async (tx) => {
      await chunk(partners, (data) => tx.partner.createMany({ data }));
      if (leadPartner.length)
        await tx.$executeRawUnsafe(
          `UPDATE lead l SET partner_id = u.p::uuid FROM unnest($1::text[], $2::text[]) AS u(i, p)
            WHERE l.id = u.i::uuid AND l.partner_id IS NULL`,
          leadPartner.map((x) => x.id),
          leadPartner.map((x) => x.partnerId),
        );
      await chunk(priceConds, (data) => tx.priceCondition.createMany({ data }));
      await chunk(invoices, (data) => tx.invoice.createMany({ data }));
      await chunk(receipts, (data) => tx.invoiceReceipt.createMany({ data }));
      await chunk(leaveTypesNew, (data) => tx.leaveType.createMany({ data }));
      await chunk(lineTemplates, (data) => tx.approvalLineTemplate.createMany({ data }));
      await chunk(checklistTpl, (data) => tx.hrChecklistTemplate.createMany({ data }));
      await chunk(hrPolicies, (data) => tx.hrPolicy.createMany({ data }));
      await chunk(commissionRules, (data) => tx.commissionRule.createMany({ data }));
      await chunk(histories, (data) => tx.employeeHistory.createMany({ data }));
      await chunk(checklistItems, (data) => tx.employeeChecklistItem.createMany({ data }));
      await chunk(docs, (data) => tx.approvalDoc.createMany({ data }));
      await chunk(steps, (data) => tx.approvalStep.createMany({ data }));
      await chunk(leaveReqs, (data) => tx.leaveRequest.createMany({ data }));
      await chunk(adjustments, (data) => tx.leaveAdjustment.createMany({ data }));
      // 직접 찍은 근태가 있는 날은 그대로 둔다
      await chunk(attendance, (data) =>
        tx.attendanceRecord.createMany({ data, skipDuplicates: true }),
      );
      // 콜 번호는 DB 트리거가 받은 시각 순서대로 붙인다
      await chunk(calls, (data) => tx.csCall.createMany({ data }));
      await chunk(followups, (data) => tx.csFollowup.createMany({ data }));
      await chunk(closures, (data) => tx.moveClosure.createMany({ data }));
      await chunk(crmLeads, (data) => tx.crmLead.createMany({ data }));
      await chunk(crmActs, (data) => tx.crmActivity.createMany({ data }));
      await chunk(campaigns, (data) => tx.campaign.createMany({ data }));
      await chunk(recipients, (data) => tx.campaignRecipient.createMany({ data }));
      await chunk(tasks, (data) => tx.teamTask.createMany({ data }));
      await chunk(taskEvents, (data) => tx.teamTaskEvent.createMany({ data }));
      await chunk(taskComments, (data) => tx.teamTaskComment.createMany({ data }));
      await chunk(notices, (data) => tx.notice.createMany({ data }));
      await chunk(noticeOrgs, (data) => tx.noticeOrgUnit.createMany({ data }));
      await chunk(branchCases, (data) => tx.branchCase.createMany({ data }));
      await chunk(franchiseInfos, (data) => tx.franchiseInfo.createMany({ data }));
      await chunk(notifications, (data) => tx.userNotification.createMany({ data }));
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  const cnt = (xs: { status?: string | null }[], s: string) =>
    xs.filter((x) => x.status === s).length;
  console.log(
    `[demo-history-more] ${ymd(START)} ~ ${ymd(TODAY)} — 거래처 ${partners.length}(제휴 접수 연결 ${leadPartner.length}) · ` +
      `청구 ${skipInvoices ? '건너뜀(운영 쪽 시드가 이미 만듦)' : `${invoices.length}(수금 ${receipts.length})`} · ` +
      `결재 ${docs.length}(결재 중 ${cnt(docs, 'PENDING')}) · 휴가 ${leaveReqs.length} · 연차 조정 ${adjustments.length} · ` +
      `근태 ${attendance.length} · 인사 이력 ${histories.length} · 체크리스트 ${checklistItems.length} · ` +
      `상담 콜 ${calls.length} · 확인콜·해피콜 ${followups.length} · 이사 마감 ${closures.length} · ` +
      `영업 CRM ${crmLeads.length}(기록 ${crmActs.length}) · 캠페인 ${campaigns.length}(수신 ${recipients.length}) · ` +
      `팀 업무 ${tasks.length}(댓글 ${taskComments.length}) · 공지 ${notices.length} · 지점 기록 ${branchCases.length} · ` +
      `가맹 계약 ${franchiseInfos.length} · 알림 ${notifications.length} · 기준정보(휴가 종류 ${leaveTypesNew.length}, ` +
      `결재선 ${lineTemplates.length}, 체크리스트 ${checklistTpl.length}, 수당 ${hrPolicies.length}, 수수료 ${commissionRules.length}, ` +
      `가격 조건 ${priceConds.length}) (${Math.round((Date.now() - t0) / 100) / 10}초)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
