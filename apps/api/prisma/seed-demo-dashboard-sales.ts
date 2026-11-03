/**
 * 영업 대시보드(추가 시드, 한 번만) — 기업영업 대시보드를 새로 만들고, 가맹 대시보드에 가맹 영업 줄을 덧붙인다.
 *
 * - 같은 이름의 템플릿이 이미 있으면 새로 만들지 않는다(관리자가 고친 내용 보존)
 * - 가맹 대시보드에 가맹 영업 위젯이 하나도 없으면 맨 아래에 그 줄만 덧붙인다
 * - 기업영업팀 직원 계정은 지금 공용 템플릿(경영관리 등)에 지정돼 있으면 기업영업 대시보드로 옮긴다.
 *   본인이 만든 대시보드에 지정돼 있으면 건드리지 않는다
 */
import { PrismaClient } from '@prisma/client';
import {
  DASH_WIDGET_MAP,
  compactDashLayout,
  makeDashItem,
  type DashItem,
  type DashPeriod,
  type DashViz,
} from '@tongin/shared';

const prisma = new PrismaClient();

type Spec = [
  widget: string,
  x: number,
  y: number,
  w?: number,
  h?: number,
  viz?: DashViz,
  period?: DashPeriod,
];

function place(specs: Spec[], top = 0): DashItem[] {
  return specs.map(([widget, x, y, w, h, viz, period]) => {
    const def = DASH_WIDGET_MAP.get(widget);
    if (!def) throw new Error(`없는 위젯: ${widget}`);
    const it = makeDashItem(def);
    Object.assign(
      it,
      { x, y: y + top },
      w && { w },
      h && { h },
      viz && { viz },
      period && { period },
    );
    return it;
  });
}

const B2B: Spec[] = [
  ['b2b.kpiRevenue', 0, 0, 3, 2, undefined, '30d'],
  ['b2b.kpiContracts', 3, 0, 3, 2, undefined, '30d'],
  ['crm.b2b.kpiPipeline', 6, 0],
  ['crm.b2b.kpiWinRate', 9, 0, 3, 2, 'card'],
  ['b2b.revenueTrend', 0, 2, 8, 5, 'bar', '12m'],
  ['crm.b2b.funnel', 8, 2, 4, 5, 'funnel'],
  ['b2b.byPartner', 0, 7, 6, 5, 'hbar', '12m'],
  ['crm.b2b.byOwner', 6, 7, 3, 5, 'hbar'],
  ['crm.b2b.bySource', 9, 7, 3, 5, 'donut'],
];

const FRAN_ROW: Spec[] = [
  ['crm.fran.kpiOpen', 0, 0],
  ['crm.fran.kpiWon', 3, 0],
  ['crm.fran.funnel', 6, 0, 6, 5, 'funnel'],
  ['crm.fran.bySource', 0, 2, 6, 3, 'donut'],
];

async function main() {
  const admin = await prisma.appUser.findUnique({ where: { loginId: 'admin' } });

  // ── 기업영업 대시보드 ──
  const NAME = '기업영업 대시보드';
  let b2b = await prisma.dashboard.findFirst({ where: { name: NAME, ownerUserId: null } });
  if (!b2b) {
    b2b = await prisma.dashboard.create({
      data: {
        name: NAME,
        description: '기업이전 매출·거래처별 실적과 기업영업 CRM 파이프라인(단계·수주율·담당자)',
        layout: { version: 1, items: compactDashLayout(place(B2B)) } as object,
        allowPersonal: true,
        createdBy: admin?.id ?? null,
      },
    });
    console.log(`대시보드 '${NAME}' 만듦`);
  } else console.log(`대시보드 '${NAME}' — 이미 있음(건너뜀)`);

  const role = await prisma.role.findUnique({ where: { code: 'TEAM_B2B' } });
  if (role) {
    const taken = await prisma.dashboardAssignment.findUnique({
      where: { targetType_targetId: { targetType: 'ROLE', targetId: role.id } },
    });
    if (!taken)
      await prisma.dashboardAssignment.create({
        data: { dashboardId: b2b.id, targetType: 'ROLE', targetId: role.id },
      });
  }
  const users = await prisma.appUser.findMany({
    where: { employee: { orgUnit: { code: 'DEPT-B2B' } } },
    select: { id: true },
  });
  let moved = 0;
  for (const u of users) {
    const cur = await prisma.dashboardAssignment.findUnique({
      where: { targetType_targetId: { targetType: 'USER', targetId: u.id } },
      include: { dashboard: { select: { ownerUserId: true } } },
    });
    if (cur && (cur.dashboard.ownerUserId || cur.dashboardId === b2b.id)) continue;
    await prisma.dashboardAssignment.upsert({
      where: { targetType_targetId: { targetType: 'USER', targetId: u.id } },
      create: { dashboardId: b2b.id, targetType: 'USER', targetId: u.id },
      update: { dashboardId: b2b.id },
    });
    moved++;
  }
  console.log(`기업영업팀 직원 ${moved}명을 '${NAME}'로 지정`);

  // ── 가맹 대시보드에 가맹 영업 줄 ──
  const fran = await prisma.dashboard.findFirst({
    where: { name: '가맹 대시보드', ownerUserId: null },
  });
  if (fran) {
    const items = (fran.layout as { items?: DashItem[] } | null)?.items ?? [];
    if (!items.some((i) => i.widget.startsWith('crm.fran.'))) {
      const bottom = Math.max(0, ...items.map((i) => i.y + i.h));
      await prisma.dashboard.update({
        where: { id: fran.id },
        data: { layout: { version: 1, items: [...items, ...place(FRAN_ROW, bottom)] } as object },
      });
      console.log(`'가맹 대시보드'에 가맹 영업 위젯 ${FRAN_ROW.length}개 덧붙임`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
