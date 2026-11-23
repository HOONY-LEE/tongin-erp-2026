import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  PERMISSION_WILDCARD,
  SERVICE_LINE_LABEL,
  STUDIO_DATASET_MAP,
  normalizeStudioSpec,
  type AuthPrincipal,
  type DashData,
  type DashPeriod,
  type StudioGrain,
  type StudioParams,
  type StudioResult,
  type StudioSpec,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';

/**
 * 위젯 스튜디오 공통 실행기 — 설계서(StudioSpec)를 SQL 하나로 바꿔 대시보드 데이터 모양(DashData)으로 돌려준다.
 * SQL 조각은 아래 표에 있는 것만 쓴다(설계서의 글자는 표의 key를 고르는 데만 쓰이고 SQL에 들어가지 않는다).
 * 값(기간·필터 값·지점 범위)은 모두 바인딩 변수. 지점 범위는 화면 조회와 같은 ScopeService.
 */

type Expr = string;
interface DimSql {
  expr: Expr;
  /** time: 날짜 칸(timestamptz는 한국 시간으로 바꾼 식), 그 외: 값 */
  time?: boolean;
  labels?: Record<string, string> | 'org' | 'code:AS_CATEGORY' | 'code:CUSTOMER_GRADE';
}
interface DatasetSql {
  from: Expr;
  org: Expr;
  /** 상태를 따로 고르지 않았을 때 거는 기본 조건(예: 계약은 서명된 것만) */
  base?: Expr;
  dims: Record<string, DimSql>;
  measures: Record<string, Expr>;
  /** 건별 숫자 칸(분포용) — 값이 없는 건(NULL)은 빼고 센다 */
  fields?: Record<string, Expr>;
}

const KST = (col: string) => `(${col} AT TIME ZONE 'Asia/Seoul')`;
const CONTRACTED = `('CONTRACTED','WORK_TOSS','IN_PROGRESS','DONE')`;

const CONTRACT_STATUS: Record<string, string> = {
  DRAFT: '작성중',
  SIGNED: '서명완료',
  CANCELED: '취소',
};
const WORK_STATUS: Record<string, string> = {
  ASSIGNED: '배정',
  IN_PROGRESS: '작업중',
  DONE: '완료',
  CANCELED: '취소',
};
const SUPPORT_STATUS: Record<string, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '처리 중',
  RESOLVED: '해결',
  CLOSED: '종료',
  CANCELED: '취소',
};
const PAYMENT_KIND: Record<string, string> = { DEPOSIT: '계약금', BALANCE: '잔금' };
const PAYMENT_STATUS: Record<string, string> = {
  PENDING: '대기',
  PAID: '입금완료',
  CANCELED: '취소',
};
const PRIORITY: Record<string, string> = { HIGH: '높음', NORMAL: '보통', LOW: '낮음' };
const CHANNEL: Record<string, string> = {
  PHONE: '전화',
  EMAIL: '이메일',
  KAKAO: '카카오톡',
  VISIT: '방문',
};
const KIND: Record<string, string> = { AS: 'A/S', CS: 'CS' };

