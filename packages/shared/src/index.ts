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
/** 진행상태 라벨 — 화면과 견적서 문서가 같은 표기를 쓰도록 공용으로 둔다 */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  RECEIVED: '접수',
  CONSULT_ASSIGNED: '상담배정',
  CONSULT_TOSS: '상담토스',
  QUOTED: '견적완료',
  CONTRACTED: '계약',
  WORK_TOSS: '작업토스',
  IN_PROGRESS: '작업중',
  DONE: '완료',
  CANCELED: '취소',
};

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

// 품목 처리구분 — 현장 견적 실무의 6종(운반/폐기/하역/경유/방치/업체).
export const HANDLING = ['CARRY', 'DISPOSE', 'UNLOAD', 'VIA', 'LEAVE', 'VENDOR'] as const;
export type Handling = (typeof HANDLING)[number];
/** 화면·문서 공용 라벨 */
export const HANDLING_LABEL: Record<Handling, string> = {
  CARRY: '운반',
  DISPOSE: '폐기',
  UNLOAD: '하역', // 내려만 주고 이사짐으로 싣지 않는 짐 — 폐기물량으로 집계
  VIA: '경유', // 목적지 전에 다른 곳에 들르는 짐
  LEAVE: '방치', // 두고 가는 짐 — 물량에 넣지 않는다
  VENDOR: '업체', // 다른 업체가 처리 — 물량에 넣지 않는다
};

/** 물량 요약 — 이사물량(운반) / 경유물량 / 폐기물량(폐기+하역). 방치·업체는 넣지 않는다. */
export interface VolumeSummary {
  moving: number;
  transit: number;
  discard: number;
  total: number;
}
export function summarizeVolume(
  lines: { cbm: number | string | { toString(): string }; handling: string }[],
): VolumeSummary {
  let moving = 0;
  let transit = 0;
  let discard = 0;
  for (const l of lines) {
    const cbm = Number(l.cbm) || 0;
    if (l.handling === 'CARRY') moving += cbm;
    else if (l.handling === 'VIA') transit += cbm;
    else if (l.handling === 'DISPOSE' || l.handling === 'UNLOAD') discard += cbm;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    moving: r(moving),
    transit: r(transit),
    discard: r(discard),
    total: r(moving + transit + discard),
  };
}

/**
 * 견적 물품 입력 기본 틀 — 방(위치)과 방마다 기본으로 펼쳐 둘 물품.
 * 견적사원은 값이 있는 물품만 채우고, 저장은 채운 물품만 한다(빈 행은 저장하지 않음).
 * 목록에 없는 물품은 방마다 직접 추가할 수 있다.
 */
