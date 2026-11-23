import { DASH_WIDGET_MAP, type DashItem, type DashPeriod } from '@tongin/shared';
import type { FilterValues } from '../ui/FilterButton';
import { filterHref } from '../../lib/useUrlFilter';

/**
 * 대시보드 위젯 → 목록 화면(드릴다운).
 *  - widgetLink: 위젯 제목·숫자 카드를 누르면 — 그 숫자를 만든 목록(기간 조건까지)
 *  - itemLink: 막대·조각·지도 칸 하나를 누르면 — 그 항목만 걸러진 목록
 * 목록 화면은 주소의 `?f=`(useUrlFilter)로 필터를 받아 시작한다.
 */

const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const DAYS: Record<Exclude<DashPeriod, 'all' | '12m'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** 위젯 기간 → 목록 기간 필터(오늘까지). 전체 기간이면 걸지 않는다 */
function range(period: DashPeriod | undefined, on?: string) {
  if (!period || period === 'all') return undefined;
  const d = new Date();
  if (period === '12m') d.setMonth(d.getMonth() - 12);
  else d.setDate(d.getDate() - DAYS[period] + 1);
  return { from: ymd(d), to: ymd(new Date()), ...(on && { on }) };
}
const today = (on?: string) => ({ from: ymd(new Date()), to: ymd(new Date()), ...(on && { on }) });

/** 대시보드 접수 상태 → 접수 목록 상태 필터(견적완료는 계약미승인에 묶여 있다) */
const leadStage = (k: string) => (k === 'QUOTED' ? 'CONTRACT_PENDING' : k);
const OPEN_SUPPORT = ['RECEIVED', 'IN_PROGRESS'];
const LIVING_CARE = ['LIVING', 'CARE'];

type Ctx = { item: DashItem; period: DashPeriod | undefined };

const leads = (c: Ctx, f: FilterValues = {}) =>
  filterHref('/leads', { period: range(c.period, 'createdAt'), ...f });
const contracts = (c: Ctx, f: FilterValues = {}) =>
  filterHref('/contracts', { period: range(c.period, 'signedAt'), status: ['SIGNED'], ...f });
const works = (c: Ctx, f: FilterValues = {}) =>
  filterHref('/work-orders', { period: range(c.period, 'scheduledDate'), ...f });
const support = (c: Ctx, f: FilterValues = {}) =>
  filterHref('/support', { createdAt: range(c.period), ...f });

/** 위젯 전체 → 목록 */
const WIDGET: Record<string, (c: Ctx) => string> = {
  'kpi.leads': leads,
  'kpi.conversion': leads,
  'lead.funnel': leads,
  'lead.trend': leads,
  'lead.bySource': leads,
  'lead.byServiceLine': leads,
  'lead.byRegion': leads,
  'lead.byBranch': leads,
  'lead.weekHour': leads,
  'lead.branchMonth': leads,
  'lead.recent': leads,
  'kpi.unassigned': () => filterHref('/leads', { owner: 'no' }),
  'lead.unassignedList': () => filterHref('/leads', { owner: 'no' }),
  'service.byStatus': (c) => leads(c, { serviceLine: LIVING_CARE }),

  'kpi.contracts': contracts,
  'kpi.revenue': contracts,
  'kpi.avgContract': contracts,
  'revenue.trend': contracts,
  'contract.trend': contracts,
  'revenue.byBranch': contracts,
  'revenue.byRegion': contracts,
  'revenue.byServiceLine': contracts,

  'kpi.collected': () => '/payments-confirm',
  'collected.trend': () => '/payments-confirm',
  'kpi.outstanding': () => filterHref('/contracts', { status: ['SIGNED'] }),
  'kpi.collectionRate': () => filterHref('/contracts', { status: ['SIGNED'] }),
  'payment.topOutstanding': () => filterHref('/contracts', { status: ['SIGNED'] }),

  'kpi.workDone': (c) => works(c, { status: ['DONE'] }),
  'kpi.workToday': () => filterHref('/work-orders', { period: today('scheduledDate') }),
  'work.byStatus': works,
  'work.trend': works,
  'work.calendar': () => '/work-orders',
  'work.upcoming': () => '/work-orders',

  'kpi.openSupport': () => filterHref('/support', { status: OPEN_SUPPORT }),
  'support.byStatus': support,
  'support.recent': () => '/support',

  'kpi.newCustomers': () => '/customers',
  'customer.byGrade': () => '/customers',
  'customer.trend': () => '/customers',
  'customer.byRegion': () => '/customers',

  'branch.ranking': () => '/branches',
  'branch.map': () => '/branches',
  'branch.anomaly': () => '/branches',

  'campaign.recent': () => '/campaigns',
  'calendar.upcoming': () => '/calendar',
  'kpi.attendanceToday': () => '/attendance',
  'hr.attendanceToday': () => '/attendance',
  'hr.onLeave': () => '/leave',
  'hr.leaveUsage': () => '/leave',
  'hr.headcount': () => '/hr',
  'kpi.pendingApprovals': () => '/approvals',
  'approval.pending': () => '/approvals',
};

/** 항목 하나 → 그 항목만 걸러진 목록 */
const ITEM: Record<string, (c: Ctx, key: string) => string | null> = {
  'lead.funnel': (c, k) => leads(c, { stage: [leadStage(k)] }),
  'lead.bySource': (c, k) => (k === 'NONE' ? null : leads(c, { source: [k] })),
  'lead.byServiceLine': (c, k) => (k === 'NONE' ? null : leads(c, { serviceLine: [k] })),
  'lead.byRegion': (c, k) => leads(c, { fromSido: [k] }),
  'lead.byBranch': (c, k) => leads(c, { org: [k] }),
  'service.byStatus': (c, k) => leads(c, { serviceLine: LIVING_CARE, stage: [leadStage(k)] }),
  // 지점 순위·지도는 접수 건수로 볼 때만 그 지점 접수로(매출·계약·작업은 지점 칸이 없는 목록이라 위젯 단위로)
  'branch.ranking': (c, k) =>
    (c.item.metric ?? 'leadCount') === 'leadCount' ? leads(c, { org: [k] }) : null,
  'branch.map': (c, k) =>
    (c.item.metric ?? 'leadCount') === 'leadCount' ? leads(c, { org: [k] }) : null,
  'work.byStatus': (c, k) => works(c, { status: [k] }),
  'support.byStatus': (c, k) => support(c, { status: [k] }),
};

const ctxOf = (item: DashItem): Ctx => ({
  item,
  period: item.period ?? DASH_WIDGET_MAP.get(item.widget)?.period,
});

export function widgetLink(item: DashItem): string | null {
  const w = item.widget;
  // 가맹 영업·기업영업 CRM 위젯은 그 CRM 화면으로
  if (w.startsWith('crm.fran.')) return '/franchise-leads';
  if (w.startsWith('b2b.')) return '/b2b-crm';
  return WIDGET[w]?.(ctxOf(item)) ?? null;
}

export function itemLink(item: DashItem, key: string): string | null {
  if (key === 'OTHER') return null;
  return ITEM[item.widget]?.(ctxOf(item), key) ?? null;
}

export const hasItemLink = (item: DashItem) => !!ITEM[item.widget];
