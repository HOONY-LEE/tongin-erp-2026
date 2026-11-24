// ── 위젯 스튜디오 ──
// 관리자가 위젯을 직접 만든다(자연어로 AI에게 맡기거나 손으로). 위젯은 '설계서(스펙)'라는 데이터일 뿐이고,
// 서버의 공통 실행기가 아래 데이터 카탈로그(측정값·차원)로만 SQL을 만든다 — 그래서 배포 없이 새 위젯이 생기고,
// 권한·지점 범위는 화면에서 볼 때와 똑같이 걸린다(지점 직원은 자기 지점 숫자만).
import {
  DASH_PERIODS,
  type DashData,
  type DashFormat,
  type DashPeriod,
  type DashViz,
} from './dashboard';

/** 시간 단위 */
export const STUDIO_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type StudioGrain = (typeof STUDIO_GRAINS)[number];
export const STUDIO_GRAIN_LABEL: Record<StudioGrain, string> = {
  day: '일간',
  week: '주간',
  month: '월간',
  quarter: '분기',
  year: '연간',
};

/** 차원 종류 — cat: 항목(상태·경로…), time: 날짜, geo: 시도(지도로 그릴 수 있다), org: 지점 */
export type StudioDimKind = 'cat' | 'time' | 'geo' | 'org';
export interface StudioDimension {
  key: string;
  label: string;
  kind: StudioDimKind;
  description?: string;
}
export interface StudioMeasure {
  key: string;
  label: string;
  format: DashFormat;
  description?: string;
}
/** 건마다 있는 숫자 칸 — 분포(히스토그램·박스플롯)는 이 값을 한 건씩 센다 */
export interface StudioField {
  key: string;
  label: string;
  format: DashFormat;
  /** 단위 이름(일·원) — 축 표기용 */
  unit?: string;
}

/** 데이터 고르기 목록의 묶음(영업·운영·고객…) — 화면 이름은 studio.dsGroup.<key> */
export const STUDIO_DATASET_GROUPS = [
  { key: 'sales', label: '영업' },
  { key: 'ops', label: '운영' },
  { key: 'customer', label: '고객·상담' },
  { key: 'finance', label: '입금·청구' },
  { key: 'hr', label: '인사' },
  { key: 'work', label: '업무·총무' },
  { key: 'branch', label: '지점·가맹' },
] as const;
export type StudioDatasetGroup = (typeof STUDIO_DATASET_GROUPS)[number]['key'];

export interface StudioDataset {
  key: string;
  label: string;
  description: string;
  /** 목록 묶음 */
  group: StudioDatasetGroup;
  /** 이 데이터를 보려면 필요한 권한 — 여러 개면 그중 하나(영업 CRM: 가맹·기업영업 중 볼 수 있는 파이프라인만) */
  perm: string | string[];
  /** 기간 필터 기본 날짜 칸 */
  defaultTime: string;
  dimensions: StudioDimension[];
  measures: StudioMeasure[];
  /** 분포용 숫자 칸(없으면 히스토그램·박스플롯을 못 쓴다) */
  fields: StudioField[];
}

const ORG_DIM: StudioDimension = { key: 'org', label: '담당 지점', kind: 'org' };
const WEEKDAY_DIM: StudioDimension = { key: 'weekday', label: '요일', kind: 'cat' };

/**
 * 데이터 카탈로그 — 위젯이 쓸 수 있는 것은 여기 있는 것뿐이다(서버가 같은 key로 SQL 조각을 갖고 있다).
 * 새 측정값·차원을 쓰고 싶으면 여기와 서버 실행기에 한 줄씩 더한다.
 * key는 저장된 위젯이 가리키므로 바꾸지 않는다. 순서는 데이터 고르기 목록 순서(묶음 안에서).
 */
