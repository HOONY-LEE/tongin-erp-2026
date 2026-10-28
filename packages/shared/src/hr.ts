// ── 인사: 전자결재 · 휴가 · 근태 ──
// 화면·API가 같이 쓰는 코드표와 순수 계산 함수.

/** 결재 문서 종류 */
export const APPROVAL_DOC_TYPES = ['LEAVE', 'ATTENDANCE_FIX', 'GENERAL'] as const;
export type ApprovalDocType = (typeof APPROVAL_DOC_TYPES)[number];
export const APPROVAL_DOC_TYPE_LABEL: Record<ApprovalDocType, string> = {
  LEAVE: '휴가 신청',
  ATTENDANCE_FIX: '근태 정정',
  GENERAL: '일반 품의',
};

/** 결재 문서 상태 */
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: '진행 중',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '회수',
};

/** 결재 단계 상태 — CC(참조)는 결재하지 않아 WAITING 그대로 둔다 */
export const APPROVAL_STEP_STATUS_LABEL: Record<string, string> = {
  WAITING: '대기',
  PENDING: '결재 차례',
  APPROVED: '승인',
  REJECTED: '반려',
  SKIPPED: '건너뜀',
};

/** 결재선 단계: 결재(APPROVER) 또는 참조(CC) */
export type ApprovalStepKind = 'APPROVER' | 'CC';
/**
 * 결재자를 정하는 방법
 * - DEPT_HEAD: 신청자 소속 조직의 장(재직자 중 직책이 가장 높은 사람, 본인이면 상위 조직의 장)
 * - ORG_HEAD: 지정한 조직의 장(그 조직에 사람이 없으면 상위로 올라간다)
 * - EMPLOYEE: 특정 직원
 */
export type ApprovalResolver = 'DEPT_HEAD' | 'ORG_HEAD' | 'EMPLOYEE';
export const APPROVAL_RESOLVER_LABEL: Record<ApprovalResolver, string> = {
  DEPT_HEAD: '신청자 부서장',
  ORG_HEAD: '지정 조직의 장',
  EMPLOYEE: '특정 직원',
};

/** 기본 결재선(템플릿)의 한 단계 — 사람으로 풀기 전의 규칙 */
export interface ApprovalLineRule {
  kind: ApprovalStepKind;
  resolver: ApprovalResolver;
  orgUnitId?: string | null;
  employeeId?: string | null;
}

/** 상신할 때 실제 사람으로 정해진 결재선 한 단계(신청 화면에서 고칠 수 있다) */
export interface ApprovalLineEntry {
  kind: ApprovalStepKind;
  employeeId: string;
}
