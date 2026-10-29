// ── 대시보드 빌더 ──
// 위젯 카탈로그(무엇을 보여 줄 수 있나) · 시각화 방식 · 레이아웃(12칸 격자) 정의.
// 위젯마다 필요한 권한이 있어, 사용자는 볼 수 있는 데이터의 위젯만 고르고 볼 수 있다.

/** 시각화 방식 */
export const DASH_VIZ = [
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
  'list',
  'map',
  'heatmap',
  'text',
] as const;
export type DashViz = (typeof DASH_VIZ)[number];
export const DASH_VIZ_LABEL: Record<DashViz, string> = {
  card: '숫자 카드',
  gauge: '게이지',
  bar: '세로 막대',
  hbar: '가로 막대',
  line: '선 그래프',
  area: '영역 그래프',
  pie: '원 그래프',
  donut: '도넛',
  funnel: '퍼널',
  table: '표',
  list: '목록',
  map: '지도',
  heatmap: '히트맵',
  text: '글',
};

/**
 * 데이터 모양 — 서버가 돌려주는 형태. 모양마다 쓸 수 있는 시각화가 정해진다.
 *  value: 숫자 하나 · category: 항목별 값 · series: 시간축 값 · matrix: 행×열 값
 *  rows: 표 행 · points: 위경도 점 · text: 글(서버 데이터 없음) · links: 바로가기
 */
export type DashShape =
  | 'value'
  | 'category'
  | 'series'
  | 'matrix'
  | 'rows'
  | 'points'
  | 'text'
  /** 화면이 스스로 데이터를 불러오는 기존 대시보드 부품(지역 확대 지도 등) */
  | 'embed';

export const DASH_PERIODS = ['7d', '30d', '90d', '12m', 'all'] as const;
export type DashPeriod = (typeof DASH_PERIODS)[number];
export const DASH_PERIOD_LABEL: Record<DashPeriod, string> = {
  '7d': '최근 7일',
  '30d': '최근 30일',
  '90d': '최근 90일',
  '12m': '최근 12개월',
  all: '전체 기간',
};

export const DASH_METRICS = ['leadCount', 'contractCount', 'revenue', 'workCount'] as const;
export type DashMetric = (typeof DASH_METRICS)[number];
export const DASH_METRIC_LABEL: Record<DashMetric, string> = {
  leadCount: '접수 건수',
  contractCount: '계약 건수',
  revenue: '매출',
  workCount: '작업 건수',
};

export type DashFormat = 'count' | 'won' | 'percent';

export interface DashWidgetDef {
  key: string;
  title: string;
  group: string;
  description: string;
  shape: DashShape;
  /** 고를 수 있는 시각화(첫 번째가 기본) */
  viz: DashViz[];
  /** 필요한 권한(모두) — 없으면 누구나 */
  perms: string[];
  /** 기본 크기(12칸 격자, 행 높이 1칸=88px) */
  size: { w: number; h: number };
  /** 기간 고르기 */
  period?: DashPeriod;
  /** 지표 고르기(지점 순위·지도) */
  metric?: DashMetric;
  /** 지도로 그릴 수 있는 시도별 데이터 */
  geo?: boolean;
}

const KPI = { w: 3, h: 2 };
const CHART = { w: 6, h: 4 };
const WIDE = { w: 12, h: 4 };
const LIST = { w: 6, h: 4 };
const MAP = { w: 4, h: 6 };

export const DASH_GROUPS = [
  '핵심 지표',
  '접수·영업',
  '계약·매출',
  '수금',
  '작업',
  '지점',
  '고객',
  '고객지원·리빙케어',
  '마케팅·일정',
  '인사·근태',
  '기타',
] as const;

