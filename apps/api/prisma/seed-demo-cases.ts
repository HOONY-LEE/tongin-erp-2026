/**
 * 데모 거래 데이터 — 접수 → 견적 → 계약 → 결제 → 작업 을 단계별로 흩어 놓는다.
 *
 *   pnpm --filter @tongin/api demo:seed:cases
 *
 * seed-demo.ts(조직·직원·계정)를 먼저 돌려야 한다. 지점·직원을 코드로 찾아 쓴다.
 *
 * 멱등하다 — 접수번호(leadNo)를 고정 규칙으로 만들고 upsert 한다.
 * 대시보드·퍼널·정산·현장 화면이 실제처럼 채워지도록 단계를 골고루 배치했다.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/** 오늘 기준 상대일 → Date(자정). 시드를 언제 돌려도 "오늘 작업"이 생기도록. */
function day(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

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

const CBM_ITEMS = [
  { category: '침실', name: '퀸 침대', cbm: 1.8 },
  { category: '침실', name: '킹 침대', cbm: 2.2 },
  { category: '침실', name: '장롱 3자', cbm: 1.5 },
  { category: '거실', name: '3인 소파', cbm: 1.6 },
  { category: '거실', name: 'TV 65인치', cbm: 0.5 },
  { category: '주방', name: '양문형 냉장고', cbm: 1.2 },
  { category: '주방', name: '식탁 4인', cbm: 0.9 },
  { category: '기타', name: '세탁기', cbm: 0.6 },
  { category: '기타', name: '책상', cbm: 0.7 },
  { category: '기타', name: '피아노', cbm: 1.4 },
];

/** 단계별 목표 분포 — 퍼널이 위에서 아래로 줄어드는 자연스러운 모양이 되게. */
type Stage = 'INTAKE' | 'QUOTED' | 'CONTRACTED' | 'WORKING' | 'DONE';

interface CaseSpec {
  branch: string;
  customer: string;
  phone: string;
  stage: Stage;
  product: string;
  from: [string, string, string]; // [우편번호, 도로명, 상세]
  to: [string, string, string];
  amount: number;
  /** 작업예정일 (오늘 기준 상대일). WORKING/DONE 단계에서 사용 */
  schedule?: number;
  /** 전속업체 코드 — 있으면 외주 작업 */
  outsource?: string;
  source: string;
}

const CASES: CaseSpec[] = [
  // ── 접수 단계 (아직 견적 전) ──
  {
    branch: 'BR-GN',
    customer: '김도현',
    phone: '010-5101-0001',
    stage: 'INTAKE',
    product: 'P-HOME',
    source: 'HOMEPAGE',
    from: ['06236', '서울 강남구 테헤란로 152', '1203호'],
    to: ['13529', '경기 성남시 분당구 판교역로 235', '302동 1501호'],
    amount: 0,
  },
  {
    branch: 'BR-GN',
    customer: '이수민',
    phone: '010-5101-0002',
    stage: 'INTAKE',
    product: 'P-HALF',
    source: 'NAVER',
    from: ['06120', '서울 강남구 논현로 508', '705호'],
    to: ['06621', '서울 서초구 서초대로 396', '1102호'],
    amount: 0,
  },
  {
    branch: 'BR-SP',
    customer: '박준영',
    phone: '010-5102-0001',
    stage: 'INTAKE',
    product: 'P-HOME',
    source: 'PHONE',
    from: ['05510', '서울 송파구 올림픽로 300', '2801호'],
    to: ['05854', '서울 송파구 법원로 128', '904호'],
    amount: 0,
  },
  {
    branch: 'BR-BD',
    customer: '최유진',
    phone: '010-5103-0001',
    stage: 'INTAKE',
    product: 'P-STORE',
    source: 'INSTAGRAM',
    from: ['13494', '경기 성남시 분당구 대왕판교로 670', '401동 1203호'],
    to: ['13561', '경기 성남시 분당구 황새울로 246', '806호'],
    amount: 0,
  },
  {
    branch: 'BR-BS',
    customer: '정한결',
    phone: '010-5105-0001',
    stage: 'INTAKE',
    product: 'P-HOME',
    source: 'AIBOT',
    from: ['48058', '부산 해운대구 센텀중앙로 97', '1503호'],
    to: ['48300', '부산 수영구 광안해변로 219', '702호'],
    amount: 0,
  },

  // ── 견적완료 (계약 대기) ──
  {
    branch: 'BR-GN',
    customer: '윤서아',
    phone: '010-5101-0003',
    stage: 'QUOTED',
    product: 'P-HOME',
    source: 'HOMEPAGE',
    from: ['06035', '서울 강남구 가로수길 43', '301호'],
    to: ['04799', '서울 성동구 왕십리로 83', '1804호'],
    amount: 2_450_000,
  },
  {
    branch: 'BR-SP',
    customer: '강민호',
    phone: '010-5102-0002',
    stage: 'QUOTED',
    product: 'P-HALF',
    source: 'WALK_IN',
    from: ['05610', '서울 송파구 백제고분로 362', '502호'],
    to: ['05288', '서울 강동구 천호대로 1121', '1203호'],
    amount: 1_780_000,
  },
  {
    branch: 'BR-IS',
    customer: '오지훈',
    phone: '010-5104-0001',
    stage: 'QUOTED',
    product: 'P-HOME',
    source: 'NAVER',
    from: ['10380', '경기 고양시 일산동구 중앙로 1275', '1102호'],
    to: ['10403', '경기 고양시 일산동구 정발산로 24', '705호'],
    amount: 2_120_000,
  },
  {
    branch: 'BR-BD',
    customer: '한소율',
    phone: '010-5103-0002',
    stage: 'QUOTED',
    product: 'P-OFFICE',
    source: 'PARTNER',
    from: ['13487', '경기 성남시 분당구 판교로 255', '4층 전체'],
    to: ['13529', '경기 성남시 분당구 판교역로 231', '7층'],
    amount: 8_600_000,
  },

  // ── 계약 (작업 전, 계약금 입금완료) ──
  {
    branch: 'BR-GN',
    customer: '임재원',
    phone: '010-5101-0004',
    stage: 'CONTRACTED',
    product: 'P-HOME',
    source: 'HOMEPAGE',
    from: ['06018', '서울 강남구 압구정로 419', '1501호'],
    to: ['06349', '서울 강남구 개포로 310', '203동 802호'],
    amount: 3_200_000,
    schedule: 5,
  },
  {
    branch: 'BR-SP',
    customer: '신하윤',
    phone: '010-5102-0003',
    stage: 'CONTRACTED',
    product: 'P-HALF',
    source: 'PHONE',
    from: ['05551', '서울 송파구 위례성대로 2', '904호'],
    to: ['05006', '서울 광진구 아차산로 402', '1105호'],
    amount: 1_950_000,
    schedule: 3,
  },
  {
    branch: 'BR-IS',
    customer: '배시연',
    phone: '010-5104-0002',
    stage: 'CONTRACTED',
    product: 'P-STORE',
    source: 'NAVER',
    from: ['10326', '경기 고양시 일산서구 중앙로 1436', '806호'],
    to: ['10442', '경기 고양시 일산동구 무궁화로 20', '1502호'],
    amount: 2_680_000,
    schedule: 7,
  },
  {
    branch: 'BR-BS',
    customer: '노건우',
    phone: '010-5105-0002',
    stage: 'CONTRACTED',
    product: 'P-HOME',
    source: 'WALK_IN',
    from: ['48400', '부산 남구 수영로 309', '2203호'],
    to: ['46241', '부산 금정구 부산대학로 63', '1004호'],
    amount: 2_340_000,
    schedule: 10,
  },

  // ── 작업중 (오늘·내일 작업 — 현장 앱에 뜬다) ──
  {
    branch: 'BR-GN',
    customer: '문채원',
    phone: '010-5101-0005',
    stage: 'WORKING',
    product: 'P-HOME',
    source: 'HOMEPAGE',
    from: ['06164', '서울 강남구 봉은사로 524', '1802호'],
    to: ['06774', '서울 서초구 남부순환로 2374', '905호'],
    amount: 2_890_000,
    schedule: 0,
  },
  {
    branch: 'BR-SP',
    customer: '류지호',
    phone: '010-5102-0004',
    stage: 'WORKING',
    product: 'P-HALF',
    source: 'AIBOT',
    from: ['05393', '서울 강동구 상암로 100', '703호'],
    to: ['05307', '서울 강동구 명일로 220', '1401호'],
    amount: 1_640_000,
    schedule: 0,
  },
  {
    branch: 'BR-IS',
    customer: '황예린',
    phone: '010-5104-0003',
    stage: 'WORKING',
    product: 'P-HOME',
    source: 'PHONE',
    from: ['10881', '경기 파주시 문발로 77', '302호'],
    to: ['10390', '경기 고양시 일산동구 강송로 138', '1203호'],
    amount: 2_050_000,
    schedule: 1,
    outsource: 'OS-HANIL',
  },

  // ── 완료 (정산·미수금에 잡힌다) ──
  {
    branch: 'BR-GN',
    customer: '조은비',
    phone: '010-5101-0006',
    stage: 'DONE',
    product: 'P-HOME',
    source: 'HOMEPAGE',
    from: ['06212', '서울 강남구 역삼로 220', '1105호'],
    to: ['06563', '서울 서초구 사평대로 140', '801호'],
    amount: 3_050_000,
    schedule: -7,
  },
  {
    branch: 'BR-GN',
    customer: '서지안',
    phone: '010-5101-0007',
    stage: 'DONE',
    product: 'P-HALF',
    source: 'NAVER',
    from: ['06098', '서울 강남구 학동로 401', '602호'],
    to: ['06284', '서울 강남구 도곡로 401', '1503호'],
    amount: 1_890_000,
    schedule: -14,
  },
  {
    branch: 'BR-SP',
    customer: '권도윤',
    phone: '010-5102-0005',
    stage: 'DONE',
    product: 'P-HOME',
    source: 'PHONE',
    from: ['05836', '서울 송파구 동남로 99', '1802호'],
    to: ['05407', '서울 강동구 올림픽로 664', '904호'],
    amount: 2_760_000,
    schedule: -5,
  },
  {
    branch: 'BR-BD',
    customer: '남시우',
    phone: '010-5103-0003',
    stage: 'DONE',
    product: 'P-HOME',
    source: 'HOMEPAGE',
    from: ['13606', '경기 성남시 분당구 성남대로 2', '1204호'],
    to: ['13636', '경기 성남시 분당구 미금일로 76', '703호'],
    amount: 2_410_000,
    schedule: -10,
    outsource: 'OS-DAEYANG',
  },
  {
    branch: 'BR-BS',
    customer: '고아라',
    phone: '010-5105-0003',
    stage: 'DONE',
    product: 'P-STORE',
    source: 'INSTAGRAM',
    from: ['48094', '부산 해운대구 마린시티2로 33', '2504호'],
    to: ['48120', '부산 해운대구 우동1로 20', '1802호'],
    amount: 3_380_000,
    schedule: -3,
  },
];

/** 견적 품목 — 금액대에 맞춰 적당히 뽑는다(무작위 대신 결정적으로: 재실행 시 동일). */
function pickItems(seed: number, budget: number) {
  const n = budget > 3_000_000 ? 6 : budget > 2_000_000 ? 5 : 4;
  return Array.from({ length: n }, (_, i) => CBM_ITEMS[(seed + i * 3) % CBM_ITEMS.length]);
}

const STAGE_LEAD_STATUS: Record<Stage, string> = {
  INTAKE: 'CONSULT_TOSS',
  QUOTED: 'QUOTED',
  CONTRACTED: 'CONTRACTED',
  WORKING: 'IN_PROGRESS',
  DONE: 'DONE',
};

async function main() {
  // ── 상품 ──
  const productByCode = new Map<string, string>();
  for (const p of PRODUCTS) {
    const row = await prisma.product.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        serviceLine: p.serviceLine,
        pricingMethod: p.pricingMethod,
        basePrice: p.basePrice,
      },
      create: p,
    });
    productByCode.set(p.code, row.id);
  }

  // ── 품목사전 ──
  const cbmByName = new Map<string, string>();
  for (const c of CBM_ITEMS) {
    const row = await prisma.cbmItem.upsert({
      where: { category_name: { category: c.category, name: c.name } },
      update: { cbm: c.cbm },
      create: c,
    });
    cbmByName.set(c.name, row.id);
  }
  console.log(`상품 ${PRODUCTS.length}개 / 품목사전 ${CBM_ITEMS.length}개`);

  // ── 참조 조회 ──
  const branches = await prisma.orgUnit.findMany({ where: { type: 'BRANCH' } });
  const branchByCode = new Map(branches.map((b) => [b.code, b.id]));
  const employees = await prisma.employee.findMany();
  const empByOrg = new Map<string, typeof employees>();
  for (const e of employees) {
    empByOrg.set(e.orgUnitId, [...(empByOrg.get(e.orgUnitId) ?? []), e]);
  }
  const partners = await prisma.partner.findMany();
  const partnerByCode = new Map(partners.map((p) => [p.code, p.id]));

  if (branchByCode.size === 0) {
    console.error('지점이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed` 를 돌려야 한다');
    process.exit(1);
  }

  const counts: Record<string, number> = {};
  for (const [i, c] of CASES.entries()) {
    const orgUnitId = branchByCode.get(c.branch);
    if (!orgUnitId) continue;
    const staff = empByOrg.get(orgUnitId) ?? [];
    const estimator =
      staff.find((s) => s.empNo?.endsWith('2') || s.empNo?.endsWith('7')) ?? staff[0];
    const crew = staff.find(
      (s) => s.empNo?.endsWith('3') || s.empNo?.endsWith('5') || s.empNo?.endsWith('9'),
    );

    // 고객 (전화번호로 식별)
    const existingCustomer = await prisma.customer.findFirst({ where: { phonePrimary: c.phone } });
    const customer =
      existingCustomer ??
      (await prisma.customer.create({
        data: { name: c.customer, phonePrimary: c.phone, ownerOrgId: orgUnitId, grade: 'NORMAL' },
      }));

    // 접수 — leadNo 를 고정해 멱등하게
    const leadNo = `RD${String(i + 1).padStart(4, '0')}`;
    const addr = {
      fromZipcode: c.from[0],
      fromAddr: c.from[1],
      fromAddrDetail: c.from[2],
      fromSido: c.from[1].split(' ')[0],
      fromSigungu: c.from[1].split(' ')[1],
      toZipcode: c.to[0],
      toAddr: c.to[1],
      toAddrDetail: c.to[2],
      toSido: c.to[1].split(' ')[0],
      toSigungu: c.to[1].split(' ')[1],
    };
    const lead = await prisma.lead.upsert({
      where: { leadNo },
      update: { status: STAGE_LEAD_STATUS[c.stage], orgUnitId, customerId: customer.id, ...addr },
      create: {
        leadNo,
        orgUnitId,
        customerId: customer.id,
        ownerEmpId: estimator?.id,
        source: c.source,
        serviceLine: 'MOVING',
        status: STAGE_LEAD_STATUS[c.stage],
        moveDate: c.schedule !== undefined ? day(c.schedule) : day(i + 3),
        partnerId: c.outsource ? partnerByCode.get(c.outsource) : undefined,
        ...addr,
      },
    });
    counts[c.stage] = (counts[c.stage] ?? 0) + 1;
    if (c.stage === 'INTAKE') continue;

    // 견적
    const items = pickItems(i, c.amount);
    const totalCbm = items.reduce((s, it) => s + it.cbm, 0);
    const estimateNo = `EQ${String(i + 1).padStart(4, '0')}`;
    const estimate = await prisma.estimate.upsert({
      where: { estimateNo },
      update: { status: 'QUOTED', totalAmount: c.amount, totalCbm },
      create: {
        estimateNo,
        leadId: lead.id,
        customerId: customer.id,
        orgUnitId,
        productId: productByCode.get(c.product)!,
        estimatorEmpId: estimator?.id,
        status: 'QUOTED',
        totalCbm,
        baseAmount: Math.round(c.amount * 0.85),
        totalAmount: c.amount,
        fromPyeong: 24 + (i % 3) * 8,
        fromElevator: i % 4 !== 0,
        toPyeong: 26 + (i % 4) * 6,
        toElevator: i % 3 !== 0,
        workInstructions:
          i % 3 === 0
            ? '오전 8시 시작. 사다리차 필요(고층).\n주차는 지하 2층, 높이제한 2.1m 주의.'
            : '오전 9시 시작. 엘리베이터 사용 협의 완료.',
        ...addr,
      },
    });

    // 구역·품목 (재실행 시 중복되지 않게 지우고 다시)
    await prisma.estimateLine.deleteMany({ where: { estimateId: estimate.id } });
    await prisma.estimateZone.deleteMany({ where: { estimateId: estimate.id } });
    // 구역은 품목 카테고리를 그대로 쓴다 — 소파가 안방에 들어가는 식의 어색함을 피한다
    const usedCategories = [...new Set(items.map((it) => it.category))];
    const zoneByCategory = new Map<string, string>();
    for (const [zi, name] of usedCategories.entries()) {
      const z = await prisma.estimateZone.create({
        data: { estimateId: estimate.id, name, sortOrder: zi },
      });
      zoneByCategory.set(name, z.id);
    }
    for (const [ii, it] of items.entries()) {
      const qty = ii % 3 === 0 ? 2 : 1;
      await prisma.estimateLine.create({
        data: {
          estimateId: estimate.id,
          zoneId: zoneByCategory.get(it.category),
          cbmItemId: cbmByName.get(it.name),
          itemName: it.name,
          qty,
          cbm: new Prisma.Decimal(it.cbm * qty),
          handling: ii === items.length - 1 && i % 4 === 0 ? 'DISPOSE' : 'CARRY',
        },
      });
    }
    if (c.stage === 'QUOTED') continue;

    // 계약 + 결제
    const contractNo = `CT${String(i + 1).padStart(4, '0')}`;
    const deposit = Math.round(c.amount * 0.1);
    const balance = c.amount - deposit;
    const contract = await prisma.contract.upsert({
      where: { contractNo },
      update: {
        status: 'SIGNED',
        totalAmount: c.amount,
        depositAmount: deposit,
        balanceAmount: balance,
      },
      create: {
        contractNo,
        estimateId: estimate.id,
        leadId: lead.id,
        customerId: customer.id,
        orgUnitId,
        contractDate: day((c.schedule ?? 5) - 7),
        totalAmount: c.amount,
        depositRatio: 0.1,
        depositAmount: deposit,
        balanceAmount: balance,
        status: 'SIGNED',
        signedAt: day((c.schedule ?? 5) - 7),
        esignRef: `demo_sign_${i}`,
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
        paidAt: day((c.schedule ?? 5) - 7),
        virtualAccount: `가상은행 VA${1000 + i}`,
      },
    });
    // 잔금은 완료 건만 입금됨 — 나머지는 미수금으로 남아 정산 화면에 보인다
    await prisma.payment.create({
      data: {
        contractId: contract.id,
        kind: 'BALANCE',
        amount: balance,
        method: 'VIRTUAL_ACCOUNT',
        status: c.stage === 'DONE' ? 'PAID' : 'PENDING',
        paidAt: c.stage === 'DONE' ? day(c.schedule ?? 0) : null,
        virtualAccount: `가상은행 VA${2000 + i}`,
      },
    });
    if (c.stage === 'CONTRACTED') continue;

    // 작업오더 + 배정
    const workNo = `WO${String(i + 1).padStart(4, '0')}`;
    const wo = await prisma.workOrder.upsert({
      where: { contractId: contract.id },
      update: {
        status: c.stage === 'DONE' ? 'DONE' : 'IN_PROGRESS',
        scheduledDate: day(c.schedule ?? 0),
        partnerId: c.outsource ? partnerByCode.get(c.outsource) : null,
      },
      create: {
        workNo,
        contractId: contract.id,
        leadId: lead.id,
        orgUnitId,
        partnerId: c.outsource ? partnerByCode.get(c.outsource) : undefined,
        scheduledDate: day(c.schedule ?? 0),
        status: c.stage === 'DONE' ? 'DONE' : 'IN_PROGRESS',
        billedCost: c.outsource ? Math.round(c.amount * 0.62) : null,
      },
    });
    await prisma.workAssignment.deleteMany({ where: { workOrderId: wo.id } });
    if (crew) {
      await prisma.workAssignment.create({
        data: {
          workOrderId: wo.id,
          employeeId: crew.id,
          resourceType: 'CREW',
          scheduledAt: day(c.schedule ?? 0),
        },
      });
    }
    await prisma.workAssignment.create({
      data: {
        workOrderId: wo.id,
        resourceType: 'VEHICLE',
        resourceRef: `${c.amount > 2_500_000 ? '5톤' : '2.5톤'} 트럭 ${12 + (i % 8)}가${3456 + i}`,
        scheduledAt: day(c.schedule ?? 0),
      },
    });
  }

  console.log('\n단계별 접수:');
  for (const s of ['INTAKE', 'QUOTED', 'CONTRACTED', 'WORKING', 'DONE'] as Stage[]) {
    console.log(`  ${s.padEnd(11)} ${counts[s] ?? 0}건`);
  }
  const [leads, ests, cons, wos, pays] = await Promise.all([
    prisma.lead.count(),
    prisma.estimate.count(),
    prisma.contract.count(),
    prisma.workOrder.count(),
    prisma.payment.count(),
  ]);
  console.log(`\n전체: 접수 ${leads} / 견적 ${ests} / 계약 ${cons} / 작업 ${wos} / 결제 ${pays}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
