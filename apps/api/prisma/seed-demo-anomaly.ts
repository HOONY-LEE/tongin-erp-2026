/**
 * 데모 이상 지점 — "견적은 받아놓고 전산 밖에서 계약해 본사 수수료를 피하는" 가맹점 패턴을 심는다.
 * 대시보드의 '이상 지점' 카드와 AI 비서의 find_suspicious_branches("수수료 안 내려고 계약 숨기는 지점 찾아줘") 시연용.
 *
 *   pnpm --filter @tongin/api demo:seed:anomaly
 *
 * seed-demo-regions.ts(지점·직원)와 seed-demo-cases.ts(상품)를 먼저 돌려야 한다.
 *
 * 무엇을 넣나 — 이미 있는 지역 지점 몇 곳에 접수를 더한다(그 지점의 원래 계약·매출은 그대로):
 *  - 부천점·김해점·원주점(의심): 방문견적까지 했는데(견적 금액 있음) 상태가 견적완료·상담토스에 머문 건이 많고,
 *    그중 상당수는 이사일이 이미 지났다(고객은 이사했는데 전산상 계약이 없다). 계약은 원래 몇 건뿐이라 매출이 낮다.
 *  - 평택점(주의): 같은 패턴이 약하게 — 경계선 사례.
 *  - 나머지 지점은 손대지 않아 정상 비교군이 된다.
 * 수수료 규칙이 하나도 없으면 '가맹 수수료(기본)' 10% 규칙을 하나 넣는다(추정 미납 수수료 계산용).
 *
 * 멱등하다 — 접수·견적은 고정 번호(RX/EX + 지점순번 + 건순번)로 upsert, 견적품목은 그 견적 것만 지우고 다시 넣는다.
 * 날짜는 오늘 기준 상대값이고 접수·방문일은 모두 과거다.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/** 오늘 기준 상대일 → UTC 자정 Date (다른 데모 시드와 같은 규칙) */
