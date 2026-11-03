// ── 업무 분장(역할·업무 범위) · 성과 평가(조직·개인 KPI) ──
// 업무 분장: 조직마다 맡은 일(업무 항목)과 주·부 담당자를 정해 둔다. 팀 업무(칸반)는 그 항목에 이어 붙여 '지금 하는 일'을 센다.
// 성과 평가: 조직·개인마다 지표 3~8개를 골라 목표를 정하고, 기간(분기) 실적으로 달성률·종합 점수·등급을 낸다.
//   자동 지표는 ERP 기록(계약·입금·작업·팀 업무·근태)에서 계산, 직접 지표는 인사팀이 실적을 넣는다.

/** 업무 주기 */
export const DUTY_CYCLES = ['ALWAYS', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ADHOC'] as const;
export type DutyCycle = (typeof DUTY_CYCLES)[number];
export const DUTY_CYCLE_LABEL: Record<DutyCycle, string> = {
  ALWAYS: '상시',
  DAILY: '매일',
  WEEKLY: '매주',
  MONTHLY: '매월',
  QUARTERLY: '분기',
  ADHOC: '수시',
};

/** 업무 분장 한 줄(화면용) */
export interface DutyView {
  id: string;
  orgUnitId: string;
  orgUnitName: string;
  title: string;
  description: string | null;
  ownerEmpId: string | null;
  ownerName: string | null;
  backupEmpId: string | null;
  backupName: string | null;
  cycle: DutyCycle;
  tool: string | null;
  linkUrl: string | null;
  sortOrder: number;
  /** 이 항목에 이어진 팀 업무 중 아직 안 끝난 것(할 일·진행 중·보류) */
  openTasks: number;
  /** 이 항목에 이어진 팀 업무 중 진행 중 */
  inProgress: number;
}

// ── 성과 지표 ──

export const KPI_SCOPES = ['ORG', 'EMPLOYEE'] as const;
export type KpiScope = (typeof KPI_SCOPES)[number];

/** 자동 지표 — ERP 기록에서 기간 실적을 계산한다 */
export const KPI_AUTO_KEYS = [
  'CONTRACT_REVENUE',
  'CONTRACT_COUNT',
  'PAID_REVENUE',
  'DONE_COUNT',
  'TASK_COMPLETION',
  'TASK_ON_TIME',
  'ATTENDANCE',
] as const;
export type KpiAutoKey = (typeof KPI_AUTO_KEYS)[number];

export interface KpiCatalogItem {
  key: KpiAutoKey;
  label: string;
  /** 차트 축 이름(짧게) */
  short: string;
  unit: string;
  /** 어디서 세는지 */
  source: string;
  /** 처음 고를 때 넣어 줄 목표(분기) */
  defaultTarget: number;
}

export const KPI_CATALOG: KpiCatalogItem[] = [
  {
    key: 'CONTRACT_REVENUE',
    label: '계약 매출',
    short: '매출',
    unit: '원',
    source: '서명된 계약 금액 — 조직은 계약 지점(하위 포함), 개인은 견적 담당',
    defaultTarget: 30_000_000,
  },
  {
    key: 'CONTRACT_COUNT',
    label: '계약 건수',
    short: '계약',
    unit: '건',
    source: '서명된 계약 수 — 조직은 계약 지점, 개인은 견적 담당',
    defaultTarget: 15,
  },
  {
    key: 'PAID_REVENUE',
    label: '입금액',
    short: '입금',
    unit: '원',
    source: '입금 확인된 금액 — 계약의 지점·견적 담당 기준',
    defaultTarget: 30_000_000,
  },
  {
    key: 'DONE_COUNT',
    label: '작업 완료',
    short: '작업',
    unit: '건',
    source: '완료된 작업 — 조직은 작업 지점, 개인은 배정된 작업',
    defaultTarget: 15,
  },
  {
    key: 'TASK_COMPLETION',
    label: '업무 완료율',
    short: '완료율',
    unit: '%',
    source: '팀 업무 중 기간 안에 기한이 있는(기한 없으면 기간 안에 만든) 일의 완료 비율',
    defaultTarget: 90,
  },
  {
    key: 'TASK_ON_TIME',
    label: '기한 준수율',
    short: '기한',
    unit: '%',
    source: '기한이 있는 완료 업무 중 기한 안에 끝낸 비율',
    defaultTarget: 90,
  },
  {
    key: 'ATTENDANCE',
    label: '정시 출근율',
    short: '근태',
    unit: '%',
    source: '출근 기록이 있는 날 중 지각하지 않은 날의 비율(근무시간 설정 기준)',
    defaultTarget: 95,
  },
];
export const KPI_CATALOG_BY_KEY: Record<string, KpiCatalogItem> = Object.fromEntries(
  KPI_CATALOG.map((m) => [m.key, m]),
);
export const isKpiAutoKey = (k: string): k is KpiAutoKey =>
  (KPI_AUTO_KEYS as readonly string[]).includes(k);

export const KPI_MIN_METRICS = 3;
export const KPI_MAX_METRICS = 8;

/** 저장되는 지표 한 줄 — 직접 지표는 key가 'custom:…'이고 이름·단위를 함께 둔다 */
export interface KpiMetricConfig {
  key: string;
  label?: string;
  unit?: string;
  target: number;
  /** 종합 점수 가중치(1~10) */
  weight: number;
}

/** 계산된 지표 한 줄 */
export interface KpiResolved {
  key: string;
  label: string;
  short: string;
  unit: string;
  auto: boolean;
  source: string;
  target: number;
  weight: number;
  /** 실적 — 계산할 자료가 없거나(자동) 아직 넣지 않았으면(직접) null */
  actual: number | null;
  /** 목표 대비 달성률 %(상한 없음). 실적이 없으면 null */
  achievement: number | null;
}

export interface KpiResult {
  scope: KpiScope;
  id: string;
  name: string;
  /** 조직: 조직 종류 · 개인: 직책 */
  sub: string | null;
  /** 개인: 소속 조직 */
  orgUnitId: string | null;
  orgUnitName: string | null;
  memberCount?: number;
  /** 'OWN'(직접 정함) | 'ORG'(소속 조직 것을 따름) | 'DEFAULT'(기본 구성) */
  source: 'OWN' | 'ORG' | 'DEFAULT';
  metrics: KpiResolved[];
  /** 종합 점수 0~100 — 지표별 달성률(100 상한)의 가중 평균, 실적 없는 지표는 뺀다 */
  score: number | null;
  grade: KpiGrade | null;
  note: string | null;
}

export const KPI_GRADES = ['S', 'A', 'B', 'C', 'D'] as const;
export type KpiGrade = (typeof KPI_GRADES)[number];
export function kpiGrade(score: number): KpiGrade {
  if (score >= 95) return 'S';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

/** 지표들로 종합 점수 — 달성률은 100에서 자른다(한 지표가 넘쳐도 다른 지표 부족을 덮지 않게) */
export function kpiScore(metrics: Pick<KpiResolved, 'achievement' | 'weight'>[]): number | null {
  const used = metrics.filter((m) => m.achievement !== null && m.weight > 0);
  const w = used.reduce((s, m) => s + m.weight, 0);
  if (!w) return null;
  return Math.round(used.reduce((s, m) => s + Math.min(100, m.achievement ?? 0) * m.weight, 0) / w);
}

/** 평가 기간 — 분기 'YYYY-Qn' */
export function kpiPeriodOf(d = new Date()): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
/** 분기의 시작일·다음 분기 시작일('YYYY-MM-DD') */
export function kpiPeriodRange(period: string): { from: string; to: string } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const q = Number(m[2]);
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${y}-${pad((q - 1) * 3 + 1)}-01`;
  const to = q === 4 ? `${y + 1}-01-01` : `${y}-${pad(q * 3 + 1)}-01`;
  return { from, to };
}
/** 고를 수 있는 기간 — 이번 분기부터 거꾸로 n개 */
export function kpiPeriodOptions(n = 6, now = new Date()): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.push({ value: `${y}-Q${q}`, label: `${y}년 ${q}분기` });
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}
