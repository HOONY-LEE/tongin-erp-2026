import i18n from '../i18n';
// 접수(리드) 관련 코드값 — 목록/상세가 같은 라벨을 쓰도록 한 곳에서 관리.
import type { StatusMap } from '../components/ui';
import { APPLE } from './palette';

export const LEAD_STATUS: StatusMap = {
  RECEIVED: { label: i18n.t('leads.st.RECEIVED'), color: 'neutral' },
  CONSULT_TOSS: { label: i18n.t('leads.st.CONSULT_TOSS'), color: 'info' },
  QUOTED: { label: i18n.t('leads.st.CONTRACT_PENDING'), color: 'warning' }, // 견적서 발송 — 화면에서는 계약미승인과 한 단계
  CONTRACT_PENDING: { label: i18n.t('leads.st.CONTRACT_PENDING'), color: 'warning' },
  CONTRACTED: { label: i18n.t('leads.st.CONTRACTED'), color: 'primary' },
  WORK_TOSS: { label: i18n.t('leads.st.WORK_TOSS'), color: 'primary' },
  DONE: { label: i18n.t('leads.st.DONE'), color: 'success' },
  CANCELED: { label: i18n.t('leads.st.CANCELED'), color: 'error' },
};

/** 접수 상태 칩 색 — 검정 계열. 진행될수록 진하게, 작업완료는 꽉 찬 검정, 반려·취소는 옅은 회색 */
export const LEAD_STATUS_COLOR: Record<string, string> = {
  RECEIVED: '#8E8E93', // 접수
  REJECTED: '#AEAEB2', // 반려(상태는 RECEIVED + rejectedAt)
  CONSULT_TOSS: '#6E6E73', // 상담토스
  QUOTED: '#545458', // 계약미승인(견적서 발송)
  CONTRACT_PENDING: '#545458', // 계약미승인
  CONTRACTED: '#3A3A3C', // 계약
  WORK_TOSS: '#1D1D1F', // 작업토스
  DONE: '#1D1D1F', // 작업완료 — 꽉 찬 검정(LEAD_STATUS_SOLID)
  CANCELED: '#AEAEB2', // 취소
};

/** 꽉 찬(검정 바탕 흰 글자) 칩으로 보일 상태 */
export const LEAD_STATUS_SOLID = new Set(['DONE']);

export const SERVICE_LINES = [
  { value: 'MOVING', label: i18n.t('leads.line.MOVING') },
  { value: 'LIVING', label: i18n.t('leads.line.LIVING') },
  { value: 'CARE', label: i18n.t('leads.line.CARE') },
  { value: 'B2B_MOVING', label: i18n.t('leads.line.B2B_MOVING') },
  { value: 'GENERAL', label: i18n.t('leads.line.GENERAL') },
];

export const RECEIPT_SOURCES = [
  // ERP 화면에서 직원이 직접 등록한 건 — CS가 상담 중 남기는 접수도 여기에 해당한다.
  { value: 'SYSTEM', label: i18n.t('leads.src.SYSTEM') },
  { value: 'HOMEPAGE', label: i18n.t('leads.src.HOMEPAGE') },
  { value: 'AIBOT', label: i18n.t('leads.src.AIBOT') },
  { value: 'PHONE', label: i18n.t('leads.src.PHONE') },
  { value: 'NAVER', label: i18n.t('leads.src.NAVER') },
  { value: 'INSTAGRAM', label: i18n.t('leads.src.INSTAGRAM') },
  { value: 'PARTNER', label: i18n.t('leads.src.PARTNER') },
  { value: 'WALK_IN', label: i18n.t('leads.src.WALK_IN') },
  { value: 'ETC', label: i18n.t('leads.src.ETC') },
];

/** 코드값을 사람이 읽는 라벨로. 모르는 코드는 원문 그대로 보여준다. */
export function codeLabel(options: { value: string; label: string }[], code?: string | null) {
  if (!code) return '-';
  return options.find((o) => o.value === code)?.label ?? code;
}