export const DASH_WIDGETS: DashWidgetDef[] = [
  // ── 핵심 지표(숫자 카드) ──
  {
    key: 'kpi.leads',
    title: '접수 건수',
    group: '핵심 지표',
    description: '기간 안에 들어온 접수 수와 앞 기간 대비 증감',
    shape: 'value',
    viz: ['card'],
    perms: ['LEAD.READ'],
    size: KPI,
    period: '30d',
  },
  {
    key: 'kpi.contracts',
    title: '계약 건수',
    group: '핵심 지표',
    description: '기간 안에 서명된 계약 수',
    shape: 'value',
    viz: ['card'],
    perms: ['CONTRACT.READ'],
    size: KPI,
    period: '30d',
  },
  {
    key: 'kpi.conversion',
    title: '계약 전환율',
    group: '핵심 지표',
    description: '기간 접수 중 계약까지 간 비율',
    shape: 'value',
    viz: ['gauge', 'card'],
    perms: ['LEAD.READ'],
    size: KPI,
    period: '90d',
  },
  {
    key: 'kpi.revenue',
    title: '계약 매출',
    group: '핵심 지표',
    description: '기간 안에 서명된 계약 금액 합계',
    shape: 'value',
    viz: ['card'],
    perms: ['CONTRACT.READ'],
    size: KPI,
    period: '30d',
  },
  {
    key: 'kpi.avgContract',
    title: '평균 계약 금액',
    group: '핵심 지표',
    description: '기간 계약 1건당 평균 금액',
    shape: 'value',
    viz: ['card'],
    perms: ['CONTRACT.READ'],
    size: KPI,
    period: '90d',
  },
  {
    key: 'kpi.collected',
    title: '수금액',
    group: '핵심 지표',
    description: '기간 안에 입금 확인된 금액',
    shape: 'value',
    viz: ['card'],
    perms: ['PAYMENT.READ'],
    size: KPI,
    period: '30d',
  },
  {
    key: 'kpi.outstanding',
    title: '미수금',
    group: '핵심 지표',
    description: '서명된 계약 금액 중 아직 들어오지 않은 금액(전체)',
    shape: 'value',
    viz: ['card'],
    perms: ['PAYMENT.READ'],
    size: KPI,
  },
  {
    key: 'kpi.collectionRate',
    title: '수금률',
    group: '핵심 지표',
    description: '서명된 계약 금액 대비 입금된 비율(전체)',
    shape: 'value',
    viz: ['gauge', 'card'],
    perms: ['PAYMENT.READ'],
    size: KPI,
  },
  {
    key: 'kpi.workDone',
    title: '작업 완료',
    group: '핵심 지표',
    description: '기간 안에 완료된 작업 수',
    shape: 'value',
    viz: ['card'],
    perms: ['WORK_ORDER.READ'],
    size: KPI,
    period: '30d',
  },
  {
    key: 'kpi.workToday',
    title: '오늘 작업',
    group: '핵심 지표',
    description: '오늘 예정된 작업 수',
    shape: 'value',
    viz: ['card'],
    perms: ['WORK_ORDER.READ'],
    size: KPI,
  },
  {
    key: 'kpi.unassigned',
    title: '담당자 미배정 접수',
    group: '핵심 지표',
    description: '진행 중인데 담당자가 없는 접수',
    shape: 'value',
    viz: ['card'],
    perms: ['LEAD.READ'],
    size: KPI,
  },
  {
    key: 'kpi.openSupport',
    title: '처리 중 문의',
    group: '핵심 지표',
    description: '아직 해결되지 않은 고객 문의',
    shape: 'value',
    viz: ['card'],
    perms: ['SUPPORT.READ'],
    size: KPI,
  },
  {
    key: 'kpi.newCustomers',
    title: '신규 고객',
    group: '핵심 지표',
    description: '기간 안에 새로 등록된 고객',
    shape: 'value',
    viz: ['card'],
    perms: ['CUSTOMER.READ'],
    size: KPI,
    period: '30d',
  },

  // ── 접수·영업 ──
  {
    key: 'lead.funnel',
    title: '접수 단계별 현황',
    group: '접수·영업',
    description: '각 단계까지 온 접수 수 — 단계마다 얼마나 빠지는지',
    shape: 'category',
    viz: ['funnel', 'bar', 'hbar', 'donut', 'table'],
    perms: ['LEAD.READ'],
    size: CHART,
    period: 'all',
  },
  {
    key: 'lead.trend',
    title: '접수 추이',
    group: '접수·영업',
    description: '일·주·월 단위 접수 건수 변화',
    shape: 'series',
    viz: ['line', 'area', 'bar', 'table'],
    perms: ['LEAD.READ'],
    size: CHART,
    period: '30d',
  },
  {
    key: 'lead.bySource',
    title: '접수 경로',
    group: '접수·영업',
    description: '네이버·전화·홈페이지 등 경로별 접수',
    shape: 'category',
    viz: ['donut', 'pie', 'hbar', 'bar', 'table'],
    perms: ['LEAD.READ'],
    size: CHART,
    period: '90d',
  },
  {
    key: 'lead.byServiceLine',
    title: '상품 종류별 접수',
    group: '접수·영업',
    description: '가정이사·리빙·케어·기업이전 등',
    shape: 'category',
    viz: ['pie', 'donut', 'bar', 'table'],
    perms: ['LEAD.READ'],
    size: CHART,
    period: '90d',
  },
  {
    key: 'lead.byRegion',
    title: '시도별 접수',
    group: '접수·영업',
    description: '출발지 시도 기준 접수 분포',
    shape: 'category',
    viz: ['map', 'hbar', 'table'],
    perms: ['LEAD.READ'],
    size: MAP,
    period: '90d',
    geo: true,
  },
  {
    key: 'lead.byBranch',
    title: '지점별 접수',
    group: '접수·영업',
    description: '접수 지점별 건수(상위 10)',
    shape: 'category',
    viz: ['hbar', 'bar', 'table'],
    perms: ['LEAD.READ'],
    size: CHART,
    period: '90d',
  },
  {
    key: 'lead.weekHour',
    title: '요일×시간대 접수',
    group: '접수·영업',
    description: '언제 접수가 많이 들어오는지(상담 인력 배치용)',
    shape: 'matrix',
    viz: ['heatmap', 'table'],
    perms: ['LEAD.READ'],
    size: WIDE,
    period: '90d',
  },
  {
    key: 'lead.branchMonth',
    title: '지점×월 접수',
    group: '접수·영업',
    description: '지점별 월간 접수 흐름(상위 10 지점)',
    shape: 'matrix',
    viz: ['heatmap', 'table'],
    perms: ['LEAD.READ'],
    size: WIDE,
    period: '12m',
  },
  {
    key: 'lead.recent',
    title: '최근 접수',
    group: '접수·영업',
    description: '가장 최근 들어온 접수 10건',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: ['LEAD.READ'],
    size: LIST,
  },
  {
    key: 'lead.unassignedList',
    title: '담당자 없는 접수',
    group: '접수·영업',
    description: '담당자를 배정해야 할 접수',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: ['LEAD.READ'],
    size: LIST,
  },

  // ── 계약·매출 ──
  {
    key: 'revenue.trend',
    title: '매출 추이',
    group: '계약·매출',
    description: '서명된 계약 금액의 변화',
    shape: 'series',
    viz: ['area', 'line', 'bar', 'table'],
    perms: ['CONTRACT.READ'],
    size: CHART,
    period: '12m',
  },
  {
    key: 'contract.trend',
    title: '계약 건수 추이',
    group: '계약·매출',
    description: '서명된 계약 수의 변화',
    shape: 'series',
    viz: ['bar', 'line', 'area', 'table'],
    perms: ['CONTRACT.READ'],
    size: CHART,
    period: '12m',
  },
  {
    key: 'revenue.byBranch',
    title: '지점별 매출',
    group: '계약·매출',
    description: '지점별 계약 금액(상위 10)',
    shape: 'category',
    viz: ['hbar', 'bar', 'table'],
    perms: ['CONTRACT.READ'],
    size: CHART,
    period: '90d',
  },
  {
    key: 'revenue.byRegion',
    title: '시도별 매출',
    group: '계약·매출',
    description: '출발지 시도 기준 계약 금액',
    shape: 'category',
    viz: ['map', 'hbar', 'table'],
    perms: ['CONTRACT.READ'],
    size: MAP,
    period: '12m',
    geo: true,
  },
  {
    key: 'revenue.byServiceLine',
    title: '상품 종류별 매출',
    group: '계약·매출',
    description: '상품 종류별 계약 금액 비중',
    shape: 'category',
    viz: ['donut', 'pie', 'bar', 'table'],
    perms: ['CONTRACT.READ'],
    size: CHART,
    period: '12m',
  },

  // ── 수금 ──
  {
    key: 'collected.trend',
    title: '수금 추이',
    group: '수금',
    description: '입금 확인된 금액의 변화',
    shape: 'series',
    viz: ['bar', 'line', 'area', 'table'],
    perms: ['PAYMENT.READ'],
    size: CHART,
    period: '12m',
  },
  {
    key: 'payment.topOutstanding',
    title: '미수금 상위 계약',
    group: '수금',
    description: '받을 돈이 가장 많이 남은 계약 10건',
    shape: 'rows',
    viz: ['table', 'list'],
    perms: ['PAYMENT.READ'],
    size: LIST,
  },

  // ── 작업 ──
  {
    key: 'work.byStatus',
    title: '작업 상태',
    group: '작업',
    description: '배정·진행·완료 등 상태별 작업 수',
    shape: 'category',
    viz: ['donut', 'pie', 'bar', 'table'],
    perms: ['WORK_ORDER.READ'],
    size: CHART,
    period: 'all',
  },
  {
    key: 'work.trend',
    title: '작업 일정 추이',
    group: '작업',
    description: '작업 예정일 기준 작업 수',
    shape: 'series',
    viz: ['bar', 'line', 'area', 'table'],
    perms: ['WORK_ORDER.READ'],
    size: CHART,
    period: '90d',
  },
  {
    key: 'work.calendar',
    title: '날짜별 작업량',
    group: '작업',
    description: '최근 12주 요일별 작업량(달력 히트맵)',
    shape: 'matrix',
    viz: ['heatmap', 'table'],
    perms: ['WORK_ORDER.READ'],
    size: WIDE,
  },
  {
    key: 'work.upcoming',
    title: '다가오는 작업',
    group: '작업',
    description: '오늘부터 예정된 작업 10건',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: ['WORK_ORDER.READ'],
    size: LIST,
  },

  // ── 지점 ──
  {
    key: 'branch.ranking',
    title: '지점 실적 순위',
    group: '지점',
    description: '지표를 골라 지점 순위를 봅니다(전 지점 비교)',
    shape: 'category',
    viz: ['hbar', 'bar', 'table'],
    perms: ['STATS.READ'],
    size: CHART,
    period: '90d',
    metric: 'revenue',
  },
  {
    key: 'branch.map',
    title: '지점 지도',
    group: '지점',
    description: '지점 위치와 실적 크기(전 지점 비교)',
    shape: 'points',
    viz: ['map', 'table'],
    perms: ['STATS.READ'],
    size: MAP,
    period: '90d',
    metric: 'leadCount',
  },
  {
    key: 'branch.performance',
    title: '지역·지점 실적 지도(확대)',
    group: '지점',
    description: '시도를 누르면 시군구까지 확대되는 실적 지도와 지점 순위(전 지점 비교)',
    shape: 'embed',
    viz: ['map'],
    perms: ['STATS.READ'],
    size: { w: 6, h: 7 },
  },
  {
    key: 'branch.anomalyReport',
    title: '이상 지점 분석 보고서',
    group: '지점',
    description: '이상 지점 점수·이유·근거 건까지 보여 주는 전체 보고서',
    shape: 'embed',
    viz: ['list'],
    perms: ['STATS.READ'],
    size: { w: 12, h: 6 },
  },
  {
    key: 'branch.anomaly',
    title: '이상 지점(AI 탐지)',
    group: '지점',
    description: '미계약·멈춘 건은 많은데 매출이 낮은 지점',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: ['STATS.READ'],
    size: LIST,
  },

  // ── 고객 ──
  {
    key: 'customer.byGrade',
    title: '고객 등급 분포',
    group: '고객',
    description: '일반·골드·VIP 등 등급별 고객 수',
    shape: 'category',
    viz: ['pie', 'donut', 'bar', 'table'],
    perms: ['CUSTOMER.READ'],
    size: CHART,
  },
  {
    key: 'customer.trend',
    title: '신규 고객 추이',
    group: '고객',
    description: '새로 등록된 고객 수의 변화',
    shape: 'series',
    viz: ['line', 'area', 'bar', 'table'],
    perms: ['CUSTOMER.READ'],
    size: CHART,
    period: '12m',
  },
  {
    key: 'customer.byRegion',
    title: '시도별 고객',
    group: '고객',
    description: '고객 주소 시도 기준 분포',
    shape: 'category',
    viz: ['map', 'hbar', 'table'],
    perms: ['CUSTOMER.READ'],
    size: MAP,
    geo: true,
  },

  // ── 고객지원·리빙케어 ──
  {
    key: 'support.byStatus',
    title: '문의 상태',
    group: '고객지원·리빙케어',
    description: '접수·처리 중·해결 등 상태별 문의',
    shape: 'category',
    viz: ['donut', 'bar', 'table'],
    perms: ['SUPPORT.READ'],
    size: CHART,
    period: '90d',
  },
  {
    key: 'support.recent',
    title: '최근 문의',
    group: '고객지원·리빙케어',
    description: '가장 최근 고객 문의 10건',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: ['SUPPORT.READ'],
    size: LIST,
  },
  {
    key: 'service.byStatus',
    title: '리빙·케어 상태',
    group: '고객지원·리빙케어',
    description: '요청·예정·완료 등 상태별 리빙·케어 주문',
    shape: 'category',
    viz: ['donut', 'bar', 'table'],
    perms: ['SERVICE_ORDER.READ'],
    size: CHART,
    period: '90d',
  },

  // ── 마케팅·일정 ──
  {
    key: 'campaign.recent',
    title: '최근 캠페인 결과',
    group: '마케팅·일정',
    description: '최근 발송한 캠페인의 대상·성공·실패',
    shape: 'rows',
    viz: ['table', 'list'],
    perms: ['MARKETING.READ'],
    size: LIST,
  },
  {
    key: 'calendar.upcoming',
    title: '다가오는 내 일정',
    group: '마케팅·일정',
    description: '오늘부터 2주 안의 내 일정',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: ['CALENDAR.READ'],
    size: LIST,
  },

  // ── 인사·근태 ── 근태·연차는 본사 직원 기준(지점은 가맹점주라 출퇴근을 찍지 않는다)
  {
    key: 'kpi.attendanceToday',
    title: '오늘 출근',
    group: '인사·근태',
    description: '본사 직원 중 오늘 출근한 사람(휴가·휴일 제외한 근무 대상 대비)',
    shape: 'value',
    viz: ['card', 'gauge'],
    perms: ['ATTENDANCE.READ'],
    size: KPI,
  },
  {
    key: 'hr.attendanceToday',
    title: '오늘 근태 확인',
    group: '인사·근태',
    description: '오늘 지각·미출근·휴가인 본사 직원',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: ['ATTENDANCE.READ'],
    size: LIST,
  },
  {
    key: 'hr.onLeave',
    title: '휴가자',
    group: '인사·근태',
    description: '오늘부터 일주일 안의 승인된 휴가',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: ['LEAVE.READ'],
    size: LIST,
  },
  {
    key: 'hr.leaveUsage',
    title: '부서별 연차 사용률',
    group: '인사·근태',
    description: '본사 부서별 이번 연차 기간 사용 일수 ÷ 생긴 일수',
    shape: 'category',
    viz: ['hbar', 'bar', 'table'],
    perms: ['LEAVE.READ'],
    size: CHART,
  },
  {
    key: 'hr.headcount',
    title: '재직 인원',
    group: '인사·근태',
    description: '재직 직원 수와 이번 달 입사·퇴사',
    shape: 'value',
    viz: ['card'],
    perms: ['EMPLOYEE.READ'],
    size: KPI,
  },
  {
    key: 'kpi.pendingApprovals',
    title: '내 결재 대기',
    group: '인사·근태',
    description: '지금 내가 결재할 문서 수',
    shape: 'value',
    viz: ['card'],
    perms: [],
    size: KPI,
  },
  {
    key: 'approval.pending',
    title: '결재할 문서',
    group: '인사·근태',
    description: '지금 내 결재 차례인 문서(누르면 결재 화면)',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: [],
    size: LIST,
  },
  {
    key: 'inbox.recent',
    title: '내 알림',
    group: '인사·근태',
    description: '결재 요청·결과, 업무 배정, 나를 언급한 댓글, 공지 — 안 읽은 알림이 굵게 보입니다',
    shape: 'rows',
    viz: ['list', 'table'],
    perms: [],
    size: LIST,
  },

  // ── 기타 ──
  {
    key: 'text.note',
    title: '메모·공지',
    group: '기타',
    description: '직접 쓴 글을 보여 줍니다(공지·목표 등)',
    shape: 'text',
    viz: ['text'],
    perms: [],
    size: { w: 4, h: 2 },
  },
];