export interface RoomPreset {
  key: string;
  name: string;
  nameEng: string;
  items: { name: string; nameEng: string }[];
}
const BEDROOM_ITEMS: RoomPreset['items'] = [
  { name: '장롱', nameEng: 'Wardrobe' },
  { name: '이불', nameEng: 'Bedding' },
  { name: '의류', nameEng: 'Clothes' },
  { name: '침대', nameEng: 'Bed' },
  { name: '협탁', nameEng: 'Side Table' },
  { name: '책장', nameEng: 'Bookshelf' },
  { name: '책', nameEng: 'Books' },
  { name: '장식장', nameEng: 'Display Cabinet' },
  { name: '공기청정기', nameEng: 'Air Purifier' },
  { name: '고가구', nameEng: 'Antique Furniture' },
  { name: '화장대', nameEng: 'Dresser' },
  { name: '서랍장', nameEng: 'Drawers' },
  { name: '탁자/책상', nameEng: 'Table, Desk' },
  { name: '의자', nameEng: 'Chair' },
  { name: '홈시어터', nameEng: 'Home Theater' },
  { name: '오디오', nameEng: 'Audio' },
  { name: '컴퓨터', nameEng: 'Computer' },
  { name: '피아노', nameEng: 'Piano' },
  { name: '에어컨', nameEng: 'Air Conditioner' },
  { name: '장난감', nameEng: 'Toys' },
  { name: 'BOX류', nameEng: 'Boxes' },
  { name: '에어드레서', nameEng: 'Air Dresser' },
];
export const ROOM_PRESETS: RoomPreset[] = [
  { key: 'MASTER', name: '안방', nameEng: "MASTER'S ROOM", items: BEDROOM_ITEMS },
  { key: 'BED1', name: '건너방', nameEng: 'BEDROOM', items: BEDROOM_ITEMS },
  { key: 'BED2', name: '건너방2', nameEng: 'BEDROOM 2', items: BEDROOM_ITEMS },
  { key: 'BED3', name: '건너방3', nameEng: 'BEDROOM 3', items: BEDROOM_ITEMS },
  { key: 'BED4', name: '건너방4', nameEng: 'BEDROOM 4', items: BEDROOM_ITEMS },
  {
    key: 'LIVING',
    name: '거실',
    nameEng: 'LIVING ROOM',
    items: [
      { name: '소파', nameEng: 'Sofa' },
      { name: '탁자', nameEng: 'Table' },
      { name: '책', nameEng: 'Books' },
      { name: '책상', nameEng: 'Desk' },
      { name: '고가구', nameEng: 'Antique Furniture' },
      { name: '도자기류', nameEng: 'Chinaware' },
      { name: '홈시어터', nameEng: 'Home Theater' },
      { name: '오디오', nameEng: 'Audio' },
      { name: '장식장', nameEng: 'Display Cabinet' },
      { name: '장식품', nameEng: 'Ornaments' },
      { name: '에어컨', nameEng: 'Air Conditioner' },
      { name: '콘솔', nameEng: 'Console' },
      { name: '거실장', nameEng: 'TV Cabinet' },
      { name: '에어드레서', nameEng: 'Air Dresser' },
      { name: '공기청정기', nameEng: 'Air Purifier' },
    ],
  },
  {
    key: 'KITCHEN',
    name: '주방',
    nameEng: 'KITCHEN',
    items: [
      { name: '식탁/의자', nameEng: 'Dining Table, Chair' },
      { name: '장식장', nameEng: 'Display Cabinet' },
      { name: '수납장', nameEng: 'Storage Cabinet' },
      { name: '냉장고', nameEng: 'Refrigerator' },
      { name: '정수기냉장고', nameEng: 'Water Purifier Refrigerator' },
      { name: '냉동고', nameEng: 'Freezer' },
      { name: '식기세척기', nameEng: 'Dishwasher' },
      { name: '식기건조기', nameEng: 'Dish Dryer' },
      { name: '김치냉장고', nameEng: 'Kimchi Refrigerator' },
      { name: '가스레인지', nameEng: 'Gas Range' },
      { name: '전자레인지', nameEng: 'Microwave' },
      { name: '쌀통', nameEng: 'Rice Bin' },
      { name: '식기류', nameEng: 'Dishes' },
      { name: '정수기', nameEng: 'Water Purifier' },
    ],
  },
  {
    key: 'BALCONY_FRONT',
    name: '앞 발코니',
    nameEng: 'FRONT BALCONY',
    items: [
      { name: '화분', nameEng: 'Flower Pots' },
      { name: '항아리', nameEng: 'Jars' },
      { name: '운동기구', nameEng: 'Exercise Equipment' },
      { name: '자전거', nameEng: 'Bicycle' },
    ],
  },
  {
    key: 'BALCONY_BACK',
    name: '뒤 발코니',
    nameEng: 'BACK BALCONY',
    items: [{ name: '세탁기/건조기', nameEng: 'Washer, Dryer' }],
  },
  {
    key: 'ETC',
    name: '다용도실·현관·화장실·창고',
    nameEng: 'ETC',
    items: [{ name: '신발류', nameEng: 'Shoes' }],
  },
];

/**
 * 견적 옵션 정의 — 견적서 3단계(옵션선택)에서 고르는 항목.
 * 가격은 카탈로그에 두지 않고 견적마다 견적사원이 입력한다(현장 조건마다 달라서).
 *  - variants: 같은 서비스 안의 종류(입주청소 일반/프리미엄 등)
 *  - hasDate: 서비스 요청일을 받는다 / hasNote: 내용을 적는다
 */
