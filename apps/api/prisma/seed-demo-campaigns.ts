/**
 * 데모 마케팅 캠페인 — 발송 완료·예약·작성 중 캠페인 몇 개와 받는 사람(건별 결과).
 *
 *   pnpm --filter @tongin/api demo:seed:campaigns
 *
 * 고객·접수를 만드는 seed-demo-cases.ts / seed-demo-regions.ts를 먼저 돌려야 한다 —
 * 받는 사람은 이미 있는 고객 중에서 접수 상태로 골라 쓴다.
 *
 * 실제로 보내지 않는다 — 발송 완료 캠페인의 결과(성공·실패)는 기록만 만든다(notification 로그도 남기지 않는다).
 * 예약 캠페인은 알림톡(항상 스텁) + 문자 대체 끔이라, 예약 시각이 지나 API가 집어 가도 문자는 나가지 않는다.
 *
 * 멱등하다 — 데모 캠페인은 고정 id로 만들고, 재실행하면 같은 id의 캠페인(+받는 사람)을 지우고 다시 넣는다.
 * 사용자가 만든 캠페인은 건드리지 않는다.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/** 데모 캠페인 고정 id — 재실행 때 이것만 갈아 끼운다 */
const demoId = (n: number) => `00000000-0000-4000-8000-00000000c${String(n).padStart(3, '0')}`;

/** 오늘 기준 상대일 + 시각(로컬) */
function at(offset: number, hour = 10, min = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, min, 0, 0);
  return d;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** 실패 사유 — 실제 문자 발송에서 흔히 나오는 것들 */
const FAIL_REASONS = ['결번(없는 번호)', '수신 거부 번호', '단말기 전원 꺼짐', '통신사 일시 오류'];

interface DemoCampaign {
  n: number;
  name: string;
  channel: 'SMS' | 'ALIMTALK';
  status: 'DRAFT' | 'SCHEDULED' | 'SENT';
  message: string;
  title?: string;
  isAd?: boolean;
  optOutText?: string;
  templateCode?: string;
  buttons?: { name: string; url: string }[];
  fallbackSms?: boolean;
  filters: Prisma.InputJsonObject;
  /** 받는 사람 — 이 접수 상태가 있는 고객 중에서 */
  leadStatuses: string[];
  take: number;
  /** 받는 사람 고르는 시작 위치(캠페인끼리 대상이 조금씩 겹치고 다르게) */
  skip: number;
  createdAt: Date;
  scheduledAt?: Date;
  sentAt?: Date;
  /** 발송 완료일 때 실패로 둘 비율(0~1) */
  failRate?: number;
}

function campaigns(): DemoCampaign[] {
  return [
    {
      n: 1,
      name: '가을 이사 성수기 조기예약 할인',
      channel: 'SMS',
      status: 'SENT',
      isAd: true,
      optOutText: '무료수신거부 080-123-4567',
      title: '[통인익스프레스] 가을 성수기 조기예약 할인',
      message:
        '{고객명} 고객님, 통인익스프레스입니다.\n' +
        '가을 이사 성수기(10~11월) 전에 미리 예약하시면 포장이사 10% 할인해 드립니다.\n' +
        '· 예약 기간: 이번 달 말까지\n· 손 없는 날도 조기예약 시 같은 할인\n' +
        '견적 문의 1588-0000',
      filters: { leadStatuses: ['QUOTED', 'CONSULT_TOSS'], excludeRecentDays: 30 },
      leadStatuses: ['QUOTED', 'CONSULT_TOSS'],
      take: 48,
      skip: 0,
      createdAt: at(-16, 14, 20),
      sentAt: at(-14, 10, 0),
      failRate: 0.06,
    },
    {
      n: 2,
      name: '미계약 고객 재안내',
      channel: 'SMS',
      status: 'SENT',
      message:
        '{고객명} 고객님, 지난번 받아 보신 이사 견적 관련해 다시 안내드립니다.\n' +
        '일정·금액 조정이 필요하시면 편하게 연락 주세요. 담당 상담사가 바로 도와드립니다.\n' +
        '통인익스프레스 1588-0000',
      filters: {
        leadStatuses: ['QUOTED'],
        receivedFrom: ymd(at(-45)),
        receivedTo: ymd(at(-7)),
      },
      leadStatuses: ['QUOTED'],
      take: 32,
      skip: 10,
      createdAt: at(-6, 9, 40),
      sentAt: at(-5, 11, 0),
      failRate: 0.04,
    },
    {
      n: 3,
      name: '입주청소 패키지 프로모션',
      channel: 'ALIMTALK',
      status: 'SENT',
      templateCode: 'TI_CLEAN_PKG_01',
      title: '입주청소 패키지 20% 할인',
      buttons: [{ name: '패키지 자세히 보기', url: 'https://tongin.example.com/clean' }],
      fallbackSms: true,
      message:
        '{고객명} 고객님, 이사 계약해 주셔서 감사합니다.\n' +
        '새 집 입주 전 청소, 통인익스프레스 입주청소 패키지로 한 번에 맡기세요.\n' +
        '■ 이사 계약 고객 20% 할인\n■ 이사 전날 또는 당일 오전 시공\n■ 새집증후군 케어 포함',
      filters: { leadStatuses: ['CONTRACTED', 'IN_PROGRESS'] },
      leadStatuses: ['CONTRACTED', 'IN_PROGRESS'],
      take: 36,
      skip: 0,
      createdAt: at(-31, 16, 5),
      sentAt: at(-30, 10, 30),
      failRate: 0.03,
    },
    {
      n: 4,
      name: '이사 완료 고객 정리수납 서비스 안내',
      channel: 'ALIMTALK',
      status: 'SCHEDULED',
      templateCode: 'TI_ORGANIZE_01',
      title: '정리수납 서비스 안내',
      buttons: [{ name: '서비스 신청하기', url: 'https://tongin.example.com/organize' }],
      // 데모 번호로 실제 문자가 나가지 않게 — 알림톡은 스텁, 문자 대체는 끈다
      fallbackSms: false,
      message:
        '{고객명} 고객님, 새 집 생활은 어떠신가요?\n' +
        '아직 정리가 덜 된 짐이 있다면 통인익스프레스 정리수납 전문가가 도와드립니다.\n' +
        '■ 주방·옷장·팬트리 맞춤 정리\n■ 이사 고객 첫 방문 15% 할인',
      filters: { leadStatuses: ['DONE'], excludeRecentDays: 14 },
      leadStatuses: ['DONE'],
      take: 40,
      skip: 0,
      createdAt: at(-1, 15, 0),
      scheduledAt: at(4, 10, 0),
    },
    {
      n: 5,
      name: '연말 이사 할인 안내',
      channel: 'SMS',
      status: 'DRAFT',
      isAd: true,
      optOutText: '무료수신거부 080-123-4567',
      title: '[통인익스프레스] 연말 이사 할인',
      message:
        '{고객명} 고객님, 한 해 마무리 잘하고 계신가요?\n' +
        '12월 이사 예약 고객께 포장이사 8% 할인과 박스 20개를 무료로 드립니다.\n' +
        '견적 문의 1588-0000',
      filters: { leadStatuses: ['CONSULT_TOSS', 'QUOTED'], grades: ['NORMAL'] },
      leadStatuses: ['CONSULT_TOSS', 'QUOTED'],
      take: 25,
      skip: 30,
      createdAt: at(0, 9, 15),
    },
  ];
}