export const DASH_WIDGET_MAP = new Map(DASH_WIDGETS.map((w) => [w.key, w]));

/** 이 권한 목록으로 쓸 수 있는 위젯인가 */
export function canUseWidget(def: DashWidgetDef, permissions: string[]): boolean {
  if (permissions.includes('*')) return true;
  return def.perms.every((p) => permissions.includes(p));
}

/** 격자에 놓인 위젯 하나 */
export interface DashItem {
  /** 배치 id(같은 위젯을 여러 번 놓을 수 있다) */
  id: string;
  widget: string;
  viz: DashViz;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 제목 바꾸기(비우면 기본 제목) */
  title?: string;
  period?: DashPeriod;
  metric?: DashMetric;
  /** 글 위젯 내용 */
  text?: string;
}

export interface DashLayout {
  version: 1;
  items: DashItem[];
}

export const DASH_COLS = 12;
export const DASH_ROW_HEIGHT = 88;

let seq = 0;
export function newDashItemId(): string {
  seq = (seq + 1) % 1000;
  return `w${Date.now().toString(36)}${seq.toString(36)}`;
}

/** 위젯 하나를 기본 설정으로 만든다 */
export function makeDashItem(def: DashWidgetDef, x = 0, y = 0): DashItem {
  return {
    id: newDashItemId(),
    widget: def.key,
    viz: def.viz[0],
    x,
    y,
    w: def.size.w,
    h: def.size.h,
    ...(def.period ? { period: def.period } : {}),
    ...(def.metric ? { metric: def.metric } : {}),
    ...(def.shape === 'text' ? { text: '' } : {}),
  };
}

