/**
 * 데모 운영 데이터 — 자재/재고, 가맹점 발주, 캘린더 일정.
 *
 *   pnpm --filter @tongin/api demo:seed:ops
 *
 * seed-demo.ts(조직·직원·계정)를 먼저 돌려야 한다. 지점·계정을 코드로 찾아 쓴다.
 *
 * 날짜는 전부 "오늘"부터의 상대일이라 언제 돌려도 최근 데이터가 된다.
 * 멱등하다 — 코드(code)·발주번호 기준 upsert 이고, 수불/일정은 데모용 표식을 달아
 * 같은 표식의 기존 행을 지우고 다시 넣는다(다른 데이터는 건드리지 않는다).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 데모로 만든 수불·일정을 재실행 때 식별하기 위한 표식. 실제 데이터와 섞이지 않게 한다. */
const DEMO_TAG = '[demo]';

/**
 * 오늘 기준 상대일 → Date(UTC 자정).
 *
 * calendar_event.date 는 DATE 컬럼이라 UTC 기준으로 잘린다. 로컬 자정(KST 00:00)을
 * 넣으면 UTC로는 전날 15시라 일정이 하루씩 밀린다.
 */
function day(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
/** 시각까지 지정한 상대일(로컬 시각) — 수불 전표처럼 시간이 있는 기록용 */
function at(offset: number, hour = 10, min = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, min, 0, 0);
  return d;
}

// ── 자재 ──────────────────────────────────────────────
// 이사 현장에서 실제로 쓰는 것들. safetyStock 은 지점 배분 기준 본사 보유 하한.
const MATERIALS = [
  // 박스류
  { code: 'BOX-S', name: '소형 박스', category: '박스', unit: 'EA', safetyStock: 300 },
  { code: 'BOX-M', name: '중형 박스', category: '박스', unit: 'EA', safetyStock: 400 },
  { code: 'BOX-L', name: '대형 박스', category: '박스', unit: 'EA', safetyStock: 250 },
  { code: 'BOX-BOOK', name: '책 박스(소형 보강)', category: '박스', unit: 'EA', safetyStock: 200 },
  { code: 'BOX-HANGER', name: '행거 박스(옷장용)', category: '박스', unit: 'EA', safetyStock: 120 },
  // 포장재
  {
    code: 'PK-AIRCAP',
    name: '에어캡(뽁뽁이) 1.2m',
    category: '포장재',
    unit: 'ROLL',
    safetyStock: 60,
  },
  { code: 'PK-STRETCH', name: '스트레치 필름', category: '포장재', unit: 'ROLL', safetyStock: 80 },
  { code: 'PK-TAPE-OPP', name: 'OPP 투명테이프', category: '포장재', unit: 'BOX', safetyStock: 40 },
  { code: 'PK-TAPE-CLOTH', name: '청테이프', category: '포장재', unit: 'BOX', safetyStock: 30 },
  { code: 'PK-PAPER', name: '완충 포장지', category: '포장재', unit: 'BOX', safetyStock: 50 },
  { code: 'PK-BLANKET', name: '가구 보호 담요', category: '포장재', unit: 'EA', safetyStock: 100 },
  // 보양재
  { code: 'PR-CORNER', name: '코너 보양대', category: '보양재', unit: 'EA', safetyStock: 150 },
  { code: 'PR-FLOOR', name: '바닥 보양지', category: '보양재', unit: 'ROLL', safetyStock: 70 },
  {
    code: 'PR-ELEV',
    name: '엘리베이터 보양 커버',
    category: '보양재',
    unit: 'SET',
    safetyStock: 25,
  },
  { code: 'PR-DOOR', name: '현관문 보양 커버', category: '보양재', unit: 'EA', safetyStock: 40 },
  // 소모품·장비
  { code: 'SP-GLOVE', name: '작업 장갑', category: '소모품', unit: 'SET', safetyStock: 200 },
  { code: 'SP-CUTTER', name: '커터칼', category: '소모품', unit: 'EA', safetyStock: 60 },
  { code: 'SP-LABEL', name: '구역 라벨 스티커', category: '소모품', unit: 'BOX', safetyStock: 35 },
  { code: 'SP-STRAP', name: '운반용 벨트', category: '장비', unit: 'SET', safetyStock: 30 },
  { code: 'UN-VEST', name: '작업 조끼(로고)', category: '유니폼', unit: 'EA', safetyStock: 80 },
];