const SQL: Record<string, DatasetSql> = {
  lead: {
    from: 'lead t',
    org: 't.org_unit_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      moveDate: { expr: 't.move_date', time: true },
      status: { expr: 't.status', labels: LEAD_STATUS_LABEL },
      source: { expr: 't.source', labels: LEAD_SOURCE_LABEL },
      serviceLine: { expr: 't.service_line', labels: SERVICE_LINE_LABEL },
      fromSido: { expr: 't.from_sido' },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
      contracted: {
        expr: `CASE WHEN t.status IN ${CONTRACTED} THEN 'Y' ELSE 'N' END`,
        labels: { Y: '계약', N: '미계약' },
      },
    },
    measures: {
      count: 'COUNT(*)::float8',
      expectedAmount: 'COALESCE(SUM(t.expected_amount), 0)::float8',
      conversion: `COALESCE(AVG(CASE WHEN t.status IN ${CONTRACTED} THEN 1 ELSE 0 END), 0)::float8`,
    },
    fields: {
      expectedAmount: 't.expected_amount::float8',
      leadDays: `(t.move_date - ${KST('t.created_at')}::date)::float8`,
    },
  },
  contract: {
    from: 'contract t LEFT JOIN lead l ON l.id = t.lead_id',
    org: 't.org_unit_id',
    base: "t.status = 'SIGNED'",
    dims: {
      signedAt: { expr: KST('t.signed_at'), time: true },
      contractDate: { expr: 't.contract_date', time: true },
      status: { expr: 't.status', labels: CONTRACT_STATUS },
      serviceLine: { expr: 'l.service_line', labels: SERVICE_LINE_LABEL },
      source: { expr: 'l.source', labels: LEAD_SOURCE_LABEL },
      fromSido: { expr: 'l.from_sido' },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: {
      revenue: 'COALESCE(SUM(t.total_amount), 0)::float8',
      count: 'COUNT(*)::float8',
      avgAmount: 'COALESCE(AVG(t.total_amount), 0)::float8',
      deposit: 'COALESCE(SUM(t.deposit_amount), 0)::float8',
    },
    fields: {
      totalAmount: 't.total_amount::float8',
      depositAmount: 't.deposit_amount::float8',
      signDays: `(${KST('t.signed_at')}::date - ${KST('l.created_at')}::date)::float8`,
    },
  },
  payment: {
    from: 'payment t JOIN contract c ON c.id = t.contract_id',
    org: 'c.org_unit_id',
    base: "t.status = 'PAID'",
    dims: {
      paidAt: { expr: KST('t.paid_at'), time: true },
      kind: { expr: 't.kind', labels: PAYMENT_KIND },
      method: { expr: 't.method' },
      status: { expr: 't.status', labels: PAYMENT_STATUS },
      org: { expr: 'c.org_unit_id::text', labels: 'org' },
    },
    measures: {
      amount: 'COALESCE(SUM(t.amount), 0)::float8',
      count: 'COUNT(*)::float8',
    },
    fields: { amount: 't.amount::float8' },
  },
  work: {
    from: 'work_order t',
    org: 't.org_unit_id',
    base: "t.status <> 'CANCELED'",
    dims: {
      scheduledDate: { expr: 't.scheduled_date', time: true },
      status: { expr: 't.status', labels: WORK_STATUS },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: { count: 'COUNT(*)::float8' },
  },
  support: {
    from: 'support_ticket t',
    org: 't.org_unit_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      status: { expr: 't.status', labels: SUPPORT_STATUS },
      kind: { expr: 't.kind', labels: KIND },
      category: { expr: 't.category', labels: 'code:AS_CATEGORY' },
      priority: { expr: 't.priority', labels: PRIORITY },
      channel: { expr: 't.channel', labels: CHANNEL },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: { count: 'COUNT(*)::float8' },
  },
  customer: {
    from: 'customer t',
    org: 't.owner_org_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      grade: { expr: 't.grade', labels: 'code:CUSTOMER_GRADE' },
      org: { expr: 't.owner_org_id::text', labels: 'org' },
    },
    measures: { count: 'COUNT(*)::float8' },
  },
};

const DAY = 86_400_000;
const PERIOD_DAYS: Record<Exclude<DashPeriod, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
};
const p2 = (n: number) => String(n).padStart(2, '0');
/** 한국 날짜 'YYYY-MM-DD' (offset일 전) */
const kstDay = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3600_000 - offsetDays * DAY).toISOString().slice(0, 10);

/** 시간 칸 → 단위의 첫날('YYYY-MM-DD') */
const bucketExpr = (expr: string, g: StudioGrain) =>
  `to_char(date_trunc('${g}', (${expr})::timestamp), 'YYYY-MM-DD')`;

/** 단위 첫날 → 보이는 이름 */
function bucketLabel(key: string, g: StudioGrain): string {
  const [y, m, d] = key.split('-').map(Number);
  if (g === 'year') return `${y}`;
  if (g === 'quarter') return `${String(y).slice(2)}년 ${Math.floor((m - 1) / 3) + 1}분기`;
  if (g === 'month') return `${String(y).slice(2)}.${m}`;
  return `${m}/${d}`;
}