export const STUDIO_DATASETS: StudioDataset[] = [
  // ── 영업 ──
  {
    key: 'lead',
    label: '접수',
    description: '고객 이사·리빙·케어 문의 접수 건',
    group: 'sales',
    perm: 'LEAD.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '접수일', kind: 'time' },
      { key: 'moveDate', label: '서비스 요청일(이사일)', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'source', label: '접수경로', kind: 'cat' },
      { key: 'serviceLine', label: '상품 종류', kind: 'cat' },
      {
        key: 'product',
        label: '상품',
        kind: 'cat',
        description: '가장 최근 견적의 상품(견적 전이면 미지정)',
      },
      { key: 'fromSido', label: '출발지 시도', kind: 'geo' },
      ORG_DIM,
      { key: 'contracted', label: '계약 여부', kind: 'cat', description: '계약 / 미계약' },
    ],
    measures: [
      { key: 'count', label: '접수 건수', format: 'count' },
      { key: 'expectedAmount', label: '예상 금액 합계', format: 'won' },
      {
        key: 'conversion',
        label: '계약 전환율',
        format: 'percent',
        description: '계약 이후 단계까지 간 접수 ÷ 전체 접수',
      },
    ],
    fields: [
      { key: 'expectedAmount', label: '예상 금액', format: 'won' },
      { key: 'leadDays', label: '접수~이사일 일수', format: 'count', unit: '일' },
    ],
  },
  {
    key: 'estimate',
    label: '견적',
    description: '접수마다 만든 견적서(이사 물량·금액·상품). 견적 금액·견적→계약 전환율을 본다',
    group: 'sales',
    perm: 'ESTIMATE.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '견적일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'product', label: '상품', kind: 'cat' },
      { key: 'serviceLine', label: '상품 종류', kind: 'cat' },
      { key: 'fromSido', label: '출발지 시도', kind: 'geo' },
      { key: 'toSido', label: '도착지 시도', kind: 'cat' },
      ORG_DIM,
      { key: 'contracted', label: '계약 여부', kind: 'cat', description: '서명된 계약이 있나' },
    ],
    measures: [
      { key: 'count', label: '견적 건수', format: 'count' },
      { key: 'amount', label: '견적 금액 합계', format: 'won' },
      { key: 'avgAmount', label: '평균 견적 금액', format: 'won' },
      { key: 'avgCbm', label: '평균 물량(CBM)', format: 'number' },
      {
        key: 'conversion',
        label: '견적→계약 전환율',
        format: 'percent',
        description: '서명된 계약으로 이어진 견적 ÷ 전체 견적',
      },
    ],
    fields: [
      { key: 'totalAmount', label: '견적 금액', format: 'won' },
      { key: 'totalCbm', label: '물량(CBM)', format: 'number', unit: 'CBM' },
      { key: 'distanceKm', label: '이동 거리(km)', format: 'number', unit: 'km' },
    ],
  },
  {
    key: 'contract',
    label: '계약',
    description: '서명된 계약(취소 제외는 상태로 거른다)',
    group: 'sales',
    perm: 'CONTRACT.READ',
    defaultTime: 'signedAt',
    dimensions: [
      { key: 'signedAt', label: '서명일', kind: 'time' },
      { key: 'contractDate', label: '계약일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'serviceLine', label: '상품 종류', kind: 'cat' },
      { key: 'product', label: '상품', kind: 'cat' },
      { key: 'source', label: '접수경로', kind: 'cat' },
      { key: 'fromSido', label: '출발지 시도', kind: 'geo' },
      ORG_DIM,
    ],
    measures: [
      { key: 'revenue', label: '매출(계약 총액)', format: 'won' },
      { key: 'count', label: '계약 건수', format: 'count' },
      { key: 'avgAmount', label: '평균 계약 금액', format: 'won' },
      { key: 'deposit', label: '계약금 합계', format: 'won' },
    ],
    fields: [
      { key: 'totalAmount', label: '계약 금액', format: 'won' },
      { key: 'depositAmount', label: '계약금', format: 'won' },
      { key: 'signDays', label: '접수~서명 일수', format: 'count', unit: '일' },
    ],
  },
  {
    key: 'crm_lead',
    label: '영업 CRM(가맹·기업영업)',
    description:
      '가맹점 모집(가맹 영업)·기업 이전(기업영업) 영업 리드. 이사 고객 접수와 별개. 단계·유입 경로·수주율·상담 횟수',
    group: 'sales',
    perm: ['FRANCHISE.READ', 'B2B_CRM.READ'],
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '등록일', kind: 'time' },
      { key: 'expectedAt', label: '예정일(개점·이전)', kind: 'time' },
      { key: 'pipeline', label: '파이프라인', kind: 'cat', description: '가맹 영업 / 기업영업' },
      { key: 'stage', label: '단계', kind: 'cat' },
      {
        key: 'phase',
        label: '진행 구분',
        kind: 'cat',
        description: '리드 / 진행 / 계약·수주 / 보류·실패',
      },
      { key: 'source', label: '유입 경로', kind: 'cat' },
      { key: 'interest', label: '관심도', kind: 'cat' },
      { key: 'owner', label: '영업 담당자', kind: 'cat' },
      { key: 'region', label: '지역', kind: 'cat' },
    ],
    measures: [
      { key: 'count', label: '리드 수', format: 'count' },
      { key: 'amount', label: '예상 금액 합계', format: 'won' },
      {
        key: 'wonRate',
        label: '계약·수주율',
        format: 'percent',
        description: '계약 완료(수주) 단계 ÷ 전체 리드',
      },
      {
        key: 'activities',
        label: '상담 횟수',
        format: 'number',
        description: '통화·문자·메일·미팅·메모 기록 수(단계 변경 자동 기록 제외)',
      },
    ],
    fields: [{ key: 'amount', label: '예상 금액', format: 'won' }],
  },
  {
    key: 'crm_activity',
    label: '영업 상담 기록',
    description: '영업 CRM 리드에 남긴 통화·문자·메일·미팅·메모와 단계 변경 — 영업 활동량',
    group: 'sales',
    perm: ['FRANCHISE.READ', 'B2B_CRM.READ'],
    defaultTime: 'at',
    dimensions: [
      { key: 'at', label: '기록일', kind: 'time' },
      { key: 'kind', label: '기록 종류', kind: 'cat' },
      { key: 'pipeline', label: '파이프라인', kind: 'cat' },
      { key: 'toStage', label: '바뀐 단계', kind: 'cat', description: '단계 변경 기록만' },
      { key: 'actor', label: '기록한 사람', kind: 'cat' },
    ],
    measures: [
      { key: 'count', label: '기록 수', format: 'count' },
      { key: 'leads', label: '상담한 리드 수', format: 'count' },
    ],
    fields: [],
  },
  // ── 운영 ──
  {
    key: 'work',
    label: '작업',
    description: '이사 작업 지시',
    group: 'ops',
    perm: 'WORK_ORDER.READ',
    defaultTime: 'scheduledDate',
    dimensions: [
      { key: 'scheduledDate', label: '작업일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      ORG_DIM,
    ],
    measures: [{ key: 'count', label: '작업 건수', format: 'count' }],
    fields: [],
  },
  {
    key: 'service_order',
    label: '리빙·케어 주문',
    description: '홈케어·청소·새집증후군 등 리빙·케어 서비스 주문(이사 견적과 별개, 취소 제외)',
    group: 'ops',
    perm: 'SERVICE_ORDER.READ',
    defaultTime: 'scheduledDate',
    dimensions: [
      { key: 'scheduledDate', label: '서비스일', kind: 'time' },
      { key: 'createdAt', label: '주문일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'serviceLine', label: '상품 종류', kind: 'cat' },
      { key: 'product', label: '상품', kind: 'cat' },
      ORG_DIM,
    ],
    measures: [
      { key: 'count', label: '주문 건수', format: 'count' },
      { key: 'amount', label: '주문 금액 합계', format: 'won' },
      { key: 'avgAmount', label: '평균 주문 금액', format: 'won' },
    ],
    fields: [{ key: 'amount', label: '주문 금액', format: 'won' }],
  },
  {
    key: 'material_order',
    label: '자재 발주',
    description: '지점이 본사에 낸 박스·포장재·유니폼 발주(취소 제외)',
    group: 'ops',
    perm: 'MATERIAL_ORDER.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '발주일', kind: 'time' },
      { key: 'shippedAt', label: '출고일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'org', label: '발주 지점', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '발주 건수', format: 'count' },
      { key: 'qty', label: '발주 수량', format: 'number' },
    ],
    fields: [{ key: 'qty', label: '발주 수량', format: 'number', unit: '개' }],
  },
  {
    key: 'stock',
    label: '자재 입출고',
    description: '자재 입고·출고·조정 수불 기록(수량). 품목·분류별 사용량',
    group: 'ops',
    perm: 'MATERIAL.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '수불일', kind: 'time' },
      { key: 'type', label: '구분(입고·출고·조정)', kind: 'cat' },
      { key: 'material', label: '자재', kind: 'cat' },
      { key: 'category', label: '자재 분류', kind: 'cat' },
      { key: 'org', label: '창고·지점', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '수불 건수', format: 'count' },
      { key: 'inQty', label: '입고 수량', format: 'number' },
      { key: 'outQty', label: '출고 수량', format: 'number' },
      { key: 'netQty', label: '순증감 수량', format: 'number' },
    ],
    fields: [],
  },
  // ── 고객·상담 ──
  {
    key: 'customer',
    label: '고객',
    description: '고객 원장',
    group: 'customer',
    perm: 'CUSTOMER.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '등록일', kind: 'time' },
      { key: 'grade', label: '등급', kind: 'cat' },
      ORG_DIM,
    ],
    measures: [{ key: 'count', label: '고객 수', format: 'count' }],
    fields: [],
  },
  {
    key: 'support',
    label: '고객지원(A/S·CS)',
    description: '고객 문의·A/S 접수',
    group: 'customer',
    perm: 'SUPPORT.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '접수일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'kind', label: '종류(A/S·CS)', kind: 'cat' },
      { key: 'category', label: '접수 유형', kind: 'cat' },
      { key: 'priority', label: '우선순위', kind: 'cat' },
      { key: 'channel', label: '채널', kind: 'cat' },
      ORG_DIM,
    ],
    measures: [{ key: 'count', label: '접수 건수', format: 'count' }],
    fields: [],
  },
  {
    key: 'cs_call',
    label: '상담 전화(콜센터)',
    description:
      '대표번호로 들어온 상담 전화(취소 제외). 시간대별 콜 수·부재중(콜백 전환) 비율·평균 통화 시간·접수 전환율',
    group: 'customer',
    perm: 'CS_CALL.ALL',
    defaultTime: 'receivedAt',
    dimensions: [
      { key: 'receivedAt', label: '수신일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'hour', label: '시간대', kind: 'cat' },
      WEEKDAY_DIM,
      { key: 'missed', label: '연결 구분', kind: 'cat', description: '바로 연결 / 콜백 전환' },
      { key: 'agent', label: '상담원', kind: 'cat' },
      { key: 'org', label: '상담원 소속', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '콜 수', format: 'count' },
      {
        key: 'missedRate',
        label: '부재중(콜백 전환) 비율',
        format: 'percent',
        description: '상담원이 바로 받지 못해 콜백 대기로 넘어간 콜 ÷ 전체 콜',
      },
      { key: 'avgMinutes', label: '평균 통화 시간(분)', format: 'number' },
      { key: 'totalMinutes', label: '총 통화 시간(분)', format: 'number' },
      {
        key: 'leadRate',
        label: '접수 전환율',
        format: 'percent',
        description: '상담 중 접수를 등록한 콜 ÷ 전체 콜',
      },
    ],
    fields: [{ key: 'minutes', label: '통화 시간(분)', format: 'number', unit: '분' }],
  },
  {
    key: 'cs_sms',
    label: '상담 문자',
    description: '상담 콘솔에서 고객에게 보낸 문자',
    group: 'customer',
    perm: 'CS_CALL.ALL',
    defaultTime: 'at',
    dimensions: [
      { key: 'at', label: '보낸 날', kind: 'time' },
      { key: 'result', label: '결과', kind: 'cat' },
      { key: 'sender', label: '보낸 사람', kind: 'cat' },
      { key: 'org', label: '보낸 사람 소속', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '문자 수', format: 'count' },
      { key: 'successRate', label: '발송 성공률', format: 'percent' },
    ],
    fields: [],
  },
  {
    key: 'campaign',
    label: '캠페인 발송',
    description: '마케팅 캠페인(문자·알림톡) 받는 사람별 발송 결과. 지점 범위면 내가 만든 캠페인만',
    group: 'customer',
    perm: 'MARKETING.READ',
    defaultTime: 'sentAt',
    dimensions: [
      { key: 'sentAt', label: '발송일', kind: 'time' },
      { key: 'status', label: '발송 결과', kind: 'cat' },
      { key: 'channel', label: '채널', kind: 'cat' },
      { key: 'campaign', label: '캠페인', kind: 'cat' },
      { key: 'ad', label: '광고 여부', kind: 'cat' },
    ],
    measures: [
      { key: 'count', label: '받는 사람 수', format: 'count' },
      { key: 'sent', label: '발송 성공 수', format: 'count' },
      {
        key: 'failRate',
        label: '발송 실패율',
        format: 'percent',
        description: '실패 ÷ (성공 + 실패)',
      },
      { key: 'campaigns', label: '캠페인 수', format: 'count' },
    ],
    fields: [],
  },
  // ── 입금·청구 ──
  {
    key: 'payment',
    label: '입금',
    description: '계약금·잔금 입금',
    group: 'finance',
    perm: 'PAYMENT.READ',
    defaultTime: 'paidAt',
    dimensions: [
      { key: 'paidAt', label: '입금일', kind: 'time' },
      { key: 'kind', label: '구분(계약금·잔금)', kind: 'cat' },
      { key: 'method', label: '결제 수단', kind: 'cat' },
      { key: 'status', label: '상태', kind: 'cat' },
      ORG_DIM,
    ],
    measures: [
      { key: 'amount', label: '입금액', format: 'won' },
      { key: 'count', label: '입금 건수', format: 'count' },
    ],
    fields: [{ key: 'amount', label: '입금액', format: 'won' }],
  },
  {
    key: 'invoice',
    label: '청구(거래처)',
    description:
      '전속·기업 거래처에 발행한 청구서와 수금(발행·수금 완료만). 청구액·수금액·미수금·수금률',
    group: 'finance',
    perm: 'BILLING.READ',
    defaultTime: 'issuedAt',
    dimensions: [
      { key: 'issuedAt', label: '발행일', kind: 'time' },
      { key: 'dueDate', label: '수금 기한', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'overdue', label: '연체 여부', kind: 'cat', description: '기한이 지났는데 수금 전' },
      { key: 'partner', label: '거래처', kind: 'cat' },
      ORG_DIM,
    ],
    measures: [
      { key: 'amount', label: '청구액', format: 'won' },
      { key: 'count', label: '청구 건수', format: 'count' },
      { key: 'received', label: '수금액', format: 'won' },
      { key: 'outstanding', label: '미수금', format: 'won' },
      { key: 'collectionRate', label: '수금률', format: 'percent', description: '수금액 ÷ 청구액' },
    ],
    fields: [{ key: 'amount', label: '청구액', format: 'won' }],
  },
  // ── 인사 ──
  {
    key: 'employee',
    label: '직원(인원)',
    description:
      '직원 인원 현황 — 소속·직책·고용 형태별 재직 인원, 입사·퇴사 추이, 근속 연수. 기간은 입사일 기준이라 현재 인원은 기간 전체로',
    group: 'hr',
    perm: 'EMPLOYEE.READ',
    defaultTime: 'hireDate',
    dimensions: [
      { key: 'hireDate', label: '입사일', kind: 'time' },
      { key: 'resignDate', label: '퇴사일', kind: 'time' },
      { key: 'org', label: '소속', kind: 'org' },
      { key: 'position', label: '직책', kind: 'cat' },
      { key: 'employmentType', label: '고용 형태', kind: 'cat' },
      { key: 'status', label: '재직 상태', kind: 'cat' },
    ],
    measures: [
      { key: 'headcount', label: '재직 인원', format: 'count' },
      { key: 'hires', label: '입사자 수', format: 'count' },
      { key: 'resigned', label: '퇴사자 수', format: 'count' },
      { key: 'avgTenure', label: '평균 근속 연수(재직자)', format: 'number' },
    ],
    fields: [{ key: 'tenureYears', label: '근속 연수', format: 'number', unit: '년' }],
  },
  {
    key: 'attendance',
    label: '근태',
    description:
      '직원 출퇴근 기록(하루 한 줄). 지각·조퇴는 근무시간 설정과 승인된 반차로 판정 — 지각률·평균 근무 시간',
    group: 'hr',
    perm: 'ATTENDANCE.READ',
    defaultTime: 'workDate',
    dimensions: [
      { key: 'workDate', label: '근무일', kind: 'time' },
      { key: 'status', label: '판정', kind: 'cat' },
      { key: 'clockInHour', label: '출근 시각대', kind: 'cat' },
      WEEKDAY_DIM,
      { key: 'source', label: '기록 방식', kind: 'cat' },
      { key: 'org', label: '소속', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '출근 기록 수', format: 'count' },
      { key: 'lateCount', label: '지각 수', format: 'count' },
      { key: 'lateRate', label: '지각률', format: 'percent', description: '지각 ÷ 출근 기록' },
      { key: 'earlyCount', label: '조퇴 수', format: 'count' },
      { key: 'avgHours', label: '평균 근무 시간(시간)', format: 'number' },
    ],
    fields: [{ key: 'workHours', label: '근무 시간', format: 'number', unit: '시간' }],
  },
  {
    key: 'leave',
    label: '휴가',
    description:
      '휴가 신청(기본은 승인된 것만, 상태로 바꿔 볼 수 있다). 휴가 종류·소속별 사용 일수',
    group: 'hr',
    perm: 'LEAVE.READ',
    defaultTime: 'startDate',
    dimensions: [
      { key: 'startDate', label: '휴가 시작일', kind: 'time' },
      { key: 'leaveType', label: '휴가 종류', kind: 'cat' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'paid', label: '유급 여부', kind: 'cat' },
      WEEKDAY_DIM,
      { key: 'org', label: '소속', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '휴가 건수', format: 'count' },
      { key: 'days', label: '휴가 일수 합계', format: 'number' },
      { key: 'avgDays', label: '평균 휴가 일수', format: 'number' },
    ],
    fields: [{ key: 'days', label: '휴가 일수', format: 'number', unit: '일' }],
  },
  {
    key: 'approval',
    label: '전자결재',
    description: '결재 문서(회수 제외) — 문서 종류·상태별 건수, 승인율, 상신~완료 평균 소요일',
    group: 'hr',
    perm: 'APPROVAL.READ',
    defaultTime: 'submittedAt',
    dimensions: [
      { key: 'submittedAt', label: '상신일', kind: 'time' },
      { key: 'completedAt', label: '완료일', kind: 'time' },
      { key: 'docType', label: '문서 종류', kind: 'cat' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'org', label: '상신 부서', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '문서 수', format: 'count' },
      { key: 'pending', label: '진행 중 문서 수', format: 'count' },
      {
        key: 'approvalRate',
        label: '승인율',
        format: 'percent',
        description: '승인 ÷ (승인 + 반려)',
      },
      {
        key: 'avgDays',
        label: '평균 결재 소요일',
        format: 'number',
        description: '상신~승인·반려',
      },
    ],
    fields: [{ key: 'days', label: '결재 소요일', format: 'number', unit: '일' }],
  },
  // ── 업무·총무 ──
  {
    key: 'task',
    label: '작업관리(팀 업무)',
    description:
      '팀 업무·요청 업무 — 상태·우선순위·담당자별 건수, 완료율, 기한 지난 업무, 처리 일수',
    group: 'work',
    perm: 'TASK.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '등록일', kind: 'time' },
      { key: 'dueDate', label: '기한', kind: 'time' },
      { key: 'doneAt', label: '완료일', kind: 'time' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'priority', label: '우선순위', kind: 'cat' },
      { key: 'project', label: '프로젝트', kind: 'cat' },
      { key: 'assignee', label: '담당자', kind: 'cat' },
      { key: 'org', label: '맡은 팀', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '업무 수', format: 'count' },
      { key: 'doneRate', label: '완료율', format: 'percent' },
      {
        key: 'overdue',
        label: '기한 지난 업무',
        format: 'count',
        description: '기한이 오늘 전인데 완료 안 된 업무',
      },
      { key: 'avgDays', label: '평균 처리 일수', format: 'number', description: '등록~완료' },
    ],
    fields: [{ key: 'leadDays', label: '처리 일수', format: 'number', unit: '일' }],
  },
  {
    key: 'calendar',
    label: '일정',
    description: '캘린더 일정 — 조직 공유 일정과 내 개인 일정(남의 개인 일정은 세지 않는다)',
    group: 'work',
    perm: 'CALENDAR.READ',
    defaultTime: 'date',
    dimensions: [
      { key: 'date', label: '일정일', kind: 'time' },
      { key: 'visibility', label: '공개 범위', kind: 'cat' },
      { key: 'allDay', label: '종일 여부', kind: 'cat' },
      { key: 'source', label: '등록 경로', kind: 'cat' },
      WEEKDAY_DIM,
      { key: 'org', label: '조직', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '일정 수', format: 'count' },
      { key: 'avgDays', label: '평균 일정 길이(일)', format: 'number' },
    ],
    fields: [{ key: 'days', label: '일정 길이', format: 'number', unit: '일' }],
  },
  {
    key: 'space',
    label: '공간 예약',
    description: '회의실·대여 공간 예약(취소 제외) — 공간별 예약 수·사용 시간·대여료',
    group: 'work',
    perm: 'SPACE.MANAGE',
    defaultTime: 'startAt',
    dimensions: [
      { key: 'startAt', label: '예약일', kind: 'time' },
      { key: 'space', label: '공간', kind: 'cat' },
      { key: 'kind', label: '공간 종류', kind: 'cat' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'hour', label: '시작 시간대', kind: 'cat' },
      WEEKDAY_DIM,
    ],
    measures: [
      { key: 'count', label: '예약 수', format: 'count' },
      { key: 'hours', label: '사용 시간 합계(시간)', format: 'number' },
      { key: 'fee', label: '대여료 합계', format: 'won' },
    ],
    fields: [{ key: 'hours', label: '예약 시간', format: 'number', unit: '시간' }],
  },
  {
    key: 'asset',
    label: '계약·자산',
    description:
      '특허·상표권·임대차·보험·리스 등 회사 계약·자산 — 종류별 건수, 월 환산 비용, 만료 예정',
    group: 'work',
    perm: 'ASSET.READ',
    defaultTime: 'startDate',
    dimensions: [
      { key: 'startDate', label: '시작일', kind: 'time' },
      { key: 'endDate', label: '만료·갱신일', kind: 'time' },
      { key: 'kind', label: '종류', kind: 'cat' },
      { key: 'amountUnit', label: '금액 기준', kind: 'cat' },
      {
        key: 'expiry',
        label: '만료 상태',
        kind: 'cat',
        description: '만료 / 90일 안 만료 / 유효 / 기한 없음',
      },
    ],
    measures: [
      { key: 'count', label: '건수', format: 'count' },
      {
        key: 'monthlyCost',
        label: '월 환산 비용',
        format: 'won',
        description: '월 단위 금액 + 연 단위 금액 ÷ 12(총액 기준은 빼고)',
      },
      { key: 'expiringSoon', label: '90일 안 만료', format: 'count' },
    ],
    fields: [{ key: 'amount', label: '금액', format: 'won' }],
  },
  // ── 지점·가맹 ──
  {
    key: 'branch',
    label: '지점·조직',
    description:
      '지점·부서 등 조직(운영 중만, 상태로 바꿔 볼 수 있다) — 지역·유형별 지점 수, 개설 추이, 가맹 상태·재계약 대상',
    group: 'branch',
    perm: 'ORG_UNIT.READ',
    defaultTime: 'createdAt',
    dimensions: [
      { key: 'createdAt', label: '등록일', kind: 'time' },
      { key: 'contractStart', label: '가맹 계약 시작일', kind: 'time' },
      { key: 'contractEnd', label: '가맹 계약 만료일', kind: 'time' },
      { key: 'type', label: '조직 유형', kind: 'cat' },
      { key: 'sido', label: '시도', kind: 'geo' },
      { key: 'parent', label: '상위 조직', kind: 'cat' },
      { key: 'franchiseStatus', label: '가맹 상태', kind: 'cat' },
      { key: 'status', label: '운영 여부', kind: 'cat' },
    ],
    measures: [
      { key: 'branches', label: '지점 수', format: 'count' },
      { key: 'count', label: '조직 수', format: 'count' },
      {
        key: 'renewalDue',
        label: '재계약 대상',
        format: 'count',
        description: '가맹 계약 만료가 오늘부터 90일 안',
      },
    ],
    fields: [],
  },
  {
    key: 'branch_case',
    label: '지점 관리 기록',
    description: '가맹팀 지점 관리 기록 — 현장점검·불법영업·보험처리·소송·재계약·민원',
    group: 'branch',
    perm: 'BRANCH_CASE.READ',
    defaultTime: 'occurredAt',
    dimensions: [
      { key: 'occurredAt', label: '발생일', kind: 'time' },
      { key: 'kind', label: '종류', kind: 'cat' },
      { key: 'status', label: '상태', kind: 'cat' },
      { key: 'assignee', label: '담당자', kind: 'cat' },
      { key: 'org', label: '지점', kind: 'org' },
    ],
    measures: [
      { key: 'count', label: '기록 수', format: 'count' },
      { key: 'open', label: '처리 중 건수', format: 'count', description: '종결 전' },
      { key: 'amount', label: '금액 합계', format: 'won' },
    ],
    fields: [{ key: 'amount', label: '금액', format: 'won' }],
  },
];
export const STUDIO_DATASET_MAP = new Map(STUDIO_DATASETS.map((d) => [d.key, d]));