/**
 * 자재별 재고 시나리오.
 *  base   — 3개월 전 최초 입고량
 *  ins    — [상대일, 수량] 추가 입고
 *  outs   — [상대일, 수량] 출고(작업 소모)
 *  adjust — [상대일, 증감, 사유] 실사 조정
 * 일부러 몇 개는 안전재고 미만으로 떨어뜨려 "부족" 경고가 화면에 보이게 한다.
 */
const STOCK: Record<
  string,
  {
    base: number;
    ins?: [number, number][];
    outs?: [number, number][];
    adjust?: [number, number, string][];
  }
> = {
  'BOX-S': {
    base: 1200,
    ins: [
      [-40, 600],
      [-12, 500],
    ],
    outs: [
      [-33, 220],
      [-20, 260],
      [-8, 180],
      [-2, 140],
    ],
  },
  'BOX-M': {
    base: 1500,
    ins: [
      [-38, 800],
      [-9, 600],
    ],
    outs: [
      [-30, 320],
      [-18, 380],
      [-6, 290],
      [-1, 210],
    ],
  },
  'BOX-L': {
    base: 900,
    ins: [[-36, 400]],
    outs: [
      [-28, 180],
      [-15, 220],
      [-5, 190],
      [-1, 120],
    ],
  },
  'BOX-BOOK': {
    base: 600,
    ins: [[-25, 300]],
    outs: [
      [-22, 140],
      [-11, 160],
      [-3, 130],
    ],
  },
  // 행거박스 — 이사 성수기라 소모가 많아 안전재고(120) 아래로 떨어진 상태
  'BOX-HANGER': {
    base: 400,
    ins: [[-30, 150]],
    outs: [
      [-24, 150],
      [-13, 170],
      [-4, 130],
    ],
  },
  'PK-AIRCAP': {
    base: 220,
    ins: [[-27, 90]],
    outs: [
      [-21, 55],
      [-10, 62],
      [-3, 48],
    ],
  },
  'PK-STRETCH': {
    base: 260,
    ins: [[-35, 120]],
    outs: [
      [-26, 70],
      [-14, 85],
      [-5, 60],
    ],
  },
  'PK-TAPE-OPP': {
    base: 150,
    ins: [[-20, 60]],
    outs: [
      [-17, 42],
      [-7, 38],
      [-2, 30],
    ],
  },
  // 청테이프 — 안전재고(30) 아래
  'PK-TAPE-CLOTH': {
    base: 110,
    outs: [
      [-23, 34],
      [-12, 30],
      [-4, 26],
    ],
  },
  'PK-PAPER': {
    base: 180,
    ins: [[-19, 70]],
    outs: [
      [-16, 45],
      [-6, 52],
    ],
  },
  'PK-BLANKET': {
    base: 320,
    ins: [[-31, 120]],
    outs: [
      [-29, 60],
      [-13, 75],
      [-2, 55],
    ],
  },
  'PR-CORNER': {
    base: 500,
    ins: [[-24, 200]],
    outs: [
      [-26, 120],
      [-11, 150],
      [-3, 110],
    ],
  },
  'PR-FLOOR': {
    base: 240,
    ins: [[-18, 80]],
    outs: [
      [-20, 58],
      [-9, 64],
      [-1, 46],
    ],
  },
  // 엘리베이터 보양 — 안전재고(25) 근처까지 소진 + 파손 조정
  'PR-ELEV': {
    base: 80,
    outs: [
      [-22, 18],
      [-10, 22],
      [-2, 14],
    ],
    adjust: [[-7, -4, '현장 파손 폐기']],
  },
  'PR-DOOR': {
    base: 160,
    ins: [[-15, 60]],
    outs: [
      [-19, 40],
      [-8, 45],
      [-2, 32],
    ],
  },
  'SP-GLOVE': {
    base: 700,
    ins: [[-28, 250]],
    outs: [
      [-25, 160],
      [-12, 180],
      [-4, 150],
    ],
  },
  'SP-CUTTER': {
    base: 180,
    outs: [
      [-21, 40],
      [-9, 35],
      [-3, 28],
    ],
    adjust: [[-5, -6, '분실 처리']],
  },
  'SP-LABEL': {
    base: 120,
    ins: [[-16, 50]],
    outs: [
      [-18, 30],
      [-7, 34],
      [-1, 26],
    ],
  },
  'SP-STRAP': {
    base: 90,
    outs: [
      [-26, 18],
      [-14, 22],
      [-6, 16],
    ],
  },
  'UN-VEST': {
    base: 260,
    ins: [[-33, 90]],
    outs: [
      [-30, 60],
      [-15, 55],
      [-5, 48],
    ],
    adjust: [[-11, -8, '훼손 교체']],
  },
};