export type EstimateOptionGroup = 'LADDER' | 'LIVING' | 'ASSEMBLY' | 'ETC';
export interface EstimateOptionDef {
  code: string;
  group: EstimateOptionGroup;
  label: string;
  variants?: { value: string; label: string }[];
  hasDate?: boolean;
  hasNote?: boolean;
}
/** 분해/설치는 물품마다 분해만·설치만·둘 다를 고른다 */
export const ASSEMBLY_VARIANTS = [
  { value: 'BOTH', label: '분해·설치' },
  { value: 'DISASSEMBLE', label: '분해만' },
  { value: 'INSTALL', label: '설치만' },
];
const asm = (code: string, label: string, hasNote = false): EstimateOptionDef => ({
  code: `ASM_${code}`,
  group: 'ASSEMBLY',
  label,
  variants: ASSEMBLY_VARIANTS,
  hasNote,
});
export const ESTIMATE_OPTIONS: EstimateOptionDef[] = [
  { code: 'LADDER_BEFORE', group: 'LADDER', label: '사다리차 서비스(전)' },
  { code: 'LADDER_AFTER', group: 'LADDER', label: '사다리차 서비스(후)' },
  {
    code: 'MOVE_IN_CLEANING',
    group: 'LIVING',
    label: '입주청소서비스',
    variants: [
      { value: 'STANDARD', label: '일반' },
      { value: 'PREMIUM', label: '프리미엄' },
    ],
    hasDate: true,
  },
  {
    code: 'APPLIANCE_CLEANING',
    group: 'LIVING',
    label: '가전청소서비스',
    variants: [
      { value: 'AIRCON', label: '에어컨' },
      { value: 'WASHER', label: '세탁기' },
    ],
    hasDate: true,
  },
  {
    code: 'ORGANIZING',
    group: 'LIVING',
    label: '정리수납서비스',
    variants: [
      { value: 'STANDARD', label: '일반' },
      { value: 'VIP', label: 'VIP' },
    ],
    hasDate: true,
  },
  { code: 'DEODORIZING', group: 'LIVING', label: '탈취살균(새집증후군)서비스', hasDate: true },
  { code: 'PIPE_CARE', group: 'LIVING', label: '배관케어서비스', hasDate: true },
  { code: 'MATTRESS_CARE', group: 'LIVING', label: '매트리스케어', hasDate: true },
  { code: 'APRON', group: 'LIVING', label: '에이프런서비스', hasDate: true },
  { code: 'MOVJE_DIRECTOR', group: 'LIVING', label: '무브제 디렉터 상담', hasDate: true },
  { code: 'OTHER_SERVICE', group: 'LIVING', label: '기타서비스', hasDate: true, hasNote: true },
  asm('WARDROBE_NORMAL', '일반 장롱'),
  asm('WARDROBE_SLIDE', '슬라이드 장롱'),
  asm('SYSTEM_HANGER', '시스템 행거'),
  asm('DESK_SET', '책상/책장 세트'),
  asm('WALL_TV', '벽걸이 TV'),
  asm('AIRCON', '에어컨'),
  asm('FRIDGE', '정수기/냉장고'),
  asm('STONE_BED_SINGLE', '돌침대(싱글)'),
  asm('STONE_BED_DOUBLE', '돌침대(더블)'),
  asm('SAFE', '금고'),
  asm('ETC', '기타', true),
  { code: 'STORAGE', group: 'ETC', label: '보관비용', hasNote: true },
];
export const ESTIMATE_OPTION_BY_CODE: Record<string, EstimateOptionDef> = Object.fromEntries(
  ESTIMATE_OPTIONS.map((o) => [o.code, o]),
);
/** 견적서·목록에 쓰는 옵션 표기 — "입주청소서비스(프리미엄)", "일반 장롱 분해·설치" */
export function optionLabel(code: string, variant?: string | null): string {
  const def = ESTIMATE_OPTION_BY_CODE[code];
  if (!def) return code;
  const v = def.variants?.find((x) => x.value === variant)?.label;
  if (!v) return def.label;
  return def.group === 'ASSEMBLY' ? `${def.label} ${v}` : `${def.label}(${v})`;
}

// EST: 작업조건(전/후) — 짐을 내리고 올리는 방법. 견적 단가·인원 산정의 근거가 된다.
export const ACCESS_METHODS = ['NONE', 'LADDER', 'ELEVATOR', 'STAIRS', 'ETC'] as const;
export type AccessMethod = (typeof ACCESS_METHODS)[number];
export const ACCESS_LABEL: Record<AccessMethod, string> = {
  NONE: '선택안함',
  LADDER: '사다리차',
  ELEVATOR: '엘리베이터',
  STAIRS: '계단',
  ETC: '기타',
};

/**
 * 견적서 메타 — 견적 한 장에 필요한 머리 정보를 접수·계약·작업에서 모아 온 것.
 * 따로 저장하지 않고 조회할 때마다 원본에서 모은다(원본이 바뀌면 견적서도 따라가야 하므로).
 * 날짜는 모두 'YYYY-MM-DD'(한국 시간 기준) 문자열이다.
 */
export interface EstimateMeta {
  customerName: string | null;
  customerPhone: string | null;
  contractId: string | null; // 이미 계약됐으면 그 계약(견적 화면에서 바로 이동)
  contractNo: string | null;
  estimatorName: string | null;
  estimatorPhone: string | null;
  leadStatus: LeadStatus | null;
  productName: string | null;
  orgUnitName: string | null;
  receivedDate: string | null; // 접수일
  consultDate: string | null; // 상담일(방문견적일)
  contractDate: string | null; // 계약일
  workDate: string | null; // 작업일(이사일)
}

// EST: 부가세 처리 — 상품/거래처에 따라 견적서에 포함으로 적기도 하고 별도로 적기도 한다.
export const VAT_MODES = ['EXCLUDED', 'INCLUDED'] as const;
export type VatMode = (typeof VAT_MODES)[number];

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
// 현장 작업팀 역할 (APP-03): 본인에게 배정된 작업만 조회 + 시작·완료. 로그인 시 현장 화면으로 진입
export const ROLE_FIELD = 'FIELD';

/** 이 역할들은 로그인 시 관리자 ERP가 아니라 현장 화면(/field)으로 들어간다. */
export const FIELD_ROLES: string[] = [ROLE_FIELD, ROLE_OUTSOURCE];

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
  employeeId: string | null; // 직원 계정이면 연결된 직원(현장 배정 조회에 사용). 외부인·에이전트는 null
  employeeName: string | null; // 연결된 직원 이름(담당자 기본값 표시용). employeeId가 null이면 null
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
