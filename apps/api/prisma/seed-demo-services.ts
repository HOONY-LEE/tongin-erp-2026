/**
 * 시드 — 고객A/S·CS, 리빙케어(서비스 주문), 마케팅 캠페인 3개.
 *
 *   pnpm --filter @tongin/api demo:seed:services
 *
 * seed-demo-leads.ts(가상 고객·계약)를 먼저 돌려야 한다 — 고객·계약·지점을 거기서 가져다 쓴다.
 * 실제로 보내지 않는다: 캠페인은 '발송 완료'(결과 기록만)와 '작성 중'뿐이라 예약 발송이 문자를 내보낼 일이 없다.
 * 날짜는 오늘 기준 상대일. 멱등하다 — 번호(AS/LV + 순번)·고정 id로 upsert, 받는 사람은 지우고 다시 넣는다.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 오늘 기준 상대일 → UTC 자정(DATE 컬럼) */
function day(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
/** 오늘 기준 상대일 + 시각 */
function at(offset: number, hour: number, min = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, min, 0, 0);
  return d;
}

// ── 리빙케어 상품(이사 상품과 따로) ──
const SERVICE_PRODUCTS = [
  {
    code: 'P-LV-CLEAN',
    name: '입주청소',
    serviceLine: 'LIVING',
    pricingMethod: 'PYEONG',
    basePrice: 350000,
  },
  {
    code: 'P-LV-ORG',
    name: '정리수납',
    serviceLine: 'LIVING',
    pricingMethod: 'FLAT',
    basePrice: 400000,
  },
  {
    code: 'P-CR-AIRCON',
    name: '에어컨 분해세척',
    serviceLine: 'CARE',
    pricingMethod: 'FLAT',
    basePrice: 120000,
  },
  {
    code: 'P-CR-SICKHOUSE',
    name: '새집증후군 시공',
    serviceLine: 'CARE',
    pricingMethod: 'PYEONG',
    basePrice: 280000,
  },
];

/** 서비스 주문 — [상품 코드, 상태, 일정(상대일), 금액, 메모] */
const SERVICE_ORDERS: [string, string, number, number, string][] = [
  ['P-LV-CLEAN', 'DONE', -21, 380000, '32평 아파트, 베란다 포함'],
  ['P-LV-CLEAN', 'DONE', -12, 420000, '입주 전날 오후 시공'],
  ['P-CR-AIRCON', 'DONE', -9, 120000, '스탠드 1대'],
  ['P-LV-ORG', 'DONE', -6, 450000, '주방·드레스룸'],
  ['P-CR-SICKHOUSE', 'SCHEDULED', 2, 310000, '이사 3일 전 시공 요청'],
  ['P-LV-CLEAN', 'SCHEDULED', 4, 360000, '이사 당일 오전'],
  ['P-CR-AIRCON', 'SCHEDULED', 6, 240000, '벽걸이 2대'],
  ['P-LV-ORG', 'SCHEDULED', 9, 400000, '아이 방 수납 위주'],
  ['P-LV-CLEAN', 'REQUESTED', 14, 340000, '날짜 협의 중'],
  ['P-CR-SICKHOUSE', 'REQUESTED', 18, 290000, '견적 방문 희망'],
  ['P-CR-AIRCON', 'REQUESTED', 20, 120000, '이사 후 설치 전 세척'],
  ['P-LV-ORG', 'CANCELED', 7, 400000, '고객 사정으로 취소'],
];