// ── 가맹점 발주 ───────────────────────────────────────
// 지점이 본사에 자재를 요청 → 승인 → 출고. 최근 3주에 걸쳐 상태를 흩어 둔다.
const ORDERS: {
  no: string;
  branch: string;
  status: 'REQUESTED' | 'APPROVED' | 'SHIPPED' | 'CANCELED';
  daysAgo: number;
  note?: string;
  lines: [string, number][];
}[] = [
  // 출고 완료
  {
    no: 'MO0001',
    branch: 'BR-GN',
    status: 'SHIPPED',
    daysAgo: 19,
    note: '9월 정기 보충',
    lines: [
      ['BOX-M', 200],
      ['BOX-S', 150],
      ['PK-TAPE-OPP', 20],
      ['SP-GLOVE', 60],
    ],
  },
  {
    no: 'MO0002',
    branch: 'BR-SP',
    status: 'SHIPPED',
    daysAgo: 16,
    note: '이사 성수기 대비',
    lines: [
      ['BOX-L', 120],
      ['PK-AIRCAP', 25],
      ['PR-CORNER', 80],
    ],
  },
  {
    no: 'MO0003',
    branch: 'BR-BD',
    status: 'SHIPPED',
    daysAgo: 12,
    lines: [
      ['BOX-M', 150],
      ['PK-STRETCH', 30],
      ['PR-FLOOR', 20],
    ],
  },
  {
    no: 'MO0004',
    branch: 'BR-IS',
    status: 'SHIPPED',
    daysAgo: 9,
    note: '신규 팀 셋업분 포함',
    lines: [
      ['UN-VEST', 20],
      ['SP-GLOVE', 50],
      ['SP-STRAP', 10],
      ['BOX-S', 100],
    ],
  },
  {
    no: 'MO0005',
    branch: 'BR-BS',
    status: 'SHIPPED',
    daysAgo: 7,
    lines: [
      ['BOX-BOOK', 80],
      ['PK-PAPER', 25],
      ['PR-DOOR', 20],
    ],
  },
  // 승인됨(출고 대기)
  {
    no: 'MO0006',
    branch: 'BR-GN',
    status: 'APPROVED',
    daysAgo: 4,
    note: '이번 주 대형 건 대비',
    lines: [
      ['BOX-HANGER', 60],
      ['PK-BLANKET', 40],
      ['PR-ELEV', 8],
    ],
  },
  {
    no: 'MO0007',
    branch: 'BR-BD',
    status: 'APPROVED',
    daysAgo: 3,
    lines: [
      ['BOX-M', 180],
      ['PK-TAPE-CLOTH', 15],
    ],
  },
  // 요청됨(승인 대기)
  {
    no: 'MO0008',
    branch: 'BR-SP',
    status: 'REQUESTED',
    daysAgo: 2,
    note: '청테이프 소진 임박',
    lines: [
      ['PK-TAPE-CLOTH', 20],
      ['PK-TAPE-OPP', 15],
      ['SP-LABEL', 10],
    ],
  },
  {
    no: 'MO0009',
    branch: 'BR-IS',
    status: 'REQUESTED',
    daysAgo: 1,
    lines: [
      ['BOX-S', 200],
      ['BOX-M', 150],
      ['SP-CUTTER', 20],
    ],
  },
  {
    no: 'MO0010',
    branch: 'BR-BS',
    status: 'REQUESTED',
    daysAgo: 0,
    note: '다음 주 기업이전 건',
    lines: [
      ['BOX-L', 100],
      ['PR-CORNER', 60],
      ['PK-STRETCH', 25],
    ],
  },
  // 취소
  {
    no: 'MO0011',
    branch: 'BR-GN',
    status: 'CANCELED',
    daysAgo: 11,
    note: '지점 재고 확인 후 취소',
    lines: [['PK-AIRCAP', 30]],
  },
];

