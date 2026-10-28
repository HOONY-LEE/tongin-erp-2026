/**
 * 대시보드 템플릿 — 팀별 4가지 관점: 경영관리(기본)·가맹·홈플래너·마케팅.
 *
 * - 예전 시연용 템플릿(경영진·지점장·상담·영업·현장 운영)이 있으면 지우고 새로 넣는다(한 번만 도는 추가 시드)
 * - 같은 이름의 템플릿이 이미 있으면 건드리지 않는다(관리자가 고친 내용 보존).
 *   단, 경영관리 템플릿에 인사 위젯이 하나도 없으면 맨 아래에 인사 줄만 덧붙인다
 * - 지정: 그 부서 직원 계정(USER) + 권한 그룹(ROLE). 이미 다른 템플릿에 지정된 대상은 건드리지 않는다
 */
import { PrismaClient } from '@prisma/client';
import {
  DASH_COLS,
  DASH_WIDGET_MAP,
  ROLE_FRANCHISE,
  ROLE_SUPER_ADMIN,
  compactDashLayout,
  makeDashItem,
  type DashItem,
  type DashMetric,
  type DashPeriod,
  type DashViz,
} from '@tongin/shared';

const prisma = new PrismaClient();

interface Spec {
  widget: string;
  /** 자리를 직접 정할 때(큰 그래프 옆에 작은 카드 두 개를 쌓는 등) */
  at?: [number, number];
  viz?: DashViz;
  w?: number;
  h?: number;
  period?: DashPeriod;
  metric?: DashMetric;
  title?: string;
  text?: string;
}

