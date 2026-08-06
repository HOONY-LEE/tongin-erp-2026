// 통인 ERP 공유 타입/상수 — 프론트(web)와 백엔드(api)가 함께 사용.
// 설계노트의 도메인 개념과 1:1 (서비스라인·산정방식·상태·처리구분).

// 조직 유형 (그룹사 > 법인/브랜드 > 지점 > 외부 전속업체)
export const ORG_UNIT_TYPES = ['GROUP', 'COMPANY', 'BRANCH', 'PARTNER'] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

export const SERVICE_LINES = ['MOVING', 'LIVING', 'CARE', 'B2B_MOVING', 'GENERAL'] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];

export const PRICING_METHODS = ['CBM', 'COST_PLUS', 'FLAT', 'PYEONG'] as const;
export type PricingMethod = (typeof PRICING_METHODS)[number];

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

// 품목 처리구분 (운반/방치/폐기)
export const HANDLING = ['CARRY', 'LEAVE', 'DISPOSE'] as const;
export type Handling = (typeof HANDLING)[number];

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
export const CAMPAIGN_STATUS = ['DRAFT', 'SENT'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number];

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
  byBranch: { orgUnitName: string; contractCount: number; revenue: number }[];
}

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
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const PERMISSION_WILDCARD = '*';

// 기본 역할 코드 (시드)
export const ROLE_SUPER_ADMIN = 'SUPER_ADMIN';
// 외부 전속업체 제한 역할 (OPS-04): 본인 소속 partner의 작업오더만 조회
export const ROLE_OUTSOURCE = 'OUTSOURCE';
// 가맹점 역할 (APP-02): 본인 소속 조직(+하위)의 리드·견적·계약·작업·발주만 조회/발주
export const ROLE_FRANCHISE = 'FRANCHISE';

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