// ── 캘린더 ────────────────────────────────────────────
// 조직 공유 일정(지점 회의·교육·점검)과 개인 일정(방문견적·외근)을 오늘 주변에 배치.
const EVENTS: {
  title: string;
  offset: number;
  endOffset?: number;
  start?: string;
  end?: string;
  color: string;
  location?: string;
  scope: 'ORG' | 'PRIVATE';
  branch?: string;
  owner: string;
  description?: string;
}[] = [
  // 조직 공유 — 지점 운영
  {
    title: '강남점 주간 회의',
    offset: -7,
    start: '09:00',
    end: '10:00',
    color: '#007AFF',
    location: '강남점 회의실',
    scope: 'ORG',
    branch: 'BR-GN',
    owner: 'gn.manager',
  },
  {
    title: '강남점 주간 회의',
    offset: 0,
    start: '09:00',
    end: '10:00',
    color: '#007AFF',
    location: '강남점 회의실',
    scope: 'ORG',
    branch: 'BR-GN',
    owner: 'gn.manager',
  },
  {
    title: '강남점 주간 회의',
    offset: 7,
    start: '09:00',
    end: '10:00',
    color: '#007AFF',
    location: '강남점 회의실',
    scope: 'ORG',
    branch: 'BR-GN',
    owner: 'gn.manager',
  },
  {
    title: '송파점 주간 회의',
    offset: 1,
    start: '09:30',
    end: '10:30',
    color: '#007AFF',
    location: '송파점 회의실',
    scope: 'ORG',
    branch: 'BR-SP',
    owner: 'sp.manager',
  },
  {
    title: '분당점 주간 회의',
    offset: 2,
    start: '09:00',
    end: '10:00',
    color: '#007AFF',
    location: '분당점 회의실',
    scope: 'ORG',
    branch: 'BR-BD',
    owner: 'bd.manager',
  },

  // 조직 공유 — 교육·점검(여러 날)
  {
    title: '신입 현장교육 (3일)',
    offset: 3,
    endOffset: 5,
    color: '#34C759',
    location: '본사 교육장',
    scope: 'ORG',
    branch: 'BR-GN',
    owner: 'gn.manager',
    description: '보양·포장 실습 포함',
  },
  {
    title: '차량 정기점검',
    offset: -3,
    start: '14:00',
    end: '17:00',
    color: '#FF9500',
    location: '강남점 주차장',
    scope: 'ORG',
    branch: 'BR-GN',
    owner: 'gn.manager',
  },
  {
    title: '자재 재고 실사',
    offset: -5,
    start: '15:00',
    end: '18:00',
    color: '#AF52DE',
    location: '본사 창고',
    scope: 'ORG',
    branch: 'BR-SP',
    owner: 'sp.manager',
  },
  {
    title: '추석 연휴 휴무',
    offset: 14,
    endOffset: 16,
    color: '#FF3B30',
    scope: 'ORG',
    branch: 'BR-GN',
    owner: 'gn.manager',
  },
  {
    title: '분기 안전교육',
    offset: 9,
    start: '13:00',
    end: '16:00',
    color: '#34C759',
    location: '본사 교육장',
    scope: 'ORG',
    branch: 'BR-BD',
    owner: 'bd.manager',
  },
  {
    title: '일산점 월례 점검',
    offset: 4,
    start: '10:00',
    end: '12:00',
    color: '#FF9500',
    location: '일산점',
    scope: 'ORG',
    branch: 'BR-IS',
    owner: 'is.manager',
  },
  {
    title: '부산점 창고 정리',
    offset: 6,
    start: '14:00',
    end: '18:00',
    color: '#AF52DE',
    location: '부산점 창고',
    scope: 'ORG',
    branch: 'BR-BS',
    owner: 'bs.manager',
  },

  // 개인 일정 — 견적사원 방문견적·외근
  {
    title: '방문견적 — 압구정 임재원',
    offset: 0,
    start: '11:00',
    end: '12:00',
    color: '#FF2D55',
    location: '서울 강남구 압구정로 419',
    scope: 'PRIVATE',
    owner: 'gn.manager',
  },
  {
    title: '방문견적 — 역삼 표지훈',
    offset: 1,
    start: '15:00',
    end: '16:00',
    color: '#FF2D55',
    location: '서울 강남구 도산대로 318',
    scope: 'PRIVATE',
    owner: 'gn.manager',
  },
  {
    title: '고객 상담 콜백',
    offset: -1,
    start: '17:00',
    end: '17:30',
    color: '#007AFF',
    scope: 'PRIVATE',
    owner: 'gn.manager',
  },
  {
    title: '방문견적 — 위례 양다온',
    offset: 2,
    start: '10:30',
    end: '11:30',
    color: '#FF2D55',
    location: '서울 송파구 마천로 215',
    scope: 'PRIVATE',
    owner: 'sp.manager',
  },
  {
    title: '전속업체 미팅(한일운수)',
    offset: 3,
    start: '16:00',
    end: '17:00',
    color: '#FF9500',
    location: '분당점',
    scope: 'PRIVATE',
    owner: 'bd.manager',
  },
  {
    title: '방문견적 — 판교 구자현',
    offset: 5,
    start: '14:00',
    end: '15:30',
    color: '#FF2D55',
    location: '경기 성남시 분당구 황새울로 335',
    scope: 'PRIVATE',
    owner: 'bd.manager',
  },
  {
    title: '지점장 정기 미팅',
    offset: 8,
    start: '10:00',
    end: '12:00',
    color: '#007AFF',
    location: '본사',
    scope: 'PRIVATE',
    owner: 'is.manager',
  },
  {
    title: '거래처 방문(LG유플러스)',
    offset: 10,
    start: '14:00',
    end: '16:00',
    color: '#AF52DE',
    location: '서울 용산구',
    scope: 'PRIVATE',
    owner: 'bs.manager',
  },

  // 현장 직원 개인 일정
  {
    title: '차량 정비 입고',
    offset: 2,
    start: '08:00',
    end: '10:00',
    color: '#FF9500',
    scope: 'PRIVATE',
    owner: 'gn.field',
  },
  {
    title: '안전교육 이수',
    offset: 9,
    start: '13:00',
    end: '16:00',
    color: '#34C759',
    location: '본사 교육장',
    scope: 'PRIVATE',
    owner: 'gn.field',
  },
  { title: '연차', offset: 12, color: '#FF3B30', scope: 'PRIVATE', owner: 'sp.field' },
];

