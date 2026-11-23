// ── 위젯 스튜디오 ──
// 관리자가 위젯을 직접 만든다(자연어로 AI에게 맡기거나 손으로). 위젯은 '설계서(스펙)'라는 데이터일 뿐이고,
// 서버의 공통 실행기가 아래 데이터 카탈로그(측정값·차원)로만 SQL을 만든다 — 그래서 배포 없이 새 위젯이 생기고,
// 권한·지점 범위는 화면에서 볼 때와 똑같이 걸린다(지점 직원은 자기 지점 숫자만).
import { DASH_PERIODS, type DashData, type DashPeriod, type DashViz } from './dashboard';

/** 시간 단위 */
export const STUDIO_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type StudioGrain = (typeof STUDIO_GRAINS)[number];
export const STUDIO_GRAIN_LABEL: Record<StudioGrain, string> = {
  day: '일간',
  week: '주간',
  month: '월간',
  quarter: '분기',
  year: '연간',
};

/** 차원 종류 — cat: 항목(상태·경로…), time: 날짜, geo: 시도(지도로 그릴 수 있다), org: 지점 */
export type StudioDimKind = 'cat' | 'time' | 'geo' | 'org';
export interface StudioDimension {
  key: string;
  label: string;
  kind: StudioDimKind;
  description?: string;
}
export interface StudioMeasure {
  key: string;
  label: string;
  format: 'count' | 'won' | 'percent';
  description?: string;
}
export interface StudioDataset {
  key: string;
  label: string;
  description: string;
  /** 이 데이터를 보려면 필요한 권한 */
  perm: string;
  /** 기간 필터 기본 날짜 칸 */
  defaultTime: string;
  dimensions: StudioDimension[];
  measures: StudioMeasure[];
}

/**
 * 데이터 카탈로그 — 위젯이 쓸 수 있는 것은 여기 있는 것뿐이다(서버가 같은 key로 SQL 조각을 갖고 있다).
 * 새 측정값·차원을 쓰고 싶으면 여기와 서버 실행기에 한 줄씩 더한다.
 */
export const STUDIO_DATASETS: StudioDataset[] = [
  {
    key: 'lead',
    label: '접수',
    description: '고객 이사·리빙·케어 문의 접수 건',
    perm: 'LEAD.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '접수일', kind: 'time' },
      { key: 'moveDate', label: '서비스 요청일(이사일)', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'source', label: '접수경로', kind: 'cat' },
      { key: 'serviceLine', label: '상품 종류', kind: 'cat' },
      { key: 'fromSido', label: '출발지 시도', kind: 'geo' },
      { key: 'org', label: '담당 지점', kind: 'org' },
      { key: 'contracted', label: '계약 여부', kind: 'cat', description: '계약 / 미계약' },
    ],
    measures: [
      { key: 'count', label: '접수 건수', format: 'count' },
      { key: 'expectedAmount', label: '예상 금액 합계', format: 'won' },
      {
        key: 'conversion',
        label: '계약 전환율',
        format: 'percent',
        description: '계약 이후 단계까지 간 접수 ÷ 전체 접수',
      },
    ],
  },
  {
    key: 'contract',
    label: '계약',
    description: '서명된 계약(취소 제외는 상태로 거른다)',
    perm: 'CONTRACT.READ',
    defaultTime: 'signedAt',
    dimensions: [
      { key: 'signedAt', label: '서명일', kind: 'time' },
      { key: 'contractDate', label: '계약일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'serviceLine', label: '상품 종류', kind: 'cat' },
      { key: 'source', label: '접수경로', kind: 'cat' },
      { key: 'fromSido', label: '출발지 시도', kind: 'geo' },
      { key: 'org', label: '담당 지점', kind: 'org' },
    ],
    measures: [
      { key: 'revenue', label: '매출(계약 총액)', format: 'won' },
      { key: 'count', label: '계약 건수', format: 'count' },
      { key: 'avgAmount', label: '평균 계약 금액', format: 'won' },
      { key: 'deposit', label: '계약금 합계', format: 'won' },
    ],
  },
  {
    key: 'payment',
    label: '입금',
    description: '계약금·잔금 입금',
    perm: 'PAYMENT.READ',
    defaultTime: 'paidAt',
    dimensions: [
      { key: 'paidAt', label: '입금일', kind: 'time' },
      { key: 'kind', label: '구분(계약금·잔금)', kind: 'cat' },
      { key: 'method', label: '결제 수단', kind: 'cat' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'org', label: '담당 지점', kind: 'org' },
    ],
    measures: [
      { key: 'amount', label: '입금액', format: 'won' },
      { key: 'count', label: '입금 건수', format: 'count' },
    ],
  },
  {
    key: 'work',
    label: '작업',
    description: '이사 작업 지시',
    perm: 'WORK_ORDER.READ',
    defaultTime: 'scheduledDate',
    dimensions: [
      { key: 'scheduledDate', label: '작업일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'org', label: '담당 지점', kind: 'org' },
    ],
    measures: [{ key: 'count', label: '작업 건수', format: 'count' }],
  },
  {
    key: 'support',
    label: '고객지원(A/S·CS)',
    description: '고객 문의·A/S 접수',
    perm: 'SUPPORT.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '접수일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'kind', label: '종류(A/S·CS)', kind: 'cat' },
      { key: 'category', label: '접수 유형', kind: 'cat' },
      { key: 'priority', label: '우선순위', kind: 'cat' },
      { key: 'channel', label: '채널', kind: 'cat' },
      { key: 'org', label: '담당 지점', kind: 'org' },
    ],
    measures: [{ key: 'count', label: '접수 건수', format: 'count' }],
  },
  {
    key: 'customer',
    label: '고객',
    description: '고객 원장',
    perm: 'CUSTOMER.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '등록일', kind: 'time' },
      { key: 'grade', label: '등급', kind: 'cat' },
      { key: 'org', label: '담당 지점', kind: 'org' },
    ],
    measures: [{ key: 'count', label: '고객 수', format: 'count' }],
  },
];
export const STUDIO_DATASET_MAP = new Map(STUDIO_DATASETS.map((d) => [d.key, d]));