/** 이 권한 목록으로 이 데이터를 볼 수 있나('*' = 전체, 권한이 여러 개면 그중 하나) */
export function studioCanSee(ds: StudioDataset | undefined, permissions: readonly string[]) {
  if (!ds) return false;
  if (permissions.includes('*')) return true;
  return (Array.isArray(ds.perm) ? ds.perm : [ds.perm]).some((x) => permissions.includes(x));
}

/** 위젯에서 쓸 수 있는 시각화(글 위젯·목록은 빼고) */
export const STUDIO_VIZ = [
  'card',
  'gauge',
  'bar',
  'hbar',
  'line',
  'area',
  'pie',
  'donut',
  'funnel',
  'table',
  'map',
  'heatmap',
  'stacked',
  'treemap',
  'histogram',
  'box',
  'scatter',
  'calendar',
  'gantt',
  'typo',
  'grouped',
] as const satisfies readonly DashViz[];
/** 차트 쓰임새 — 무엇을 보여 주나(스튜디오에서 묶어 보여 주고 AI 규칙에도 쓴다) */
export const STUDIO_VIZ_GROUPS: { key: string; label: string; viz: StudioViz[] }[] = [
  { key: 'single', label: '숫자 하나', viz: ['card', 'gauge', 'typo'] },
  { key: 'compare', label: '비교', viz: ['bar', 'hbar', 'stacked', 'grouped', 'table'] },
  { key: 'part', label: '구성(비중)', viz: ['pie', 'donut', 'treemap', 'funnel'] },
  { key: 'trend', label: '추이(시간)', viz: ['line', 'area', 'calendar'] },
  { key: 'plan', label: '기간', viz: ['gantt'] },
  { key: 'dist', label: '분포', viz: ['histogram', 'box'] },
  { key: 'relation', label: '관계', viz: ['scatter', 'heatmap'] },
  { key: 'geo', label: '지역', viz: ['map'] },
];
export type StudioViz = (typeof STUDIO_VIZ)[number];