/** 기간 안의 단위 첫날들(빈 칸도 0으로 채우려고) */
function buckets(from: string, to: string, g: StudioGrain): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  // 시작을 단위 첫날로
  if (g === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (g === 'month' || g === 'quarter' || g === 'year') d.setUTCDate(1);
  if (g === 'quarter') d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3);
  if (g === 'year') d.setUTCMonth(0);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(`${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`);
    if (g === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (g === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else if (g === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (g === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return out;
}

@Injectable()
export class StudioQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** 이 사람이 이 설계서의 데이터를 볼 수 있나 */
  canSee(spec: StudioSpec, p: AuthPrincipal): boolean {
    const ds = STUDIO_DATASET_MAP.get(spec.dataset);
    return !!ds && (p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes(ds.perm));
  }

  async run(rawSpec: unknown, params: StudioParams, p: AuthPrincipal): Promise<StudioResult> {
    const { spec } = normalizeStudioSpec(rawSpec);
    if (!this.canSee(spec, p)) throw new ForbiddenException('이 데이터를 볼 권한이 없습니다.');
    const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
    const q = SQL[spec.dataset];
    const ids = await this.scope.orgScopeIds(p);
    const multiOrg = ids === null || ids.length > 1;

    // 조작 값 반영(카탈로그에 있는 것만)
    const has = (k?: string | null) => !!k && !!q.dims[k];
    const measure = params.measure && q.measures[params.measure] ? params.measure : spec.measure;
    let dimension =
      params.dimension !== undefined
        ? has(params.dimension)
          ? params.dimension!
          : null
        : (spec.dimension ?? null);
    // 한 지점만 보는 사람에게 '지점별'은 의미가 없다 — 그 칸이면 기준 없이(또는 다음 기준으로)
    if (dimension === 'org' && !multiOrg) dimension = null;
    const grain = params.grain ?? spec.grain ?? 'month';
    const period = params.period ?? spec.period;
    const split = has(spec.split) && spec.split !== dimension ? spec.split! : null;
    const timeField = has(spec.periodField) ? spec.periodField! : ds.defaultTime;

    const filters = new Map<string, string[]>();
    for (const f of spec.filters ?? []) if (has(f.dim)) filters.set(f.dim, f.values);
    for (const [k, v] of Object.entries(params.filters ?? {}))
      if (has(k) && Array.isArray(v) && v.length) filters.set(k, v.map(String).slice(0, 50));

    const values: unknown[] = [];
    const bind = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    };
    const where = (from?: string, to?: string) => {
      const w: string[] = [];
      if (ids !== null) w.push(`${q.org} = ANY(${bind(ids)}::uuid[])`);
      const usesStatus =
        dimension === 'status' ||
        split === 'status' ||
        filters.has('status') ||
        (spec.controls ?? []).some((c) => c.kind === 'filter' && c.dim === 'status');
      if (q.base && !usesStatus) w.push(q.base);
      const tf = q.dims[timeField];
      if (from) w.push(`(${tf.expr})::date >= ${bind(from)}::date`);
      if (to) w.push(`(${tf.expr})::date <= ${bind(to)}::date`);
      for (const [k, v] of filters) w.push(`(${q.dims[k].expr}) = ANY(${bind(v)}::text[])`);
      return w.length ? `WHERE ${w.join(' AND ')}` : '';
    };
    const range = (back = 0): { from?: string; to?: string } => {
      if (period === 'all') return {};
      const n = PERIOD_DAYS[period];
      return { from: kstDay(n * (back + 1) - 1), to: kstDay(n * back) };
    };
    const keyExpr = (k: string) => {
      const d = q.dims[k];
      return d.time ? bucketExpr(d.expr, grain) : `COALESCE((${d.expr})::text, '')`;
    };
    const m = q.measures[measure];
    const fmt = ds.measures.find((x) => x.key === measure)?.format ?? 'count';

    const options = await this.filterOptions(spec, q, ids);
    const applied = { measure, dimension, grain, period };
    const viz = params.viz ?? spec.viz;

    // ── 분포: 히스토그램(건별 숫자를 구간으로) · 박스플롯(기준별 사분위) ──
    const fieldKey = params.field && q.fields?.[params.field] ? params.field : (spec.field ?? '');
    const fieldSql = q.fields?.[fieldKey];
    const fieldDef = ds.fields.find((f) => f.key === fieldKey);
    if ((viz === 'histogram' || viz === 'box') && fieldSql && fieldDef) {
      const cur = range();
      values.length = 0;
      const w = where(cur.from, cur.to);
      const notNull = `${w ? `${w} AND` : 'WHERE'} (${fieldSql}) IS NOT NULL`;
      const fFmt = fieldDef.format;
      if (viz === 'histogram') {
        const [mm] = await this.prisma.$queryRawUnsafe<{ lo: number | null; hi: number | null }[]>(
          `SELECT MIN(${fieldSql}) AS lo, MAX(${fieldSql}) AS hi FROM ${q.from} ${notNull}`,
          ...values,
        );
        const lo = Number(mm?.lo ?? 0);
        const hi = Number(mm?.hi ?? 0);
        if (mm?.lo == null)
          return {
            data: { shape: 'category', format: 'count', items: [] },
            options,
            multiOrg,
            applied,
          };
        // 보기 좋은 구간 폭(1·2·5 단위)으로 12개 안팎
        const raw = Math.max((hi - lo) / 12, fFmt === 'won' ? 10000 : 1);
        const mag = 10 ** Math.floor(Math.log10(raw));
        const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) ?? 10 * mag;
        const start = Math.floor(lo / step) * step;
        const rows = await this.prisma.$queryRawUnsafe<{ b: number; n: number }[]>(
          `SELECT FLOOR(((${fieldSql}) - ${bind(start)}::float8) / ${bind(step)}::float8)::int AS b, COUNT(*)::int AS n FROM ${q.from} ${notNull} GROUP BY 1 ORDER BY 1`,
          ...values,
        );
        const byBin = new Map(rows.map((r) => [Number(r.b), Number(r.n)]));
        const last = Math.max(0, ...rows.map((r) => Number(r.b)));
        const lab = (v: number) =>
          fFmt === 'won'
            ? v >= 1e8
              ? `${+(v / 1e8).toFixed(1)}억`
              : v >= 1e4
                ? `${Math.round(v / 1e4).toLocaleString()}만`
                : v.toLocaleString()
            : `${v.toLocaleString()}${fieldDef.unit ?? ''}`;
        return {
          data: {
            shape: 'category',
            format: 'count',
            items: Array.from({ length: last + 1 }, (_, i) => ({
              key: String(i),
              label: lab(start + i * step),
              value: byBin.get(i) ?? 0,
            })),
          },
          options,
          multiOrg,
          applied,
        };
      }
      // 박스플롯 — 기준이 있으면 기준별(건수 많은 12개), 없으면 하나
      const k1 = dimension ? keyExpr(dimension) : `''`;
      const rows = await this.prisma.$queryRawUnsafe<{ k1: string; p: number[]; n: number }[]>(
        `SELECT ${k1} AS k1, percentile_cont(ARRAY[0, 0.25, 0.5, 0.75, 1]) WITHIN GROUP (ORDER BY ${fieldSql}) AS p, COUNT(*)::int AS n FROM ${q.from} ${notNull} GROUP BY 1 ORDER BY 3 DESC LIMIT 12`,
        ...values,
      );
      const label = dimension
        ? await this.labeler(
            q,
            [dimension],
            rows.map((r) => ({ k1: r.k1, k2: '' })),
          )
        : null;
      const items = rows.map((r) => {
        const [min, q1, median, q3, max] = (r.p ?? []).map(Number);
        const isTime = dimension ? !!q.dims[dimension].time : false;
        return {
          key: r.k1 || 'ALL',
          label: !dimension
            ? fieldDef.label
            : isTime
              ? bucketLabel(r.k1, grain)
              : (label!(dimension, r.k1) ?? (r.k1 || '미지정')),
          min,
          q1,
          median,
          q3,
          max,
          n: Number(r.n),
        };
      });
      if (dimension && q.dims[dimension].time) items.sort((a, b) => a.key.localeCompare(b.key));
      return { data: { shape: 'box', format: fFmt, items }, options, multiOrg, applied };
    }

    // ── 관계: 산점도(기준별로 두 숫자) ──
    const m2key = spec.measure2 && q.measures[spec.measure2] ? spec.measure2 : null;
    if (viz === 'scatter' && m2key && dimension) {
      const cur = range();
      values.length = 0;
      const k1 = keyExpr(dimension);
      const rows = await this.prisma.$queryRawUnsafe<{ k1: string; x: number; y: number }[]>(
        `SELECT ${k1} AS k1, ${q.measures[measure]} AS x, ${q.measures[m2key]} AS y FROM ${q.from} ${where(cur.from, cur.to)} GROUP BY 1`,
        ...values,
      );
      const label = await this.labeler(
        q,
        [dimension],
        rows.map((r) => ({ k1: r.k1, k2: '' })),
      );
      const isTime = !!q.dims[dimension].time;
      const mDef = (k: string) => ds.measures.find((x) => x.key === k)!;
      return {
        data: {
          shape: 'scatter',
          xLabel: mDef(measure).label,
          yLabel: mDef(m2key).label,
          xFormat: mDef(measure).format,
          yFormat: mDef(m2key).format,
          points: rows.map((r) => ({
            key: r.k1 || 'NONE',
            label: isTime
              ? bucketLabel(r.k1, grain)
              : (label(dimension, r.k1) ?? (r.k1 || '미지정')),
            x: Number(r.x),
            y: Number(r.y),
          })),
        },
        options,
        multiOrg,
        applied,
      };
    }

    // ── 숫자 하나 ──
    if (!dimension) {
      const cur = range();
      values.length = 0;
      const sqlCur = `SELECT ${m} AS v FROM ${q.from} ${where(cur.from, cur.to)}`;
      const curVals = [...values];
      const [{ v }] = await this.prisma.$queryRawUnsafe<{ v: number }[]>(sqlCur, ...curVals);
      let previous: number | null = null;
      if (period !== 'all') {
        values.length = 0;
        const prev = range(1);
        const sqlPrev = `SELECT ${m} AS v FROM ${q.from} ${where(prev.from, prev.to)}`;
        const [r] = await this.prisma.$queryRawUnsafe<{ v: number }[]>(sqlPrev, ...values);
        previous = Number(r?.v ?? 0);
      }
      const value = Number(v ?? 0);
      return {
        data: {
          shape: 'value',
          format: fmt,
          value,
          previous,
          ...(fmt === 'percent' ? { max: 1 } : { max: Math.max(value, previous ?? 0) * 1.25 || 1 }),
        },
        options,
        multiOrg,
        applied,
      };
    }

    const cur = range();
    values.length = 0;
    const k1 = keyExpr(dimension);
    const k2 = split ? keyExpr(split) : `''`;
    const sql = `SELECT ${k1} AS k1, ${k2} AS k2, ${m} AS v FROM ${q.from} ${where(cur.from, cur.to)} GROUP BY 1, 2`;
    const rows = await this.prisma.$queryRawUnsafe<{ k1: string; k2: string; v: number }[]>(
      sql,
      ...values,
    );
    const label = await this.labeler(q, [dimension, ...(split ? [split] : [])], rows);
    const isTime = !!q.dims[dimension].time;
    const name = (dim: string, k: string) =>
      q.dims[dim].time ? bucketLabel(k, grain) : k ? (label(dim, k) ?? k) : '미지정';

    // 1차 기준 값 순서 — 시간은 기간 전체(빈 칸 0), 항목은 많은 것부터
    const total = new Map<string, number>();
    for (const r of rows) total.set(r.k1, (total.get(r.k1) ?? 0) + Number(r.v));
    let keys1: string[];
    if (isTime) {
      const from = cur.from ?? [...total.keys()].sort()[0] ?? kstDay();
      keys1 = [...new Set([...buckets(from, cur.to ?? kstDay(), grain), ...total.keys()])].sort();
    } else {
      keys1 = [...total.keys()].sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0));
      if (spec.limit) keys1 = keys1.slice(0, spec.limit);
      else keys1 = keys1.slice(0, 30);
    }

    if (!split) {
      const data: DashData = isTime
        ? {
            shape: 'series',
            format: fmt,
            unit: grain === 'day' ? 'day' : grain === 'week' ? 'week' : 'month',
            points: keys1.map((k) => ({
              x: k,
              label: bucketLabel(k, grain),
              value: total.get(k) ?? 0,
            })),
          }
        : {
            shape: 'category',
            format: fmt,
            items: keys1.map((k) => ({
              key: k || 'NONE',
              label: name(dimension, k),
              value: total.get(k) ?? 0,
            })),
          };
      return { data, options, multiOrg, applied };
    }

    // 두 기준 — 행(나눔) × 열(1차 기준)
    const t2 = new Map<string, number>();
    for (const r of rows) t2.set(r.k2, (t2.get(r.k2) ?? 0) + Number(r.v));
    const keys2 = [...t2.keys()].sort((a, b) => (t2.get(b) ?? 0) - (t2.get(a) ?? 0)).slice(0, 12);
    const cell = new Map(rows.map((r) => [`${r.k2}\u0000${r.k1}`, Number(r.v)]));
    return {
      data: {
        shape: 'matrix',
        format: fmt,
        rows: keys2.map((k) => name(split, k)),
        cols: keys1.map((k) => name(dimension, k)),
        cells: keys2.map((r) => keys1.map((c) => cell.get(`${r}\u0000${c}`) ?? 0)),
      },
      options,
      multiOrg,
      applied,
    };
  }

  /** 키 → 이름(코드표·지점 이름·공통코드) */
  private async labeler(q: DatasetSql, dims: string[], rows: { k1: string; k2: string }[]) {
    const maps = new Map<string, Record<string, string>>();
    for (const [i, dim] of dims.entries()) {
      const l = q.dims[dim].labels;
      if (!l) continue;
      if (typeof l === 'object') maps.set(dim, l);
      else {
        const keys = [...new Set(rows.map((r) => (i === 0 ? r.k1 : r.k2)).filter(Boolean))];
        maps.set(dim, await this.lookup(l, keys));
      }
    }
    return (dim: string, k: string) => maps.get(dim)?.[k];
  }

  private async lookup(kind: string, keys: string[]): Promise<Record<string, string>> {
    if (kind === 'org') {
      const ids = keys.filter((k) => /^[0-9a-f-]{36}$/i.test(k));
      if (!ids.length) return {};
      const rows = await this.prisma.orgUnit.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return Object.fromEntries(rows.map((r) => [r.id, r.name]));
    }
    const group = kind.slice('code:'.length);
    const rows = await this.prisma.commonCode.findMany({
      where: { codeGroup: group },
      select: { code: true, name: true },
    });
    return Object.fromEntries(rows.map((r) => [r.code, r.name]));
  }

  /** 필터 조작 요소가 고를 값 — 내 범위 안에서 실제로 있는 값 */
  private async filterOptions(spec: StudioSpec, q: DatasetSql, ids: string[] | null) {
    const out: StudioResult['options'] = {};
    for (const c of spec.controls ?? []) {
      if (c.kind !== 'filter' || !q.dims[c.dim] || q.dims[c.dim].time) continue;
      const d = q.dims[c.dim];
      const args: unknown[] = [];
      const w = ids === null ? '' : `WHERE ${q.org} = ANY($1::uuid[])`;
      if (ids !== null) args.push(ids);
      const rows = await this.prisma.$queryRawUnsafe<{ k: string | null }[]>(
        `SELECT DISTINCT (${d.expr})::text AS k FROM ${q.from} ${w} LIMIT 60`,
        ...args,
      );
      const keys = rows.map((r) => r.k).filter((k): k is string => !!k);
      const lab =
        typeof d.labels === 'object' ? d.labels : d.labels ? await this.lookup(d.labels, keys) : {};
      out[c.dim] = keys
        .map((k) => ({ value: k, label: lab[k] ?? k }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    }
    return out;
  }
}
