import { Injectable } from '@nestjs/common';
import {
  DASH_WIDGET_MAP,
  LEAD_STATUS,
  LEAD_STATUS_LABEL,
  SERVICE_LINE_LABEL,
  canUseWidget,
  type AuthPrincipal,
  type DashData,
  type DashDataResult,
  type DashItem,
  type DashMetric,
  type DashPeriod,
  type LeadStatus,
  type ServiceLine,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { BranchAnomalyService } from '../stats/branch-anomaly.service';

const DAY = 86400_000;
const KST = 9 * 3600_000;
/** 한국 시간 기준 날짜 문자열 */
const ymd = (d: Date) => new Date(d.getTime() + KST).toISOString().slice(0, 10);
const ym = (d: Date) => ymd(d).slice(0, 7);

/** 계약까지 간 접수 단계 */
const CONTRACTED: string[] = ['CONTRACTED', 'WORK_TOSS', 'IN_PROGRESS', 'DONE'];
const OPEN_LEAD = { notIn: ['DONE', 'CANCELED'] };

const SOURCE_LABEL: Record<string, string> = {
  SYSTEM: '시스템',
  HOMEPAGE: '홈페이지',
  AIBOT: 'AI상담봇',
  PHONE: '전화상담',
  NAVER: '네이버',
  INSTAGRAM: '인스타그램',
  PARTNER: '제휴사',
  WALK_IN: '방문접수',
  ETC: '기타',
};
const WORK_STATUS_LABEL: Record<string, string> = {
  ASSIGNED: '배정',
  IN_PROGRESS: '작업중',
  DONE: '완료',
  CANCELED: '취소',
};
const SUPPORT_STATUS_LABEL: Record<string, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '처리 중',
  RESOLVED: '해결',
  CLOSED: '종료',
  CANCELED: '취소',
};
const SERVICE_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '요청',
  SCHEDULED: '일정 확정',
  DONE: '완료',
  CANCELED: '취소',
};
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

type Unit = 'day' | 'week' | 'month';
interface Range {
  from: Date | null;
  /** 앞 기간(증감 비교) 시작 */
  prevFrom: Date | null;
  unit: Unit;
}

function rangeOf(period: DashPeriod | undefined): Range {
  const now = Date.now();
  switch (period) {
    case '7d':
      return { from: new Date(now - 7 * DAY), prevFrom: new Date(now - 14 * DAY), unit: 'day' };
    case '30d':
      return { from: new Date(now - 30 * DAY), prevFrom: new Date(now - 60 * DAY), unit: 'day' };
    case '90d':
      return { from: new Date(now - 90 * DAY), prevFrom: new Date(now - 180 * DAY), unit: 'week' };
    case '12m': {
      const d = new Date(now + KST);
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1) - KST;
      const prev = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 23, 1) - KST;
      return { from: new Date(start), prevFrom: new Date(prev), unit: 'month' };
    }
    default:
      return { from: null, prevFrom: null, unit: 'month' };
  }
}

/** 주의 시작(월요일) 날짜 문자열 */
function weekKey(d: Date): string {
  const k = new Date(d.getTime() + KST);
  const dow = (k.getUTCDay() + 6) % 7;
  k.setUTCDate(k.getUTCDate() - dow);
  return k.toISOString().slice(0, 10);
}
const keyOf = (d: Date, unit: Unit) =>
  unit === 'day' ? ymd(d) : unit === 'week' ? weekKey(d) : ym(d);