/** 조작 요소 자리 — 제목 줄(오른쪽 끝) · 차트 위 왼쪽 · 차트 위 오른쪽 · 차트 아래 */
export const STUDIO_PLACES = ['title', 'left', 'right', 'bottom'] as const;
export type StudioPlace = (typeof STUDIO_PLACES)[number];

/** 위젯 안 조작 요소 — 보는 사람이 눌러 바꾼다(세그먼트 탭·드롭다운·필터) */
export type StudioControl = (
  | {
      kind: 'segment' | 'dropdown';
      /** 무엇을 바꾸나 — 시간 단위·묶을 기준·숫자·기간·차트 모양 */
      target: 'grain' | 'dimension' | 'measure' | 'period' | 'viz';
      label?: string;
      options: string[];
    }
  | {
      kind: 'filter';
      /** 거를 차원(항목 여러 개 고르기) */
      dim: string;
      label?: string;
    }
) & {
  /** 놓을 자리(없으면 차트 위 왼쪽) */
  place?: StudioPlace;
};

export interface StudioFilter {
  dim: string;
  values: string[];
}

/** 위젯 설계서 */
export interface StudioSpec {
  version: 1;
  title: string;
  subtitle?: string;
  dataset: string;
  measure: string;
  /** 산점도의 세로축 숫자(가로축은 measure) */
  measure2?: string;
  /** 간트 차트의 끝 날짜 칸(시작은 periodField·기본 날짜) — 없으면 같은 칸의 처음~마지막 */
  endField?: string;
  /** 분포(히스토그램·박스플롯)에 쓸 건별 숫자 칸 */
  field?: string;
  /** 묶을 기준(없으면 숫자 하나) */
  dimension?: string | null;
  /** 시간 차원일 때 단위 */
  grain?: StudioGrain;
  /** 두 번째 기준(히트맵의 행 · 표의 나눔) */
  split?: string | null;
  viz: StudioViz;
  period: DashPeriod;
  /** 기간을 걸 날짜 칸(없으면 데이터 기본) */
  periodField?: string;
  /** 늘 거는 조건 */
  filters?: StudioFilter[];
  /** 항목 수 제한(많은 것부터) */
  limit?: number;
  controls?: StudioControl[];
  /** 위젯 안 배치(12칸 격자) — 요소 id('title'·'subtitle'·'ctl:<번호>'·'chart') → 자리. 없으면 place로 기본 배치 */
  layout?: Record<string, StudioBox>;
  /** 글자 모양 */
  look?: StudioLook;
  /** 대시보드에 놓을 때 기본 크기(대시보드 칸·줄) */
  size?: { w: number; h: number };
}

