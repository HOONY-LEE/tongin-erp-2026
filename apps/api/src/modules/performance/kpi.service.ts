import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KPI_CATALOG,
  KPI_CATALOG_BY_KEY,
  KPI_COMPANY_KEYS,
  KPI_MAX_METRICS,
  KPI_MIN_METRICS,
  PERMISSION_WILDCARD,
  isKpiAutoKey,
  kpiGrade,
  kpiPeriodRange,
  kpiScore,
  type AuthPrincipal,
  type KpiAutoKey,
  type KpiMetricConfig,
  type KpiResolved,
  type KpiResult,
  type KpiScope,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { DutyService } from './duty.service';

/** 본사 조직(카드로 보이는 조직) */
const HQ_ORG_TYPES = ['DEPT', 'TF'];
/** 지점 */
const BRANCH_TYPES = ['BRANCH'];

/** 지표 계산에 쓰는 원자료 — 조직은 하위 조직까지 더한다 */
interface Raw {
  revenue: number;
  contracts: number;
  paid: number;
  done: number;
  taskTotal: number;
  taskDone: number;
  timedDone: number;
  onTime: number;
  attDays: number;
  attOnTime: number;
  /** 접수 */
  leads: number;
  /** 견적 · 그중 서명 계약으로 이어진 것 */
  estimates: number;
  estContracted: number;
  /** 끝낸 상담 콜 · 그중 접수 등록 · 콜백으로 끝낸 것 */
  calls: number;
  callLeads: number;
  outcalls: number;
  /** 해결·종료된 A/S·CS */
  asDone: number;
  /** CRM 업체 등록 */
  crmNew: number;
}
const emptyRaw = (): Raw => ({
  revenue: 0,
  contracts: 0,
  paid: 0,
  done: 0,
  taskTotal: 0,
  taskDone: 0,
  timedDone: 0,
  onTime: 0,
  attDays: 0,
  attOnTime: 0,
  leads: 0,
  estimates: 0,
  estContracted: 0,
  calls: 0,
  callLeads: 0,
  outcalls: 0,
  asDone: 0,
  crmNew: 0,
});
const addRaw = (a: Raw, b: Raw) => {
  for (const k of Object.keys(a) as (keyof Raw)[]) a[k] += b[k];
};
/** 업무·근태 원자료 — 본사 부서 카드는 이것만 조직(팀 업무) 기준, 나머지는 구성원 합 */
const ORG_BASED: (keyof Raw)[] = [
  'taskTotal',
  'taskDone',
  'timedDone',
  'onTime',
  'attDays',
  'attOnTime',
];
/** 회사 전체로만 세는 값(담당자가 기록에 없는 것) */
interface CompanyRaw {
  partnerNew: number;
  partnerLeads: number;
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

function autoValue(key: KpiAutoKey, r: Raw, c: CompanyRaw): number | null {
  switch (key) {
    case 'LEAD_COUNT':
      return r.leads;
    case 'ESTIMATE_COUNT':
      return r.estimates;
    case 'ESTIMATE_CONVERSION':
      return pct(r.estContracted, r.estimates);
    case 'CALL_HANDLED':
      return r.calls;
    case 'CALL_TO_LEAD':
      return pct(r.callLeads, r.calls);
    case 'OUTCALL_DONE':
      return r.outcalls;
    case 'AS_HANDLED':
      return r.asDone;
    case 'CRM_NEW':
      return r.crmNew;
    case 'PARTNER_NEW':
      return c.partnerNew;
    case 'PARTNER_LEADS':
      return c.partnerLeads;
    case 'CONTRACT_REVENUE':
      return r.revenue;
    case 'CONTRACT_COUNT':
      return r.contracts;
    case 'PAID_REVENUE':
      return r.paid;
    case 'DONE_COUNT':
      return r.done;
    case 'TASK_COMPLETION':
      return pct(r.taskDone, r.taskTotal);
    case 'TASK_ON_TIME':
      return pct(r.onTime, r.timedDone);
    case 'ATTENDANCE':
      return pct(r.attOnTime, r.attDays);
  }
}

/** 자동 지표 한 줄(목표를 안 주면 카탈로그 기본 목표) */
const auto = (key: KpiAutoKey, weight = 1, target?: number): KpiMetricConfig => ({
  key,
  target: target ?? KPI_CATALOG_BY_KEY[key].defaultTarget,
  weight,
});
/** 직접 지표 한 줄 — ERP로 셀 수 없는 것은 인사팀이 분기 실적을 넣는다 */
const manual = (
  key: string,
  label: string,
  unit: string,
  target: number,
  weight = 1,
): KpiMetricConfig => ({ key: `custom:${key}`, label, unit, target, weight });

/**
 * 부서별 기본 구성(5~6개) — 그 부서가 실제로 하는 일을 재는 지표. ERP 기록으로 셀 수 있으면 자동,
 * 없으면 직접 지표. 성과 평가 화면에서 따로 정하면(구성 저장) 그것이 우선한다.
 */
const DEPT_DEFAULTS: { match: RegExp; metrics: KpiMetricConfig[] }[] = [
  {
    // 전화 상담·접수 등록·콜백·A/S
    match: /고객관리/,
    metrics: [
      auto('CALL_HANDLED', 2),
      auto('CALL_TO_LEAD', 2),
      auto('OUTCALL_DONE'),
      auto('AS_HANDLED', 2),
      auto('LEAD_COUNT'),
      auto('ATTENDANCE'),
    ],
  },
  {
    // 제휴사·전속 계약사 영업 — 계약·CRM 등록·제휴 접수
    match: /전속|제휴/,
    metrics: [
      auto('PARTNER_NEW', 3),
      auto('CRM_NEW', 2),
      auto('PARTNER_LEADS', 2),
      manual('partner-meeting', '제휴처 미팅', '건', 24),
      auto('TASK_COMPLETION'),
      auto('ATTENDANCE'),
    ],
  },
  {
    // 방문 견적 — 견적 건수와 견적이 계약·작업으로 이어진 정도
    match: /홈플래너/,
    metrics: [
      auto('ESTIMATE_COUNT', 2),
      auto('ESTIMATE_CONVERSION', 3),
      auto('CONTRACT_COUNT', 2),
      auto('CONTRACT_REVENUE', 2),
      auto('DONE_COUNT'),
      auto('ATTENDANCE'),
    ],
  },
  {
    // VIP 이사 — 접수·계약 건수·계약 금액
    match: /무브제/,
    metrics: [
      auto('LEAD_COUNT', 2),
      auto('CONTRACT_COUNT', 2),
      auto('CONTRACT_REVENUE', 3),
      auto('ESTIMATE_CONVERSION', 2),
      manual('vip-satisfaction', 'VIP 만족도', '점', 90),
      auto('ATTENDANCE'),
    ],
  },
  {
    match: /기업영업/,
    metrics: [
      auto('CRM_NEW', 2),
      manual('b2b-meeting', '기업 미팅·제안', '건', 30, 2),
      auto('CONTRACT_COUNT', 2),
      auto('CONTRACT_REVENUE', 3),
      auto('TASK_COMPLETION'),
      auto('ATTENDANCE'),
    ],
  },
  {
    match: /가맹/,
    metrics: [
      auto('CRM_NEW', 2),
      manual('new-franchise', '신규 가맹', '개점', 15, 3),
      manual('econtract', '전자계약 업로드율', '%', 95, 2),
      manual('material', '자재 구매 지점 비율', '%', 95),
      auto('TASK_COMPLETION'),
      auto('ATTENDANCE'),
    ],
  },
  {
    // 정산·수금·인사 — 입금액과 마감 지키기
    match: /경영관리/,
    metrics: [
      auto('PAID_REVENUE', 2),
      manual('receivable', '미수금 회수율', '%', 90, 2),
      manual('closing', '정산 마감 준수', '%', 100),
      auto('TASK_COMPLETION'),
      auto('TASK_ON_TIME'),
      auto('ATTENDANCE'),
    ],
  },
  {
    match: /마케팅/,
    metrics: [
      manual('campaign', '캠페인 실행', '건', 12, 2),
      manual('inflow', '광고 유입 접수', '건', 150, 3),
      auto('LEAD_COUNT'),
      auto('TASK_COMPLETION'),
      auto('TASK_ON_TIME'),
      auto('ATTENDANCE'),
    ],
  },
  {
    match: /디자인/,
    metrics: [
      manual('deliverable', '디자인 산출물', '건', 40, 2),
      manual('revision', '요청 반영도', '점', 90),
      auto('TASK_COMPLETION', 2),
      auto('TASK_ON_TIME', 2),
      auto('ATTENDANCE'),
    ],
  },
];
/** 그 밖의 본사 부서·TF(기획·부동산 등) */
const HQ_DEFAULT: KpiMetricConfig[] = [
  manual('milestone', '과제 달성률', '%', 90, 2),
  manual('report', '보고·제안 제출', '건', 12),
  auto('TASK_COMPLETION', 2),
  auto('TASK_ON_TIME'),
  auto('ATTENDANCE'),
];
/** 지점 — 접수에서 견적·계약·작업·입금까지 */
const BRANCH_DEFAULT: KpiMetricConfig[] = [
  auto('CONTRACT_REVENUE', 3),
  auto('CONTRACT_COUNT', 2),
  auto('LEAD_COUNT'),
  auto('ESTIMATE_CONVERSION', 2),
  auto('DONE_COUNT'),
  auto('PAID_REVENUE'),
];

/** 기본 구성 — 지점은 영업·작업, 본사 부서는 부서 이름으로 고른 업무 지표 */
function defaultMetrics(orgType: string, orgName = ''): KpiMetricConfig[] {
  if (BRANCH_TYPES.includes(orgType)) return BRANCH_DEFAULT;
  return DEPT_DEFAULTS.find((d) => d.match.test(orgName))?.metrics ?? HQ_DEFAULT;
}

/** 개인이 조직 구성을 따를 때 — 금액·건수 목표는 조직 인원으로 나눈다(비율 지표는 그대로) */
function shareForPerson(m: KpiMetricConfig, members: number): KpiMetricConfig {
  const unit = isKpiAutoKey(m.key) ? KPI_CATALOG_BY_KEY[m.key].unit : (m.unit ?? '');
  if (unit === '%' || members <= 1) return m;
  const t = m.target / members;
  return { ...m, target: unit === '원' ? Math.round(t / 1000) * 1000 : Math.max(1, Math.round(t)) };
}

/** 개인 지표가 3개보다 적으면 업무·근태 지표로 채운다(다각형은 꼭짓점 3개부터) */
function fillPersonal(metrics: KpiMetricConfig[]): KpiMetricConfig[] {
  const out = [...metrics];
  for (const k of ['TASK_COMPLETION', 'TASK_ON_TIME', 'ATTENDANCE'] as KpiAutoKey[]) {
    if (out.length >= KPI_MIN_METRICS) break;
    if (!out.some((m) => m.key === k))
      out.push({ key: k, target: KPI_CATALOG_BY_KEY[k].defaultTarget, weight: 1 });
  }
  return out;
}

export interface KpiSaveInput {
  scope: KpiScope;
  scopeId: string;
  period: string;
  metrics: KpiMetricConfig[];
  actuals?: Record<string, number | null>;
  note?: string | null;
}

/**
 * 성과 평가 — 조직·직원 지표(3~8개)와 목표, 기간(분기) 실적으로 달성률·종합 점수·등급.
 * 자동 지표는 ERP 기록에서 계산하고, 직접 지표 실적은 인사팀이 넣는다.
 * 구성이 없는 조직은 기본 구성, 구성이 없는 직원은 소속 조직 구성(금액·건수 목표는 인원으로 나눔)을 따른다.
 */
@Injectable()
export class KpiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly duties: DutyService,
  ) {}

  canEdit(p: AuthPrincipal) {
    return p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes('HR.UPDATE');
  }

  private range(period: string) {
    const r = kpiPeriodRange(period);
    if (!r) throw new BadRequestException('기간 형식이 올바르지 않습니다(예: 2026-Q4).');
    return {
      ...r,
      fromTs: new Date(`${r.from}T00:00:00+09:00`),
      toTs: new Date(`${r.to}T00:00:00+09:00`),
      fromDate: new Date(`${r.from}T00:00:00Z`),
      toDate: new Date(`${r.to}T00:00:00Z`),
    };
  }

  /** 기간 원자료 — 조직(직접 소속분)·직원별 */
  private async collect(period: string) {
    const r = this.range(period);
    const settings = await this.attendance.settings();
    const [h, m] = settings.workStart.split(':').map(Number);
    const lateAfter = h * 60 + m + settings.lateGraceMin;

    const org = new Map<string, Raw>();
    const emp = new Map<string, Raw>();
    const at = (map: Map<string, Raw>, id: string | null | undefined) => {
      if (!id) return null;
      let v = map.get(id);
      if (!v) map.set(id, (v = emptyRaw()));
      return v;
    };

    const [contracts, payments, works, tasks, att] = await Promise.all([
      this.prisma.contract.findMany({
        where: { status: 'SIGNED', signedAt: { gte: r.fromTs, lt: r.toTs } },
        select: {
          orgUnitId: true,
          totalAmount: true,
          estimate: { select: { estimatorEmpId: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { status: 'PAID', paidAt: { gte: r.fromTs, lt: r.toTs } },
        select: {
          amount: true,
          contract: { select: { orgUnitId: true, estimate: { select: { estimatorEmpId: true } } } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { status: 'DONE', scheduledDate: { gte: r.fromDate, lt: r.toDate } },
        select: { orgUnitId: true, assignments: { select: { employeeId: true } } },
      }),
      this.prisma.teamTask.findMany({
        where: {
          OR: [
            { dueDate: { gte: r.fromDate, lt: r.toDate } },
            { dueDate: null, createdAt: { gte: r.fromTs, lt: r.toTs } },
          ],
        },
        select: {
          teamOrgId: true,
          assigneeEmpId: true,
          status: true,
          dueDate: true,
          doneAt: true,
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          // 근태 집계 시작일 앞은 세지 않는다
          workDate: {
            gte:
              settings.trackFrom > r.from
                ? new Date(`${settings.trackFrom}T00:00:00Z`)
                : r.fromDate,
            lt: r.toDate,
          },
          clockIn: { not: null },
        },
        select: {
          employeeId: true,
          clockIn: true,
          employee: { select: { orgUnitId: true } },
        },
      }),
    ]);

    for (const c of contracts) {
      const amt = Number(c.totalAmount);
      for (const v of [at(org, c.orgUnitId), at(emp, c.estimate?.estimatorEmpId)]) {
        if (!v) continue;
        v.revenue += amt;
        v.contracts += 1;
      }
    }
    for (const p of payments) {
      const amt = Number(p.amount);
      for (const v of [
        at(org, p.contract?.orgUnitId),
        at(emp, p.contract?.estimate?.estimatorEmpId),
      ])
        if (v) v.paid += amt;
    }
    for (const w of works) {
      const o = at(org, w.orgUnitId);
      if (o) o.done += 1;
      for (const id of new Set(w.assignments.map((a) => a.employeeId))) {
        const v = at(emp, id);
        if (v) v.done += 1;
      }
    }
    for (const t of tasks) {
      const isDone = t.status === 'DONE';
      const timed = isDone && !!t.dueDate && !!t.doneAt;
      // 기한 안 = 끝낸 날(한국 날짜) ≤ 기한
      const onTime =
        timed &&
        new Date(t.doneAt!.getTime() + 9 * 3600_000).toISOString().slice(0, 10) <=
          t.dueDate!.toISOString().slice(0, 10);
      for (const v of [at(org, t.teamOrgId), at(emp, t.assigneeEmpId)]) {
        if (!v) continue;
        v.taskTotal += 1;
        if (isDone) v.taskDone += 1;
        if (timed) v.timedDone += 1;
        if (onTime) v.onTime += 1;
      }
    }
    for (const a of att) {
      const k = new Date(a.clockIn!.getTime() + 9 * 3600_000);
      const ok = k.getUTCHours() * 60 + k.getUTCMinutes() <= lateAfter;
      for (const v of [at(org, a.employee.orgUnitId), at(emp, a.employeeId)]) {
        if (!v) continue;
        v.attDays += 1;
        if (ok) v.attOnTime += 1;
      }
    }

    // ── 부서별 업무 지표(접수·견적·상담 콜·A/S·CRM·제휴) ──
    const [leads, estimates, calls, tickets, crm, staff, partnerNew, partnerLeads] =
      await Promise.all([
        this.prisma.lead.findMany({
          where: { createdAt: { gte: r.fromTs, lt: r.toTs } },
          select: { orgUnitId: true, ownerEmpId: true },
        }),
        this.prisma.estimate.findMany({
          where: { createdAt: { gte: r.fromTs, lt: r.toTs } },
          select: {
            orgUnitId: true,
            estimatorEmpId: true,
            contract: { select: { status: true } },
          },
        }),
        this.prisma.csCall.findMany({
          where: { status: 'DONE', receivedAt: { gte: r.fromTs, lt: r.toTs } },
          select: { agentEmpId: true, leadId: true, attempts: true },
        }),
        this.prisma.supportTicket.findMany({
          where: {
            status: { in: ['RESOLVED', 'CLOSED'] },
            createdAt: { gte: r.fromTs, lt: r.toTs },
          },
          select: { orgUnitId: true, assigneeEmpId: true },
        }),
        this.prisma.crmLead.findMany({
          where: { createdAt: { gte: r.fromTs, lt: r.toTs } },
          select: { createdByUserId: true, ownerEmpId: true },
        }),
        // 상담원·CRM 등록자의 소속(콜·CRM에는 조직이 없다) — 계정 → 직원 → 조직
        this.prisma.appUser.findMany({
          where: { employeeId: { not: null } },
          select: { id: true, employee: { select: { id: true, orgUnitId: true } } },
        }),
        this.prisma.partner.count({
          where: {
            type: { in: ['AFFILIATE', 'EXCLUSIVE'] },
            createdAt: { gte: r.fromTs, lt: r.toTs },
          },
        }),
        this.prisma.lead.count({
          where: {
            partner: { type: { in: ['AFFILIATE', 'EXCLUSIVE'] } },
            createdAt: { gte: r.fromTs, lt: r.toTs },
          },
        }),
      ]);
    const empOrg = new Map<string, string>();
    const userEmp = new Map<string, string>();
    for (const u of staff) {
      if (!u.employee) continue;
      empOrg.set(u.employee.id, u.employee.orgUnitId);
      userEmp.set(u.id, u.employee.id);
    }
    // 한 기록은 조직 한 곳·사람 한 명에만 센다(회사 합계에서 두 번 세지 않게)
    const both = (orgId: string | null | undefined, empId: string | null | undefined) =>
      [at(org, orgId ?? (empId ? empOrg.get(empId) : null)), at(emp, empId)].filter(
        (v): v is Raw => !!v,
      );
    for (const l of leads) for (const v of both(l.orgUnitId, l.ownerEmpId)) v.leads += 1;
    for (const e of estimates) {
      const signed = e.contract?.status === 'SIGNED';
      for (const v of both(e.orgUnitId, e.estimatorEmpId)) {
        v.estimates += 1;
        if (signed) v.estContracted += 1;
      }
    }
    for (const c of calls) {
      for (const v of both(null, c.agentEmpId)) {
        v.calls += 1;
        if (c.leadId) v.callLeads += 1;
        if (c.attempts > 0) v.outcalls += 1;
      }
    }
    for (const t of tickets) for (const v of both(t.orgUnitId, t.assigneeEmpId)) v.asDone += 1;
    for (const c of crm) {
      const by = (c.createdByUserId ? userEmp.get(c.createdByUserId) : null) ?? c.ownerEmpId;
      for (const v of both(null, by)) v.crmNew += 1;
    }
    const company: CompanyRaw = { partnerNew, partnerLeads };
    return { org, emp, company };
  }

  /** 조직 나무 — 하위 조직까지 더한 원자료와 인원 */
  private async orgTree() {
    const units = await this.prisma.orgUnit.findMany({
      where: { isActive: true },
      select: { id: true, parentId: true, name: true, type: true },
    });
    const kids = new Map<string, string[]>();
    for (const u of units)
      if (u.parentId) kids.set(u.parentId, [...(kids.get(u.parentId) ?? []), u.id]);
    const subtree = (id: string) => {
      const out = [id];
      for (let i = 0; i < out.length; i++) out.push(...(kids.get(out[i]) ?? []));
      return out;
    };
    return { units, subtree };
  }

  private resolve(
    metrics: KpiMetricConfig[],
    raw: Raw,
    actuals: Record<string, number | null>,
    company: CompanyRaw,
  ): KpiResolved[] {
    return metrics.map((m) => {
      const cat = isKpiAutoKey(m.key) ? KPI_CATALOG_BY_KEY[m.key] : null;
      const actual = cat
        ? autoValue(cat.key, raw, company)
        : typeof actuals[m.key] === 'number'
          ? (actuals[m.key] as number)
          : null;
      const achievement =
        actual === null || !(m.target > 0) ? null : Math.round((actual / m.target) * 1000) / 10;
      return {
        key: m.key,
        label: cat?.label ?? m.label ?? '지표',
        short: cat?.short ?? (m.label ?? '지표').slice(0, 8),
        unit: cat?.unit ?? m.unit ?? '',
        auto: !!cat,
        source: cat?.source ?? '직접 입력',
        target: m.target,
        weight: m.weight,
        actual,
        achievement,
      };
    });
  }

  private parseMetrics(v: Prisma.JsonValue): KpiMetricConfig[] {
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is Prisma.JsonObject => !!x && typeof x === 'object' && !Array.isArray(x))
      .map((x) => ({
        key: String(x.key ?? ''),
        label: typeof x.label === 'string' ? x.label : undefined,
        unit: typeof x.unit === 'string' ? x.unit : undefined,
        target: Number(x.target) || 0,
        weight: Number(x.weight) || 1,
      }))
      .filter((m) => m.key);
  }
  private parseActuals(v: Prisma.JsonValue): Record<string, number | null> {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Record<string, number | null> = {};
    for (const [k, x] of Object.entries(v)) out[k] = typeof x === 'number' ? x : null;
    return out;
  }

  /**
   * 한 기간 전체 — 조직 카드(본사 부서·TF 또는 지점)와 직원 표.
   * group: 'HQ' 본사 | 'BRANCH' 지점
   */
  async overview(period: string, group: 'HQ' | 'BRANCH') {
    const [{ org: orgRaw, emp: empRaw, company }, tree, sets] = await Promise.all([
      this.collect(period),
      this.orgTree(),
      this.prisma.kpiSet.findMany({ where: { period } }),
    ]);
    const setOf = new Map(sets.map((s) => [`${s.scope}:${s.scopeId}`, s]));
    const orgTypes = group === 'BRANCH' ? BRANCH_TYPES : HQ_ORG_TYPES;
    const unitById = new Map(tree.units.map((u) => [u.id, u]));

    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        orgUnitId: true,
        position: { select: { name: true, sortOrder: true } },
      },
    });
    const directCount = new Map<string, number>();
    for (const e of employees)
      directCount.set(e.orgUnitId, (directCount.get(e.orgUnitId) ?? 0) + 1);

    // 조직 구성(직접 정했거나 기본) — 직원이 따를 때도 쓴다
    const orgConfig = (id: string) => {
      const own = setOf.get(`ORG:${id}`);
      const unit = unitById.get(id);
      return own
        ? {
            source: 'OWN' as const,
            metrics: this.parseMetrics(own.metrics),
            actuals: this.parseActuals(own.actuals),
            note: own.note,
          }
        : {
            source: 'DEFAULT' as const,
            metrics: defaultMetrics(unit?.type ?? 'DEPT', unit?.name),
            actuals: {},
            note: null,
          };
    };
    const orgRawSum = (id: string) => {
      const sum = emptyRaw();
      for (const x of tree.subtree(id)) {
        const r = orgRaw.get(x);
        if (r) addRaw(sum, r);
      }
      return sum;
    };
    // 본사 부서 카드 — 계약·접수·견적·콜·A/S·CRM은 구성원(하위 조직 포함)이 한 것의 합.
    // 거의 모든 접수·계약은 지점 소속이라, 부서 일은 담당자(견적·상담원·등록자)로만 셀 수 있다.
    // 업무·근태는 예전처럼 조직(팀 업무) 기준
    const hqRawSum = (id: string) => {
      const sum = emptyRaw();
      const inTree = new Set(tree.subtree(id));
      for (const e of employees) {
        if (!inTree.has(e.orgUnitId)) continue;
        const r = empRaw.get(e.id);
        if (r) addRaw(sum, r);
      }
      const byOrg = orgRawSum(id);
      for (const k of ORG_BASED) sum[k] = byOrg[k];
      return sum;
    };

    const orgs: KpiResult[] = tree.units
      .filter((u) => orgTypes.includes(u.type))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((u) => {
        const cfg = orgConfig(u.id);
        const raw = group === 'BRANCH' ? orgRawSum(u.id) : hqRawSum(u.id);
        const metrics = this.resolve(cfg.metrics, raw, cfg.actuals, company);
        const score = kpiScore(metrics);
        const members = tree.subtree(u.id).reduce((s, x) => s + (directCount.get(x) ?? 0), 0);
        return {
          scope: 'ORG',
          id: u.id,
          name: u.name,
          sub: u.type,
          orgUnitId: u.parentId,
          orgUnitName: u.parentId ? (unitById.get(u.parentId)?.name ?? null) : null,
          memberCount: members,
          source: cfg.source,
          metrics,
          score,
          grade: score === null ? null : kpiGrade(score),
          note: cfg.note,
        };
      });

    const inGroup = (orgUnitId: string) => {
      const t = unitById.get(orgUnitId)?.type ?? '';
      return group === 'BRANCH'
        ? BRANCH_TYPES.includes(t)
        : !BRANCH_TYPES.includes(t) && t !== 'PARTNER';
    };
    const people: KpiResult[] = employees
      .filter((e) => inGroup(e.orgUnitId))
      .sort(
        (a, b) =>
          (unitById.get(a.orgUnitId)?.name ?? '').localeCompare(
            unitById.get(b.orgUnitId)?.name ?? '',
            'ko',
          ) ||
          (a.position?.sortOrder ?? 999) - (b.position?.sortOrder ?? 999) ||
          a.name.localeCompare(b.name, 'ko'),
      )
      .map((e) =>
        this.personResult(
          e,
          setOf.get(`EMPLOYEE:${e.id}`),
          orgConfig(e.orgUnitId),
          empRaw,
          unitById,
          directCount,
          company,
        ),
      );

    return { period, canEdit: false, catalog: KPI_CATALOG, orgs, people };
  }

  private personResult(
    e: { id: string; name: string; orgUnitId: string; position: { name: string } | null },
    own: { metrics: Prisma.JsonValue; actuals: Prisma.JsonValue; note: string | null } | undefined,
    orgCfg: { source: 'OWN' | 'DEFAULT'; metrics: KpiMetricConfig[] },
    empRaw: Map<string, Raw>,
    unitById: Map<string, { name: string }>,
    directCount: Map<string, number>,
    company: CompanyRaw,
  ): KpiResult {
    const cfg = own
      ? {
          source: 'OWN' as const,
          metrics: this.parseMetrics(own.metrics),
          actuals: this.parseActuals(own.actuals),
          note: own.note,
        }
      : {
          source: orgCfg.source === 'OWN' ? ('ORG' as const) : ('DEFAULT' as const),
          // 직접 지표는 조직 실적이라 개인에게 넘기지 않는다 — 3개가 안 되면 개인 기본 지표로 채운다
          metrics: fillPersonal(
            orgCfg.metrics
              // 회사 전체로만 세는 지표(제휴 계약·제휴 접수)는 팀 공동 — 개인에게 넘기지 않는다
              .filter((m) => isKpiAutoKey(m.key) && !KPI_COMPANY_KEYS.includes(m.key))
              .map((m) => shareForPerson(m, directCount.get(e.orgUnitId) ?? 1)),
          ),
          actuals: {},
          note: null,
        };
    const metrics = this.resolve(cfg.metrics, empRaw.get(e.id) ?? emptyRaw(), cfg.actuals, company);
    const score = kpiScore(metrics);
    return {
      scope: 'EMPLOYEE',
      id: e.id,
      name: e.name,
      sub: e.position?.name ?? null,
      orgUnitId: e.orgUnitId,
      orgUnitName: unitById.get(e.orgUnitId)?.name ?? null,
      source: cfg.source,
      metrics,
      score,
      grade: score === null ? null : kpiGrade(score),
      note: cfg.note,
    };
  }

  /** 한 조직·직원 — 상세 화면(직원이면 업무분장도 함께) */
  async one(p: AuthPrincipal, scope: KpiScope, id: string, period: string) {
    let group: 'HQ' | 'BRANCH' = 'HQ';
    if (scope === 'ORG') {
      const u = await this.prisma.orgUnit.findUnique({ where: { id }, select: { type: true } });
      if (!u) throw new NotFoundException('조직을 찾을 수 없습니다.');
      if (BRANCH_TYPES.includes(u.type)) group = 'BRANCH';
    } else {
      const e = await this.prisma.employee.findUnique({
        where: { id },
        select: { orgUnit: { select: { type: true } } },
      });
      if (!e) throw new NotFoundException('직원을 찾을 수 없습니다.');
      if (BRANCH_TYPES.includes(e.orgUnit.type)) group = 'BRANCH';
    }
    const all = await this.overview(period, group);
    const list = scope === 'ORG' ? all.orgs : all.people;
    let result = list.find((x) => x.id === id) ?? null;
    if (!result && scope === 'ORG') {
      // 카드 목록에 없는 조직(회사·그룹)도 상세는 볼 수 있게
      const extra = await this.overviewOrg(period, id);
      result = extra;
    }
    if (!result) throw new NotFoundException('평가 대상을 찾을 수 없습니다.');
    const members =
      scope === 'ORG'
        ? all.people
            .filter((x) => x.orgUnitId === id)
            .map((x) => ({
              id: x.id,
              name: x.name,
              sub: x.sub,
              score: x.score,
              grade: x.grade,
            }))
        : [];
    const duties =
      scope === 'EMPLOYEE'
        ? await this.duties.list({ ownerOrBackup: id })
        : (await this.duties.list()).filter((d) => d.orgUnitId === id);
    return { period, canEdit: this.canEdit(p), catalog: KPI_CATALOG, result, members, duties };
  }

  private async overviewOrg(period: string, id: string): Promise<KpiResult | null> {
    const u = await this.prisma.orgUnit.findUnique({ where: { id } });
    if (!u) return null;
    const [{ org: orgRaw, company }, tree, own] = await Promise.all([
      this.collect(period),
      this.orgTree(),
      this.prisma.kpiSet.findUnique({
        where: { scope_scopeId_period: { scope: 'ORG', scopeId: id, period } },
      }),
    ]);
    const sum = emptyRaw();
    for (const x of tree.subtree(id)) {
      const r = orgRaw.get(x);
      if (r) addRaw(sum, r);
    }
    const metricsCfg = own ? this.parseMetrics(own.metrics) : defaultMetrics(u.type, u.name);
    const metrics = this.resolve(
      metricsCfg,
      sum,
      own ? this.parseActuals(own.actuals) : {},
      company,
    );
    const score = kpiScore(metrics);
    return {
      scope: 'ORG',
      id,
      name: u.name,
      sub: u.type,
      orgUnitId: u.parentId,
      orgUnitName: null,
      source: own ? 'OWN' : 'DEFAULT',
      metrics,
      score,
      grade: score === null ? null : kpiGrade(score),
      note: own?.note ?? null,
    };
  }

  async save(p: AuthPrincipal, input: KpiSaveInput) {
    const { scopeId, ...rest } = input;
    return this.saveMany(p, { ...rest, scopeIds: [scopeId] });
  }

  /**
   * 여러 조직·직원에 같은 지표 구성을 한 번에 — 소속 조직 직원 전체나 고른 사람들.
   * actuals를 안 보내면(한꺼번에 정할 때) 사람마다 이미 넣어 둔 직접 지표 실적은 그대로 둔다.
   */
  async saveMany(
    p: AuthPrincipal,
    input: Omit<KpiSaveInput, 'scopeId' | 'actuals'> & {
      scopeIds: string[];
      actuals?: Record<string, number | null>;
    },
  ) {
    if (!this.canEdit(p)) throw new ForbiddenException('성과 지표를 정할 권한이 없습니다.');
    const ids = [...new Set(input.scopeIds)];
    if (!ids.length) throw new BadRequestException('적용할 대상을 골라 주세요.');
    this.range(input.period);
    const metrics = input.metrics.map((m) => ({
      key: m.key,
      ...(isKpiAutoKey(m.key)
        ? {}
        : { label: (m.label ?? '').trim(), unit: (m.unit ?? '').trim() }),
      target: m.target,
      weight: m.weight,
    }));
    if (metrics.length < KPI_MIN_METRICS || metrics.length > KPI_MAX_METRICS)
      throw new BadRequestException(
        `지표는 ${KPI_MIN_METRICS}~${KPI_MAX_METRICS}개로 정해 주세요.`,
      );
    if (new Set(metrics.map((m) => m.key)).size !== metrics.length)
      throw new BadRequestException('같은 지표가 두 번 들어 있습니다.');
    for (const m of metrics) {
      if (!isKpiAutoKey(m.key) && (!m.key.startsWith('custom:') || !m.label))
        throw new BadRequestException('직접 지표는 이름을 넣어 주세요.');
      if (!(m.target > 0)) throw new BadRequestException('목표는 0보다 커야 합니다.');
    }
    const found =
      input.scope === 'ORG'
        ? await this.prisma.orgUnit.count({ where: { id: { in: ids } } })
        : await this.prisma.employee.count({ where: { id: { in: ids } } });
    if (found !== ids.length)
      throw new NotFoundException(
        input.scope === 'ORG' ? '조직을 찾을 수 없습니다.' : '직원을 찾을 수 없습니다.',
      );
    const keys = new Set(metrics.filter((m) => !isKpiAutoKey(m.key)).map((m) => m.key));
    const clean = (a: Record<string, unknown> | null | undefined) =>
      Object.fromEntries(
        Object.entries(a ?? {}).filter(
          ([k, v]) => keys.has(k) && typeof v === 'number' && Number.isFinite(v),
        ),
      );
    const existing = input.actuals
      ? []
      : await this.prisma.kpiSet.findMany({
          where: { scope: input.scope, scopeId: { in: ids }, period: input.period },
          select: { scopeId: true, actuals: true },
        });
    const keep = new Map(existing.map((e) => [e.scopeId, this.parseActuals(e.actuals)]));
    await this.prisma.$transaction(
      ids.map((scopeId) => {
        const data = {
          metrics: metrics as unknown as Prisma.InputJsonValue,
          actuals: clean(input.actuals ?? keep.get(scopeId)) as Prisma.InputJsonValue,
          note: input.note?.trim() || null,
          updatedByUserId: p.userId,
        };
        return this.prisma.kpiSet.upsert({
          where: { scope_scopeId_period: { scope: input.scope, scopeId, period: input.period } },
          create: { scope: input.scope, scopeId, period: input.period, ...data },
          update: data,
        });
      }),
    );
    return { ok: true, saved: ids.length };
  }

  /** 여러 대상 한꺼번에 되돌리기 — 직원은 다시 소속 조직 구성을 따른다 */
  async resetMany(p: AuthPrincipal, scope: KpiScope, scopeIds: string[], period: string) {
    if (!this.canEdit(p)) throw new ForbiddenException('성과 지표를 정할 권한이 없습니다.');
    const r = await this.prisma.kpiSet.deleteMany({
      where: { scope, scopeId: { in: [...new Set(scopeIds)] }, period },
    });
    return { ok: true, reset: r.count };
  }

  /** 직접 정한 구성 지우기 — 다시 기본(조직) / 소속 조직 구성(직원)을 따른다 */
  async reset(p: AuthPrincipal, scope: KpiScope, scopeId: string, period: string) {
    if (!this.canEdit(p)) throw new ForbiddenException('성과 지표를 정할 권한이 없습니다.');
    await this.prisma.kpiSet.deleteMany({ where: { scope, scopeId, period } });
    return { ok: true };
  }
}