/** A/S·CS 접수 — [종류, 채널, 제목, 내용, 우선순위, 상태, 접수일(상대일), 처리 결과] */
const TICKETS: [string, string, string, string, string, string, number, string | null][] = [
  [
    'AS',
    'PHONE',
    '장롱 문짝 파손',
    '이사 중 장롱 문짝 경첩이 빠졌다고 연락. 사진 받음.',
    'HIGH',
    'IN_PROGRESS',
    -3,
    null,
  ],
  [
    'AS',
    'KAKAO',
    '냉장고 외관 긁힘',
    '양문형 냉장고 오른쪽 문 긁힘. 보상 문의.',
    'HIGH',
    'RECEIVED',
    -1,
    null,
  ],
  [
    'AS',
    'PHONE',
    '식탁 다리 흔들림',
    '조립 후 다리 한쪽이 흔들림 — 재조립 요청',
    'NORMAL',
    'RESOLVED',
    -8,
    '기사 재방문해 재조립 완료',
  ],
  [
    'AS',
    'VISIT',
    '벽 찍힘(도착지)',
    '현관 옆 벽지 찍힘. 도배 보수 요청.',
    'NORMAL',
    'IN_PROGRESS',
    -5,
    null,
  ],
  [
    'AS',
    'PHONE',
    '세탁기 배수 호스 누락',
    '배수 호스를 안 챙겨 왔다고 함',
    'HIGH',
    'CLOSED',
    -15,
    '당일 호스 전달·설치',
  ],
  [
    'AS',
    'EMAIL',
    'TV 받침대 나사 분실',
    '벽걸이 TV 브라켓 나사가 없음',
    'LOW',
    'RESOLVED',
    -11,
    '나사 택배 발송',
  ],
  [
    'CS',
    'PHONE',
    '계약금 입금 확인 문의',
    '어제 입금했는데 확인됐는지 문의',
    'NORMAL',
    'CLOSED',
    -4,
    '입금 확인 안내',
  ],
  [
    'CS',
    'KAKAO',
    '이사 날짜 변경 요청',
    '다음 주로 하루 미루고 싶다고 함',
    'NORMAL',
    'RECEIVED',
    0,
    null,
  ],
  [
    'CS',
    'PHONE',
    '견적 금액 문의',
    '사다리차 비용이 왜 붙었는지 문의',
    'LOW',
    'RESOLVED',
    -6,
    '고층·엘리베이터 사용 불가로 필요 안내',
  ],
  [
    'CS',
    'EMAIL',
    '세금계산서 발행 요청',
    '사무실 이사 건 세금계산서 요청',
    'NORMAL',
    'IN_PROGRESS',
    -2,
    null,
  ],
  [
    'CS',
    'PHONE',
    '기사님 칭찬',
    '포장이 꼼꼼했다고 감사 전화',
    'LOW',
    'CLOSED',
    -10,
    '해당 팀 공유',
  ],
  [
    'AS',
    'PHONE',
    '침대 프레임 파손 주장',
    '확인 결과 기존 파손 가능성 — 사진 대조 중',
    'HIGH',
    'CANCELED',
    -13,
    '이사 전 사진과 동일 — 고객 확인 후 취소',
  ],
];

/** 캠페인 실패 사유 — 실제 문자 발송에서 흔한 것들 */
const FAIL_REASONS = ['결번(없는 번호)', '수신 거부 번호', '단말기 전원 꺼짐'];
const campaignId = (n: number) => `00000000-0000-4000-8000-00000000c${String(n).padStart(3, '0')}`;