/** 위젯에서 쓸 수 있는 시각화(글 위젯·목록은 빼고) */
export const STUDIO_VIZ = [
  'card',
  'gauge',
  'bar',
  'hbar',
  'line',
  'area',
  'pie',
  'donut',
  'funnel',
  'table',
  'map',
  'heatmap',
] as const satisfies readonly DashViz[];
export type StudioViz = (typeof STUDIO_VIZ)[number];

/** 위젯 안 조작 요소 — 보는 사람이 눌러 바꾼다(세그먼트 탭·드롭다운·필터) */
export type StudioControl =
  | {
      kind: 'segment' | 'dropdown';
      /** 무엇을 바꾸나 — 시간 단위·묶을 기준·숫자·기간·차트 모양 */
      target: 'grain' | 'dimension' | 'measure' | 'period' | 'viz';
      label?: string;
      options: string[];
    }
  | {
      kind: 'filter';
      /** 거를 차원(항목 여러 개 고르기) */
      dim: string;
      label?: string;
    };

export interface StudioFilter {
  dim: string;
  values: string[];
}

/** 위젯 설계서 */
export interface StudioSpec {
  version: 1;
  title: string;
  subtitle?: string;
  dataset: string;
  measure: string;
  /** 묶을 기준(없으면 숫자 하나) */
  dimension?: string | null;
  /** 시간 차원일 때 단위 */
  grain?: StudioGrain;
  /** 두 번째 기준(히트맵의 행 · 표의 나눔) */
  split?: string | null;
  viz: StudioViz;
  period: DashPeriod;
  /** 기간을 걸 날짜 칸(없으면 데이터 기본) */
  periodField?: string;
  /** 늘 거는 조건 */
  filters?: StudioFilter[];
  /** 항목 수 제한(많은 것부터) */
  limit?: number;
  controls?: StudioControl[];
}

/** 보는 사람이 조작한 값 — 설계서의 기본값을 덮는다 */
export interface StudioParams {
  grain?: StudioGrain;
  dimension?: string | null;
  measure?: string;
  period?: DashPeriod;
  viz?: StudioViz;
  /** 필터 조작 — 차원 → 고른 값 */
  filters?: Record<string, string[]>;
}

/** 대시보드 배치에서 만든 위젯을 가리키는 widget 값 — 'cw:' + 위젯 id */
export const CUSTOM_WIDGET_PREFIX = 'cw:';
export const isCustomWidgetKey = (k: string) => k.startsWith(CUSTOM_WIDGET_PREFIX);

