// 접수(리드) 관련 코드값 — 목록/상세가 같은 라벨을 쓰도록 한 곳에서 관리.
import type { StatusMap } from '../components/ui';
import { APPLE } from './palette';

export const LEAD_STATUS: StatusMap = {
  RECEIVED: { label: '접수', color: 'neutral' },
  CONSULT_TOSS: { label: '상담토스', color: 'info' },
  QUOTED: { label: '계약미승인', color: 'warning' }, // 견적서 발송 — 화면에서는 계약미승인과 한 단계
  CONTRACT_PENDING: { label: '계약미승인', color: 'warning' },
  CONTRACTED: { label: '계약', color: 'primary' },
  WORK_TOSS: { label: '작업토스', color: 'primary' },
  DONE: { label: '작업완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

/** 접수 상태 칩 색 — 연한 바탕 + 같은 색 글자. 상태마다 확실히 다른 색 */
export const LEAD_STATUS_COLOR: Record<string, string> = {
  RECEIVED: APPLE.gray, // 접수
  REJECTED: APPLE.red, // 반려(상태는 RECEIVED + rejectedAt)
  CONSULT_TOSS: APPLE.cyan, // 상담토스 — 하늘색
  QUOTED: APPLE.orange, // 계약미승인(견적서 발송)
  CONTRACT_PENDING: APPLE.orange, // 계약미승인
  CONTRACTED: APPLE.green, // 계약
  WORK_TOSS: APPLE.blue, // 작업토스 — 파랑
  DONE: APPLE.purple, // 작업완료
  CANCELED: '#1D1D1F', // 취소 — 검정
};

export const SERVICE_LINES = [
  { value: 'MOVING', label: '이사(무빙)' },
  { value: 'LIVING', label: '리빙' },
  { value: 'CARE', label: '케어' },
  { value: 'B2B_MOVING', label: '기업이전' },
  { value: 'GENERAL', label: '일반' },
];

export const RECEIPT_SOURCES = [
  // ERP 화면에서 직원이 직접 등록한 건 — CS가 상담 중 남기는 접수도 여기에 해당한다.
  { value: 'SYSTEM', label: '시스템' },
  { value: 'HOMEPAGE', label: '홈페이지' },
  { value: 'AIBOT', label: 'AI상담봇' },
  { value: 'PHONE', label: '전화상담' },
  { value: 'NAVER', label: '네이버' },
  { value: 'INSTAGRAM', label: '인스타그램' },
  { value: 'PARTNER', label: '제휴사' },
  { value: 'WALK_IN', label: '방문접수' },
  { value: 'ETC', label: '기타' },
];

/** 코드값을 사람이 읽는 라벨로. 모르는 코드는 원문 그대로 보여준다. */
export function codeLabel(options: { value: string; label: string }[], code?: string | null) {
  if (!code) return '-';
  return options.find((o) => o.value === code)?.label ?? code;
}
