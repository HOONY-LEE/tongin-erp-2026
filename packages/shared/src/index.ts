// 통인 ERP 공유 타입/상수 — 프론트(web)와 백엔드(api)가 함께 사용.
// 설계노트의 도메인 개념과 1:1 (서비스라인·산정방식·상태·처리구분).

// 조직 유형 (그룹사 > 법인/브랜드 > 지점 > 외부 전속업체)
export const ORG_UNIT_TYPES = ['GROUP', 'COMPANY', 'BRANCH', 'PARTNER'] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

export const SERVICE_LINES = ['MOVING', 'LIVING', 'CARE', 'B2B_MOVING', 'GENERAL'] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];
export const SERVICE_LINE_LABEL: Record<ServiceLine, string> = {
  MOVING: '이사',
  LIVING: '리빙',
  CARE: '케어',
  B2B_MOVING: '기업이전',
  GENERAL: '일반',
};

export const PRICING_METHODS = ['CBM', 'COST_PLUS', 'FLAT', 'PYEONG'] as const;
export type PricingMethod = (typeof PRICING_METHODS)[number];
export const PRICING_METHOD_LABEL: Record<PricingMethod, string> = {
  CBM: 'CBM(물량) 기준',
  COST_PLUS: '원가적상식',
  FLAT: '정액',
  PYEONG: '평수 기준',
};

// 거래처 유형 / 가격조건 할인 유형 (FND-09 카탈로그)
export const PARTNER_TYPES = ['AFFILIATE', 'OUTSOURCE', 'B2B_CLIENT'] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const DISCOUNT_TYPES = ['RATE', 'AMOUNT', 'FIXED_PRICE'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

// 접수→완료 상태머신 (설계노트 부록 D-4)
export const LEAD_STATUS = [
  'RECEIVED', // 접수완료
  'CONSULT_ASSIGNED', // 상담배정
  'CONSULT_TOSS', // 상담토스
  'QUOTED', // 견적완료
  'CONTRACTED', // 계약(승인)
  'WORK_TOSS', // 작업토스
  'IN_PROGRESS', // 작업중
  'DONE', // 완료
  'CANCELED', // 취소
] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];
/** 진행상태 라벨 — 화면과 견적서 문서가 같은 표기를 쓰도록 공용으로 둔다 */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  RECEIVED: '접수',
  CONSULT_ASSIGNED: '상담배정',
  CONSULT_TOSS: '상담토스',
  QUOTED: '견적완료',
  CONTRACTED: '계약',
  WORK_TOSS: '작업토스',
  IN_PROGRESS: '작업중',
  DONE: '완료',
  CANCELED: '취소',
};

// 리드 상태머신: 허용 전이만 가능 (부록 D-4). CANCELED는 종료 전 어디서든 가능.
export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  RECEIVED: ['CONSULT_ASSIGNED', 'CANCELED'],
  CONSULT_ASSIGNED: ['CONSULT_TOSS', 'CANCELED'],
  CONSULT_TOSS: ['QUOTED', 'CANCELED'],
  QUOTED: ['CONTRACTED', 'CANCELED'],
  CONTRACTED: ['WORK_TOSS', 'CANCELED'],
  WORK_TOSS: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['DONE', 'CANCELED'],
  DONE: [],
  CANCELED: [],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_TRANSITIONS[from]?.includes(to) ?? false;
}

// 품목 처리구분 — 현장 견적 실무의 6종(운반/폐기/하역/경유/방치/업체).
export const HANDLING = ['CARRY', 'DISPOSE', 'UNLOAD', 'VIA', 'LEAVE', 'VENDOR'] as const;
export type Handling = (typeof HANDLING)[number];
/** 화면·문서 공용 라벨 */
export const HANDLING_LABEL: Record<Handling, string> = {
  CARRY: '운반',
  DISPOSE: '폐기',
  UNLOAD: '하역', // 내려만 주고 이사짐으로 싣지 않는 짐 — 폐기물량으로 집계
  VIA: '경유', // 목적지 전에 다른 곳에 들르는 짐
  LEAVE: '방치', // 두고 가는 짐 — 물량에 넣지 않는다
  VENDOR: '업체', // 다른 업체가 처리 — 물량에 넣지 않는다
};

