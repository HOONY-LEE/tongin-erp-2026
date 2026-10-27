/**
 * 데모 전국 지점 — 17개 시·도에 지점을 더 두고, 지점마다 접수 → 견적 → 계약 → 결제 → 작업을 채운다.
 * 대시보드 지도(시·도 확대 포함)와 지점별 실적(접수·계약·작업·매출)이 지역마다 다르게 보이게 하려는 것.
 *
 *   pnpm --filter @tongin/api demo:seed:regions
 *
 * seed-demo.ts(그룹·법인)와 seed-demo-cases.ts(상품)를 먼저 돌려야 한다 — 법인·상품을 코드로 찾아 쓴다.
 *
 * 멱등하다 — 지점·직원은 코드·사번으로 upsert, 접수·견적·계약·작업은 고정 번호(RG/EG/CG/WG + 지점순번 + 건순번)로
 * upsert 하고, 결제·견적품목·배정은 그 건의 것만 지우고 다시 넣는다. 다른 데이터는 건드리지 않는다.
 * 건수·금액·단계는 무작위가 아니라 지점 설정에서 결정적으로 나온다(재실행해도 같다).
 *
 * 위치: 지점 주소는 실제 도로명주소(대개 그 시·군·구의 시청·구청 일대)이고, lat/lng 는 그 주소 부근 좌표다.
 * 지점을 조직관리에서 주소 검색으로 다시 저장하면 카카오 지오코딩 좌표로 바뀐다.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_FRANCHISE } from '@tongin/shared';

const prisma = new PrismaClient();

/** 지역 지점 직원은 2020년 입사 */
const HIRE_DATE = new Date('2020-03-02T00:00:00Z');

