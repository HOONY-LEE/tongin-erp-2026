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
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const PERMISSION_WILDCARD = '*';

// 기본 역할 코드 (시드)
export const ROLE_SUPER_ADMIN = 'SUPER_ADMIN';

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
  permissions: string[]; // 평탄화된 permission code (또는 '*')
  scopes: { roleCode: string; dataScope: DataScope; orgScopeId: string | null }[];
}