/**
 * 처리방법은 데이터(handling_method)로 관리하고, 각 처리방법이 물량의 어느 칸에 들어가는지(bucket)를 정한다.
 * 위 HANDLING·HANDLING_LABEL은 기본 6종(처음 데이터와 같음) — 처리방법 목록을 못 받았을 때의 기본값.
 */
export const HANDLING_BUCKETS = ['MOVING', 'TRANSIT', 'DISCARD', 'EXCLUDED'] as const;
export type HandlingBucket = (typeof HANDLING_BUCKETS)[number];
export const HANDLING_BUCKET_LABEL: Record<HandlingBucket, string> = {
  MOVING: '이사물량',
  TRANSIT: '경유물량',
  DISCARD: '폐기물량',
  EXCLUDED: '물량 제외',
};
export const DEFAULT_HANDLING_BUCKET: Record<string, HandlingBucket> = {
  CARRY: 'MOVING',
  VIA: 'TRANSIT',
  DISPOSE: 'DISCARD',
  UNLOAD: 'DISCARD',
  LEAVE: 'EXCLUDED',
  VENDOR: 'EXCLUDED',
};

/** 이사물량을 무엇으로 견적하나 — 부피(CBM) 또는 무게(톤) */
export const VOLUME_UNITS = ['CBM', 'TON'] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export const VOLUME_UNIT_LABEL: Record<VolumeUnit, string> = { CBM: 'CBM', TON: '톤' };

/** 물량 요약 — 이사물량 / 경유물량 / 폐기물량. '물량 제외' 처리방법은 넣지 않는다. */
export interface VolumeSummary {
  moving: number;
  transit: number;
  discard: number;
  total: number;
}
type Num = number | string | { toString(): string } | null | undefined;
export function summarizeVolume(
  lines: { cbm?: Num; ton?: Num; handling: string }[],
  opts: { unit?: VolumeUnit; buckets?: Record<string, string> } = {},
): VolumeSummary {
  const buckets = opts.buckets ?? DEFAULT_HANDLING_BUCKET;
  let moving = 0;
  let transit = 0;
  let discard = 0;
  for (const l of lines) {
    const v = Number(opts.unit === 'TON' ? l.ton : l.cbm) || 0;
    const b = buckets[l.handling] ?? DEFAULT_HANDLING_BUCKET[l.handling];
    if (b === 'MOVING') moving += v;
    else if (b === 'TRANSIT') transit += v;
    else if (b === 'DISCARD') discard += v;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    moving: r(moving),
    transit: r(transit),
    discard: r(discard),
    total: r(moving + transit + discard),
  };
}

/** 견적 물품정보에 내려주는 이사물량 카탈로그(방 틀·물품 사전·처리방법) */
export interface MoveItemDef {
  id: string;
  name: string;
  nameEng: string | null;
  category: string;
  cbm: string | number | null;
  ton: string | number | null;
}
export interface RoomTemplateDef {
  id: string;
  code: string;
  name: string;
  nameEng: string | null;
  /** 견적표 '기타' 칸 수 — 목록 밖 물품은 기타N 칸에 메모(품목명)와 함께 적는다 */
  extraSlots: number;
  itemIds: string[];
}
export interface HandlingDef {
  code: string;
  name: string;
  bucket: HandlingBucket;
  isActive: boolean;
}
export interface MoveCatalog {
  rooms: RoomTemplateDef[];
  items: MoveItemDef[];
  handlings: HandlingDef[];
}