/** 오늘 기준 상대일 → UTC 자정 Date (DATE 컬럼이 하루 밀리지 않게 — seed-demo-cases.ts와 같은 규칙) */
function day(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

interface BranchSpec {
  code: string;
  name: string;
  sido: string;
  /** 세종처럼 시·군·구가 없으면 null */
  sigungu: string | null;
  zipcode: string;
  /** 도로명 + 건물번호 — 지점 주소이자 이 지역 접수 주소를 만들 때 쓴다 */
  road: string;
  no: number;
  lat: number;
  lng: number;
  /** 접수 건수 */
  leads: number;
  /** 계약까지 간 비율(0~1) — 계약·작업·매출 차이를 만든다 */
  conv: number;
  /** 평균 계약 금액(원) */
  avg: number;
}

// 지점 — 기존 5개(강남·송파·분당·일산·부산)는 seed-demo.ts 가 만든다. 여기서는 나머지 시·도를 채운다.
const BRANCHES: BranchSpec[] = [
  // 서울
  {
    code: 'BR-MP',
    name: '마포점',
    sido: '서울',
    sigungu: '마포구',
    zipcode: '03937',
    road: '월드컵로',
    no: 212,
    lat: 37.5663,
    lng: 126.9019,
    leads: 11,
    conv: 0.55,
    avg: 2_450_000,
  },
  {
    code: 'BR-NW',
    name: '노원점',
    sido: '서울',
    sigungu: '노원구',
    zipcode: '01689',
    road: '노해로',
    no: 437,
    lat: 37.6542,
    lng: 127.0568,
    leads: 8,
    conv: 0.5,
    avg: 2_100_000,
  },
  {
    code: 'BR-GS',
    name: '강서점',
    sido: '서울',
    sigungu: '강서구',
    zipcode: '07658',
    road: '화곡로',
    no: 302,
    lat: 37.5509,
    lng: 126.8495,
    leads: 9,
    conv: 0.45,
    avg: 2_200_000,
  },
  {
    code: 'BR-YD',
    name: '영등포점',
    sido: '서울',
    sigungu: '영등포구',
    zipcode: '07260',
    road: '당산로',
    no: 123,
    lat: 37.5264,
    lng: 126.8962,
    leads: 7,
    conv: 0.6,
    avg: 2_650_000,
  },
  // 경기
  {
    code: 'BR-SW',
    name: '수원점',
    sido: '경기',
    sigungu: '수원시 팔달구',
    zipcode: '16490',
    road: '효원로',
    no: 241,
    lat: 37.2636,
    lng: 127.0286,
    leads: 12,
    conv: 0.5,
    avg: 2_300_000,
  },
  {
    code: 'BR-SJI',
    name: '수지점',
    sido: '경기',
    sigungu: '용인시 수지구',
    zipcode: '16835',
    road: '포은대로',
    no: 435,
    lat: 37.3222,
    lng: 127.0975,
    leads: 9,
    conv: 0.65,
    avg: 2_900_000,
  },
  {
    code: 'BR-HS',
    name: '화성점',
    sido: '경기',
    sigungu: '화성시',
    zipcode: '18310',
    road: '시청로',
    no: 159,
    lat: 37.1995,
    lng: 126.8311,
    leads: 6,
    conv: 0.5,
    avg: 2_400_000,
  },
  {
    code: 'BR-BC',
    name: '부천점',
    sido: '경기',
    sigungu: '부천시',
    zipcode: '14598',
    road: '길주로',
    no: 210,
    lat: 37.5035,
    lng: 126.766,
    leads: 8,
    conv: 0.4,
    avg: 1_950_000,
  },
  {
    code: 'BR-AY',
    name: '안양점',
    sido: '경기',
    sigungu: '안양시 동안구',
    zipcode: '14052',
    road: '시민대로',
    no: 235,
    lat: 37.3943,
    lng: 126.9568,
    leads: 7,
    conv: 0.55,
    avg: 2_250_000,
  },
  {
    code: 'BR-NYJ',
    name: '남양주점',
    sido: '경기',
    sigungu: '남양주시',
    zipcode: '12248',
    road: '경춘로',
    no: 1037,
    lat: 37.636,
    lng: 127.2165,
    leads: 5,
    conv: 0.4,
    avg: 2_050_000,
  },
  {
    code: 'BR-PT',
    name: '평택점',
    sido: '경기',
    sigungu: '평택시',
    zipcode: '17903',
    road: '경기대로',
    no: 245,
    lat: 36.9921,
    lng: 127.1129,
    leads: 6,
    conv: 0.35,
    avg: 1_850_000,
  },
  // 인천
  {
    code: 'BR-IC',
    name: '인천점',
    sido: '인천',
    sigungu: '남동구',
    zipcode: '21554',
    road: '정각로',
    no: 29,
    lat: 37.4563,
    lng: 126.7052,
    leads: 9,
    conv: 0.45,
    avg: 2_150_000,
  },
  {
    code: 'BR-YS',
    name: '연수점',
    sido: '인천',
    sigungu: '연수구',
    zipcode: '21966',
    road: '원인재로',
    no: 115,
    lat: 37.4101,
    lng: 126.6783,
    leads: 6,
    conv: 0.6,
    avg: 2_600_000,
  },
  // 부산
  {
    code: 'BR-YJ',
    name: '부산연제점',
    sido: '부산',
    sigungu: '연제구',
    zipcode: '47545',
    road: '중앙대로',
    no: 1001,
    lat: 35.1798,
    lng: 129.075,
    leads: 8,
    conv: 0.5,
    avg: 2_200_000,
  },
  // 대구
  {
    code: 'BR-DG',
    name: '대구점',
    sido: '대구',
    sigungu: '중구',
    zipcode: '41911',
    road: '공평로',
    no: 88,
    lat: 35.8714,
    lng: 128.6014,
    leads: 7,
    conv: 0.45,
    avg: 2_000_000,
  },
  {
    code: 'BR-SS',
    name: '수성점',
    sido: '대구',
    sigungu: '수성구',
    zipcode: '42091',
    road: '달구벌대로',
    no: 2423,
    lat: 35.8582,
    lng: 128.6306,
    leads: 6,
    conv: 0.65,
    avg: 2_700_000,
  },
  // 광주
  {
    code: 'BR-GJ',
    name: '광주점',
    sido: '광주',
    sigungu: '서구',
    zipcode: '61945',
    road: '내방로',
    no: 111,
    lat: 35.1601,
    lng: 126.8514,
    leads: 6,
    conv: 0.5,
    avg: 1_900_000,
  },
  // 대전
  {
    code: 'BR-DJ',
    name: '대전점',
    sido: '대전',
    sigungu: '서구',
    zipcode: '35242',
    road: '둔산로',
    no: 100,
    lat: 36.3504,
    lng: 127.3845,
    leads: 8,
    conv: 0.55,
    avg: 2_150_000,
  },
  // 울산
  {
    code: 'BR-US',
    name: '울산점',
    sido: '울산',
    sigungu: '남구',
    zipcode: '44675',
    road: '중앙로',
    no: 201,
    lat: 35.5396,
    lng: 129.3115,
    leads: 5,
    conv: 0.6,
    avg: 2_350_000,
  },
  // 세종
  {
    code: 'BR-SEJ',
    name: '세종점',
    sido: '세종',
    sigungu: null,
    zipcode: '30151',
    road: '한누리대로',
    no: 2130,
    lat: 36.48,
    lng: 127.289,
    leads: 4,
    conv: 0.5,
    avg: 2_500_000,
  },
  // 강원
  {
    code: 'BR-CC',
    name: '춘천점',
    sido: '강원',
    sigungu: '춘천시',
    zipcode: '24266',
    road: '시청길',
    no: 11,
    lat: 37.8813,
    lng: 127.7298,
    leads: 4,
    conv: 0.5,
    avg: 1_800_000,
  },
  {
    code: 'BR-WJ',
    name: '원주점',
    sido: '강원',
    sigungu: '원주시',
    zipcode: '26411',
    road: '시청로',
    no: 1,
    lat: 37.3422,
    lng: 127.9202,
    leads: 5,
    conv: 0.4,
    avg: 1_900_000,
  },
  // 충북
  {
    code: 'BR-CJ',
    name: '청주점',
    sido: '충북',
    sigungu: '청주시 상당구',
    zipcode: '28542',
    road: '상당로',
    no: 155,
    lat: 36.6424,
    lng: 127.489,
    leads: 6,
    conv: 0.5,
    avg: 1_950_000,
  },
  // 충남
  {
    code: 'BR-CA',
    name: '천안점',
    sido: '충남',
    sigungu: '천안시 서북구',
    zipcode: '31151',
    road: '번영로',
    no: 156,
    lat: 36.8151,
    lng: 127.1139,
    leads: 7,
    conv: 0.45,
    avg: 2_000_000,
  },
  // 전북
  {
    code: 'BR-JJ',
    name: '전주점',
    sido: '전북',
    sigungu: '전주시 완산구',
    zipcode: '55032',
    road: '노송광장로',
    no: 10,
    lat: 35.8242,
    lng: 127.148,
    leads: 5,
    conv: 0.4,
    avg: 1_750_000,
  },
  // 전남
  {
    code: 'BR-SC',
    name: '순천점',
    sido: '전남',
    sigungu: '순천시',
    zipcode: '57959',
    road: '장명로',
    no: 30,
    lat: 34.9506,
    lng: 127.4872,
    leads: 4,
    conv: 0.5,
    avg: 1_700_000,
  },
  {
    code: 'BR-YSU',
    name: '여수점',
    sido: '전남',
    sigungu: '여수시',
    zipcode: '59631',
    road: '시청로',
    no: 1,
    lat: 34.7604,
    lng: 127.6622,
    leads: 3,
    conv: 0.35,
    avg: 1_650_000,
  },
  // 경북
  {
    code: 'BR-PH',
    name: '포항점',
    sido: '경북',
    sigungu: '포항시 남구',
    zipcode: '37750',
    road: '시청로',
    no: 1,
    lat: 36.019,
    lng: 129.3435,
    leads: 5,
    conv: 0.5,
    avg: 1_900_000,
  },
  {
    code: 'BR-GMI',
    name: '구미점',
    sido: '경북',
    sigungu: '구미시',
    zipcode: '39281',
    road: '송정대로',
    no: 55,
    lat: 36.1195,
    lng: 128.3446,
    leads: 4,
    conv: 0.45,
    avg: 1_850_000,
  },
  // 경남
  {
    code: 'BR-CW',
    name: '창원점',
    sido: '경남',
    sigungu: '창원시 의창구',
    zipcode: '51430',
    road: '중앙대로',
    no: 151,
    lat: 35.228,
    lng: 128.6811,
    leads: 7,
    conv: 0.55,
    avg: 2_050_000,
  },
  {
    code: 'BR-GH',
    name: '김해점',
    sido: '경남',
    sigungu: '김해시',
    zipcode: '50993',
    road: '김해대로',
    no: 2401,
    lat: 35.2285,
    lng: 128.8894,
    leads: 5,
    conv: 0.4,
    avg: 1_850_000,
  },
  // 제주
  {
    code: 'BR-JE',
    name: '제주점',
    sido: '제주',
    sigungu: '제주시',
    zipcode: '63122',
    road: '문연로',
    no: 6,
    lat: 33.489,
    lng: 126.4983,
    leads: 5,
    conv: 0.6,
    avg: 2_800_000,
  },
  {
    code: 'BR-SGP',
    name: '서귀포점',
    sido: '제주',
    sigungu: '서귀포시',
    zipcode: '63592',
    road: '중앙로',
    no: 105,
    lat: 33.2541,
    lng: 126.56,
    leads: 3,
    conv: 0.35,
    avg: 2_400_000,
  },
];

const SURNAMES = [
  '김',
  '이',
  '박',
  '최',
  '정',
  '강',
  '조',
  '윤',
  '장',
  '임',
  '한',
  '오',
  '서',
  '신',
];
const GIVEN = [
  '민준',
  '서연',
  '도윤',
  '하은',
  '시우',
  '지유',
  '예준',
  '수아',
  '주원',
  '지아',
  '건우',
  '서윤',
  '현우',
  '채원',
  '지호',
  '다은',
  '유찬',
  '소율',
];
const personName = (n: number) => SURNAMES[n % SURNAMES.length] + GIVEN[(n * 7 + 3) % GIVEN.length];

const SOURCES = ['HOMEPAGE', 'NAVER', 'PHONE', 'INSTAGRAM', 'AIBOT', 'WALK_IN'];
const PRODUCTS = ['P-HOME', 'P-HOME', 'P-HALF', 'P-HOME', 'P-STORE', 'P-HALF', 'P-OFFICE'];
/** 견적 품목 — 방 틀(room_template)·이사물품(cbm_item) 기본값과 이름을 맞춘다(seed-demo-cases.ts와 같은 묶음) */
const ITEMS = [
  { preset: '침대', room: 'MASTER', cbm: 1.8 },
  { preset: '장롱', room: 'MASTER', cbm: 1.5 },
  { preset: '소파', room: 'LIVING', cbm: 1.6 },
  { preset: '냉장고', room: 'KITCHEN', cbm: 1.2 },
  { preset: '식탁/의자', room: 'KITCHEN', cbm: 0.9 },
  { preset: '세탁기/건조기', room: 'BALCONY_BACK', cbm: 0.6 },
  { preset: '탁자/책상', room: 'BED1', cbm: 0.7 },
];

type Stage = 'INTAKE' | 'QUOTED' | 'CONTRACTED' | 'WORKING' | 'DONE';
const STAGE_LEAD_STATUS: Record<Stage, string> = {
  INTAKE: 'CONSULT_TOSS',
  QUOTED: 'QUOTED',
  CONTRACTED: 'WORK_TOSS', // 계약 후 작업일·배정까지 잡힌 예정 건
  WORKING: 'IN_PROGRESS',
  DONE: 'DONE',
};

/**
 * 지점 하나의 건별 단계 — 계약 비율(conv)만큼은 계약 이상, 나머지는 접수·견적.
 * 계약 이상은 완료 > 작업 > 계약 순으로, 나머지는 견적 > 접수 순으로 나눈다.
 */
function stagesFor(b: BranchSpec): Stage[] {
  const signed = Math.max(1, Math.round(b.leads * b.conv));
  const done = Math.ceil(signed * 0.5);
  const working = Math.ceil((signed - done) * 0.5);
  const contracted = signed - done - working;
  const open = b.leads - signed;
  const quoted = Math.ceil(open * 0.5);
  return [
    ...Array<Stage>(done).fill('DONE'),
    ...Array<Stage>(working).fill('WORKING'),
    ...Array<Stage>(contracted).fill('CONTRACTED'),
    ...Array<Stage>(quoted).fill('QUOTED'),
    ...Array<Stage>(open - quoted).fill('INTAKE'),
  ];
}

/**
 * 작업(예정)일 — 완료는 지난 석 달(8월~)에 흩고, 작업중은 오늘 전후,
 * 계약된 건은 앞으로 두 달 반(12월 말까지) — 달력에 달마다 이사 일정이 보이게.
 */
function scheduleFor(stage: Stage, n: number): number {
  if (stage === 'DONE') return -(3 + ((n * 11) % 80));
  if (stage === 'WORKING') return (n % 4) - 1;
  if (stage === 'CONTRACTED') return 6 + ((n * 5) % 66);
  return 8 + ((n * 3) % 20);
}

async function main() {
  const company = await prisma.orgUnit.findUnique({ where: { code: 'CO-MOVING' } });
  if (!company) {
    console.error(
      '법인(CO-MOVING)이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed` 를 돌려야 한다',
    );
    process.exit(1);
  }
  const products = await prisma.product.findMany({ where: { code: { startsWith: 'P-' } } });
  const productByCode = new Map(products.map((p) => [p.code, p.id]));
  if (!productByCode.get('P-HOME')) {
    console.error('상품이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed:cases` 를 돌려야 한다');
    process.exit(1);
  }
  const cbmRows = await prisma.cbmItem.findMany({
    where: { name: { in: ITEMS.map((i) => i.preset) } },
  });
  const itemByName = new Map(cbmRows.map((r) => [r.name, r]));
  const rooms = await prisma.roomTemplate.findMany({ orderBy: { sortOrder: 'asc' } });

  const franchiseRole = await prisma.role.findUnique({ where: { code: ROLE_FRANCHISE } });
  if (!franchiseRole)
    console.warn('가맹점 역할이 없다 — 지점 계정은 건너뛴다(API를 한 번 띄운 뒤 다시)');
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD ?? 'tongin1234', 10);

  let leadTotal = 0;
  const stageCount: Record<string, number> = {};
  for (const [bi, b] of BRANCHES.entries()) {
    const bno = String(bi + 1).padStart(2, '0');
    const addr = `${b.sido}${b.sigungu ? ` ${b.sigungu}` : ''} ${b.road} ${b.no}`;

    // ── 지점 (좌표는 처음 만들 때만 넣는다 — 조직관리에서 고친 주소를 덮어쓰지 않게) ──
    const branch = await prisma.orgUnit.upsert({
      where: { code: b.code },
      update: { name: b.name, parentId: company.id },
      create: {
        code: b.code,
        name: b.name,
        type: 'BRANCH',
        parentId: company.id,
        zipcode: b.zipcode,
        addr,
        sido: b.sido,
        sigungu: b.sigungu,
        lat: b.lat,
        lng: b.lng,
      },
    });

    // ── 직원 2명: 지점장(…1)·현장(…3) — 사번 끝자리로 견적/현장 담당을 고르는 규칙과 맞춘다 ──
    const staff = [];
    for (const [ri, role] of (['지점장', '현장'] as const).entries()) {
      // 사번 = 입사연도(2020) + 일련번호 4자리 — 끝자리(1 지점장·3 현장)는 담당을 고르는 규칙과 맞춘다
      const empNo = `20200${bno}${ri === 0 ? 1 : 3}`;
      // 직책: 지점장→지점장, 현장→현장팀장(관리자가 바꾼 직책은 덮어쓰지 않는다)
      const pos = await prisma.position.upsert({
        where: { name: role === '지점장' ? '지점장' : '현장팀장' },
        update: {},
        create: { name: role === '지점장' ? '지점장' : '현장팀장' },
      });
      const e = await prisma.employee.upsert({
        where: { empNo },
        update: { orgUnitId: branch.id, hireDate: HIRE_DATE },
        create: {
          empNo,
          hireDate: HIRE_DATE,
          name: personName(bi * 2 + ri + 40),
          phone: `010-23${bno}-00${ri + 1}${ri === 0 ? 1 : 3}`,
          orgUnitId: branch.id,
          positionId: pos.id,
        },
      });
      if (!e.positionId) {
        await prisma.employee.update({ where: { id: e.id }, data: { positionId: pos.id } });
      }
      staff.push({ ...e, role });
    }
    const [manager, crew] = staff;

    // ── 지점 계정 = 지점장 직원 계정(소속 지점 범위). 아이디는 지점 코드에서(예: BR-MP → mp.manager) ──
    if (franchiseRole) {
      const loginId = `${b.code.replace(/^BR-/, '').toLowerCase()}.manager`;
      const user = await prisma.appUser.upsert({
        where: { loginId },
        update: { employeeId: manager.id, isActive: true },
        create: { loginId, passwordHash, employeeId: manager.id, principalType: 'HUMAN' },
      });
      const has = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: franchiseRole.id },
      });
      if (!has) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: franchiseRole.id,
            orgScopeId: branch.id,
            dataScope: 'ORG',
          },
        });
      }
    }

    // ── 거래 ──
    const stages = stagesFor(b);
    for (const [ci, stage] of stages.entries()) {
      const n = bi * 31 + ci; // 지점·건마다 다른 결정적 시드
      const seq = `${bno}${String(ci + 1).padStart(2, '0')}`;
      const phone = `010-6${String(bi + 1).padStart(3, '0')}-${String(ci + 1).padStart(4, '0')}`;
      const existing = await prisma.customer.findFirst({ where: { phonePrimary: phone } });
      const customer =
        existing ??
        (await prisma.customer.create({
          data: {
            name: personName(n),
            phonePrimary: phone,
            ownerOrgId: branch.id,
            grade: 'NORMAL',
          },
        }));

      // 대부분 같은 지역 안에서, 셋 중 하나는 다른 지점 지역으로 이사
      const dest = ci % 3 === 2 ? BRANCHES[(bi + 1 + (ci % 5)) % BRANCHES.length] : b;
      const a = {
        fromZipcode: b.zipcode,
        fromAddr: `${b.sido}${b.sigungu ? ` ${b.sigungu}` : ''} ${b.road} ${b.no + 12 + ci * 7}`,
        fromAddrDetail: `${100 + ((n * 3) % 9) * 100 + (ci % 12) + 1}호`,
        fromSido: b.sido,
        fromSigungu: b.sigungu ?? undefined,
        toZipcode: dest.zipcode,
        toAddr: `${dest.sido}${dest.sigungu ? ` ${dest.sigungu}` : ''} ${dest.road} ${dest.no + 4 + ci * 5}`,
        toAddrDetail: `${101 + (n % 8)}동 ${300 + ((n * 7) % 15) * 100 + 2}호`,
        toSido: dest.sido,
        toSigungu: dest.sigungu ?? undefined,
      };
      // 금액: 지점 평균 ±35% (결정적), 만원 단위
      const amount = Math.round((b.avg * (0.65 + ((n * 37) % 71) / 100)) / 10_000) * 10_000;
      const schedule = scheduleFor(stage, n);
      // 이사일이 멀리 있어도 접수·방문견적·계약은 이미 지난 일이다(미래 접수일이 생기지 않게)
      const receivedAt =
        stage === 'INTAKE' ? day(-(ci % 6)) : day(Math.min(schedule - 14, -(12 + (n % 9))));
      const timeline = {
        createdAt: receivedAt,
        visitDate: stage === 'INTAKE' ? undefined : day(Math.min(schedule - 10, -(6 + (n % 5)))),
      };

      const leadNo = `RG${seq}`;
      const lead = await prisma.lead.upsert({
        where: { leadNo },
        update: {
          status: STAGE_LEAD_STATUS[stage],
          orgUnitId: branch.id,
          customerId: customer.id,
          moveDate: day(schedule),
          ...timeline,
          ...a,
        },
        create: {
          leadNo,
          orgUnitId: branch.id,
          customerId: customer.id,
          ownerEmpId: manager.id,
          source: SOURCES[n % SOURCES.length],
          serviceLine: 'MOVING',
          status: STAGE_LEAD_STATUS[stage],
          moveDate: day(schedule),
          ...timeline,
          ...a,
        },
      });
      leadTotal++;
      stageCount[stage] = (stageCount[stage] ?? 0) + 1;
      if (stage === 'INTAKE') continue;

      // 견적 + 품목
      const items = Array.from(
        { length: 3 + (n % 3) },
        (_, i) => ITEMS[(n + i * 2) % ITEMS.length],
      );
      const totalCbm = items.reduce((s, it) => s + it.cbm, 0);
      const estimateNo = `EG${seq}`;
      const estimate = await prisma.estimate.upsert({
        where: { estimateNo },
        update: { status: 'QUOTED', totalAmount: amount, totalCbm },
        create: {
          estimateNo,
          leadId: lead.id,
          customerId: customer.id,
          orgUnitId: branch.id,
          productId:
            productByCode.get(PRODUCTS[n % PRODUCTS.length]) ?? productByCode.get('P-HOME')!,
          estimatorEmpId: manager.id,
          status: 'QUOTED',
          totalCbm,
          baseAmount: Math.round(amount * 0.85),
          totalAmount: amount,
          fromPyeong: 18 + (n % 5) * 6,
          fromAccess: n % 4 === 0 ? 'STAIRS' : 'ELEVATOR',
          toPyeong: 20 + (n % 4) * 7,
          toAccess: n % 5 === 0 ? 'LADDER' : 'ELEVATOR',
          workInstructions: '오전 8시 30분 시작. 엘리베이터 사용 협의 완료.',
          ...a,
        },
      });
      await prisma.estimateLine.deleteMany({ where: { estimateId: estimate.id } });
      await prisma.estimateZone.deleteMany({ where: { estimateId: estimate.id } });
      const zoneByRoom = new Map<string, string>();
      for (const room of rooms.filter((r) => items.some((it) => it.room === r.code))) {
        const z = await prisma.estimateZone.create({
          data: {
            estimateId: estimate.id,
            name: room.name,
            roomKey: room.code,
            sortOrder: rooms.indexOf(room),
          },
        });
        zoneByRoom.set(room.code, z.id);
      }
      for (const it of items) {
        const row = itemByName.get(it.preset);
        await prisma.estimateLine.create({
          data: {
            estimateId: estimate.id,
            zoneId: zoneByRoom.get(it.room),
            cbmItemId: row?.id,
            itemName: it.preset,
            itemNameEng: row?.nameEng,
            qty: 1,
            cbm: new Prisma.Decimal(it.cbm),
            handling: 'CARRY',
          },
        });
      }
      if (stage === 'QUOTED') continue;

      // 계약 + 결제(계약금 입금, 잔금은 완료 건만 입금)
      const contractNo = `CG${seq}`;
      const deposit = Math.round(amount * 0.1);
      const balance = amount - deposit;
      const signedOn = day(Math.min(schedule - 7, -(1 + (n % 4))));
      const contract = await prisma.contract.upsert({
        where: { contractNo },
        update: {
          status: 'SIGNED',
          totalAmount: amount,
          depositAmount: deposit,
          balanceAmount: balance,
          contractDate: signedOn,
          signedAt: signedOn,
        },
        create: {
          contractNo,
          estimateId: estimate.id,
          leadId: lead.id,
          customerId: customer.id,
          orgUnitId: branch.id,
          contractDate: signedOn,
          totalAmount: amount,
          depositRatio: 0.1,
          depositAmount: deposit,
          balanceAmount: balance,
          status: 'SIGNED',
          signedAt: signedOn,
          esignRef: `demo_sign_rg_${seq}`,
        },
      });
      await prisma.payment.deleteMany({ where: { contractId: contract.id } });
      await prisma.payment.create({
        data: {
          contractId: contract.id,
          kind: 'DEPOSIT',
          amount: deposit,
          method: 'VIRTUAL_ACCOUNT',
          status: 'PAID',
          paidAt: signedOn,
          virtualAccount: `가상은행 VG1${seq}`,
        },
      });
      await prisma.payment.create({
        data: {
          contractId: contract.id,
          kind: 'BALANCE',
          amount: balance,
          // 셋 중 하나는 카드로 잔금 — 카드는 가상계좌가 없다
          method: n % 3 === 0 ? 'CARD' : 'VIRTUAL_ACCOUNT',
          status: stage === 'DONE' ? 'PAID' : 'PENDING',
          paidAt: stage === 'DONE' ? day(schedule) : null,
          virtualAccount: n % 3 === 0 ? null : `가상은행 VG2${seq}`,
        },
      });
      // 계약된 건은 작업일이 잡혀 배정까지 된 상태(작업토스)로 — 달력의 예정 이사

      // 작업오더 + 배정(현장 직원·차량)
      const wo = await prisma.workOrder.upsert({
        where: { contractId: contract.id },
        update: {
          status: stage === 'DONE' ? 'DONE' : schedule > 0 ? 'ASSIGNED' : 'IN_PROGRESS',
          scheduledDate: day(schedule),
        },
        create: {
          workNo: `WG${seq}`,
          contractId: contract.id,
          leadId: lead.id,
          orgUnitId: branch.id,
          scheduledDate: day(schedule),
          status: stage === 'DONE' ? 'DONE' : schedule > 0 ? 'ASSIGNED' : 'IN_PROGRESS',
        },
      });
      await prisma.workAssignment.deleteMany({ where: { workOrderId: wo.id } });
      await prisma.workAssignment.create({
        data: {
          workOrderId: wo.id,
          employeeId: crew.id,
          resourceType: 'CREW',
          scheduledAt: day(schedule),
        },
      });
      await prisma.workAssignment.create({
        data: {
          workOrderId: wo.id,
          resourceType: 'VEHICLE',
          resourceRef: `${amount > 2_500_000 ? '5톤' : '2.5톤'} 트럭 ${30 + (n % 60)}바${4000 + n}`,
          scheduledAt: day(schedule),
        },
      });
    }
  }

  console.log(
    `지점 ${BRANCHES.length}개 (17개 시·도) · 직원 ${BRANCHES.length * 2}명 · 접수 ${leadTotal}건`,
  );
  for (const s of ['INTAKE', 'QUOTED', 'CONTRACTED', 'WORKING', 'DONE'] as Stage[]) {
    console.log(`  ${s.padEnd(11)} ${stageCount[s] ?? 0}건`);
  }
  const [branches, leads, cons, wos, pays] = await Promise.all([
    prisma.orgUnit.count({ where: { type: 'BRANCH' } }),
    prisma.lead.count(),
    prisma.contract.count(),
    prisma.workOrder.count(),
    prisma.payment.count(),
  ]);
  console.log(
    `\n전체: 지점 ${branches} / 접수 ${leads} / 계약 ${cons} / 작업 ${wos} / 결제 ${pays}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
