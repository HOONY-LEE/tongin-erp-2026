/**
 * 시드 — 기준 정보: 상품, 이사물품 기본 부피(CBM), 자재 품목. 거래(접수·견적·발주·재고 수불)는 넣지 않는다.
 *
 *   pnpm --filter @tongin/api demo:seed:catalog
 *
 * 여러 번 돌려도 같은 결과(코드 기준 upsert). 관리자가 고친 이사물품 부피는 덮어쓰지 않는다.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCTS = [
  {
    code: 'P-HOME',
    name: '가정이사',
    serviceLine: 'MOVING',
    pricingMethod: 'CBM',
    basePrice: 300000,
  },
  {
    code: 'P-HALF',
    name: '반포장이사',
    serviceLine: 'MOVING',
    pricingMethod: 'CBM',
    basePrice: 220000,
  },
  {
    code: 'P-OFFICE',
    name: '사무실이사',
    serviceLine: 'B2B_MOVING',
    pricingMethod: 'COST_PLUS',
    basePrice: 500000,
  },
  {
    code: 'P-STORE',
    name: '보관이사',
    serviceLine: 'MOVING',
    pricingMethod: 'FLAT',
    basePrice: 450000,
  },
];

/** 방 틀의 이사물품(마이그레이션이 넣는 침대·장롱 …)에 채울 기본 부피 — preset = 물품 이름 */
const CBM_ITEMS = [
  {
    category: '침실',
    name: '퀸 침대',
    cbm: 1.8,
    room: 'MASTER',
    preset: '침대',
    memo: '퀸 사이즈',
  },
  { category: '침실', name: '킹 침대', cbm: 2.2, room: 'BED1', preset: '침대', memo: '킹 사이즈' },
  { category: '침실', name: '장롱 3자', cbm: 1.5, room: 'MASTER', preset: '장롱', memo: '3자' },
  { category: '거실', name: '3인 소파', cbm: 1.6, room: 'LIVING', preset: '소파', memo: '3인용' },
  {
    category: '거실',
    name: 'TV 65인치',
    cbm: 0.5,
    room: 'LIVING',
    preset: '홈시어터',
    memo: 'TV 65인치',
  },
  {
    category: '주방',
    name: '양문형 냉장고',
    cbm: 1.2,
    room: 'KITCHEN',
    preset: '냉장고',
    memo: '양문형',
  },
  {
    category: '주방',
    name: '식탁 4인',
    cbm: 0.9,
    room: 'KITCHEN',
    preset: '식탁/의자',
    memo: '4인용',
  },
  {
    category: '기타',
    name: '세탁기',
    cbm: 0.6,
    room: 'BALCONY_BACK',
    preset: '세탁기/건조기',
    memo: '드럼',
  },
  { category: '기타', name: '책상', cbm: 0.7, room: 'BED1', preset: '탁자/책상', memo: '' },
  {
    category: '기타',
    name: '피아노',
    cbm: 1.4,
    room: 'MASTER',
    preset: '피아노',
    memo: '업라이트',
  },
];

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

async function main() {
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        serviceLine: p.serviceLine,
        pricingMethod: p.pricingMethod,
        basePrice: p.basePrice,
      },
      create: p,
    });
  }

  let cbmFilled = 0;
  for (const c of CBM_ITEMS) {
    const row = await prisma.cbmItem.findUnique({ where: { name: c.preset } });
    if (row && row.cbm == null) {
      await prisma.cbmItem.update({ where: { id: row.id }, data: { cbm: c.cbm } });
      cbmFilled++;
    }
  }

  for (const m of MATERIALS) {
    await prisma.material.upsert({
      where: { code: m.code },
      update: { name: m.name, category: m.category, unit: m.unit, safetyStock: m.safetyStock },
      create: m,
    });
  }
  console.log(
    `기준 정보: 상품 ${PRODUCTS.length}개, 이사물품 부피 ${cbmFilled}개, 자재 ${MATERIALS.length}종`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