/** 상품 구성(가정이사 등)에서 상품의 역할 */
export const BUNDLE_ROLES = ['REQUIRED', 'DEFAULT', 'OPTIONAL'] as const;
export type BundleRole = (typeof BUNDLE_ROLES)[number];
export const BUNDLE_ROLE_LABEL: Record<BundleRole, string> = {
  REQUIRED: '필수',
  DEFAULT: '기본선택',
  OPTIONAL: '선택',
};

/**
 * 견적 옵션 — 견적서 3단계(옵션선택)에서 고르는 항목.
 * 목록 원본은 상품관리 '옵션' 탭(addon_service)이다. 여기에는 화면 묶음과 표기 규칙만 둔다.
 * 가격은 견적마다 견적사원이 입력한다(현장 조건마다 달라서). 카탈로그 가격은 참고 기본가.
 */
export const ESTIMATE_OPTION_GROUPS = ['LADDER', 'LIVING', 'ASSEMBLY', 'ETC'] as const;
export type EstimateOptionGroup = (typeof ESTIMATE_OPTION_GROUPS)[number];
export const ESTIMATE_OPTION_GROUP_LABEL: Record<EstimateOptionGroup, string> = {
  LADDER: '사다리차 서비스',
  LIVING: '생활 서비스',
  ASSEMBLY: '분해 · 설치',
  ETC: '기타',
};
export interface OptionVariant {
  value: string;
  label: string;
}
/** 견적 화면에 내려주는 옵션 한 줄(카탈로그 행) */
export interface EstimateOptionDef {
  id: string;
  code: string;
  name: string;
  groupCode: EstimateOptionGroup;
  variants: OptionVariant[] | null;
  hasDate: boolean;
  hasNote: boolean;
  price: string | number | null;
  isActive: boolean;
  /** VOLUME = 이사물량(물품정보로 견적) | SERVICE */
  kind: 'VOLUME' | 'SERVICE';
  /** 이 견적의 상품 구성에서의 역할. null이면 구성 밖 — '추가 상품'으로만 고를 수 있다 */
  role: BundleRole | null;
  /** 구성에서 정한 단가(없으면 price). 이사물량이면 CBM·톤당 단가 */
  bundlePrice: string | number | null;
}
/** 견적서·목록에 쓰는 옵션 표기 — "입주청소서비스(프리미엄)", "일반 장롱 분해·설치" */
export function optionLabel(
  def: { name: string; groupCode: string; variants?: OptionVariant[] | null },
  variant?: string | null,
): string {
  const v = def.variants?.find((x) => x.value === variant)?.label;
  if (!v) return def.name;
  return def.groupCode === 'ASSEMBLY' ? `${def.name} ${v}` : `${def.name}(${v})`;
}

// EST: 작업조건(전/후) — 짐을 내리고 올리는 방법. 견적 단가·인원 산정의 근거가 된다.
export const ACCESS_METHODS = ['NONE', 'LADDER', 'ELEVATOR', 'STAIRS', 'ETC'] as const;
export type AccessMethod = (typeof ACCESS_METHODS)[number];
export const ACCESS_LABEL: Record<AccessMethod, string> = {
  NONE: '선택안함',
  LADDER: '사다리차',
  ELEVATOR: '엘리베이터',
  STAIRS: '계단',
  ETC: '기타',
};

/**
 * 견적서 메타 — 견적 한 장에 필요한 머리 정보를 접수·계약·작업에서 모아 온 것.
 * 따로 저장하지 않고 조회할 때마다 원본에서 모은다(원본이 바뀌면 견적서도 따라가야 하므로).
 * 날짜는 모두 'YYYY-MM-DD'(한국 시간 기준) 문자열이다.
 */
