/**
 * 시드 — 실제 지점에 접수 100건을 단계별로 흩어 놓는다(접수 → 견적 → 계약 → 입금 → 작업).
 *
 *   pnpm --filter @tongin/api demo:seed:leads
 *
 * 화면마다 필요한 단계까지 만든다:
 *  - 접수 목록: 100건 전부(접수·상담·견적완료·계약·작업토스·작업중·완료·취소)
 *  - 입금확인: 견적서를 보낸 건(견적 QUOTED) — 계약 전 / 계약서 발송·계약금 대기 / 계약금 입금 / 잔금까지 완료
 *  - 캘린더(조직 일정): 작업오더 — 앞으로 할 작업(작업토스)·오늘 전후(작업중)·지난 작업(완료)
 *
 * seed-demo.ts(지점·직원)와 seed-demo-catalog.ts(상품·이사물품)를 먼저 돌려야 한다.
 * 고객은 가상 인물이고 전화번호는 010-0000-NNNN(실제로 문자가 가지 않는 번호대)이다.
 * 날짜는 오늘 기준 상대일 — 언제 돌려도 최근 데이터가 된다.
 * 멱등하다 — 번호(RS/ES/CS/WS + 순번)로 upsert 하고, 견적품목·결제·배정은 그 건의 것만 지우고 다시 넣는다.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TOTAL = 100;
/** 접수를 나눠 줄 지점 수 */
const BRANCH_COUNT = 30;
/** 로그인 화면(Login.tsx) 데모 지점장 — 이 지점들에는 꼭 접수가 들어가게 */
const DEMO_LOGINS = ['dongseok_shin', 'inseok_choi', 'keunsung_choi', 'dongchul_kim', 'bongki_yoo'];

/** 오늘 기준 상대일 → UTC 자정(DATE 컬럼이 하루 밀리지 않게 — 다른 시드와 같은 규칙) */
function day(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
/** 오늘 기준 상대일 + 시각(접수 시각처럼 시간이 있는 값) */
function at(offset: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, (offset * 7) % 60, 0, 0);
  return d;
}

// ── 단계 ─────────────────────────────────────────────
type Stage =
  | 'RECEIVED'
  | 'CONSULT_ASSIGNED'
  | 'CONSULT_TOSS'
  | 'QUOTED' // 견적서 발송, 계약 전
  | 'SENT' // 계약서 발송, 계약금 대기(입금확인 '입금 대기')
  | 'CONTRACTED' // 계약금 입금, 작업오더 전
  | 'WORK_TOSS' // 작업오더 배정(앞으로)
  | 'IN_PROGRESS' // 오늘 전후 작업
  | 'DONE' // 지난 작업, 잔금까지 입금
  | 'CANCELED';

/** 100건 단계 분포 — 퍼널이 위에서 아래로 자연스럽게 줄어든다 */
const PLAN: [Stage, number][] = [
  ['RECEIVED', 10],
  ['CONSULT_ASSIGNED', 8],
  ['CONSULT_TOSS', 7],
  ['QUOTED', 15],
  ['SENT', 10],
  ['CONTRACTED', 5],
  ['WORK_TOSS', 15],
  ['IN_PROGRESS', 5],
  ['DONE', 20],
  ['CANCELED', 5],
];

const LEAD_STATUS: Record<Stage, string> = {
  RECEIVED: 'RECEIVED',
  CONSULT_ASSIGNED: 'CONSULT_ASSIGNED',
  CONSULT_TOSS: 'CONSULT_TOSS',
  QUOTED: 'QUOTED',
  SENT: 'QUOTED',
  CONTRACTED: 'CONTRACTED',
  WORK_TOSS: 'WORK_TOSS',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELED: 'CANCELED',
};

/** 이사일(작업일) — 앞으로 / 오늘 전후 / 지난 날. 단계 안에서 순번(k)으로 퍼뜨린다 */
function moveOffset(stage: Stage, k: number): number {
  switch (stage) {
    case 'IN_PROGRESS':
      return [-1, 0, 0, 1, 0][k % 5];
    case 'DONE':
      return -(3 + k * 3); // -3 ~ -60
    case 'WORK_TOSS':
      return 2 + k * 2; // 2 ~ 30일 뒤
    case 'CONTRACTED':
      return 12 + k * 4;
    case 'SENT':
    case 'QUOTED':
      return 10 + k * 3;
    case 'CANCELED':
      return 5 + k * 4;
    default:
      return 14 + k * 3; // 접수·상담 단계 — 아직 먼 이사
  }
}
/** 접수일 — 이사일보다 2~4주 앞(지난 날짜로) */
const receivedOffset = (stage: Stage, move: number, k: number) =>
  ['RECEIVED', 'CONSULT_ASSIGNED', 'CONSULT_TOSS'].includes(stage)
    ? -(k % 6)
    : Math.min(-1, move - 14 - (k % 3) * 5);