/** 위젯 안 격자 칸 수 */
export const STUDIO_COLS = 12;
export const STUDIO_ALIGNS = ['start', 'center', 'end'] as const;
export type StudioAlign = (typeof STUDIO_ALIGNS)[number];
/** 요소 한 개의 자리 — 줄(y)·시작 칸(x, 0~11)·칸 수(w)·칸 안 정렬 */
export interface StudioBox {
  x: number;
  y: number;
  w: number;
  align?: StudioAlign;
}
export interface StudioLook {
  titleSize?: number;
  titleBold?: boolean;
  subtitleSize?: number;
  /** 차트 색 묶음(대시보드 색 key) — 없으면 대시보드 색을 따른다 */
  palette?: string;
  /** 항목마다 색(항목 key → #rrggbb) */
  colors?: Record<string, string>;
}
export const STUDIO_TITLE_SIZES = [12, 13, 14, 16, 18, 20, 24, 28, 32];
export const STUDIO_SUBTITLE_SIZES = [11, 12, 13, 14, 16, 18];
export const STUDIO_SIZE_LIMIT = { minW: 2, maxW: 12, minH: 2, maxH: 10 };

/** 대시보드에 놓을 때 기본 크기 */
export function studioDefaultSize(spec: StudioSpec): { w: number; h: number } {
  if (spec.size) return spec.size;
  return { w: 6, h: spec.viz === 'card' || spec.viz === 'gauge' ? 2 : 4 };
}

