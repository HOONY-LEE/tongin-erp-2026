/**
 * 시연용 대시보드 템플릿 — 경영진(기본)·지점장·상담·현장 운영.
 * 같은 이름이 이미 있으면 건드리지 않는다(관리자가 고친 내용 보존). 권한 그룹 지정도 비어 있을 때만 넣는다.
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

const TEMPLATES: {
  name: string;
  description: string;
  isDefault?: boolean;
  allowPersonal: boolean;
  roles: string[];
  specs: Spec[];
}[] = [
  {
    name: '경영진 대시보드',
    description: '전사 매출·수금·전환과 지역·지점 현황을 한눈에',
    isDefault: true,
    allowPersonal: true,
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
      {
        widget: 'branch.ranking',
        viz: 'hbar',
        w: 4,
        h: 6,
        period: '90d',
        metric: 'revenue',
        at: [4, 6],
      },
      { widget: 'lead.funnel', viz: 'funnel', w: 4, h: 6, period: '90d', at: [8, 6] },
      { widget: 'lead.bySource', viz: 'donut', w: 6, h: 4, period: '90d', at: [0, 12] },
      { widget: 'work.byStatus', viz: 'donut', w: 6, h: 4, at: [6, 12] },
      { widget: 'branch.anomaly', viz: 'list', w: 6, h: 5, at: [0, 16] },
      { widget: 'payment.topOutstanding', viz: 'table', w: 6, h: 5, at: [6, 16] },
    ],
  },
  {
    name: '지점장 대시보드',
    description: '우리 지점의 접수·계약·오늘 작업과 챙길 일',
    allowPersonal: true,
    roles: [ROLE_FRANCHISE],
    specs: [
      {
        widget: 'text.note',
        w: 12,
        h: 2,
        title: '이번 달 목표',
        text: '계약 전환율 45% 이상 · 담당자 미배정 접수 0건 유지 · 작업 후 사진 등록 100%',
      },
      { widget: 'kpi.leads', period: '30d' },
      { widget: 'kpi.contracts', period: '30d' },
      { widget: 'kpi.workToday' },
      { widget: 'kpi.unassigned' },
      { widget: 'lead.trend', viz: 'line', w: 6, h: 4, period: '30d' },
      { widget: 'lead.funnel', viz: 'funnel', w: 6, h: 4, period: '90d' },
      { widget: 'work.upcoming', viz: 'list', w: 6, h: 5 },
      { widget: 'lead.unassignedList', viz: 'list', w: 6, h: 5 },
      { widget: 'work.calendar', viz: 'heatmap', w: 12, h: 4 },
      {
        widget: 'branch.ranking',
        viz: 'hbar',
        w: 6,
        h: 5,
        period: '90d',
        metric: 'leadCount',
        title: '지점 접수 순위(전국)',
      },
      { widget: 'lead.recent', viz: 'list', w: 6, h: 5 },
    ],
  },
  {
    name: '상담·영업 대시보드',
    description: '접수가 언제·어디서 들어오고 어디서 빠지는지(상담 인력 배치용)',
    allowPersonal: true,
    roles: [],
    specs: [
      { widget: 'kpi.leads', period: '7d', title: '최근 7일 접수', at: [0, 0] },
      { widget: 'kpi.unassigned', at: [3, 0] },
      { widget: 'kpi.conversion', viz: 'card', period: '30d', at: [6, 0] },
      { widget: 'kpi.newCustomers', period: '30d', at: [9, 0] },
      { widget: 'lead.weekHour', viz: 'heatmap', w: 12, h: 4, period: '90d', at: [0, 2] },
      { widget: 'lead.bySource', viz: 'pie', w: 4, h: 4, period: '30d', at: [0, 6] },
      { widget: 'lead.byBranch', viz: 'hbar', w: 4, h: 4, period: '30d', at: [4, 6] },
      { widget: 'lead.byRegion', viz: 'map', w: 4, h: 8, period: '90d', at: [8, 6] },
      { widget: 'lead.unassignedList', viz: 'table', w: 8, h: 4, at: [0, 10] },
      { widget: 'lead.branchMonth', viz: 'heatmap', w: 12, h: 5, period: '12m', at: [0, 14] },
    ],
  },
  {
    name: '현장 운영 대시보드',
    description: '작업 일정·상태와 다가오는 작업(운영·배차 담당)',
    allowPersonal: false,
    roles: [],
    specs: [
      { widget: 'kpi.workToday' },
      { widget: 'kpi.workDone', period: '30d' },
      { widget: 'kpi.openSupport' },
      { widget: 'kpi.contracts', period: '7d', title: '최근 7일 계약' },
      { widget: 'work.trend', viz: 'bar', w: 8, h: 4, period: '90d' },
      { widget: 'work.byStatus', viz: 'donut', w: 4, h: 4 },
      { widget: 'work.calendar', viz: 'heatmap', w: 12, h: 4 },
      { widget: 'work.upcoming', viz: 'table', w: 7, h: 5 },
      {
        widget: 'branch.map',
        viz: 'map',
        w: 5,
        h: 5,
        period: '90d',
        metric: 'workCount',
        title: '지점별 작업량',
      },
    ],
  },
];

async function main() {
  const admin = await prisma.appUser.findUnique({ where: { loginId: 'admin' } });
  for (const t of TEMPLATES) {
    const exists = await prisma.dashboard.findFirst({ where: { name: t.name, ownerUserId: null } });
    if (exists) {
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
    for (const code of t.roles) {
      const role = await prisma.role.findUnique({ where: { code } });
      if (!role) continue;
      const taken = await prisma.dashboardAssignment.findUnique({
        where: { targetType_targetId: { targetType: 'ROLE', targetId: role.id } },
      });
      if (taken) continue;
      await prisma.dashboardAssignment.create({
        data: { dashboardId: d.id, targetType: 'ROLE', targetId: role.id },
      });
    }
    console.log(
      `대시보드 '${t.name}' — 위젯 ${layout.items.length}개${t.roles.length ? ` · ${t.roles.join(', ')} 지정` : ''}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