// ── 가상 고객 ────────────────────────────────────────
const FAMILY = [
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
  '권',
  '황',
  '안',
  '송',
  '류',
  '홍',
];
const GIVEN = [
  '민준',
  '서연',
  '도윤',
  '하은',
  '지호',
  '수아',
  '예준',
  '지유',
  '시우',
  '서윤',
  '주원',
  '하린',
  '지훈',
  '채원',
  '건우',
  '다은',
  '우진',
  '예린',
  '현우',
  '소율',
  '태윤',
  '유나',
  '성민',
  '가은',
  '준혁',
];
const customerName = (i: number) =>
  FAMILY[(i * 7) % FAMILY.length] + GIVEN[(i * 11) % GIVEN.length];
const customerPhone = (i: number) => `010-0000-${String(1000 + i).padStart(4, '0')}`;

// ── 지역별 주소 — 지점 이름의 지역어로 고른다(없으면 서울 강남) ──
type Region = { sido: string; sigungu: string; zip: string; roads: string[] };
const R = (sido: string, sigungu: string, zip: string, ...roads: string[]): Region => ({
  sido,
  sigungu,
  zip,
  roads,
});
const REGIONS: [RegExp, Region][] = [
  [
    /강남|압구정|청담|일원|논현|신사|도곡|대치|개포|삼성|역삼|수서|자곡|VIP/,
    R('서울', '강남구', '06', '테헤란로', '논현로', '선릉로', '도산대로', '개포로'),
  ],
  [
    /서초|양재|반포|잠원|우면|내곡|방배/,
    R('서울', '서초구', '06', '서초대로', '반포대로', '사평대로', '양재대로'),
  ],
  [
    /송파|잠실|가락|석촌|방이|풍납|신천|거여|마천|위례/,
    R('서울', '송파구', '05', '올림픽로', '송파대로', '백제고분로', '위례광장로'),
  ],
  [/강동/, R('서울', '강동구', '05', '천호대로', '고덕로', '양재대로')],
  [/마포|공덕/, R('서울', '마포구', '04', '마포대로', '월드컵북로', '독막로')],
  [/목동|이촌|용산/, R('서울', '용산구', '04', '한강대로', '이촌로', '녹사평대로')],
  [/성동/, R('서울', '성동구', '04', '왕십리로', '성수일로')],
  [/광진/, R('서울', '광진구', '05', '능동로', '광나루로')],
  [/동작/, R('서울', '동작구', '07', '상도로', '노량진로')],
  [/영등포|여의도/, R('서울', '영등포구', '07', '여의대로', '국제금융로', '영등포로')],
  [/은평/, R('서울', '은평구', '03', '진관2로', '통일로')],
  [/방학|노원|상계/, R('서울', '노원구', '01', '동일로', '상계로')],
  [/성북|길음/, R('서울', '성북구', '02', '삼양로', '동소문로')],
  [/중구|명동/, R('서울', '중구', '04', '퇴계로', '을지로')],
  [/강서|마곡/, R('서울', '강서구', '07', '마곡중앙로', '공항대로')],
  [/양주|미아/, R('서울', '강북구', '01', '도봉로', '솔매로')],
  [
    /분당|판교|정자|수내|서현|이매|야탑|구미/,
    R('경기', '성남시 분당구', '13', '판교역로', '정자일로', '황새울로', '분당로'),
  ],
  [/수원|영통|권선|광교/, R('경기', '수원시 영통구', '16', '광교중앙로', '영통로', '봉영로')],
  [
    /용인|상현|기흥|수지|동천|죽전|보정/,
    R('경기', '용인시 수지구', '16', '포은대로', '수지로', '죽전로'),
  ],
  [/일산|고양|덕양/, R('경기', '고양시 일산동구', '10', '호수로', '중앙로', '정발산로')],
  [/파주/, R('경기', '파주시', '10', '회동길', '금정로')],
  [/김포/, R('경기', '김포시', '10', '김포한강4로', '사우중로')],
  [/의정부/, R('경기', '의정부시', '11', '시민로', '평화로')],
  [/남양주/, R('경기', '남양주시', '12', '경춘로', '다산중앙로')],
  [/하남/, R('경기', '하남시', '12', '미사강변대로', '신장로')],
  [/안양/, R('경기', '안양시 동안구', '14', '시민대로', '평촌대로')],
  [/부천|광명/, R('경기', '부천시', '14', '길주로', '중동로')],
  [/평택/, R('경기', '평택시', '17', '평택로', '중앙로')],
  [/동탄/, R('경기', '화성시', '18', '동탄대로', '동탄순환대로')],
  [/오산/, R('경기', '오산시', '18', '오산로', '성호대로')],
  [/과천/, R('경기', '과천시', '13', '중앙로', '별양로')],
  [/경기광주/, R('경기', '광주시', '12', '경충대로', '역동로')],
  [/인천|송도|백령/, R('인천', '연수구', '21', '컨벤시아대로', '송도과학로')],
  [/대전|유성|둔산/, R('대전', '유성구', '34', '대학로', '한밭대로')],
  [/대구|달서|수성/, R('대구', '수성구', '42', '달구벌대로', '동대구로')],
  [/부산|해운대|동래/, R('부산', '해운대구', '48', '해운대로', '센텀중앙로')],
  [/광주|광산/, R('광주', '광산구', '62', '임방울대로', '수완로')],
  [/전주|덕진/, R('전북', '전주시 덕진구', '54', '백제대로', '기린대로')],
  [/청주|오창|청원/, R('충북', '청주시 흥덕구', '28', '직지대로', '가로수로')],
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
const regionOf = (branchName: string) =>
  REGIONS.find(([re]) => re.test(branchName))?.[1] ?? REGIONS[0][1];

function address(r: Region, seed: number): [string, string, string, string, string] {
  const road = r.roads[seed % r.roads.length];
  const zip = `${r.zip}${String(100 + ((seed * 37) % 899)).padStart(3, '0')}`;
  const addr = `${r.sido} ${r.sigungu} ${road} ${10 + ((seed * 53) % 290)}`;
  const detail = `${101 + (seed % 9)}동 ${2 + (seed % 18)}0${1 + (seed % 4)}호`;
  return [zip, addr, detail, r.sido, r.sigungu.split(' ')[0]];
}

// ── 견적 물품(이사물품 이름 = 방 틀의 물품) ──
const ITEMS: { preset: string; cbm: number; room: string; memo: string }[] = [
  { preset: '침대', cbm: 1.8, room: 'MASTER', memo: '퀸 사이즈' },
  { preset: '장롱', cbm: 1.5, room: 'MASTER', memo: '3자' },
  { preset: '소파', cbm: 1.6, room: 'LIVING', memo: '3인용' },
  { preset: '냉장고', cbm: 1.2, room: 'KITCHEN', memo: '양문형' },
  { preset: '식탁/의자', cbm: 0.9, room: 'KITCHEN', memo: '4인용' },
  { preset: '세탁기/건조기', cbm: 0.6, room: 'BALCONY_BACK', memo: '드럼' },
  { preset: '탁자/책상', cbm: 0.7, room: 'BED1', memo: '' },
  { preset: '침대', cbm: 1.2, room: 'BED1', memo: '싱글' },
];
const PRODUCTS = ['P-HOME', 'P-HOME', 'P-HALF', 'P-HOME', 'P-OFFICE', 'P-HALF', 'P-STORE'];
const SOURCES = [
  'PHONE',
  'HOMEPAGE',
  'NAVER',
  'AIBOT',
  'PHONE',
  'INSTAGRAM',
  'PARTNER',
  'WALK_IN',
  'SYSTEM',
];

async function main() {
  // ── 참조 ── 계정이 켜진 지점장이 있는 지점에만 넣는다
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
  // 로그인 화면 데모 지점장의 지점을 앞에 두고, 지점 BRANCH_COUNT곳에 몰아 지점별 화면에도 건수가 보이게 한다
  const focus = (m: (typeof managers)[number]) =>
    m.appUsers.some((u) => DEMO_LOGINS.includes(u.loginId)) ? 0 : 1;
  const branches = [
    ...new Map(
      [...managers].sort((a, b) => focus(a) - focus(b)).map((m) => [m.orgUnitId, m]),
    ).values(),
  ].slice(0, BRANCH_COUNT);
  if (!branches.length) {
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
  const cbmByName = new Map(
    (
      await prisma.cbmItem.findMany({
        where: { name: { in: [...new Set(ITEMS.map((i) => i.preset))] } },
        select: { id: true, name: true, nameEng: true },
      })
    ).map((c) => [c.name, c]),
  );
  const rooms = await prisma.roomTemplate.findMany({ orderBy: { sortOrder: 'asc' } });

  // 단계 목록 펼치기 — 단계가 지점마다 고르게 섞이도록 순번 i로 지점을 돌린다
  const stages: { stage: Stage; k: number }[] = PLAN.flatMap(([stage, n]) =>
    Array.from({ length: n }, (_, k) => ({ stage, k })),
  );

  const counts: Record<string, number> = {};
  for (const [idx, { stage, k }] of stages.entries()) {
    const i = idx + 1;
    const b = branches[(idx * 7) % branches.length];
    const orgUnitId = b.orgUnitId;
    const region = regionOf(b.orgUnit.name);
    const productCode = PRODUCTS[idx % PRODUCTS.length];
    const serviceLine = productCode === 'P-OFFICE' ? 'B2B_MOVING' : 'MOVING';
    const amount = 1_200_000 + ((idx * 173_000) % 2_800_000); // 120만 ~ 400만
    const move = moveOffset(stage, k);
    const received = receivedOffset(stage, move, k);

    // 고객(전화번호로 식별)
    const phone = customerPhone(i);
    const customer =
      (await prisma.customer.findFirst({ where: { phonePrimary: phone } })) ??
      (await prisma.customer.create({
        data: {
          name: customerName(i),
          phonePrimary: phone,
          ownerOrgId: orgUnitId,
          grade: 'NORMAL',
        },
      }));

    const [fz, fa, fd, fsido, fsgg] = address(region, i);
    // 도착지 — 대개 같은 지역, 다섯 건에 한 건은 다른 지역으로
    const toRegion = i % 5 === 0 ? REGIONS[(i * 3) % REGIONS.length][1] : region;
    const [tz, ta, td, tsido, tsgg] = address(toRegion, i + 17);
    const addr = {
      fromZipcode: fz,
      fromAddr: fa,
      fromAddrDetail: fd,
      fromSido: fsido,
      fromSigungu: fsgg,
      toZipcode: tz,
      toAddr: ta,
      toAddrDetail: td,
      toSido: tsido,
      toSigungu: tsgg,
    };
    const quotedOrLater = !['RECEIVED', 'CONSULT_ASSIGNED', 'CONSULT_TOSS', 'CANCELED'].includes(
      stage,
    );
    const leadNo = `RS${String(i).padStart(4, '0')}`;
    const data = {
      orgUnitId,
      customerId: customer.id,
      ownerEmpId: b.id,
      source: SOURCES[idx % SOURCES.length],
      serviceLine,
      status: LEAD_STATUS[stage],
      moveDate: day(move),
      visitDate: quotedOrLater || stage === 'CONSULT_TOSS' ? day(Math.min(-1, received + 3)) : null,
      createdAt: at(received, 9 + (i % 9)),
      ...addr,
    };
    const lead = await prisma.lead.upsert({
      where: { leadNo },
      update: data,
      create: { leadNo, ...data },
    });
    counts[stage] = (counts[stage] ?? 0) + 1;
    if (!quotedOrLater) continue;

    // ── 견적(견적서 발송 = QUOTED → 입금확인에 뜬다) ──
    const items = Array.from({ length: 4 + (i % 3) }, (_, n) => ITEMS[(i + n * 3) % ITEMS.length]);
    const totalCbm = items.reduce((s, it) => s + it.cbm, 0);
    const estimateNo = `ES${String(i).padStart(4, '0')}`;
    const estData = {
      leadId: lead.id,
      customerId: customer.id,
      orgUnitId,
      productId: products.get(productCode) ?? products.get('P-HOME')!,
      estimatorEmpId: b.id,
      status: 'QUOTED',
      totalCbm,
      baseAmount: Math.round(amount * 0.85),
      totalAmount: amount,
      fromPyeong: 20 + (i % 4) * 6,
      fromAccess: i % 4 !== 0 ? 'ELEVATOR' : i % 8 === 0 ? 'LADDER' : 'STAIRS',
      toPyeong: 22 + (i % 5) * 5,
      toAccess: i % 3 !== 0 ? 'ELEVATOR' : 'LADDER',
      workInstructions:
        i % 3 === 0
          ? '오전 8시 시작. 사다리차 필요(고층).\n주차는 지하 2층, 높이제한 2.1m 주의.'
          : '오전 9시 시작. 엘리베이터 사용 협의 완료.',
      createdAt: at(Math.min(-1, received + 3), 15),
      ...addr,
    };
    const estimate = await prisma.estimate.upsert({
      where: { estimateNo },
      update: estData,
      create: { estimateNo, ...estData },
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
          sortOrder: room.sortOrder,
        },
      });
      zoneByRoom.set(room.code, z.id);
    }
    for (const [n, it] of items.entries()) {
      const item = cbmByName.get(it.preset);
      await prisma.estimateLine.create({
        data: {
          estimateId: estimate.id,
          zoneId: zoneByRoom.get(it.room),
          cbmItemId: item?.id,
          itemName: it.preset,
          itemNameEng: item?.nameEng,
          qty: 1,
          cbm: new Prisma.Decimal(it.cbm),
          handling: n === items.length - 1 && i % 4 === 0 ? 'DISPOSE' : 'CARRY',
          memo: it.memo || null,
        },
      });
    }
    if (stage === 'QUOTED') continue;

    // ── 계약 + 입금 ──
    const contractNo = `CS${String(i).padStart(4, '0')}`;
    const deposit = Math.round(amount * 0.1);
    const balance = amount - deposit;
    const signed = stage !== 'SENT';
    const contractDay = Math.min(-1, move - 7);
    const conData = {
      estimateId: estimate.id,
      leadId: lead.id,
      customerId: customer.id,
      orgUnitId,
      contractDate: day(contractDay),
      totalAmount: amount,
      depositRatio: 0.1,
      depositAmount: deposit,
      balanceAmount: balance,
      status: signed ? 'SIGNED' : 'DRAFT',
      signedAt: signed ? at(contractDay, 14) : null,
      sentAt: at(contractDay, 11),
      esignRef: signed ? `seed_sign_${i}` : null,
    };
    const contract = await prisma.contract.upsert({
      where: { contractNo },
      update: conData,
      create: { contractNo, ...conData },
    });
    await prisma.payment.deleteMany({ where: { contractId: contract.id } });
    await prisma.payment.create({
      data: {
        contractId: contract.id,
        kind: 'DEPOSIT',
        amount: deposit,
        method: 'VIRTUAL_ACCOUNT',
        status: signed ? 'PAID' : 'PENDING',
        paidAt: signed ? at(contractDay, 16) : null,
        virtualAccount: `가상은행 ${String(90000000 + i * 1371)}`,
      },
    });
    if (signed) {
      await prisma.payment.create({
        data: {
          contractId: contract.id,
          kind: 'BALANCE',
          amount: balance,
          method: 'VIRTUAL_ACCOUNT',
          status: stage === 'DONE' ? 'PAID' : 'PENDING',
          paidAt: stage === 'DONE' ? at(move, 18) : null,
          virtualAccount: `가상은행 ${String(80000000 + i * 1371)}`,
        },
      });
    }
    if (stage === 'SENT' || stage === 'CONTRACTED') continue;

    // ── 작업오더(캘린더 조직 일정에 뜬다) ──
    const workNo = `WS${String(i).padStart(4, '0')}`;
    const woStatus =
      stage === 'DONE' ? 'DONE' : stage === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ASSIGNED';
    const wo = await prisma.workOrder.upsert({
      where: { contractId: contract.id },
      update: { status: woStatus, scheduledDate: day(move), orgUnitId },
      create: {
        workNo,
        contractId: contract.id,
        leadId: lead.id,
        orgUnitId,
        scheduledDate: day(move),
        status: woStatus,
      },
    });
    await prisma.workAssignment.deleteMany({ where: { workOrderId: wo.id } });
    await prisma.workAssignment.create({
      data: {
        workOrderId: wo.id,
        employeeId: b.id,
        resourceType: 'CREW',
        scheduledAt: day(move),
      },
    });
    await prisma.workAssignment.create({
      data: {
        workOrderId: wo.id,
        resourceType: 'VEHICLE',
        resourceRef: `${amount > 2_500_000 ? '5톤' : '2.5톤'} 트럭 ${12 + (i % 8)}가${3456 + i}`,
        scheduledAt: day(move),
      },
    });
  }

  console.log(`접수 ${TOTAL}건 — 지점 ${branches.length}곳에 나눔`);
  console.log(PLAN.map(([s]) => `${s} ${counts[s] ?? 0}`).join(' · '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
