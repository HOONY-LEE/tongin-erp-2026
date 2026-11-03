// ── 가맹: 가맹점 현황(계약·입금·재계약) · 가맹 영업 CRM(가맹점 모집) ──
// 이사 고객 CRM(접수)과 따로 — 여기 '고객'은 가맹점이 될 업체(사장님)다.

/** 가맹점 운영 상태 */
export const FRANCHISE_STATUSES = ['OPERATING', 'PREPARING', 'SUSPENDED', 'TERMINATED'] as const;
export type FranchiseStatus = (typeof FRANCHISE_STATUSES)[number];
export const FRANCHISE_STATUS_LABEL: Record<FranchiseStatus, string> = {
  OPERATING: '운영 중',
  PREPARING: '개점 준비',
  SUSPENDED: '휴업',
  TERMINATED: '해지',
};
/** 계약 만료가 이 날수 안이면 재계약 대상 */
export const FRANCHISE_RENEWAL_DAYS = 90;

/** 가맹점 한 곳(지점 + 계약 정보) — 가맹점 현황 표 한 줄 */
export interface FranchiseBranchRow {
  orgUnitId: string;
  name: string;
  parentName: string | null;
  addr: string | null;
  status: FranchiseStatus;
  ownerName: string | null;
  ownerPhone: string | null;
  bizNo: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  /** 만료까지 남은 날(지났으면 음수) */
  daysLeft: number | null;
  renewalDue: boolean;
  franchiseFee: number | null;
  feePaidAt: string | null;
  deposit: number | null;
  depositPaidAt: string | null;
  royalty: number | null;
  /** 가맹비·보증금 중 정해 두고 입금 확인이 안 된 것이 있음 */
  unpaid: boolean;
  memo: string | null;
  /** 계약 정보를 한 번도 안 넣었음 */
  empty: boolean;
  employeeCount: number;
}

// 가맹 영업(CRM) — 단계
export const FRANCHISE_LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'CONSULTING',
  'MEETING',
  'CONTRACTING',
  'WON',
  'HOLD',
  'LOST',
] as const;
export type FranchiseLeadStage = (typeof FRANCHISE_LEAD_STAGES)[number];
export const FRANCHISE_LEAD_STAGE_LABEL: Record<FranchiseLeadStage, string> = {
  NEW: '발굴',
  CONTACTED: '첫 연락',
  CONSULTING: '상담 중',
  MEETING: '미팅·방문',
  CONTRACTING: '계약 진행',
  WON: '계약 완료',
  HOLD: '보류',
  LOST: '실패',
};
/** 칸반 칸(진행 순서) — 보류·실패는 목록에서 */
export const FRANCHISE_PIPELINE: FranchiseLeadStage[] = [
  'NEW',
  'CONTACTED',
  'CONSULTING',
  'MEETING',
  'CONTRACTING',
  'WON',
];
export const FRANCHISE_LEAD_STAGE_COLOR: Record<FranchiseLeadStage, string> = {
  NEW: '#9ca3af',
  CONTACTED: '#60a5fa',
  CONSULTING: '#3b82f6',
  MEETING: '#8b5cf6',
  CONTRACTING: '#f59e0b',
  WON: '#16a34a',
  HOLD: '#a8a29e',
  LOST: '#ef4444',
};

export const FRANCHISE_LEAD_SOURCES = [
  'DB',
  'INBOUND',
  'OUTBOUND',
  'REFERRAL',
  'EXPO',
  'ETC',
] as const;
export type FranchiseLeadSource = (typeof FRANCHISE_LEAD_SOURCES)[number];
export const FRANCHISE_LEAD_SOURCE_LABEL: Record<FranchiseLeadSource, string> = {
  DB: 'DB 발굴',
  INBOUND: '인바운드 문의',
  OUTBOUND: '아웃바운드',
  REFERRAL: '소개',
  EXPO: '박람회·설명회',
  ETC: '기타',
};

/** 관심도 */
export const FRANCHISE_INTERESTS = ['A', 'B', 'C'] as const;
export type FranchiseInterest = (typeof FRANCHISE_INTERESTS)[number];
export const FRANCHISE_INTEREST_LABEL: Record<FranchiseInterest, string> = {
  A: '높음',
  B: '보통',
  C: '낮음',
};

/** 상담 기록 종류(STAGE는 단계를 바꾸면 자동으로) */
export const FRANCHISE_ACTIVITY_KINDS = ['CALL', 'SMS', 'MEETING', 'MEMO', 'STAGE'] as const;
export type FranchiseActivityKind = (typeof FRANCHISE_ACTIVITY_KINDS)[number];
export const FRANCHISE_ACTIVITY_LABEL: Record<FranchiseActivityKind, string> = {
  CALL: '통화',
  SMS: '문자',
  MEETING: '미팅·방문',
  MEMO: '메모',
  STAGE: '단계 변경',
};

export interface FranchiseLeadView {
  id: string;
  companyName: string;
  contactName: string | null;
  phone: string | null;
  region: string | null;
  source: FranchiseLeadSource;
  stage: FranchiseLeadStage;
  interest: FranchiseInterest;
  ownerEmpId: string | null;
  ownerName: string | null;
  nextActionAt: string | null;
  nextAction: string | null;
  currentBiz: string | null;
  memo: string | null;
  lostReason: string | null;
  branchId: string | null;
  branchName: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface FranchiseActivityView {
  id: string;
  kind: FranchiseActivityKind;
  content: string | null;
  fromStage: FranchiseLeadStage | null;
  toStage: FranchiseLeadStage | null;
  actorName: string | null;
  at: string;
}
