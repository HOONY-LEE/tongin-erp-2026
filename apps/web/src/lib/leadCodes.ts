// 접수(리드) 관련 코드값 — 목록/상세가 같은 라벨을 쓰도록 한 곳에서 관리.
import type { StatusMap } from '../components/ui';

export const LEAD_STATUS: StatusMap = {
  RECEIVED: { label: '접수', color: 'neutral' },
  CONSULT_ASSIGNED: { label: '상담배정', color: 'info' },
  CONSULT_TOSS: { label: '상담토스', color: 'info' },
  QUOTED: { label: '견적완료', color: 'warning' },
  CONTRACTED: { label: '계약', color: 'primary' },
  WORK_TOSS: { label: '작업토스', color: 'primary' },
  IN_PROGRESS: { label: '작업중', color: 'info' },
  DONE: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

export const SERVICE_LINES = [
  { value: 'MOVING', label: '이사(무빙)' },
  { value: 'LIVING', label: '리빙' },
  { value: 'CARE', label: '케어' },
  { value: 'B2B_MOVING', label: '기업이전' },
  { value: 'GENERAL', label: '일반' },
];

export const RECEIPT_SOURCES = [
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
