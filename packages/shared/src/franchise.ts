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