async function main() {
  // ── 참조 ──
  const contracts = await prisma.contract.findMany({
    where: { status: 'SIGNED' },
    select: { id: true, customerId: true, orgUnitId: true, lead: { select: { toAddr: true } } },
    orderBy: { contractNo: 'asc' },
  });
  const customers = await prisma.customer.findMany({
    where: { phonePrimary: { startsWith: '010-0000-' } },
    select: { id: true, name: true, phonePrimary: true, ownerOrgId: true },
    orderBy: { phonePrimary: 'asc' },
  });
  if (!contracts.length || !customers.length) {
    console.error(
      '계약·고객이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed:leads` 를 돌려야 한다',
    );
    process.exit(1);
  }
  const branchStaff = new Map(
    (
      await prisma.employee.findMany({
        where: { orgUnit: { type: 'BRANCH' } },
        select: { id: true, orgUnitId: true },
      })
    ).map((e) => [e.orgUnitId, e.id]),
  );

  // ── 리빙케어 상품·주문 ──
  const productId = new Map<string, string>();
  for (const p of SERVICE_PRODUCTS) {
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
    productId.set(p.code, row.id);
  }
  for (const [i, [code, status, offset, amount, note]] of SERVICE_ORDERS.entries()) {
    const c = contracts[(i * 3) % contracts.length];
    const p = SERVICE_PRODUCTS.find((x) => x.code === code)!;
    const orderNo = `LV${String(i + 1).padStart(4, '0')}`;
    const data = {
      serviceLine: p.serviceLine,
      productId: productId.get(code),
      customerId: c.customerId,
      orgUnitId: c.orgUnitId,
      scheduledDate: day(offset),
      address: c.lead?.toAddr ?? null,
      amount: new Prisma.Decimal(amount),
      note,
      status,
      assignedEmpId: status === 'REQUESTED' ? null : (branchStaff.get(c.orgUnitId) ?? null),
      createdAt: at(Math.min(offset, 0) - 7, 10 + (i % 6)),
    };
    await prisma.serviceOrder.upsert({
      where: { orderNo },
      update: data,
      create: { orderNo, ...data },
    });
  }

  // ── A/S·CS 접수 — A/S는 이사가 끝난 계약 고객 ──
  for (const [
    i,
    [kind, channel, subject, content, priority, status, offset, resolution],
  ] of TICKETS.entries()) {
    const c = contracts[(i * 5 + 1) % contracts.length];
    const ticketNo = `AS${String(i + 1).padStart(4, '0')}`;
    const data = {
      kind,
      channel,
      subject,
      content,
      priority,
      status,
      resolution,
      customerId: c.customerId,
      contractId: kind === 'AS' ? c.id : null,
      orgUnitId: c.orgUnitId,
      assigneeEmpId: status === 'RECEIVED' ? null : (branchStaff.get(c.orgUnitId) ?? null),
      createdAt: at(offset, 9 + (i % 8), (i * 7) % 60),
    };
    await prisma.supportTicket.upsert({
      where: { ticketNo },
      update: data,
      create: { ticketNo, ...data },
    });
  }

  // ── 마케팅 캠페인 3개 — 발송 완료 2(결과만 기록) + 작성 중 1 ──
  const author = await prisma.appUser.findFirst({
    where: { loginId: { in: ['seungho_song', 'kookjong_ko', 'admin'] } },
    orderBy: { loginId: 'desc' },
    select: { id: true },
  });
  const CAMPAIGNS = [
    {
      n: 1,
      name: '가을 이사 성수기 조기예약 할인',
      status: 'SENT',
      isAd: true,
      optOutText: '무료수신거부 080-000-0000',
      title: '[통인익스프레스] 가을 성수기 조기예약 할인',
      message:
        '{고객명} 고객님, 통인익스프레스입니다.\n가을 이사 성수기 전에 미리 예약하시면 포장이사 10% 할인해 드립니다.\n· 예약 기간: 이번 달 말까지\n· 손 없는 날도 조기예약 시 같은 할인\n견적 문의 1899-0123',
      periodStart: day(-20),
      periodEnd: day(10),
      who: customers.slice(0, 40),
      createdAt: at(-16, 14, 20),
      sentAt: at(-14, 10, 0),
      failEvery: 15,
    },
    {
      n: 2,
      name: '이사 완료 고객 입주청소 안내',
      status: 'SENT',
      isAd: false,
      optOutText: null,
      title: null,
      message:
        '{고객명} 고객님, 이사는 잘 마무리하셨나요?\n통인익스프레스 입주청소·정리수납도 함께 맡겨 주세요. 이사 고객은 15% 할인됩니다.\n문의 1899-0123',
      periodStart: day(-10),
      periodEnd: day(20),
      who: customers.slice(20, 48),
      createdAt: at(-6, 9, 40),
      sentAt: at(-5, 11, 0),
      failEvery: 20,
    },
    {
      n: 3,
      name: '연말 이사 할인 안내',
      status: 'DRAFT',
      isAd: true,
      optOutText: '무료수신거부 080-000-0000',
      title: '[통인익스프레스] 연말 이사 할인',
      message:
        '{고객명} 고객님, 한 해 마무리 잘하고 계신가요?\n12월 이사 예약 고객께 포장이사 8% 할인과 박스 20개를 무료로 드립니다.\n견적 문의 1899-0123',
      periodStart: day(30),
      periodEnd: day(60),
      who: customers.slice(50, 75),
      createdAt: at(0, 9, 15),
      sentAt: null,
      failEvery: 0,
    },
  ];
  for (const c of CAMPAIGNS) {
    const id = campaignId(c.n);
    const sent = c.status === 'SENT';
    const results = c.who.map((cu, k) => {
      const fail = sent && c.failEvery > 0 && k % c.failEvery === c.failEvery - 1;
      return {
        campaignId: id,
        customerId: cu.id,
        name: cu.name,
        phone: cu.phonePrimary ?? '',
        status: !sent ? 'PENDING' : fail ? 'FAILED' : 'SENT',
        reason: fail ? FAIL_REASONS[k % FAIL_REASONS.length] : null,
        sentAt: sent && !fail ? c.sentAt : null,
      };
    });
    const failed = results.filter((r) => r.status === 'FAILED').length;
    const data = {
      name: c.name,
      channel: 'SMS',
      message: c.message,
      title: c.title,
      isAd: c.isAd,
      optOutText: c.optOutText,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      status: c.status,
      recipientCount: results.length,
      sentCount: sent ? results.length - failed : 0,
      failedCount: failed,
      sentAt: c.sentAt,
      createdBy: author?.id ?? null,
      createdAt: c.createdAt,
    };
    await prisma.$transaction([
      prisma.campaignRecipient.deleteMany({ where: { campaignId: id } }),
      prisma.campaign.upsert({ where: { id }, update: data, create: { id, ...data } }),
      prisma.campaignRecipient.createMany({ data: results }),
    ]);
  }

  const [so, tk, cp] = await Promise.all([
    prisma.serviceOrder.count(),
    prisma.supportTicket.count(),
    prisma.campaign.count(),
  ]);
  console.log(`리빙케어 ${so}건 · A/S·CS ${tk}건 · 캠페인 ${cp}개`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