async function main() {
  const author = await prisma.appUser.findFirst({
    where: { loginId: { in: ['admin', 'hq.admin', 'gn.manager'] } },
    select: { id: true },
  });

  let total = 0;
  for (const c of campaigns()) {
    const id = demoId(c.n);
    // 재실행 — 같은 id의 데모 캠페인을 받는 사람과 함께 지우고 다시 넣는다
    await prisma.$transaction([
      prisma.campaignRecipient.deleteMany({ where: { campaignId: id } }),
      prisma.campaign.deleteMany({ where: { id } }),
    ]);

    const customers = await prisma.customer.findMany({
      where: { phonePrimary: { not: null }, leads: { some: { status: { in: c.leadStatuses } } } },
      orderBy: { phonePrimary: 'asc' },
      skip: c.skip,
      take: c.take,
      select: { id: true, name: true, phonePrimary: true },
    });

    const sent = c.status === 'SENT';
    const failEvery = sent && c.failRate ? Math.max(2, Math.round(1 / c.failRate)) : 0;
    const recipients = customers.map((cu, i) => {
      const failed = failEvery > 0 && i % failEvery === failEvery - 1;
      return {
        campaignId: id,
        customerId: cu.id,
        name: cu.name,
        phone: cu.phonePrimary!,
        status: sent ? (failed ? 'FAILED' : 'SENT') : 'PENDING',
        reason: failed ? FAIL_REASONS[i % FAIL_REASONS.length] : null,
        // 받는 사람마다 몇 초씩 차이 나게
        sentAt: sent && c.sentAt ? new Date(c.sentAt.getTime() + i * 1500) : null,
      };
    });
    const failedCount = recipients.filter((r) => r.status === 'FAILED').length;

    await prisma.$transaction([
      prisma.campaign.create({
        data: {
          id,
          name: c.name,
          channel: c.channel,
          status: c.status,
          message: c.message,
          title: c.title ?? null,
          isAd: c.isAd ?? false,
          optOutText: c.optOutText ?? null,
          templateCode: c.templateCode ?? null,
          buttons: c.buttons ? (c.buttons as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          fallbackSms: c.fallbackSms ?? true,
          filters: c.filters,
          recipientCount: recipients.length,
          sentCount: sent ? recipients.length - failedCount : 0,
          failedCount: sent ? failedCount : 0,
          scheduledAt: c.scheduledAt ?? null,
          sentAt: sent ? (c.sentAt ?? null) : null,
          createdBy: author?.id ?? null,
          createdAt: c.createdAt,
        },
      }),
      prisma.campaignRecipient.createMany({ data: recipients }),
    ]);
    total += recipients.length;
    console.log(
      `캠페인 '${c.name}' (${c.channel}·${c.status}) 받는 사람 ${recipients.length}명` +
        (sent ? ` — 성공 ${recipients.length - failedCount} · 실패 ${failedCount}` : ''),
    );
  }
  console.log(`\n데모 캠페인 ${campaigns().length}개 · 받는 사람 ${total}명 (실제 발송 없음)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