/** 저장된 JSON을 안전하게 정리 — 모르는 위젯·잘못된 크기는 고친다 */
export function normalizeDashLayout(raw: unknown): DashLayout {
  const items = Array.isArray((raw as DashLayout | null)?.items) ? (raw as DashLayout).items : [];
  const out: DashItem[] = [];
  for (const it of items) {
    const def = DASH_WIDGET_MAP.get(String(it?.widget));
    if (!def) continue;
    const w = Math.min(DASH_COLS, Math.max(2, Math.round(Number(it.w) || def.size.w)));
    const h = Math.min(12, Math.max(2, Math.round(Number(it.h) || def.size.h)));
    out.push({
      id: String(it.id || newDashItemId()),
      widget: def.key,
      viz: def.viz.includes(it.viz) ? it.viz : def.viz[0],
      x: Math.min(DASH_COLS - w, Math.max(0, Math.round(Number(it.x) || 0))),
      y: Math.max(0, Math.round(Number(it.y) || 0)),
      w,
      h,
      ...(it.title ? { title: String(it.title).slice(0, 60) } : {}),
      ...(def.period
        ? {
            period: (DASH_PERIODS as readonly string[]).includes(String(it.period))
              ? it.period
              : def.period,
          }
        : {}),
      ...(def.metric
        ? {
            metric: (DASH_METRICS as readonly string[]).includes(String(it.metric))
              ? it.metric
              : def.metric,
          }
        : {}),
      ...(def.shape === 'text' ? { text: String(it.text ?? '').slice(0, 2000) } : {}),
    });
  }
  return { version: 1, items: out };
}