/** 왼쪽 위부터 줄을 채워 가며 놓는다 */
function pack(specs: Spec[]): { version: 1; items: DashItem[] } {
  const items: DashItem[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const s of specs) {
    const def = DASH_WIDGET_MAP.get(s.widget);
    if (!def) throw new Error(`없는 위젯: ${s.widget}`);
    const it = makeDashItem(def);
    if (s.viz) it.viz = s.viz;
    if (s.w) it.w = s.w;
    if (s.h) it.h = s.h;
    if (s.period) it.period = s.period;
    if (s.metric) it.metric = s.metric;
    if (s.title) it.title = s.title;
    if (s.text !== undefined) it.text = s.text;
    if (s.at) {
      [it.x, it.y] = s.at;
      items.push(it);
      continue;
    }
    if (x + it.w > DASH_COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    it.x = x;
    it.y = y;
    x += it.w;
    rowH = Math.max(rowH, it.h);
    items.push(it);
  }
  return { version: 1, items: compactDashLayout(items) };
}

/** 경영관리 인사 줄 — y는 그 줄 맨 위 기준(새로 만들 때·덧붙일 때 아래로 민다) */
const MGMT_HR: Spec[] = [
  { widget: 'kpi.attendanceToday', viz: 'gauge', w: 4, h: 2, at: [0, 0] },
  { widget: 'kpi.pendingApprovals', w: 4, h: 2, at: [4, 0] },
  { widget: 'hr.headcount', w: 4, h: 2, at: [8, 0] },
  { widget: 'hr.attendanceToday', viz: 'list', w: 4, h: 5, at: [0, 2] },
  { widget: 'hr.onLeave', viz: 'list', w: 4, h: 5, at: [4, 2] },
  { widget: 'hr.leaveUsage', viz: 'hbar', w: 4, h: 5, at: [8, 2] },
];
const HR_WIDGETS = new Set(MGMT_HR.map((s) => s.widget));
const below = (specs: Spec[], y: number): Spec[] =>
  specs.map((s) => ({ ...s, at: s.at ? [s.at[0], s.at[1] + y] : undefined }));

const OLD_SEEDED = [
  '경영진 대시보드',
  '지점장 대시보드',
  '상담·영업 대시보드',
  '현장 운영 대시보드',
];

const TEMPLATES: {
  name: string;
  description: string;
  isDefault?: boolean;
  allowPersonal: boolean;
  /** 이 부서(조직 코드, seed-demo.ts) 직원 계정에 지정 */
  depts: string[];
  /** 이 권한 그룹에 지정 */
  roles: string[];
  specs: Spec[];
}[] = [
  {
    name: '경영관리 대시보드',
    description: '전사 매출·수금·전환과 지역·지점 현황 — 경영관리 관점',
    isDefault: true,
    allowPersonal: true,
    depts: ['DEPT-MGMT', 'GRP-PLAN'],
    roles: [ROLE_SUPER_ADMIN],
    specs: [
      { widget: 'kpi.revenue', period: '30d', at: [0, 0] },
      { widget: 'kpi.contracts', period: '30d', at: [3, 0] },
      { widget: 'kpi.conversion', viz: 'gauge', period: '90d', at: [6, 0] },
      { widget: 'kpi.collectionRate', viz: 'gauge', at: [9, 0] },
      { widget: 'revenue.trend', viz: 'area', w: 8, h: 4, period: '12m', at: [0, 2] },
      { widget: 'kpi.outstanding', w: 4, h: 2, at: [8, 2] },
      { widget: 'kpi.collected', w: 4, h: 2, period: '30d', at: [8, 4] },
      { widget: 'revenue.byRegion', viz: 'map', w: 4, h: 6, period: '12m', at: [0, 6] },
      { widget: 'revenue.byBranch', viz: 'hbar', w: 4, h: 6, period: '90d', at: [4, 6] },
      { widget: 'revenue.byServiceLine', viz: 'donut', w: 4, h: 6, period: '90d', at: [8, 6] },
      { widget: 'payment.topOutstanding', viz: 'table', w: 6, h: 5, at: [0, 12] },
      { widget: 'branch.anomaly', viz: 'list', w: 6, h: 5, at: [6, 12] },
      ...below(MGMT_HR, 17),
    ],
  },
  {
    name: '가맹 대시보드',
    description: '지점별 접수·계약·매출과 이상 지점 — 가맹 관리 관점',
    allowPersonal: true,
    depts: ['DEPT-FRAN'],
    roles: [ROLE_FRANCHISE],
    specs: [
      { widget: 'kpi.leads', period: '30d', at: [0, 0] },
      { widget: 'kpi.contracts', period: '30d', at: [3, 0] },
      { widget: 'kpi.avgContract', period: '90d', at: [6, 0] },
      { widget: 'kpi.unassigned', at: [9, 0] },
      { widget: 'branch.ranking', viz: 'hbar', w: 6, h: 6, period: '90d', at: [0, 2] },
      { widget: 'branch.performance', viz: 'map', w: 6, h: 6, period: '90d', at: [6, 2] },
      { widget: 'branch.map', viz: 'table', w: 12, h: 5, at: [0, 8] },
      { widget: 'lead.branchMonth', viz: 'heatmap', w: 8, h: 5, period: '12m', at: [0, 13] },
      { widget: 'branch.anomaly', viz: 'list', w: 4, h: 5, at: [8, 13] },
    ],
  },
  {
    name: '홈플래너 대시보드',
    description: '들어온 접수와 상담 진행·미배정 건 — 홈플래너(상담) 관점',
    allowPersonal: true,
    depts: ['DEPT-HOME', 'DEPT-CS'],
    roles: [],
    specs: [
      { widget: 'kpi.leads', period: '7d', title: '최근 7일 접수', at: [0, 0] },
      { widget: 'kpi.unassigned', at: [3, 0] },
      { widget: 'kpi.conversion', viz: 'card', period: '30d', at: [6, 0] },
      { widget: 'kpi.newCustomers', period: '30d', at: [9, 0] },
      { widget: 'lead.trend', viz: 'line', w: 8, h: 4, period: '30d', at: [0, 2] },
      { widget: 'lead.funnel', viz: 'funnel', w: 4, h: 4, period: '90d', at: [8, 2] },
      { widget: 'lead.unassignedList', viz: 'table', w: 7, h: 5, at: [0, 6] },
      { widget: 'calendar.upcoming', viz: 'list', w: 5, h: 5, at: [7, 6] },
      { widget: 'lead.weekHour', viz: 'heatmap', w: 8, h: 4, period: '90d', at: [0, 11] },
      { widget: 'lead.byServiceLine', viz: 'donut', w: 4, h: 4, period: '90d', at: [8, 11] },
    ],
  },
  {
    name: '마케팅 대시보드',
    description: '접수 경로·지역과 고객 증가, 캠페인 — 마케팅 관점',
    allowPersonal: true,
    depts: ['DEPT-MKT', 'DEPT-DESIGN'],
    roles: [],
    specs: [
      { widget: 'kpi.leads', period: '30d', at: [0, 0] },
      { widget: 'kpi.newCustomers', period: '30d', at: [3, 0] },
      { widget: 'kpi.conversion', viz: 'gauge', period: '90d', at: [6, 0] },
      { widget: 'kpi.revenue', period: '30d', at: [9, 0] },
      { widget: 'lead.bySource', viz: 'donut', w: 4, h: 5, period: '90d', at: [0, 2] },
      { widget: 'lead.trend', viz: 'area', w: 8, h: 5, period: '12m', at: [4, 2] },
      { widget: 'lead.byRegion', viz: 'map', w: 4, h: 6, period: '90d', at: [0, 7] },
      { widget: 'customer.trend', viz: 'line', w: 4, h: 6, period: '12m', at: [4, 7] },
      { widget: 'customer.byGrade', viz: 'pie', w: 4, h: 6, at: [8, 7] },
      { widget: 'campaign.recent', viz: 'table', w: 12, h: 4, at: [0, 13] },
    ],
  },
];

async function assign(dashboardId: string, targetType: 'ROLE' | 'USER', targetId: string) {
  const taken = await prisma.dashboardAssignment.findUnique({
    where: { targetType_targetId: { targetType, targetId } },
  });
  if (taken) return false;
  await prisma.dashboardAssignment.create({ data: { dashboardId, targetType, targetId } });
  return true;
}

async function main() {
  const admin = await prisma.appUser.findUnique({ where: { loginId: 'admin' } });
  // 예전 시연용 템플릿 정리(지정도 함께 지워진다)
  const removed = await prisma.dashboard.deleteMany({
    where: { ownerUserId: null, name: { in: OLD_SEEDED } },
  });
  if (removed.count) console.log(`예전 시연 템플릿 ${removed.count}개 정리`);

  for (const t of TEMPLATES) {
    const exists = await prisma.dashboard.findFirst({ where: { name: t.name, ownerUserId: null } });
    if (exists) {
      if (t.specs.some((x) => HR_WIDGETS.has(x.widget))) {
        const cur = exists.layout as { version: 1; items: DashItem[] } | null;
        const items = cur?.items ?? [];
        if (!items.some((i) => HR_WIDGETS.has(i.widget))) {
          const bottom = Math.max(0, ...items.map((i) => i.y + i.h));
          // 인사 줄만 따로 배치한 뒤 기존 위젯 아래로 내린다
          const hr = pack(MGMT_HR).items.map((i) => ({ ...i, y: i.y + bottom }));
          await prisma.dashboard.update({
            where: { id: exists.id },
            data: { layout: { version: 1, items: [...items, ...hr] } as object },
          });
          console.log(`대시보드 '${t.name}' — 인사 위젯 ${hr.length}개 덧붙임`);
          continue;
        }
      }
      console.log(`대시보드 '${t.name}' — 이미 있음(건너뜀)`);
      continue;
    }
    if (t.isDefault) {
      const hasDefault = await prisma.dashboard.count({
        where: { isDefault: true, ownerUserId: null },
      });
      if (hasDefault) t.isDefault = false;
    }
    const layout = pack(t.specs);
    const d = await prisma.dashboard.create({
      data: {
        name: t.name,
        description: t.description,
        layout: layout as object,
        isDefault: t.isDefault ?? false,
        allowPersonal: t.allowPersonal,
        createdBy: admin?.id ?? null,
      },
    });
    let roles = 0;
    for (const code of t.roles) {
      const role = await prisma.role.findUnique({ where: { code } });
      if (role && (await assign(d.id, 'ROLE', role.id))) roles++;
    }
    // 부서 직원 계정 — 직접 지정은 권한 그룹 지정보다 먼저 적용된다
    const users = await prisma.appUser.findMany({
      where: { employee: { orgUnit: { code: { in: t.depts } } } },
      select: { id: true },
    });
    let people = 0;
    for (const u of users) if (await assign(d.id, 'USER', u.id)) people++;
    console.log(
      `대시보드 '${t.name}' — 위젯 ${layout.items.length}개 · 권한 그룹 ${roles} · 직원 ${people}명 지정`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