/** 위젯 안 요소 id — 제목·부제·보기 옵션(필터는 여러 개여도 버튼 하나라 첫 것만)·차트 */
export function studioElementIds(spec: StudioSpec): string[] {
  const ids = ['title'];
  if (spec.subtitle) ids.push('subtitle');
  let filter = false;
  (spec.controls ?? []).forEach((c, i) => {
    if (c.kind === 'filter') {
      if (filter) return;
      filter = true;
    }
    ids.push(`ctl:${i}`);
  });
  ids.push('chart');
  return ids;
}

/** 줄 번호를 0부터 빈틈없이(소수 줄 — 사이에 끼운 줄 — 도 정리) */
export function compactStudioRows(layout: Record<string, StudioBox>): Record<string, StudioBox> {
  const ys = [...new Set(Object.values(layout).map((b) => b.y))].sort((a, b) => a - b);
  const at = new Map(ys.map((y, i) => [y, i]));
  return Object.fromEntries(
    Object.entries(layout).map(([k, b]) => [k, { ...b, y: at.get(b.y) ?? 0 }]),
  );
}

/** place로 정한 기본 배치 — 제목 줄 · 부제 · 차트 위(왼쪽·오른쪽) · 차트 · 차트 아래 */
function defaultStudioLayout(spec: StudioSpec): Record<string, StudioBox> {
  const ids = studioElementIds(spec);
  const ctl = ids.filter((id) => id.startsWith('ctl:'));
  const placeOfId = (id: string) => spec.controls?.[Number(id.slice(4))]?.place ?? 'left';
  const out: Record<string, StudioBox> = {};
  /** 기본 폭 — 탭은 항목 수만큼, 드롭다운 3칸, 필터 버튼 2칸 */
  const wOf = (id: string) => {
    const c = spec.controls?.[Number(id.slice(4))];
    if (!c || c.kind === 'filter') return 2;
    return c.kind === 'segment' ? Math.min(6, Math.max(3, c.options.length + 1)) : 3;
  };
  /** 한 줄에 왼쪽부터(또는 오른쪽 끝부터) 채운다 — 넘치면 다음 줄 */
  const pack = (list: string[], y: number, fromRight: boolean, startX = 0) => {
    let x = startX;
    let row = y;
    const items = fromRight ? [...list].reverse() : list;
    let end = 12;
    for (const id of items) {
      const w = wOf(id);
      if (fromRight) {
        if (end - w < startX) {
          row += 0.1;
          end = 12;
        }
        out[id] = { x: end - w, y: row, w, align: 'end' };
        end -= w;
      } else {
        if (x + w > 12) {
          row += 0.1;
          x = 0;
        }
        out[id] = { x, y: row, w };
        x += w;
      }
    }
    return fromRight ? end : x;
  };
  const head = ctl.filter((id) => placeOfId(id) === 'title');
  const headW = head.reduce((n, id) => n + wOf(id), 0);
  const titleW = Math.max(4, 12 - headW);
  out.title = { x: 0, y: 0, w: titleW };
  pack(head, 0, true, titleW);
  if (spec.subtitle) out.subtitle = { x: 0, y: 1, w: 12 };
  const leftEnd = pack(
    ctl.filter((id) => placeOfId(id) === 'left'),
    2,
    false,
  );
  pack(
    ctl.filter((id) => placeOfId(id) === 'right'),
    2,
    true,
    leftEnd,
  );
  out.chart = { x: 0, y: 3, w: 12 };
  pack(
    ctl.filter((id) => placeOfId(id) === 'bottom'),
    4,
    false,
  );
  return fixOverlaps(out);
}