/** 겹침 */
function overlaps(a: DashItem, b: DashItem) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * 격자 정리 — 고정할 위젯(방금 옮기거나 키운 것)을 먼저 두고, 나머지는 겹치면 아래로 밀어낸 뒤
 * 위로 빈칸 없이 끌어올린다(위에서부터 차곡차곡).
 */
export function compactDashLayout(items: DashItem[], pinnedId?: string): DashItem[] {
  const pinned = items.find((i) => i.id === pinnedId);
  const rest = items
    .filter((i) => i.id !== pinnedId)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((i) => ({ ...i }));
  const placed: DashItem[] = pinned ? [{ ...pinned }] : [];
  for (const it of rest) {
    // 위로 끌어올리기
    it.y = 0;
    while (placed.some((p) => overlaps(p, it))) it.y++;
    placed.push(it);
  }
  // 고정한 위젯도 위가 비었으면 끌어올린다
  if (pinned) {
    const p = placed[0];
    const others = placed.slice(1);
    while (p.y > 0 && !others.some((o) => overlaps({ ...p, y: p.y - 1 }, o))) p.y--;
  }
  return placed.sort((a, b) => a.y - b.y || a.x - b.x);
}

const flowKey = (i: Pick<DashItem, 'x' | 'y'>) => i.y * DASH_COLS + i.x;

