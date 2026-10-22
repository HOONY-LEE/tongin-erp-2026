import type { EstimateMeta, EstimateOptionDef, MoveCatalog, VolumeUnit } from '@tongin/shared';

/** GET /estimates/:id 응답(견적 상세 화면에서 쓰는 부분) */
export interface EstimateZone {
  id: string;
  name: string;
  roomKey: string | null;
  sortOrder: number;
}
export interface EstimateLine {
  id: string;
  zoneId: string | null;
  cbmItemId: string | null;
  itemName: string;
  itemNameEng: string | null;
  cbm: string | number;
  ton: string | number | null;
  handling: string;
  memo: string | null;
}
export interface EstimateAddon {
  id: string;
  addonServiceId: string | null;
  isExtra: boolean;
  code: string | null;
  variant: string | null;
  serviceDate: string | null;
  name: string;
  amount: string | number;
  memo: string | null;
}
export interface EstimateDetailData {
  id: string;
  estimateNo: string;
  status: string;
  leadId: string;
  customerId: string;
  productId: string;
  serviceLine: string | null;
  totalCbm: string | number;
  totalTon: string | number;
  volumeUnit: VolumeUnit;
  /** 3단계를 한 번이라도 저장했나 — 아직이면 '기본선택' 상품을 미리 체크해 둔다 */
  optionsSavedAt: string | null;
  baseAmount: string | number | null;
  totalAmount: string | number | null;
  moveAmount: string | number | null;
  vatMode: string;
  vatAmount: string | number | null;
  depositAmount: string | number | null;
  balanceAmount: string | number | null;
  fromZipcode: string | null;
  fromAddr: string | null;
  fromAddrDetail: string | null;
  fromSido: string | null;
  fromSigungu: string | null;
  fromLat: number | null;
  fromLng: number | null;
  toZipcode: string | null;
  toAddr: string | null;
  toAddrDetail: string | null;
  toSido: string | null;
  toSigungu: string | null;
  toLat: number | null;
  toLng: number | null;
  fromPyeong: number | null;
  toPyeong: number | null;
  fromAccess: string;
  fromAccessNote: string | null;
  toAccess: string;
  toAccessNote: string | null;
  zones: EstimateZone[];
  lines: EstimateLine[];
  addons: EstimateAddon[];
  /** 상품 카탈로그 + 이 견적 상품 구성에서의 역할(필수·기본선택·선택, 구성 밖은 null) */
  optionCatalog: EstimateOptionDef[];
  /** 2단계 물품정보 — 방 틀·이사물품·처리방법 */
  moveCatalog: MoveCatalog;
  lead: { id: string; leadNo: string; visitDate: string | null; moveDate: string | null } | null;
  meta: EstimateMeta;
}

/** 탭 공통 props — 저장하면 서버가 돌려준 최신 상세로 화면 전체를 갱신한다 */
export interface TabProps {
  data: EstimateDetailData;
  canEdit: boolean;
  onSaved: (next: EstimateDetailData) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export const won = (v: unknown) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '-' : `${Number(v).toLocaleString()}원`;

/** 숫자 입력 문자열 → 숫자(빈칸은 0). 콤마가 섞여 들어와도 받아 준다. */
export const toNum = (v: string) => {
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