/** 같은 줄에서 겹치면 뒤의 것을 바로 아래 새 줄로 */
function fixOverlaps(layout: Record<string, StudioBox>): Record<string, StudioBox> {
  const out = { ...layout };
  for (let guard = 0; guard < 20; guard++) {
    let moved = false;
    const rows = new Map<number, string[]>();
    for (const [k, b] of Object.entries(out)) rows.set(b.y, [...(rows.get(b.y) ?? []), k]);
    for (const [y, ks] of rows) {
      ks.sort((a, b) => out[a].x - out[b].x);
      let end = 0;
      for (const k of ks) {
        if (out[k].x < end) {
          out[k] = { ...out[k], y: y + 0.5 };
          moved = true;
        } else end = out[k].x + out[k].w;
      }
    }
    if (!moved) break;
    Object.assign(out, compactStudioRows(out));
  }
  return compactStudioRows(out);
}

/** 실제로 그릴 배치 — 저장한 배치에 없는 요소는 기본 자리 근처(제목은 맨 위, 차트는 맨 아래, 나머지는 차트 바로 위 새 줄)로 */
export function studioLayout(spec: StudioSpec): Record<string, StudioBox> {
  if (!spec.layout) return defaultStudioLayout(spec);
  const ids = studioElementIds(spec);
  const out: Record<string, StudioBox> = {};
  for (const id of ids) if (spec.layout[id]) out[id] = { ...spec.layout[id] };
  const chartY = out.chart?.y ?? Math.max(0, ...Object.values(out).map((b) => b.y + 1));
  let add = 0;
  for (const id of ids) {
    if (out[id]) continue;
    if (id === 'title') out[id] = { x: 0, y: -1, w: 12 };
    else if (id === 'chart') out[id] = { x: 0, y: 1000, w: 12 };
    else if (id === 'subtitle') out[id] = { x: 0, y: (out.title?.y ?? -1) + 0.25, w: 12 };
    else out[id] = { x: (add++ % 3) * 4, y: chartY - 0.5, w: 4 };
  }
  return fixOverlaps(out);
}

/** 보기 옵션 i번을 빼고 배치 번호를 당긴다 */
export function studioRemoveControl(spec: StudioSpec, i: number): Partial<StudioSpec> {
  const controls = (spec.controls ?? []).filter((_, k) => k !== i);
  if (!spec.layout) return { controls };
  const layout: Record<string, StudioBox> = {};
  for (const [k, b] of Object.entries(spec.layout)) {
    if (!k.startsWith('ctl:')) layout[k] = b;
    else {
      const n = Number(k.slice(4));
      if (n < i) layout[k] = b;
      else if (n > i) layout[`ctl:${n - 1}`] = b;
    }
  }
  return { controls, layout: compactStudioRows(layout) };
}

const intIn = (v: unknown, lo: number, hi: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
function normalizeLayout(raw: unknown): Record<string, StudioBox> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, StudioBox> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(title|subtitle|chart|ctl:[0-9])$/.test(k)) continue;
    const b = (v ?? {}) as Record<string, unknown>;
    const x = intIn(b.x, 0, 11);
    const w = intIn(b.w, 1, 12);
    const y = intIn(b.y, 0, 40);
    if (x === null || w === null || y === null) continue;
    out[k] = {
      x,
      y,
      w: Math.min(w, 12 - x),
      ...((STUDIO_ALIGNS as readonly string[]).includes(String(b.align)) && b.align !== 'start'
        ? { align: b.align as StudioAlign }
        : {}),
    };
  }
  return Object.keys(out).length ? out : undefined;
}
function normalizeLook(raw: unknown): StudioLook | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const titleSize = intIn(r.titleSize, 10, 40);
  const subtitleSize = intIn(r.subtitleSize, 9, 24);
  const look: StudioLook = {
    ...(titleSize ? { titleSize } : {}),
    ...(subtitleSize ? { subtitleSize } : {}),
    ...(typeof r.titleBold === 'boolean' ? { titleBold: r.titleBold } : {}),
    ...(typeof r.palette === 'string' && /^([a-z]{2,12}|#[0-9a-fA-F]{6})$/.test(r.palette)
      ? { palette: r.palette }
      : {}),
  };
  if (r.colors && typeof r.colors === 'object') {
    const colors = Object.fromEntries(
      Object.entries(r.colors as Record<string, unknown>)
        .filter(([k, v]) => k.length <= 120 && typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v))
        .slice(0, 40),
    ) as Record<string, string>;
    if (Object.keys(colors).length) look.colors = colors;
  }
  return Object.keys(look).length ? look : undefined;
}
function normalizeSize(raw: unknown): { w: number; h: number } | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const L = STUDIO_SIZE_LIMIT;
  const w = intIn(r.w, L.minW, L.maxW);
  const h = intIn(r.h, L.minH, L.maxH);
  return w && h ? { w, h } : undefined;
}

/** 보는 사람이 조작한 값 — 설계서의 기본값을 덮는다 */
export interface StudioParams {
  grain?: StudioGrain;
  dimension?: string | null;
  measure?: string;
  period?: DashPeriod;
  viz?: StudioViz;
  /** 분포 칸 바꾸기 */
  field?: string;
  /** 필터 조작 — 차원 → 고른 값 */
  filters?: Record<string, string[]>;
}

/** 대시보드 배치에서 만든 위젯을 가리키는 widget 값 — 'cw:' + 위젯 id */
export const CUSTOM_WIDGET_PREFIX = 'cw:';
export const isCustomWidgetKey = (k: string) => k.startsWith(CUSTOM_WIDGET_PREFIX);