/**
 * 왼쪽 위부터 흐르듯 채우기 — 주어진 순서대로, 앞 위젯 자리 이후의 첫 빈칸(왼쪽→오른쪽, 위→아래)에 놓는다.
 * 순서가 유지되고 왼쪽이 비지 않는다. 큰 그래프 옆에 작은 카드 두 개를 쌓는 배치도 그대로 된다.
 */
export function flowDashLayout(ordered: DashItem[]): DashItem[] {
  const placed: DashItem[] = [];
  let cursor = 0;
  for (const src of ordered) {
    const it = { ...src, w: Math.min(DASH_COLS, src.w) };
    for (let k = cursor; ; k++) {
      const x = k % DASH_COLS;
      if (x + it.w > DASH_COLS) continue;
      it.x = x;
      it.y = Math.floor(k / DASH_COLS);
      if (!placed.some((p) => overlaps(p, it))) break;
    }
    placed.push(it);
    cursor = flowKey(it);
  }
  return placed;
}

/** 지금 배치의 순서(위→아래, 왼쪽→오른쪽) */
export function dashFlowOrder(items: DashItem[]): DashItem[] {
  return [...items].sort((a, b) => flowKey(a) - flowKey(b));
}

/**
 * 위젯 하나를 (x, y) 칸 근처로 옮겨 다시 흐르게 한다 — 그 칸보다 뒤에 있던 위젯 앞으로 끼어든다.
 * `item`이 목록에 없으면(새로 놓는 위젯) 끼워 넣는다. 크기를 바꾼 경우엔 `item`에 바뀐 크기를 담아 보낸다.
 */