async function main() {
  // ── 자재 ──
  const matByCode = new Map<string, string>();
  for (const m of MATERIALS) {
    const row = await prisma.material.upsert({
      where: { code: m.code },
      update: { name: m.name, category: m.category, unit: m.unit, safetyStock: m.safetyStock },
      create: m,
    });
    matByCode.set(m.code, row.id);
  }
  console.log(`자재 ${MATERIALS.length}종`);

  // ── 재고 수불 ──
  // 데모 표식이 달린 기존 수불만 지우고 다시 넣는다(수기로 넣은 전표는 보존).
  await prisma.stockMovement.deleteMany({ where: { reason: { startsWith: DEMO_TAG } } });
  let moveCount = 0;
  for (const [code, sc] of Object.entries(STOCK)) {
    const materialId = matByCode.get(code);
    if (!materialId) continue;
    const rows: { type: string; qtyDelta: number; reason: string; createdAt: Date }[] = [
      { type: 'IN', qtyDelta: sc.base, reason: `${DEMO_TAG} 최초 입고`, createdAt: at(-90, 9) },
    ];
    for (const [d, q] of sc.ins ?? []) {
      rows.push({
        type: 'IN',
        qtyDelta: q,
        reason: `${DEMO_TAG} 본사 입고`,
        createdAt: at(d, 9, 30),
      });
    }
    for (const [d, q] of sc.outs ?? []) {
      rows.push({
        type: 'OUT',
        qtyDelta: -q,
        reason: `${DEMO_TAG} 현장 소모`,
        createdAt: at(d, 17),
      });
    }
    for (const [d, q, why] of sc.adjust ?? []) {
      rows.push({
        type: 'ADJUST',
        qtyDelta: q,
        reason: `${DEMO_TAG} ${why}`,
        createdAt: at(d, 16),
      });
    }
    await prisma.stockMovement.createMany({ data: rows.map((r) => ({ ...r, materialId })) });
    moveCount += rows.length;
  }
  console.log(`재고 수불 ${moveCount}건`);

  // ── 가맹점 발주 ──
  const branches = await prisma.orgUnit.findMany({ where: { type: 'BRANCH' } });
  const branchByCode = new Map(branches.map((b) => [b.code, b.id]));
  if (branchByCode.size === 0) {
    console.error('지점이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed` 를 돌려야 한다');
    process.exit(1);
  }

  for (const o of ORDERS) {
    const orgUnitId = branchByCode.get(o.branch);
    if (!orgUnitId) continue;
    const order = await prisma.materialOrder.upsert({
      where: { orderNo: o.no },
      update: {
        status: o.status,
        note: o.note,
        orgUnitId,
        createdAt: at(-o.daysAgo, 11),
        shippedAt: o.status === 'SHIPPED' ? at(-o.daysAgo + 2, 15) : null,
      },
      create: {
        orderNo: o.no,
        orgUnitId,
        status: o.status,
        note: o.note,
        createdAt: at(-o.daysAgo, 11),
        shippedAt: o.status === 'SHIPPED' ? at(-o.daysAgo + 2, 15) : null,
      },
    });
    // 라인은 매번 새로 깐다(수량이 바뀌어도 중복되지 않게)
    await prisma.materialOrderLine.deleteMany({ where: { orderId: order.id } });
    for (const [code, qty] of o.lines) {
      const materialId = matByCode.get(code);
      if (!materialId) continue;
      await prisma.materialOrderLine.create({ data: { orderId: order.id, materialId, qty } });
    }
    // 출고된 발주는 본사 재고에서 빠진 전표를 남긴다 — 발주 화면과 재고가 아귀 맞게
    if (o.status === 'SHIPPED') {
      for (const [code, qty] of o.lines) {
        const materialId = matByCode.get(code);
        if (!materialId) continue;
        await prisma.stockMovement.create({
          data: {
            materialId,
            orgUnitId,
            type: 'OUT',
            qtyDelta: -qty,
            reason: `${DEMO_TAG} 가맹점 발주 출고 (${o.no})`,
            refType: 'material_order',
            refId: order.id,
            createdAt: at(-o.daysAgo + 2, 15),
          },
        });
      }
    }
  }
  console.log(`가맹점 발주 ${ORDERS.length}건 (출고 5 / 승인 2 / 요청 3 / 취소 1)`);

  // ── 캘린더 ──
  const users = await prisma.appUser.findMany({ select: { id: true, loginId: true } });
  const userByLogin = new Map(users.map((u) => [u.loginId, u.id]));
  await prisma.calendarEvent.deleteMany({ where: { description: { startsWith: DEMO_TAG } } });
  let evCount = 0;
  for (const e of EVENTS) {
    const ownerUserId = userByLogin.get(e.owner);
    if (!ownerUserId) continue;
    const orgUnitId = e.scope === 'ORG' ? (branchByCode.get(e.branch ?? '') ?? null) : null;
    await prisma.calendarEvent.create({
      data: {
        title: e.title,
        // 설명 앞에 표식을 달아 재실행 때 이 데모 일정만 지운다
        description: `${DEMO_TAG}${e.description ? ' ' + e.description : ''}`,
        date: day(e.offset),
        endDate: e.endOffset !== undefined ? day(e.endOffset) : null,
        startTime: e.start ?? null,
        endTime: e.end ?? null,
        color: e.color,
        location: e.location ?? null,
        visibility: e.scope,
        ownerUserId,
        orgUnitId,
        source: 'LOCAL',
      },
    });
    evCount += 1;
  }
  console.log(`캘린더 일정 ${evCount}건 (조직 공유 + 개인)`);

  // ── 요약 ──
  const lowStock: string[] = [];
  for (const m of MATERIALS) {
    const id = matByCode.get(m.code);
    if (!id) continue;
    const agg = await prisma.stockMovement.aggregate({
      where: { materialId: id },
      _sum: { qtyDelta: true },
    });
    const stock = agg._sum.qtyDelta ?? 0;
    if (stock < m.safetyStock) lowStock.push(`${m.name} ${stock}/${m.safetyStock}`);
  }
  console.log(`\n안전재고 미만 ${lowStock.length}종 — ${lowStock.join(', ') || '없음'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