const placeOf = (v: unknown): { place?: StudioPlace } =>
  (STUDIO_PLACES as readonly string[]).includes(String(v)) && v !== 'left'
    ? { place: v as StudioPlace }
    : {};

/** 설계서 검사 — 카탈로그에 없는 데이터·칸·모양은 고쳐서 쓸 수 있는 값만 남긴다(AI 답·저장 값 공통) */
export function normalizeStudioSpec(raw: unknown): { spec: StudioSpec; errors: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const ds = STUDIO_DATASET_MAP.get(String(r.dataset)) ?? STUDIO_DATASETS[0];
  if (!STUDIO_DATASET_MAP.has(String(r.dataset))) errors.push(`없는 데이터: ${String(r.dataset)}`);
  const dimKeys = new Set(ds.dimensions.map((d) => d.key));
  const mKeys = new Set(ds.measures.map((m) => m.key));
  const dimOk = (v: unknown) => (typeof v === 'string' && dimKeys.has(v) ? v : null);
  const measure = mKeys.has(String(r.measure)) ? String(r.measure) : ds.measures[0].key;
  if (!mKeys.has(String(r.measure))) errors.push(`없는 측정값: ${String(r.measure)}`);
  const viz = (STUDIO_VIZ as readonly string[]).includes(String(r.viz))
    ? (r.viz as StudioViz)
    : 'bar';
  const grain = (STUDIO_GRAINS as readonly string[]).includes(String(r.grain))
    ? (r.grain as StudioGrain)
    : 'month';
  const period = (DASH_PERIODS as readonly string[]).includes(String(r.period))
    ? (r.period as DashPeriod)
    : '90d';
  const timeDims = new Set(ds.dimensions.filter((d) => d.kind === 'time').map((d) => d.key));
  const filters = (Array.isArray(r.filters) ? r.filters : [])
    .map((f) => f as StudioFilter)
    .filter((f) => dimOk(f?.dim) && Array.isArray(f.values))
    .map((f) => ({ dim: f.dim, values: f.values.map(String).slice(0, 50) }))
    .slice(0, 6);
  const controls: StudioControl[] = [];
  for (const c of Array.isArray(r.controls) ? r.controls : []) {
    const x = c as Record<string, unknown>;
    if (x.kind === 'filter') {
      const dim = dimOk(x.dim);
      if (dim && !timeDims.has(dim))
        controls.push({
          kind: 'filter',
          dim,
          ...(x.label ? { label: String(x.label) } : {}),
          ...placeOf(x.place),
        });
      continue;
    }
    if (x.kind !== 'segment' && x.kind !== 'dropdown') continue;
    const target = String(x.target);
    const valid =
      target === 'grain'
        ? (v: string) => (STUDIO_GRAINS as readonly string[]).includes(v)
        : target === 'dimension'
          ? (v: string) => dimKeys.has(v)
          : target === 'measure'
            ? (v: string) => mKeys.has(v)
            : target === 'period'
              ? (v: string) => (DASH_PERIODS as readonly string[]).includes(v)
              : target === 'viz'
                ? (v: string) => (STUDIO_VIZ as readonly string[]).includes(v)
                : null;
    if (!valid) continue;
    const options = [
      ...new Set((Array.isArray(x.options) ? x.options : []).map(String).filter(valid)),
    ];
    if (options.length < 2) continue;
    controls.push({
      kind: x.kind,
      target: target as 'grain',
      options: options.slice(0, 8),
      ...(x.label ? { label: String(x.label).slice(0, 20) } : {}),
      ...placeOf(x.place),
    });
  }
  const fKeys = new Set(ds.fields.map((f) => f.key));
  let vizOut = viz;
  // 분포는 건별 숫자 칸이 있어야, 산점도는 숫자가 두 개 있어야 — 없으면 막대로
  const field = fKeys.has(String(r.field)) ? String(r.field) : ds.fields[0]?.key;
  if ((viz === 'histogram' || viz === 'box') && !field) vizOut = 'bar';
  const others = ds.measures.filter((m) => m.key !== measure);
  const measure2 =
    mKeys.has(String(r.measure2)) && String(r.measure2) !== measure
      ? String(r.measure2)
      : others[0]?.key;
  if (viz === 'scatter' && !measure2) vizOut = 'bar';
  const limit = Number(r.limit);
  const spec: StudioSpec = {
    version: 1,
    title: String(r.title ?? '').slice(0, 60) || '새 위젯',
    ...(r.subtitle ? { subtitle: String(r.subtitle).slice(0, 120) } : {}),
    dataset: ds.key,
    measure,
    dimension: dimOk(r.dimension),
    grain,
    split: dimOk(r.split),
    viz: vizOut,
    ...(vizOut === 'scatter' && measure2 ? { measure2 } : {}),
    ...((vizOut === 'histogram' || vizOut === 'box') && field ? { field } : {}),
    period,
    ...(timeDims.has(String(r.periodField)) ? { periodField: String(r.periodField) } : {}),
    ...(vizOut === 'gantt' && timeDims.has(String(r.endField))
      ? { endField: String(r.endField) }
      : {}),
    ...(filters.length ? { filters } : {}),
    ...(limit > 0 ? { limit: Math.min(50, Math.round(limit)) } : {}),
    ...(controls.length ? { controls: controls.slice(0, 4) } : {}),
  };
  const layout = normalizeLayout(r.layout);
  const look = normalizeLook(r.look);
  const size = normalizeSize(r.size);
  if (layout) spec.layout = layout;
  if (look) spec.look = look;
  if (size) spec.size = size;
  return { spec, errors };
}

/** 만든 위젯 한 개(목록·대시보드 편집 화면에서 쓴다) */
export interface CustomWidgetRow {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  spec: StudioSpec;
  prompt: string | null;
  createdByName: string | null;
  updatedAt: string;
}

/** AI 추천안 하나 */
export interface StudioProposal {
  name: string;
  why: string;
  spec: StudioSpec;
}

/** 위젯 데이터(서버 실행 결과) */
export interface StudioResult {
  data: DashData;
  /** 필터 조작 요소의 고를 값(차원 → 값·이름) */
  options: Record<string, { value: string; label: string }[]>;
  /** 여러 지점을 볼 수 있나 — 아니면 '지점별' 같은 선택지는 숨긴다 */
  multiOrg: boolean;
  /** 실제로 쓴 값(조작 반영 후) */
  applied: { measure: string; dimension: string | null; grain: StudioGrain; period: DashPeriod };
}