export interface EstimateMeta {
  customerName: string | null;
  customerPhone: string | null;
  contractId: string | null; // 이미 계약됐으면 그 계약(견적 화면에서 바로 이동)
  contractNo: string | null;
  estimatorName: string | null;
  estimatorPhone: string | null;
  leadStatus: LeadStatus | null;
  productName: string | null;
  orgUnitName: string | null;
  receivedDate: string | null; // 접수일
  consultDate: string | null; // 상담일(방문견적일)
  contractDate: string | null; // 계약일
  workDate: string | null; // 작업일(이사일)
  // 진행 — 견적서 보내기 → 고객 서명 → 계약금 입금 → 작업
  sentAt: string | null; // 고객에게 견적서를 보낸 시각
  signedAt: string | null; // 고객 전자서명 시각
  depositPaidAt: string | null; // 계약금 입금 확인 시각
  depositAccount: string | null; // 안내한 계약금 계좌
  workOrderId: string | null;
}

// EST: 부가세 처리 — 상품/거래처에 따라 견적서에 포함으로 적기도 하고 별도로 적기도 한다.
export const VAT_MODES = ['EXCLUDED', 'INCLUDED'] as const;
export type VatMode = (typeof VAT_MODES)[number];

// MM-01: 재고 수불 유형 (입고/출고/조정)
export const STOCK_MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

// CAT-01: 리빙·케어 서비스 주문 상태 (요청→일정확정→완료 / 취소)
export const SERVICE_ORDER_STATUS = ['REQUESTED', 'SCHEDULED', 'DONE', 'CANCELED'] as const;
export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUS)[number];

// AS-01: CS·AS 접수 유형/상태 (상담·불만=CS, 하자보수=AS)
export const SUPPORT_KINDS = ['CS', 'AS'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];
export const SUPPORT_TICKET_STATUS = [
  'RECEIVED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELED',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUS)[number];

// MM-02: 가맹점 발주 상태 (요청→승인→출고; 출고 전 취소 가능)
export const MATERIAL_ORDER_STATUS = ['REQUESTED', 'APPROVED', 'SHIPPED', 'CANCELED'] as const;
export type MaterialOrderStatus = (typeof MATERIAL_ORDER_STATUS)[number];

// MKT-01: 마케팅 캠페인 채널/상태
export const CAMPAIGN_CHANNELS = ['SMS', 'ALIMTALK'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];
export const CAMPAIGN_CHANNEL_LABEL: Record<CampaignChannel, string> = {
  SMS: '문자(SMS·LMS)',
  ALIMTALK: '카카오 알림톡',
};
export const CAMPAIGN_STATUS = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number];
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: '작성 중',
  SCHEDULED: '예약됨',
  SENDING: '발송 중',
  SENT: '발송 완료',
  CANCELED: '취소',
};

/** 캠페인 받을 고객 고르기 조건 — 화면·서버 공용 */
export interface CampaignAudienceFilter {
  keyword?: string; // 이름·전화번호 일부
  sido?: string[]; // 시·도(고객 주소 또는 접수 출발·도착지)
  addressKeyword?: string; // 주소 일부(구·동·아파트명 …)
  moveDateFrom?: string; // 이사일(접수) 범위 YYYY-MM-DD
  moveDateTo?: string;
  receivedFrom?: string; // 접수일 범위
  receivedTo?: string;
  leadStatuses?: string[]; // 접수 진행상태(하나라도 해당하는 접수가 있는 고객)
  grades?: string[]; // 고객 등급
  orgUnitId?: string; // 담당 지점
  excludeRecentDays?: number; // 최근 N일 안에 캠페인을 받은 고객 제외
}

/** 문자 바이트 길이(EUC-KR 기준: 한글 2바이트) — 90바이트 넘으면 장문(LMS) */
export function smsBytes(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return n;
}
export const SMS_MAX_BYTES = 90;

// ── HR-01: 인센티브/패널티 정책 엔진 (설정 기반 — 규칙=데이터) ──
export const HR_POLICY_KINDS = ['INCENTIVE', 'PENALTY'] as const; // 수당(+) / 패널티(−)
export type HrPolicyKind = (typeof HR_POLICY_KINDS)[number];