/** 기간의 빈 칸까지 채운 시간축 */
function buckets(from: Date, unit: Unit): { x: string; label: string }[] {
  const out: { x: string; label: string }[] = [];
  const end = keyOf(new Date(), unit);
  const cur = new Date(from.getTime());
  for (let i = 0; i < 400; i++) {
    const k = keyOf(cur, unit);
    if (!out.length || out[out.length - 1].x !== k) {
      const label =
        unit === 'month'
          ? `${Number(k.slice(5, 7))}월`
          : `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
      out.push({ x: k, label: unit === 'month' && k.endsWith('-01') ? label : label });
    }
    if (k === end) break;
    if (unit === 'month') cur.setUTCMonth(cur.getUTCMonth() + 1);
    else cur.setTime(cur.getTime() + (unit === 'week' ? 7 : 1) * DAY);
  }
  // 12개월이 넘어가면 연도를 붙여 헷갈리지 않게
  if (unit === 'month' && out.length > 12) {
    for (const b of out) b.label = `${b.x.slice(2, 4)}.${b.x.slice(5, 7)}`;
  }
  return out;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * 대시보드 위젯 데이터 — 위젯마다 필요한 권한을 다시 확인하고, 데이터 범위(소속 조직)를 적용해 집계한다.
 * '지점' 묶음(지점 순위·지도·이상 지점)은 기존 대시보드처럼 전 지점 비교를 보여 준다(STATS.READ).
 */
@Injectable()
export class DashboardDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly anomaly: BranchAnomalyService,
  ) {}

  async many(items: Pick<DashItem, 'id' | 'widget' | 'period' | 'metric'>[], p: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(p);
    const out: Record<string, DashDataResult> = {};
    await Promise.all(
      items.map(async (it) => {
        const def = DASH_WIDGET_MAP.get(it.widget);
        if (!def) {
          out[it.id] = { ok: false, error: '없는 위젯입니다' };
          return;
        }
        if (!canUseWidget(def, p.permissions)) {
          out[it.id] = { ok: false, error: '이 데이터를 볼 권한이 없습니다' };
          return;
        }
        if (def.shape === 'text' || def.shape === 'embed') return;
        try {
          out[it.id] = {
            ok: true,
            data: await this.one(
              it.widget,
              it.period ?? def.period,
              it.metric ?? def.metric,
              ids,
              p,
            ),
          };
        } catch (e) {
          out[it.id] = { ok: false, error: e instanceof Error ? e.message : '불러오지 못했습니다' };
        }
      }),
    );
    return out;
  }

  private async one(
    key: string,
    period: DashPeriod | undefined,
    metric: DashMetric | undefined,
    ids: string[] | null,
    p: AuthPrincipal,
  ): Promise<DashData> {
    const r = rangeOf(period);
    const org = ids === null ? {} : { orgUnitId: { in: ids } };
    const since = (field: string) => (r.from ? { [field]: { gte: r.from } } : {});
    const prevWin = (field: string) =>
      r.from && r.prevFrom ? { [field]: { gte: r.prevFrom, lt: r.from } } : null;

    switch (key) {
      // ── 핵심 지표 ──
      case 'kpi.leads': {
        const [value, previous] = await Promise.all([
          this.prisma.lead.count({ where: { ...org, ...since('createdAt') } }),
          prevWin('createdAt')
            ? this.prisma.lead.count({ where: { ...org, ...prevWin('createdAt') } })
            : null,
        ]);
        return { shape: 'value', format: 'count', value, previous };
      }
      case 'kpi.contracts':
      case 'kpi.revenue':
      case 'kpi.avgContract': {
        const where = { status: 'SIGNED', ...org };
        const [cur, prev] = await Promise.all([
          this.prisma.contract.aggregate({
            where: { ...where, ...since('signedAt') },
            _count: true,
            _sum: { totalAmount: true },
          }),
          prevWin('signedAt')
            ? this.prisma.contract.aggregate({
                where: { ...where, ...prevWin('signedAt') },
                _count: true,
                _sum: { totalAmount: true },
              })
            : null,
        ]);
        const pick = (a: typeof cur | null) =>
          !a
            ? null
            : key === 'kpi.contracts'
              ? a._count
              : key === 'kpi.revenue'
                ? num(a._sum.totalAmount)
                : a._count
                  ? Math.round(num(a._sum.totalAmount) / a._count)
                  : 0;
        return {
          shape: 'value',
          format: key === 'kpi.contracts' ? 'count' : 'won',
          value: pick(cur) ?? 0,
          previous: pick(prev),
        };
      }
      case 'kpi.conversion': {
        const rows = await this.prisma.lead.groupBy({
          by: ['status'],
          where: { ...org, ...since('createdAt') },
          _count: true,
        });
        const total = rows.reduce((s, x) => s + x._count, 0);
        const won = rows
          .filter((x) => CONTRACTED.includes(x.status))
          .reduce((s, x) => s + x._count, 0);
        return {
          shape: 'value',
          format: 'percent',
          value: total ? won / total : 0,
          max: 1,
          hint: `접수 ${total.toLocaleString()}건 중 ${won.toLocaleString()}건 계약`,
        };
      }
      case 'kpi.collected': {
        const contract = ids === null ? {} : { contract: org };
        const [cur, prev] = await Promise.all([
          this.prisma.payment.aggregate({
            where: { status: 'PAID', ...contract, ...since('paidAt') },
            _sum: { amount: true },
          }),
          prevWin('paidAt')
            ? this.prisma.payment.aggregate({
                where: { status: 'PAID', ...contract, ...prevWin('paidAt') },
                _sum: { amount: true },
              })
            : null,
        ]);
        return {
          shape: 'value',
          format: 'won',
          value: num(cur._sum.amount),
          previous: prev ? num(prev._sum.amount) : null,
        };
      }
      case 'kpi.outstanding':
      case 'kpi.collectionRate': {
        const [billed, paid] = await Promise.all([
          this.prisma.contract.aggregate({
            where: { status: 'SIGNED', ...org },
            _sum: { totalAmount: true },
          }),
          this.prisma.payment.aggregate({
            where: { status: 'PAID', contract: { status: 'SIGNED', ...org } },
            _sum: { amount: true },
          }),
        ]);
        const b = num(billed._sum.totalAmount);
        const pd = num(paid._sum.amount);
        return key === 'kpi.outstanding'
          ? {
              shape: 'value',
              format: 'won',
              value: Math.max(0, b - pd),
              hint: `청구 ${b.toLocaleString()}원`,
            }
          : {
              shape: 'value',
              format: 'percent',
              value: b ? pd / b : 0,
              max: 1,
              hint: `${pd.toLocaleString()}원 / ${b.toLocaleString()}원`,
            };
      }
      case 'kpi.workDone': {
        const [value, previous] = await Promise.all([
          this.prisma.workOrder.count({
            where: { ...org, status: 'DONE', ...since('scheduledDate') },
          }),
          prevWin('scheduledDate')
            ? this.prisma.workOrder.count({
                where: { ...org, status: 'DONE', ...prevWin('scheduledDate') },
              })
            : null,
        ]);
        return { shape: 'value', format: 'count', value, previous };
      }
      case 'kpi.workToday': {
        const today = new Date(`${ymd(new Date())}T00:00:00+09:00`);
        const value = await this.prisma.workOrder.count({
          where: {
            ...org,
            status: { not: 'CANCELED' },
            scheduledDate: { gte: today, lt: new Date(today.getTime() + DAY) },
          },
        });
        return { shape: 'value', format: 'count', value };
      }
      case 'kpi.unassigned': {
        const value = await this.prisma.lead.count({
          where: { ...org, ownerEmpId: null, status: OPEN_LEAD },
        });
        return { shape: 'value', format: 'count', value };
      }
      case 'kpi.openSupport': {
        const value = await this.prisma.supportTicket.count({
          where: { ...org, status: { in: ['RECEIVED', 'IN_PROGRESS'] } },
        });
        return { shape: 'value', format: 'count', value };
      }
      case 'kpi.newCustomers': {
        const cOrg = ids === null ? {} : { ownerOrgId: { in: ids } };
        const [value, previous] = await Promise.all([
          this.prisma.customer.count({ where: { ...cOrg, ...since('createdAt') } }),
          prevWin('createdAt')
            ? this.prisma.customer.count({ where: { ...cOrg, ...prevWin('createdAt') } })
            : null,
        ]);
        return { shape: 'value', format: 'count', value, previous };
      }

      // ── 접수·영업 ──
      case 'lead.funnel': {
        // 그 단계에 '도달한' 접수 수(그 단계 이후에 있는 접수 포함) — 단계마다 얼마나 빠지는지 보인다
        const rows = await this.prisma.lead.groupBy({
          by: ['status'],
          where: { ...org, ...since('createdAt'), status: { not: 'CANCELED' } },
          _count: true,
        });
        const m = new Map(rows.map((x) => [x.status, x._count]));
        const stages = LEAD_STATUS.filter((s) => s !== 'CANCELED');
        let acc = 0;
        const reached = [...stages].reverse().map((s) => {
          acc += m.get(s) ?? 0;
          return { key: s, label: LEAD_STATUS_LABEL[s as LeadStatus], value: acc };
        });
        return { shape: 'category', format: 'count', items: reached.reverse() };
      }
      case 'lead.trend':
        return this.series(
          await this.prisma.lead.findMany({
            where: { ...org, ...since('createdAt') },
            select: { createdAt: true },
          }),
          (x) => x.createdAt,
          () => 1,
          r,
          'count',
        );
      case 'lead.bySource':
      case 'lead.byServiceLine': {
        const field = key === 'lead.bySource' ? 'source' : 'serviceLine';
        const rows = await this.prisma.lead.groupBy({
          by: [field],
          where: { ...org, ...since('createdAt') },
          _count: true,
        });
        return this.category(
          rows.map((x) => {
            const k = (x as Record<string, unknown>)[field] as string | null;
            return {
              key: k ?? 'NONE',
              label: !k
                ? '미지정'
                : field === 'source'
                  ? (SOURCE_LABEL[k] ?? k)
                  : (SERVICE_LINE_LABEL[k as ServiceLine] ?? k),
              value: x._count,
            };
          }),
          'count',
          8,
        );
      }
      case 'lead.byRegion': {
        const rows = await this.prisma.lead.groupBy({
          by: ['fromSido'],
          where: { ...org, ...since('createdAt'), fromSido: { not: null } },
          _count: true,
        });
        return this.category(
          rows.map((x) => ({ key: x.fromSido!, label: x.fromSido!, value: x._count })),
          'count',
        );
      }
      case 'lead.byBranch': {
        const rows = await this.prisma.lead.groupBy({
          by: ['orgUnitId'],
          where: { ...org, ...since('createdAt') },
          _count: true,
        });
        return this.byOrg(
          rows.map((x) => ({ id: x.orgUnitId, value: x._count })),
          'count',
          10,
        );
      }
      case 'lead.weekHour': {
        const rows = await this.prisma.lead.findMany({
          where: { ...org, ...since('createdAt') },
          select: { createdAt: true },
        });
        const cells = WEEKDAYS.map(() => Array<number>(24).fill(0));
        for (const x of rows) {
          const k = new Date(x.createdAt.getTime() + KST);
          cells[(k.getUTCDay() + 6) % 7][k.getUTCHours()]++;
        }
        return {
          shape: 'matrix',
          format: 'count',
          rows: WEEKDAYS,
          cols: Array.from({ length: 24 }, (_, h) => `${h}시`),
          cells,
        };
      }
      case 'lead.branchMonth': {
        const from = r.from ?? rangeOf('12m').from!;
        const rows = await this.prisma.lead.findMany({
          where: { ...org, createdAt: { gte: from } },
          select: { createdAt: true, orgUnitId: true },
        });
        const months = buckets(from, 'month');
        const total = new Map<string, number>();
        for (const x of rows) total.set(x.orgUnitId, (total.get(x.orgUnitId) ?? 0) + 1);
        const top = [...total.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id]) => id);
        const names = await this.orgNames(top);
        const idx = new Map(months.map((m, i) => [m.x, i]));
        const cells = top.map(() => Array<number>(months.length).fill(0));
        for (const x of rows) {
          const ri = top.indexOf(x.orgUnitId);
          const ci = idx.get(ym(x.createdAt));
          if (ri >= 0 && ci !== undefined) cells[ri][ci]++;
        }
        return {
          shape: 'matrix',
          format: 'count',
          rows: top.map((id) => names.get(id) ?? '-'),
          cols: months.map((m) => m.label),
          cells,
        };
      }
      case 'lead.recent':
      case 'lead.unassignedList': {
        const leads = await this.prisma.lead.findMany({
          where: {
            ...org,
            ...(key === 'lead.unassignedList' ? { ownerEmpId: null, status: OPEN_LEAD } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            leadNo: true,
            status: true,
            createdAt: true,
            moveDate: true,
            customer: { select: { name: true } },
            orgUnit: { select: { name: true } },
          },
        });
        return {
          shape: 'rows',
          link: '/leads/{id}',
          columns: [
            { key: 'customer', label: '고객' },
            { key: 'status', label: '단계' },
            { key: 'branch', label: '지점' },
            {
              key: key === 'lead.recent' ? 'createdAt' : 'moveDate',
              label: key === 'lead.recent' ? '접수일' : '이사일',
              format: 'date',
            },
          ],
          rows: leads.map((l) => ({
            id: l.id,
            title: l.customer?.name ?? l.leadNo,
            customer: l.customer?.name ?? '-',
            status: LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status,
            branch: l.orgUnit?.name ?? '-',
            createdAt: l.createdAt.toISOString(),
            moveDate: l.moveDate ? l.moveDate.toISOString() : null,
          })),
        };
      }

      // ── 계약·매출 ──
      case 'revenue.trend':
      case 'contract.trend':
        return this.series(
          await this.prisma.contract.findMany({
            where: {
              ...org,
              status: 'SIGNED',
              signedAt: { not: null, ...(r.from ? { gte: r.from } : {}) },
            },
            select: { signedAt: true, totalAmount: true },
          }),
          (x) => x.signedAt!,
          (x) => (key === 'revenue.trend' ? num(x.totalAmount) : 1),
          r,
          key === 'revenue.trend' ? 'won' : 'count',
        );
      case 'revenue.byBranch': {
        const rows = await this.prisma.contract.groupBy({
          by: ['orgUnitId'],
          where: { ...org, status: 'SIGNED', ...since('signedAt') },
          _sum: { totalAmount: true },
        });
        return this.byOrg(
          rows.map((x) => ({ id: x.orgUnitId, value: num(x._sum.totalAmount) })),
          'won',
          10,
        );
      }
      case 'revenue.byRegion':
      case 'revenue.byServiceLine': {
        const rows = await this.prisma.contract.findMany({
          where: { ...org, status: 'SIGNED', ...since('signedAt') },
          select: { totalAmount: true, lead: { select: { fromSido: true, serviceLine: true } } },
        });
        const m = new Map<string, number>();
        for (const c of rows) {
          const k = key === 'revenue.byRegion' ? c.lead?.fromSido : c.lead?.serviceLine;
          if (!k && key === 'revenue.byRegion') continue;
          m.set(k ?? 'NONE', (m.get(k ?? 'NONE') ?? 0) + num(c.totalAmount));
        }
        return this.category(
          [...m.entries()].map(([k, v]) => ({
            key: k,
            label:
              key === 'revenue.byRegion'
                ? k
                : k === 'NONE'
                  ? '미지정'
                  : (SERVICE_LINE_LABEL[k as ServiceLine] ?? k),
            value: v,
          })),
          'won',
          key === 'revenue.byServiceLine' ? 8 : undefined,
        );
      }

      // ── 수금 ──
      case 'collected.trend':
        return this.series(
          await this.prisma.payment.findMany({
            where: {
              status: 'PAID',
              paidAt: { not: null, ...(r.from ? { gte: r.from } : {}) },
              ...(ids === null ? {} : { contract: org }),
            },
            select: { paidAt: true, amount: true },
          }),
          (x) => x.paidAt!,
          (x) => num(x.amount),
          r,
          'won',
        );
      case 'payment.topOutstanding': {
        const contracts = await this.prisma.contract.findMany({
          where: { ...org, status: 'SIGNED' },
          select: {
            id: true,
            contractNo: true,
            totalAmount: true,
            customer: { select: { name: true } },
            payments: { where: { status: 'PAID' }, select: { amount: true } },
          },
        });
        const rows = contracts
          .map((c) => {
            const paid = c.payments.reduce((s, x) => s + num(x.amount), 0);
            return {
              id: c.id,
              title: c.customer?.name ?? c.contractNo,
              customer: c.customer?.name ?? '-',
              contractNo: c.contractNo,
              total: num(c.totalAmount),
              outstanding: num(c.totalAmount) - paid,
            };
          })
          .filter((c) => c.outstanding > 0)
          .sort((a, b) => b.outstanding - a.outstanding)
          .slice(0, 10);
        return {
          shape: 'rows',
          link: '/contracts/{id}',
          columns: [
            { key: 'customer', label: '고객' },
            { key: 'contractNo', label: '계약번호' },
            { key: 'total', label: '계약금액', format: 'won' },
            { key: 'outstanding', label: '미수금', format: 'won' },
          ],
          rows,
        };
      }

      // ── 작업 ──
      case 'work.byStatus':
        return this.statusCategory(
          await this.prisma.workOrder.groupBy({
            by: ['status'],
            where: { ...org, ...since('createdAt') },
            _count: true,
          }),
          WORK_STATUS_LABEL,
        );
      case 'work.trend':
        return this.series(
          await this.prisma.workOrder.findMany({
            where: {
              ...org,
              status: { not: 'CANCELED' },
              scheduledDate: { not: null, ...(r.from ? { gte: r.from } : {}) },
            },
            select: { scheduledDate: true },
          }),
          (x) => x.scheduledDate!,
          () => 1,
          r,
          'count',
        );
      case 'work.calendar': {
        const thisWeek = new Date(`${weekKey(new Date())}T00:00:00+09:00`);
        const from = new Date(thisWeek.getTime() - 11 * 7 * DAY);
        const rows = await this.prisma.workOrder.findMany({
          where: {
            ...org,
            status: { not: 'CANCELED' },
            scheduledDate: { gte: from, lt: new Date(thisWeek.getTime() + 7 * DAY) },
          },
          select: { scheduledDate: true },
        });
        const weeks = Array.from({ length: 12 }, (_, i) =>
          weekKey(new Date(from.getTime() + i * 7 * DAY)),
        );
        const cells = WEEKDAYS.map(() => Array<number>(12).fill(0));
        for (const x of rows) {
          const d = x.scheduledDate!;
          const ci = weeks.indexOf(weekKey(d));
          const k = new Date(d.getTime() + KST);
          if (ci >= 0) cells[(k.getUTCDay() + 6) % 7][ci]++;
        }
        return {
          shape: 'matrix',
          format: 'count',
          rows: WEEKDAYS,
          cols: weeks.map((w) => `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))}`),
          cells,
        };
      }
      case 'work.upcoming': {
        const today = new Date(`${ymd(new Date())}T00:00:00+09:00`);
        const rows = await this.prisma.workOrder.findMany({
          where: { ...org, status: { notIn: ['DONE', 'CANCELED'] }, scheduledDate: { gte: today } },
          orderBy: { scheduledDate: 'asc' },
          take: 10,
          select: {
            id: true,
            workNo: true,
            status: true,
            scheduledDate: true,
            orgUnit: { select: { name: true } },
            lead: { select: { customer: { select: { name: true } }, fromSigungu: true } },
          },
        });
        return {
          shape: 'rows',
          link: '/work-orders/{id}',
          columns: [
            { key: 'date', label: '작업일', format: 'date' },
            { key: 'customer', label: '고객' },
            { key: 'branch', label: '지점' },
            { key: 'status', label: '상태' },
          ],
          rows: rows.map((w) => ({
            id: w.id,
            title: w.lead?.customer?.name ?? w.workNo,
            date: w.scheduledDate ? w.scheduledDate.toISOString() : null,
            customer: w.lead?.customer?.name ?? '-',
            branch: w.orgUnit?.name ?? '-',
            status: WORK_STATUS_LABEL[w.status] ?? w.status,
          })),
        };
      }

      // ── 지점(전 지점 비교) ──
      case 'branch.ranking':
      case 'branch.map': {
        const m = metric ?? 'revenue';
        const units = await this.prisma.orgUnit.findMany({
          where: { type: 'BRANCH', isActive: true },
          select: { id: true, name: true, lat: true, lng: true },
        });
        const val = await this.branchMetric(m, r);
        const format = m === 'revenue' ? 'won' : 'count';
        if (key === 'branch.ranking') {
          return this.category(
            units.map((u) => ({ key: u.id, label: u.name, value: val.get(u.id) ?? 0 })),
            format,
            15,
            true,
          );
        }
        return {
          shape: 'points',
          format,
          points: units
            .filter((u) => u.lat != null && u.lng != null)
            .map((u) => ({
              key: u.id,
              label: u.name,
              lat: u.lat!,
              lng: u.lng!,
              value: val.get(u.id) ?? 0,
            })),
        };
      }
      case 'branch.anomaly': {
        const rep = await this.anomaly.analyze({}, p);
        return {
          shape: 'rows',
          columns: [
            { key: 'branch', label: '지점' },
            { key: 'score', label: '점수' },
            { key: 'reason', label: '이유' },
          ],
          rows: rep.branches
            .filter((b) => b.level !== 'NORMAL')
            .slice(0, 10)
            .map((b) => ({
              id: b.orgUnitId,
              title: b.orgUnitName,
              branch: b.orgUnitName,
              score: b.score,
              reason: b.reasons[0] ?? '-',
            })),
        };
      }

      // ── 고객 ──
      case 'customer.byGrade': {
        const cOrg = ids === null ? {} : { ownerOrgId: { in: ids } };
        const [rows, codes] = await Promise.all([
          this.prisma.customer.groupBy({ by: ['grade'], where: cOrg, _count: true }),
          this.prisma.commonCode.findMany({
            where: { codeGroup: 'CUSTOMER_GRADE' },
            select: { code: true, name: true },
          }),
        ]);
        const label = new Map(codes.map((c) => [c.code, c.name]));
        return this.category(
          rows.map((x) => ({
            key: x.grade ?? 'NONE',
            label: x.grade ? (label.get(x.grade) ?? x.grade) : '미지정',
            value: x._count,
          })),
          'count',
        );
      }
      case 'customer.trend': {
        const cOrg = ids === null ? {} : { ownerOrgId: { in: ids } };
        return this.series(
          await this.prisma.customer.findMany({
            where: { ...cOrg, ...since('createdAt') },
            select: { createdAt: true },
          }),
          (x) => x.createdAt,
          () => 1,
          r,
          'count',
        );
      }
      case 'customer.byRegion': {
        const cOrg = ids === null ? {} : { ownerOrgId: { in: ids } };
        const rows = await this.prisma.customer.groupBy({
          by: ['sido'],
          where: { ...cOrg, sido: { not: null } },
          _count: true,
        });
        return this.category(
          rows.map((x) => ({ key: x.sido!, label: x.sido!, value: x._count })),
          'count',
        );
      }

      // ── 고객지원·리빙케어 ──
      case 'support.byStatus':
        return this.statusCategory(
          await this.prisma.supportTicket.groupBy({
            by: ['status'],
            where: { ...org, ...since('createdAt') },
            _count: true,
          }),
          SUPPORT_STATUS_LABEL,
        );
      case 'support.recent': {
        const rows = await this.prisma.supportTicket.findMany({
          where: org,
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, subject: true, status: true, kind: true, createdAt: true },
        });
        return {
          shape: 'rows',
          columns: [
            { key: 'subject', label: '제목' },
            { key: 'kind', label: '유형' },
            { key: 'status', label: '상태' },
            { key: 'createdAt', label: '접수일', format: 'date' },
          ],
          rows: rows.map((t) => ({
            id: t.id,
            title: t.subject,
            subject: t.subject,
            kind: t.kind === 'AS' ? '하자보수' : '상담',
            status: SUPPORT_STATUS_LABEL[t.status] ?? t.status,
            createdAt: t.createdAt.toISOString(),
          })),
        };
      }
      case 'service.byStatus':
        return this.statusCategory(
          await this.prisma.serviceOrder.groupBy({
            by: ['status'],
            where: { ...org, ...since('createdAt') },
            _count: true,
          }),
          SERVICE_STATUS_LABEL,
        );

      // ── 마케팅·일정 ──
      case 'campaign.recent': {
        const rows = await this.prisma.campaign.findMany({
          where: { status: { in: ['SENT', 'SENDING', 'SCHEDULED'] } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            name: true,
            recipientCount: true,
            sentCount: true,
            failedCount: true,
            sentAt: true,
            scheduledAt: true,
          },
        });
        return {
          shape: 'rows',
          link: '/campaigns/{id}',
          columns: [
            { key: 'name', label: '캠페인' },
            { key: 'recipientCount', label: '대상', format: 'count' },
            { key: 'sentCount', label: '성공', format: 'count' },
            { key: 'failedCount', label: '실패', format: 'count' },
          ],
          rows: rows.map((c) => ({
            id: c.id,
            title: c.name,
            name: c.name,
            recipientCount: c.recipientCount,
            sentCount: c.sentCount,
            failedCount: c.failedCount,
            date: (c.sentAt ?? c.scheduledAt)?.toISOString() ?? null,
          })),
        };
      }
      case 'calendar.upcoming': {
        const today = new Date(`${ymd(new Date())}T00:00:00+09:00`);
        const rows = await this.prisma.calendarEvent.findMany({
          where: {
            ownerUserId: p.userId,
            date: { gte: today, lt: new Date(today.getTime() + 14 * DAY) },
          },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          take: 10,
          select: { id: true, title: true, date: true, startTime: true, location: true },
        });
        return {
          shape: 'rows',
          link: '/calendar',
          columns: [
            { key: 'date', label: '날짜', format: 'date' },
            { key: 'time', label: '시간' },
            { key: 'titleText', label: '일정' },
          ],
          rows: rows.map((e) => ({
            id: e.id,
            title: e.title,
            titleText: e.title,
            date: e.date.toISOString(),
            time: e.startTime ?? '하루 종일',
          })),
        };
      }
    }
    throw new Error('아직 준비되지 않은 위젯입니다');
  }

  // ── 도우미 ──

  private series<T>(
    rows: T[],
    at: (x: T) => Date,
    val: (x: T) => number,
    r: Range,
    format: 'count' | 'won',
  ): DashData {
    // 전체 기간이면 가장 오래된 데이터부터(최대 36개월)
    let from = r.from;
    if (!from) {
      const min = rows.reduce<Date | null>((m, x) => (!m || at(x) < m ? at(x) : m), null);
      const floor = Date.now() - 36 * 30 * DAY;
      from = new Date(Math.max(min?.getTime() ?? Date.now(), floor));
    }
    const axis = buckets(from, r.unit);
    const m = new Map<string, number>();
    for (const x of rows) {
      const k = keyOf(at(x), r.unit);
      m.set(k, (m.get(k) ?? 0) + val(x));
    }
    return {
      shape: 'series',
      format,
      unit: r.unit,
      points: axis.map((b) => ({ ...b, value: m.get(b.x) ?? 0 })),
    };
  }

  /** 항목 정리 — 큰 순서, limit을 넘으면 나머지는 '기타'로 묶는다 */
  private category(
    items: { key: string; label: string; value: number }[],
    format: 'count' | 'won',
    limit?: number,
    /** 순위(지점 등)는 '기타'로 묶지 않고 위에서 limit개만 */
    topOnly = false,
  ): DashData {
    const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
    if (limit && topOnly) return { shape: 'category', format, items: sorted.slice(0, limit) };
    if (limit && sorted.length > limit) {
      const head = sorted.slice(0, limit - 1);
      const rest = sorted.slice(limit - 1).reduce((s, i) => s + i.value, 0);
      return {
        shape: 'category',
        format,
        items: [...head, { key: 'OTHER', label: '기타', value: rest }],
      };
    }
    return { shape: 'category', format, items: sorted };
  }

  /** rows: groupBy(['status'], _count) 결과 */
  private statusCategory(rows: unknown, labels: Record<string, string>): DashData {
    const list = rows as { status: string; _count: number }[];
    const m = new Map(list.map((x) => [x.status, x._count]));
    const order = Object.keys(labels);
    return {
      shape: 'category',
      format: 'count',
      items: [...order, ...[...m.keys()].filter((k) => !order.includes(k))]
        .filter((k) => (m.get(k) ?? 0) > 0)
        .map((k) => ({ key: k, label: labels[k] ?? k, value: m.get(k) ?? 0 })),
    };
  }

  private async byOrg(
    rows: { id: string; value: number }[],
    format: 'count' | 'won',
    limit: number,
  ) {
    const names = await this.orgNames(rows.map((x) => x.id));
    return this.category(
      rows.map((x) => ({ key: x.id, label: names.get(x.id) ?? '-', value: x.value })),
      format,
      limit,
      true,
    );
  }

  private async orgNames(ids: string[]) {
    const rows = await this.prisma.orgUnit.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((x) => [x.id, x.name]));
  }

  /** 전 지점의 지표 값 */
  private async branchMetric(metric: DashMetric, r: Range) {
    const since = (f: string) => (r.from ? { [f]: { gte: r.from } } : {});
    const m = new Map<string, number>();
    if (metric === 'leadCount') {
      const rows = await this.prisma.lead.groupBy({
        by: ['orgUnitId'],
        where: since('createdAt'),
        _count: true,
      });
      rows.forEach((x) => m.set(x.orgUnitId, x._count));
    } else if (metric === 'workCount') {
      const rows = await this.prisma.workOrder.groupBy({
        by: ['orgUnitId'],
        where: { status: { not: 'CANCELED' }, ...since('createdAt') },
        _count: true,
      });
      rows.forEach((x) => m.set(x.orgUnitId, x._count));
    } else {
      const rows = await this.prisma.contract.groupBy({
        by: ['orgUnitId'],
        where: { status: 'SIGNED', ...since('signedAt') },
        _count: true,
        _sum: { totalAmount: true },
      });
      rows.forEach((x) =>
        m.set(x.orgUnitId, metric === 'revenue' ? num(x._sum.totalAmount) : x._count),
      );
    }
    return m;
  }
}