function day(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * 건 종류
 *  PAST_QUOTED  견적완료 + 이사일 지남 (가장 강한 신호)
 *  PAST_TOSS    상담토스인데 견적서(작성중)까지 있고 이사일 지남
 *  STALE_QUOTED 견적완료 후 3주 넘게 멈춤, 이사일은 아직
 *  CANCELED     견적 후 취소(이사일 지남) — 흔한 은폐 수법이지만 점수엔 넣지 않는 현실감용
 *  FRESH        최근 접수(상담토스) — 정상적인 진행 건
 */
type Kind = 'PAST_QUOTED' | 'PAST_TOSS' | 'STALE_QUOTED' | 'CANCELED' | 'FRESH';
const KIND_STATUS: Record<Kind, string> = {
  PAST_QUOTED: 'QUOTED',
  PAST_TOSS: 'CONSULT_TOSS',
  STALE_QUOTED: 'QUOTED',
  CANCELED: 'CANCELED',
  FRESH: 'CONSULT_TOSS',
};

interface Spec {
  code: string;
  /** 평균 견적 금액(원) */
  avg: number;
  mix: Partial<Record<Kind, number>>;
}

const SPECS: Spec[] = [
  {
    code: 'BR-BC',
    avg: 2_600_000,
    mix: { PAST_QUOTED: 9, PAST_TOSS: 3, STALE_QUOTED: 2, CANCELED: 1, FRESH: 1 },
  },
  {
    code: 'BR-GH',
    avg: 2_300_000,
    mix: { PAST_QUOTED: 6, PAST_TOSS: 3, STALE_QUOTED: 2, CANCELED: 1, FRESH: 1 },
  },
  {
    code: 'BR-WJ',
    avg: 2_200_000,
    mix: { PAST_QUOTED: 5, PAST_TOSS: 2, STALE_QUOTED: 2, FRESH: 2 },
  },
  { code: 'BR-PT', avg: 2_400_000, mix: { PAST_QUOTED: 2, STALE_QUOTED: 1, FRESH: 2 } },
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
  '권',
];
const GIVEN = [
  '민재',
  '하늘',
  '수빈',
  '태윤',
  '예린',
  '도현',
  '서진',
  '지안',
  '현수',
  '유나',
  '건우',
  '나래',
  '준혁',
  '소희',
];
/** 지점·건 순번으로 고르는 고객 이름 — 한 지점 안에서 겹치지 않게 성·이름을 따로 돌린다 */
const personName = (si: number, ci: number) =>
  SURNAMES[(si * 4 + ci) % SURNAMES.length] + GIVEN[(si * 5 + ci * 3) % GIVEN.length];
const SOURCES = ['NAVER', 'PHONE', 'HOMEPAGE', 'INSTAGRAM'];
const PRODUCTS = ['P-HOME', 'P-HOME', 'P-HALF', 'P-HOME', 'P-STORE'];
const ITEMS = [
  { name: '침대', cbm: 1.8 },
  { name: '장롱', cbm: 1.5 },
  { name: '소파', cbm: 1.6 },
  { name: '냉장고', cbm: 1.2 },
  { name: '식탁/의자', cbm: 0.9 },
  { name: '세탁기/건조기', cbm: 0.6 },
];

/** 건 종류별 이사일·접수일·방문일 (오늘 기준 상대일, 결정적) */
function timeline(kind: Kind, n: number) {
  if (kind === 'FRESH') return { received: -(1 + (n % 5)), visit: null, move: 15 + (n % 20) };
  if (kind === 'STALE_QUOTED') {
    const received = -(28 + (n % 15));
    return { received, visit: received + 4, move: 10 + (n % 25) };
  }
  // 이사일이 지난 건: 5~80일 전 이사, 그 2~4주 전에 접수·방문견적
  const move = -(5 + ((n * 13) % 76));
  const received = move - (16 + (n % 14));
  return { received, visit: received + 3 + (n % 4), move };
}

async function main() {
  const products = await prisma.product.findMany({ where: { code: { startsWith: 'P-' } } });
  const productByCode = new Map(products.map((p) => [p.code, p.id]));
  if (!productByCode.get('P-HOME')) {
    console.error('상품이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed:cases` 를 돌려야 한다');
    process.exit(1);
  }
  const cbmRows = await prisma.cbmItem.findMany({
    where: { name: { in: ITEMS.map((i) => i.name) } },
  });
  const cbmByName = new Map(cbmRows.map((r) => [r.name, r]));

  let total = 0;
  for (const [si, spec] of SPECS.entries()) {
    const branch = await prisma.orgUnit.findUnique({ where: { code: spec.code } });
    if (!branch) {
      console.error(
        `지점 ${spec.code}이 없다 — 먼저 \`pnpm --filter @tongin/api demo:seed:regions\` 를 돌려야 한다`,
      );
      process.exit(1);
    }
    const manager = await prisma.employee.findFirst({
      where: { orgUnitId: branch.id },
      orderBy: { empNo: 'asc' },
    });
    const sido = branch.sido ?? '';
    const area = `${sido}${branch.sigungu ? ` ${branch.sigungu}` : ''}`;
    const kinds = (Object.entries(spec.mix) as [Kind, number][]).flatMap(([k, c]) =>
      Array<Kind>(c).fill(k),
    );
    const sno = String(si + 1).padStart(2, '0');
    const counts: Partial<Record<Kind, number>> = {};

    for (const [ci, kind] of kinds.entries()) {
      const n = si * 37 + ci * 7 + 3;
      const seq = `${sno}${String(ci + 1).padStart(2, '0')}`;
      const phone = `010-7${String(si + 1).padStart(3, '0')}-${String(ci + 1).padStart(4, '0')}`;
      // 이 시드 전용 번호대(010-7xxx)라 이름은 매번 맞춰 둔다
      const found = await prisma.customer.findFirst({ where: { phonePrimary: phone } });
      const customer = found
        ? await prisma.customer.update({
            where: { id: found.id },
            data: { name: personName(si, ci) },
          })
        : await prisma.customer.create({
            data: {
              name: personName(si, ci),
              phonePrimary: phone,
              ownerOrgId: branch.id,
              grade: 'NORMAL',
            },
          });
      const t = timeline(kind, n);
      const addr = {
        fromZipcode: branch.zipcode ?? undefined,
        fromAddr: `${area} 중앙로 ${40 + ci * 9}`,
        fromAddrDetail: `${101 + (n % 9)}동 ${200 + ((n * 7) % 12) * 100 + 3}호`,
        fromSido: sido || undefined,
        fromSigungu: branch.sigungu ?? undefined,
        toAddr: `${area} 시청로 ${10 + ci * 11}`,
        toAddrDetail: `${300 + ((n * 3) % 10) * 100 + 1}호`,
        toSido: sido || undefined,
        toSigungu: branch.sigungu ?? undefined,
      };
      const status = KIND_STATUS[kind];
      const leadNo = `RX${seq}`;
      const data = {
        status,
        orgUnitId: branch.id,
        customerId: customer.id,
        ownerEmpId: manager?.id,
        createdAt: day(t.received),
        visitDate: t.visit === null ? null : day(t.visit),
        moveDate: day(t.move),
        ...addr,
      };
      const lead = await prisma.lead.upsert({
        where: { leadNo },
        update: data,
        create: { leadNo, source: SOURCES[n % SOURCES.length], serviceLine: 'MOVING', ...data },
      });
      counts[kind] = (counts[kind] ?? 0) + 1;
      total++;
      if (kind === 'FRESH') continue;

      // 방문견적 — 금액은 지점 평균 ±30%, 만원 단위
      const amount = Math.round((spec.avg * (0.7 + ((n * 29) % 61) / 100)) / 10_000) * 10_000;
      const items = Array.from(
        { length: 3 + (n % 3) },
        (_, i) => ITEMS[(n + i * 2) % ITEMS.length],
      );
      const totalCbm = items.reduce((s, it) => s + it.cbm, 0);
      const estimateNo = `EX${seq}`;
      const estData = {
        status: kind === 'PAST_TOSS' ? 'DRAFT' : 'QUOTED',
        totalAmount: amount,
        baseAmount: Math.round(amount * 0.85),
        totalCbm,
        createdAt: day(t.visit ?? t.received),
      };
      const estimate = await prisma.estimate.upsert({
        where: { estimateNo },
        update: estData,
        create: {
          estimateNo,
          leadId: lead.id,
          customerId: customer.id,
          orgUnitId: branch.id,
          productId:
            productByCode.get(PRODUCTS[n % PRODUCTS.length]) ?? productByCode.get('P-HOME')!,
          estimatorEmpId: manager?.id,
          fromPyeong: 20 + (n % 5) * 5,
          fromAccess: n % 4 === 0 ? 'STAIRS' : 'ELEVATOR',
          toPyeong: 22 + (n % 4) * 6,
          toAccess: 'ELEVATOR',
          ...addr,
          ...estData,
        },
      });
      await prisma.estimateLine.deleteMany({ where: { estimateId: estimate.id } });
      for (const it of items) {
        const row = cbmByName.get(it.name);
        await prisma.estimateLine.create({
          data: {
            estimateId: estimate.id,
            cbmItemId: row?.id,
            itemName: it.name,
            itemNameEng: row?.nameEng,
            qty: 1,
            cbm: new Prisma.Decimal(it.cbm),
            handling: 'CARRY',
          },
        });
      }
    }
    console.log(
      `${branch.name}(${spec.code}) +${kinds.length}건 — ` +
        Object.entries(counts)
          .map(([k, c]) => `${k} ${c}`)
          .join(', '),
    );
  }

  // 수수료 규칙이 하나도 없을 때만 기본 규칙을 둔다(이미 있으면 그대로)
  if (!(await prisma.commissionRule.count({ where: { isActive: true } }))) {
    await prisma.commissionRule.create({
      data: { name: '가맹 수수료(기본)', calcType: 'RATE', rate: 0.1, priority: 0 },
    });
    console.log('수수료 규칙: 가맹 수수료(기본) 10% 추가');
  }
  console.log(`\n이상 지점 시연 접수 ${total}건 반영`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