export function placeDashItem(
  items: DashItem[],
  item: DashItem,
  target: { x: number; y: number },
): DashItem[] {
  const before = items.find((i) => i.id === item.id);
  const others = dashFlowOrder(items.filter((i) => i.id !== item.id));
  const t = flowKey(target);
  // 뒤로 옮길 땐 닿은 위젯의 뒤로(그 자리를 차지하도록), 앞으로 옮길 땐 앞으로
  const forward = before && t > flowKey(before);
  let at = others.findIndex((o) => (forward ? flowKey(o) > t : flowKey(o) >= t));
  if (at < 0) at = others.length;
  others.splice(at, 0, item);
  return flowDashLayout(others);
}

/** 권한에 맞는 기본 대시보드 — 관리자가 정한 것이 없을 때 */
export function defaultDashLayout(permissions: string[]): DashLayout {
  const want: { key: string; viz?: DashViz }[] = [
    { key: 'approval.pending' },
    { key: 'inbox.recent' },
    { key: 'kpi.leads' },
    { key: 'kpi.contracts' },
    { key: 'kpi.revenue' },
    { key: 'kpi.conversion' },
    { key: 'kpi.collected' },
    { key: 'kpi.outstanding' },
    { key: 'kpi.workToday' },
    { key: 'kpi.unassigned' },
    { key: 'lead.trend' },
    { key: 'lead.funnel' },
    { key: 'revenue.trend' },
    { key: 'lead.bySource' },
    { key: 'branch.map' },
    { key: 'branch.ranking' },
    { key: 'lead.weekHour' },
    { key: 'work.upcoming' },
    { key: 'lead.recent' },
  ];
  const items: DashItem[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const w of want) {
    const def = DASH_WIDGET_MAP.get(w.key);
    if (!def || !canUseWidget(def, permissions)) continue;
    const it = makeDashItem(def);
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

// ── 서버가 돌려주는 위젯 데이터 ──
export type DashData =
  | {
      shape: 'value';
      format: DashFormat;
      value: number;
      previous?: number | null;
      max?: number;
      hint?: string;
    }
  | {
      shape: 'category';
      format: DashFormat;
      items: { key: string; label: string; value: number }[];
    }
  | {
      shape: 'series';
      format: DashFormat;
      unit: 'day' | 'week' | 'month';
      points: { x: string; label: string; value: number }[];
    }
  | { shape: 'matrix'; format: DashFormat; rows: string[]; cols: string[]; cells: number[][] }
  | {
      shape: 'rows';
      columns: { key: string; label: string; format?: DashFormat | 'date' | 'text' }[];
      /** href = 이 행만의 이동 주소(link보다 먼저), unread = 1이면 굵게(안 읽은 알림·결재 대기) */
      rows: Record<string, string | number | null>[];
      /** 행을 누르면 갈 화면(예: /leads/:id) — {id} 자리에 행 id */
      link?: string;
    }
  | {
      shape: 'points';
      format: DashFormat;
      points: { key: string; label: string; lat: number; lng: number; value: number }[];
    };

export type DashDataResult = { ok: true; data: DashData } | { ok: false; error: string };

// ── 대시보드 색상 ─────────────────────────────────────────────
/**
 * 대시보드(템플릿) 색 — 기본은 통인 테마색, 바꿀 때는 애플 시스템 색 라인업에서 고른다.
 * (애플 옐로·브라운은 흰 바탕에서 너무 밝거나 회색처럼 보여 차트 색으로는 뺐다)
 * 고른 색이 첫 번째 계열색·연속값(히트맵·지도) 색이 되고, 나머지 계열색은 애플 색 순서로 이어진다.
 * light는 애플 시스템 색 값. dark는 같은 색을 어두운 바탕에 맞게 살짝 낮춘 값(애플 다크 값은 차트 바탕에서
 * 너무 밝아 색끼리 밝기가 들쭉날쭉해진다 — dataviz 팔레트 검사 기준).
 */
export const DASH_COLORS = [
  { key: 'tongin', label: '통인', light: '#fc753c', dark: '#e16a38' },
  { key: 'blue', label: '블루', light: '#007aff', dark: '#036fe4' },
  { key: 'indigo', label: '인디고', light: '#5856d6', dark: '#514fc0' },
  { key: 'purple', label: '퍼플', light: '#af52de', dark: '#9d4cc7' },
  { key: 'pink', label: '핑크', light: '#ff2d55', dark: '#e42b4e' },
  { key: 'red', label: '레드', light: '#ff3b30', dark: '#e4372e' },
  { key: 'orange', label: '오렌지', light: '#ff9500', dark: '#d27d06' },
  { key: 'green', label: '그린', light: '#34c759', dark: '#2fa54d' },
  { key: 'mint', label: '민트', light: '#00c7be', dark: '#06a59e' },
  { key: 'teal', label: '틸', light: '#30b0c7', dark: '#2e9eb3' },
  { key: 'cyan', label: '시안', light: '#32ade6', dark: '#2e90be' },
] as const;
export type DashColorKey = (typeof DASH_COLORS)[number]['key'];
export const DASH_COLOR_KEYS = DASH_COLORS.map((c) => c.key) as DashColorKey[];
export const DASH_DEFAULT_COLOR: DashColorKey = 'tongin';

/** 첫 색 다음에 이어질 계열색 순서 — 서로 잘 구분되는 색끼리 번갈아(색약 구분 검사 통과 순서) */
const SERIES_ORDER: DashColorKey[] = [
  'blue',
  'orange',
  'green',
  'purple',
  'pink',
  'teal',
  'indigo',
  'red',
  'mint',
  'cyan',
];
/** 고른 색과 너무 비슷해 바로 뒤에 두면 헷갈리는 색 */
const NEAR: Partial<Record<DashColorKey, DashColorKey[]>> = {
  tongin: ['orange', 'red'],
  orange: ['tongin'],
  red: ['pink', 'tongin'],
  pink: ['red'],
  blue: ['cyan', 'indigo'],
  cyan: ['blue', 'teal'],
  teal: ['mint', 'cyan'],
  mint: ['teal', 'green'],
  indigo: ['blue', 'purple'],
  purple: ['indigo', 'blue'],
  green: ['mint'],
};

/** 나란히 두면 헷갈리는 짝(양방향) — 색약(적록)·밝기 기준 */
const CONFUSED = new Set(
  [
    ['green', 'pink'],
    ['green', 'red'],
    ['green', 'tongin'],
    ['cyan', 'mint'],
    ['teal', 'mint'],
    ['cyan', 'teal'],
    ['blue', 'purple'],
    ['blue', 'indigo'],
    ['blue', 'cyan'],
    ['red', 'pink'],
    ['orange', 'tongin'],
  ].flatMap(([a, b]) => [`${a}:${b}`, `${b}:${a}`]),
);

/**
 * 대시보드 색 → 차트 CSS 변수(--dash-series-1~8, --dash-seq-1~7).
 * 연속값은 고른 색 한 가지의 밝기 단계(밝은 바탕 → 진한 색).
 */
export function dashColorVars(
  key: string | null | undefined,
  dark: boolean,
): Record<string, string> {
  const pick = (k: DashColorKey) => {
    const c = DASH_COLORS.find((x) => x.key === k) ?? DASH_COLORS[0];
    return dark ? c.dark : c.light;
  };
  const main = (
    DASH_COLOR_KEYS.includes(key as DashColorKey) ? key : DASH_DEFAULT_COLOR
  ) as DashColorKey;
  const skip = new Set<DashColorKey>([main, ...(NEAR[main] ?? [])]);
  // 순서대로 고르되 바로 앞 색과 헷갈리는 짝(색약 기준)은 한 칸 미룬다
  const keys: DashColorKey[] = [main];
  const rest = SERIES_ORDER.filter((k) => !skip.has(k));
  while (keys.length < 8 && rest.length) {
    const prev = keys[keys.length - 1];
    const i = rest.findIndex((k) => !CONFUSED.has(`${prev}:${k}`));
    keys.push(rest.splice(i < 0 ? 0 : i, 1)[0]);
  }
  const series = keys.map(pick);
  const accent = pick(main);
  const base = dark ? '#1c1c1e' : '#ffffff';
  const steps = [14, 28, 44, 60, 76, 100];
  const vars: Record<string, string> = {};
  series.forEach((c, i) => (vars[`--dash-series-${i + 1}`] = c));
  steps.forEach(
    (p, i) => (vars[`--dash-seq-${i + 1}`] = `color-mix(in srgb, ${accent} ${p}%, ${base})`),
  );
  vars['--dash-seq-7'] = `color-mix(in srgb, ${accent} 78%, ${dark ? '#ffffff' : '#000000'})`;
  return vars;
}
