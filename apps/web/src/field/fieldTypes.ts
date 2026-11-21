import i18n from '../i18n';
import { HANDLING_LABEL as SHARED_HANDLING_LABEL } from '../i18n/codes';
// 현장 API 응답 타입 — apps/api/src/modules/field/field.service.ts 와 1:1.

export interface FieldWorkOrder {
  id: string;
  workNo: string;
  status: string;
  scheduledDate: string | null;
  customerName: string;
  customerPhone: string | null;
  fromAddr: string | null;
  toAddr: string | null;
  crewCount: number;
}

export interface FieldLine {
  id: string;
  itemName: string;
  qty: string;
  handling: string;
  /** 처리방법 이름 — 서버가 상품관리 › 처리방법에서 채운다 */
  handlingName?: string;
  memo: string | null;
}

export interface FieldWorkOrderDetail extends FieldWorkOrder {
  contractNo: string;
  fromZipcode: string | null;
  fromAddrDetail: string | null;
  fromLat: number | null;
  fromLng: number | null;
  fromPyeong: string | null;
  fromAccess: string;
  fromAccessNote: string | null;
  toZipcode: string | null;
  toAddrDetail: string | null;
  toLat: number | null;
  toLng: number | null;
  toPyeong: string | null;
  toAccess: string;
  toAccessNote: string | null;
  workInstructions: string | null;
  totalCbm: string;
  zones: { id: string; name: string; lines: FieldLine[] }[];
  looseLines: FieldLine[];
  assignments: { id: string; name: string; resourceType: string; scheduledAt: string | null }[];
}

export const WORK_STATUS: Record<
  string,
  { label: string; color: 'neutral' | 'info' | 'success' | 'error' }
> = {
  ASSIGNED: { label: i18n.t('misc2.wo.ASSIGNED'), color: 'neutral' },
  IN_PROGRESS: { label: i18n.t('misc2.wo.IN_PROGRESS'), color: 'info' },
  DONE: { label: i18n.t('misc2.wo.DONE'), color: 'success' },
  CANCELED: { label: i18n.t('misc2.wo.CANCELED'), color: 'error' },
};

// 작업지시 라인의 handling은 서버에서 오는 문자열이라 넓은 타입으로 다시 노출한다.
export const HANDLING_LABEL: Record<string, string> = SHARED_HANDLING_LABEL;

/** 오늘 기준 YYYY-MM-DD */
export function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "8월 12일 (화)" — 현장에서 날짜만 빠르게 읽히도록 */
export function formatDay(key: string | null): string {
  if (!key) return i18n.t('misc2.noDate');
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = [
    i18n.t('misc2.dow.0'),
    i18n.t('misc2.dow.1'),
    i18n.t('misc2.dow.2'),
    i18n.t('misc2.dow.3'),
    i18n.t('misc2.dow.4'),
    i18n.t('misc2.dow.5'),
    i18n.t('misc2.dow.6'),
  ][date.getDay()];
  return i18n.t('misc2.dayShort', { v0: m, v1: d, v2: dow });
}