export const HR_TARGET_TYPES = ['EMPLOYEE', 'BRANCH'] as const; // 견적사원 / 지점
export type HrTargetType = (typeof HR_TARGET_TYPES)[number];

// 실적 지표. 금액형(매출)·건수형으로 나뉨. *_BRANCH_ONLY 는 지점 귀속만 가능.
export const HR_METRICS = [
  'CONTRACT_REVENUE', // 계약(서명) 매출
  'CONTRACT_COUNT', // 계약 건수
  'PAID_REVENUE', // 입금완료 매출
  'DONE_COUNT', // 완료 작업 수 (지점만)
  'AS_COUNT', // AS/하자 접수 수 (지점만)
] as const;
export type HrMetric = (typeof HR_METRICS)[number];
export const HR_METRICS_BRANCH_ONLY: HrMetric[] = ['DONE_COUNT', 'AS_COUNT'];
export const HR_METRICS_AMOUNT: HrMetric[] = ['CONTRACT_REVENUE', 'PAID_REVENUE'];

// 계산 방식: 정률(기준액×rate) | 단위당 정액(건수×amount)
export const HR_CALC_TYPES = ['RATE', 'FIXED_PER_UNIT'] as const;
export type HrCalcType = (typeof HR_CALC_TYPES)[number];

// 정산 결과(연월×대상유형): 대상별 라인 + 수당/패널티/순지급
export interface HrPayoutLine {
  policyId: string;
  policyName: string;
  kind: HrPolicyKind;
  metric: HrMetric;
  base: number; // 지표 실적값(매출 또는 건수)
  value: number; // 규칙 값(rate 또는 단위당 정액)
  amount: number; // 산출액(패널티는 음수)
}
export interface HrPayoutTarget {
  targetId: string;
  targetName: string;
  lines: HrPayoutLine[];
  incentive: number;
  penalty: number;
  net: number; // 수당 − 패널티
}
export interface HrPayoutResult {
  year: number;
  month: number;
  targetType: HrTargetType;
  targets: HrPayoutTarget[];
}

// EST-03: 견적 재료비 라인 상태 (DRAFT→재고 차감→DEDUCTED)
export const ESTIMATE_COST_LINE_STATUS = ['DRAFT', 'DEDUCTED', 'CANCELED'] as const;
export type EstimateCostLineStatus = (typeof ESTIMATE_COST_LINE_STATUS)[number];

// EST-04: 기업이전(B2B) 원가 적상식 문서 3종 (설계노트 F-2)
export const B2B_DOCUMENT_KINDS = ['quote', 'items', 'cost'] as const;
export type B2bDocumentKind = (typeof B2B_DOCUMENT_KINDS)[number]; // 견적서/물품내역서/산출내역서

