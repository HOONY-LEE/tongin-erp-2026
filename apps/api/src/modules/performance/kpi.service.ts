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
});
const addRaw = (a: Raw, b: Raw) => {
  for (const k of Object.keys(a) as (keyof Raw)[]) a[k] += b[k];
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

function autoValue(key: KpiAutoKey, r: Raw): number | null {
  switch (key) {
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

/** 기본 구성 — 지점은 영업·작업, 본사 조직은 업무·근태 */
function defaultMetrics(orgType: string): KpiMetricConfig[] {
  const keys: KpiAutoKey[] = BRANCH_TYPES.includes(orgType)
    ? ['CONTRACT_REVENUE', 'CONTRACT_COUNT', 'DONE_COUNT']
    : ['TASK_COMPLETION', 'TASK_ON_TIME', 'ATTENDANCE'];
  return keys.map((k) => ({ key: k, target: KPI_CATALOG_BY_KEY[k].defaultTarget, weight: 1 }));
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
    return { org, emp };
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
  ): KpiResolved[] {
    return metrics.map((m) => {
      const cat = isKpiAutoKey(m.key) ? KPI_CATALOG_BY_KEY[m.key] : null;
      const actual = cat
        ? autoValue(cat.key, raw)
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
    const [{ org: orgRaw, emp: empRaw }, tree, sets] = await Promise.all([
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
            metrics: defaultMetrics(unit?.type ?? 'DEPT'),
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

    const orgs: KpiResult[] = tree.units
      .filter((u) => orgTypes.includes(u.type))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((u) => {
        const cfg = orgConfig(u.id);
        const metrics = this.resolve(cfg.metrics, orgRawSum(u.id), cfg.actuals);
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
              .filter((m) => isKpiAutoKey(m.key))
              .map((m) => shareForPerson(m, directCount.get(e.orgUnitId) ?? 1)),
          ),
          actuals: {},
          note: null,
        };
    const metrics = this.resolve(cfg.metrics, empRaw.get(e.id) ?? emptyRaw(), cfg.actuals);
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

  /** 한 조직·직원 — 상세 화면(직원이면 업무 분장도 함께) */
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
    const [{ org: orgRaw }, tree, own] = await Promise.all([
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
    const metricsCfg = own ? this.parseMetrics(own.metrics) : defaultMetrics(u.type);
    const metrics = this.resolve(metricsCfg, sum, own ? this.parseActuals(own.actuals) : {});
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