/** 설계서 검사 — 카탈로그에 없는 데이터·칸·모양은 고쳐서 쓸 수 있는 값만 남긴다(AI 답·저장 값 공통) */
export function normalizeStudioSpec(raw: unknown): { spec: StudioSpec; errors: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const ds = STUDIO_DATASET_MAP.get(String(r.dataset)) ?? STUDIO_DATASETS[0];
  if (!STUDIO_DATASET_MAP.has(String(r.dataset))) errors.push(`없는 데이터: ${String(r.dataset)}`);
  const dimKeys = new Set(ds.dimensions.map((d) => d.key));
  const mKeys = new Set(ds.measures.map((m) => m.key));
  const dimOk = (v: unknown) => (typeof v === 'string' && dimKeys.has(v) ? v : null);
  const measure = mKeys.has(String(r.measure)) ? String(r.measure) : ds.measures[0].key;
  if (!mKeys.has(String(r.measure))) errors.push(`없는 측정값: ${String(r.measure)}`);
  const viz = (STUDIO_VIZ as readonly string[]).includes(String(r.viz))
    ? (r.viz as StudioViz)
    : 'bar';
  const grain = (STUDIO_GRAINS as readonly string[]).includes(String(r.grain))
    ? (r.grain as StudioGrain)
    : 'month';
  const period = (DASH_PERIODS as readonly string[]).includes(String(r.period))
    ? (r.period as DashPeriod)
    : '90d';
  const timeDims = new Set(ds.dimensions.filter((d) => d.kind === 'time').map((d) => d.key));
  const filters = (Array.isArray(r.filters) ? r.filters : [])
    .map((f) => f as StudioFilter)
    .filter((f) => dimOk(f?.dim) && Array.isArray(f.values))
    .map((f) => ({ dim: f.dim, values: f.values.map(String).slice(0, 50) }))
    .slice(0, 6);
  const controls: StudioControl[] = [];
  for (const c of Array.isArray(r.controls) ? r.controls : []) {
    const x = c as Record<string, unknown>;
    if (x.kind === 'filter') {
      const dim = dimOk(x.dim);
      if (dim && !timeDims.has(dim))
        controls.push({ kind: 'filter', dim, ...(x.label ? { label: String(x.label) } : {}) });
      continue;
    }
    if (x.kind !== 'segment' && x.kind !== 'dropdown') continue;
    const target = String(x.target);
    const valid =
      target === 'grain'
        ? (v: string) => (STUDIO_GRAINS as readonly string[]).includes(v)
        : target === 'dimension'
          ? (v: string) => dimKeys.has(v)
          : target === 'measure'
            ? (v: string) => mKeys.has(v)
            : target === 'period'
              ? (v: string) => (DASH_PERIODS as readonly string[]).includes(v)
              : target === 'viz'
                ? (v: string) => (STUDIO_VIZ as readonly string[]).includes(v)
                : null;
    if (!valid) continue;
    const options = [
      ...new Set((Array.isArray(x.options) ? x.options : []).map(String).filter(valid)),
    ];
    if (options.length < 2) continue;
    controls.push({
      kind: x.kind,
      target: target as 'grain',
      options: options.slice(0, 8),
      ...(x.label ? { label: String(x.label).slice(0, 20) } : {}),
    });
  }
  const limit = Number(r.limit);
  const spec: StudioSpec = {
    version: 1,
    title: String(r.title ?? '').slice(0, 60) || '새 위젯',
    ...(r.subtitle ? { subtitle: String(r.subtitle).slice(0, 120) } : {}),
    dataset: ds.key,
    measure,
    dimension: dimOk(r.dimension),
    grain,
    split: dimOk(r.split),
    viz,
    period,
    ...(timeDims.has(String(r.periodField)) ? { periodField: String(r.periodField) } : {}),
    ...(filters.length ? { filters } : {}),
    ...(limit > 0 ? { limit: Math.min(50, Math.round(limit)) } : {}),
    ...(controls.length ? { controls: controls.slice(0, 4) } : {}),
  };
  return { spec, errors };
}

/** 만든 위젯 한 개(목록·대시보드 편집 화면에서 쓴다) */
export interface CustomWidgetRow {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  spec: StudioSpec;
  prompt: string | null;
  createdByName: string | null;
  updatedAt: string;
}

/** AI 추천안 하나 */
export interface StudioProposal {
  name: string;
  why: string;
  spec: StudioSpec;
}

/** 위젯 데이터(서버 실행 결과) */
export interface StudioResult {
  data: DashData;
  /** 필터 조작 요소의 고를 값(차원 → 값·이름) */
  options: Record<string, { value: string; label: string }[]>;
  /** 여러 지점을 볼 수 있나 — 아니면 '지점별' 같은 선택지는 숨긴다 */
  multiOrg: boolean;
  /** 실제로 쓴 값(조작 반영 후) */
  applied: { measure: string; dimension: string | null; grain: StudioGrain; period: DashPeriod };
}