// EST-04: 원가 적상식 산출 결과 (F-3)
export interface B2bCostBreakdown {
  materialCost: number; // 1.재료비(costLines 합)
  vehicleCost: number; // 2.차량비
  laborCost: number; // 3.노무비
  etcCost: number; // 4.기타
  subtotal: number; // 5.합계(1+2+3+4)
  overheadRate: number;
  overhead: number; // 6.공과잡비
  adminRate: number;
  admin: number; // 7.일반관리비
  profitRate: number;
  profit: number; // 8.이윤
  totalServiceCost: number; // 9.총 용역원가
  quotedAmount: number; // 10.견적가
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

// ── CRM-01: 대시보드 통계 (전환율 퍼널 + KPI + 가맹점별 매출) ──
export interface StatsOverview {
  funnel: { status: LeadStatus; count: number }[]; // 접수→완료 단계별 리드 수
  kpi: {
    leadTotal: number;
    contractCount: number; // SIGNED 계약 수
    doneCount: number; // 완료 작업 수
    revenue: number; // SIGNED 계약 총액
    collected: number; // PAID 입금액
    outstanding: number; // 미수금(revenue − collected)
    conversionRate: number; // 계약수 / 리드수 (0~1)
  };
  /** 지점별 실적 — 접수·계약(SIGNED)·작업(전체)·매출(SIGNED 총액) */
  byBranch: StatsByUnit[];
  /** 시·도별 실적 — 접수 출발지 기준(지도 모드) */
  byRegion: (Omit<StatsByUnit, 'orgUnitName' | 'orgUnitId' | 'lat' | 'lng'> & { sido: string })[];
}
export interface StatsByUnit {
  orgUnitName: string;
  /** 지점 위치(지도의 점). 좌표가 없으면 시·도 중심에 찍는다 */
  orgUnitId?: string | null;
  sido?: string | null;
  lat?: number | null;
  lng?: number | null;
  leadCount: number;
  contractCount: number;
  workCount: number;
  revenue: number;
}
// ── CRM-01b: 이상 지점 탐지 — 견적은 냈는데 전산상 미계약으로 남겨 수수료를 피하는 패턴 ──
export const ANOMALY_LEVELS = ['NORMAL', 'WATCH', 'SUSPECT'] as const;
export type AnomalyLevel = (typeof ANOMALY_LEVELS)[number];
export const ANOMALY_LEVEL_LABEL: Record<AnomalyLevel, string> = {
  NORMAL: '정상',
  WATCH: '주의',
  SUSPECT: '의심',
};
export interface BranchAnomalyMetrics {
  leadCount: number; // 기간 내 접수(취소 포함)
  quotedCount: number; // 견적까지 간 접수
  contractCount: number; // SIGNED 계약이 있는 접수
  /** 견적→계약 전환율(0~1) */
  conversionRate: number;
  /** 14일 넘게 상담토스·견적완료 등 계약 전 단계에 멈춘 접수 */
  stalledCount: number;
  stalledRate: number; // stalled / leadCount
  /** 이사일이 이미 지났는데 아직 계약 전 단계인 접수 — 가장 강한 신호 */
  pastMoveOpenCount: number;
  pastMoveOpenRate: number; // pastMoveOpen / leadCount
  quotedAmount: number; // 견적 금액 합(접수별 최신 견적)
  revenue: number; // SIGNED 계약 총액
  revenuePerLead: number;
  /** 이사일이 지난 미계약 건의 견적 합 — 전산 밖에서 계약됐을 가능성이 큰 매출(상한 추정) */
  missingRevenue: number;
  commissionRate: number; // 적용한 수수료율(0~1)
  /** 누락 추정 매출 × 수수료율 */
  commissionAtRisk: number;
}
export interface BranchAnomalyEvidence {
  leadNo: string;
  status: LeadStatus;
  customerName: string | null;
  moveDate: string | null;
  estimateAmount: number;
}
export interface BranchAnomaly {
  orgUnitId: string;
  orgUnitName: string;
  sido: string | null;
  score: number; // 0~100
  level: AnomalyLevel;
  reasons: string[];
  metrics: BranchAnomalyMetrics;
  evidence: BranchAnomalyEvidence[];
}
export interface BranchAnomalyReport {
  from: string;
  to: string;
  minLeads: number;
  /** 비교 기준(분석 대상 지점들의 중앙값) */
  baseline: {
    branchCount: number;
    conversionRate: number;
    stalledRate: number;
    pastMoveOpenRate: number;
    revenuePerLead: number;
  };
  /** PEERS=범위 안 지점 중앙값, DEFAULT=비교 지점이 3곳 미만이라 본사 기준값(접수당 매출 비교 생략) */
  baselineSource: 'PEERS' | 'DEFAULT';
  /** 접수가 minLeads 미만이라 오탐을 피하려고 뺀 지점 수 */
  excludedSmallBranches: number;
  commissionNote: string;
  method: string;
  branches: BranchAnomaly[];
}

export const STATS_METRICS = ['leadCount', 'contractCount', 'workCount', 'revenue'] as const;
export type StatsMetric = (typeof STATS_METRICS)[number];
export const STATS_METRIC_LABEL: Record<StatsMetric, string> = {
  leadCount: '접수 건수',
  contractCount: '계약 건수',
  workCount: '작업 건수',
  revenue: '매출',
};

// ── FND-03: 인증 + RBAC ──

// 주체 유형 (설계노트 1-B: 에이전트/워크플로우도 1급 주체)
export const PRINCIPAL_TYPES = ['HUMAN', 'AGENT', 'WORKFLOW'] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

// 데이터 범위 (역할 부여 시 조직 스코프와 함께)
export const DATA_SCOPES = ['OWN', 'ORG', 'ALL'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

// 권한 = 데이터(코드 하드코딩 금지, 개발원칙 §5). 기능 단위 코드: <도메인>.<액션>.
// '*' = 전체 권한(슈퍼관리자). 새 기능 추가 시 여기 + 시드에 등록.
export const PERMISSIONS = [
  'ORG_UNIT.READ',
  'ORG_UNIT.WRITE',
  'USER.READ',
  'USER.WRITE',
  'ROLE.READ',
  'ROLE.WRITE',
  'COMMON_CODE.READ',
  'COMMON_CODE.WRITE',
  'EMPLOYEE.READ',
  'EMPLOYEE.WRITE',
  'CUSTOMER.READ',
  'CUSTOMER.WRITE',
  'PARTNER.READ',
  'PARTNER.WRITE',
  'PRODUCT.READ',
  'PRODUCT.WRITE',
  'CBM_ITEM.READ',
  'CBM_ITEM.WRITE',
  'ADDON.READ',
  'ADDON.WRITE',
  'PRICE_CONDITION.READ',
  'PRICE_CONDITION.WRITE',
  'AUDIT.READ',
  'LEAD.READ',
  'LEAD.WRITE',
  'ESTIMATE.READ',
  'ESTIMATE.WRITE',
  'CONTRACT.READ',
  'CONTRACT.WRITE',
  'PAYMENT.READ',
  'PAYMENT.WRITE',
  'WORK_ORDER.READ',
  'WORK_ORDER.WRITE',
  'NOTIFICATION.READ',
  'NOTIFICATION.SEND', // 고객에게 문자·알림톡 직접 발송(AI 비서의 문자 발송 포함)
  'MATERIAL.READ',
  'MATERIAL.WRITE',
  'SETTLEMENT.READ',
  'SETTLEMENT.WRITE',
  'BILLING.READ',
  'BILLING.WRITE',
  'MATERIAL_ORDER.READ',
  'MATERIAL_ORDER.WRITE',
  'STATS.READ',
  'SERVICE_ORDER.READ',
  'SERVICE_ORDER.WRITE',
  'SUPPORT.READ',
  'SUPPORT.WRITE',
  'MARKETING.READ',
  'MARKETING.WRITE',
  'HR.READ',
  'HR.WRITE',
  'CALENDAR.READ',
  'CALENDAR.WRITE',
  'AI.USE', // AI 비서 사용 — AI는 사용자 본인 권한 안에서만 도구를 실행한다
  'AI.MANAGE', // AI 에이전트 관리 — 에이전트 블루프린트 만들기·고치기·테스트 실행(도구는 실행자 본인 권한으로)
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const PERMISSION_WILDCARD = '*';

// 기본 역할 코드 (시드)
export const ROLE_SUPER_ADMIN = 'SUPER_ADMIN';
// 외부 전속업체 제한 역할 (OPS-04): 본인 소속 partner의 작업오더만 조회
export const ROLE_OUTSOURCE = 'OUTSOURCE';
// 가맹점 역할 (APP-02): 본인 소속 조직(+하위)의 리드·견적·계약·작업·발주만 조회/발주
export const ROLE_FRANCHISE = 'FRANCHISE';
// 현장 작업팀 역할 (APP-03): 본인에게 배정된 작업만 조회 + 시작·완료. 로그인 시 현장 화면으로 진입
export const ROLE_FIELD = 'FIELD';

/** 이 역할들은 로그인 시 관리자 ERP가 아니라 현장 화면(/field)으로 들어간다. */
export const FIELD_ROLES: string[] = [ROLE_FIELD, ROLE_OUTSOURCE];

export interface LoginRequest {
  loginId: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // 초
}

// 현재 주체(사람/에이전트 공용) — /auth/me 응답 & request.user
export interface AuthPrincipal {
  userId: string;
  loginId: string;
  principalType: PrincipalType;
  employeeId: string | null; // 직원 계정이면 연결된 직원(현장 배정 조회에 사용). 외부인·에이전트는 null
  employeeName: string | null; // 연결된 직원 이름(담당자 기본값 표시용). employeeId가 null이면 null
  employeeOrgUnitId: string | null; // 연결된 직원의 소속 조직(접수 지점 기본값)
  partnerId: string | null; // 외부 전속/제휴 소속(있으면 partner 범위로 제한, OPS-04)
  permissions: string[]; // 평탄화된 permission code (또는 '*')
  scopes: { roleCode: string; dataScope: DataScope; orgScopeId: string | null }[];
}

// ── SET-01: 입금/미수금 관리 (레거시 입금-고객입금관리/고객별미수금/월별금액 대체) ──

// 고객별 미수금: 청구(SIGNED 계약 총액) − 입금(PAID) = 미수금
export interface CustomerReceivable {
  customerId: string;
  customerName: string;
  contractCount: number;
  billed: number; // 청구액(SIGNED 계약 totalAmount 합)
  paid: number; // 입금액(PAID payment 합)
  outstanding: number; // 미수금 = billed − paid
}

// 월별 입금액 (PAID payment의 paidAt 기준)
export interface MonthlyInflow {
  month: string; // YYYY-MM
  count: number;
  total: number;
}

// ── SET-02: 지점 정산/수수료 ──

// 수수료 산정 방식: 정률(기준액×rate) | 정액(건당 고정)
export const COMMISSION_CALC_TYPES = ['RATE', 'FIXED'] as const;
export type CommissionCalcType = (typeof COMMISSION_CALC_TYPES)[number];

// 지점 정산 결과(특정 지점·연월): 계약별 수수료 + 합계
export interface BranchSettlementLine {
  contractId: string;
  contractNo: string;
  customerName: string;
  serviceLine: string | null;
  source: string | null;
  base: number; // 정산 기준액(SIGNED 계약 총액)
  ruleId: string | null; // 적용 규칙(없으면 0원)
  ruleName: string | null;
  calcType: CommissionCalcType | null;
  commission: number;
}

export interface BranchSettlement {
  orgUnitId: string;
  orgUnitName: string;
  year: number;
  month: number;
  contractCount: number;
  baseTotal: number;
  commissionTotal: number;
  lines: BranchSettlementLine[];
}

// ── SET-03: 전속/B2B 청구·수금 + 마진 (설계노트 D-3) ──

export const INVOICE_STATUS = ['DRAFT', 'ISSUED', 'COLLECTED', 'CANCELED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

// 계약별 마진: 매출(계약 총액) − 전속원가(작업오더 billedCost)
export interface ContractMargin {
  contractId: string;
  contractNo: string;
  customerName: string;
  revenue: number; // 매출
  outsourceCost: number; // 전속원가(billedCost)
  margin: number; // 매출 − 전속원가
}

// 거래처별 미수금: 청구(ISSUED+COLLECTED) − 수금
export interface PartnerReceivable {
  partnerId: string;
  partnerName: string;
  invoiceCount: number;
  billed: number;
  collected: number;
  outstanding: number;
}

export * from './agent-blueprint';
