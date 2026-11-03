// ── 영업 CRM 공통 틀 — 파이프라인(가맹 영업 · 기업영업 …)마다 단계·유입 경로·추가 항목만 다르고 코드는 하나 ──
// 새 영업 CRM이 필요하면 CRM_PIPELINES에 한 줄 더하고 권한·메뉴만 붙이면 된다.

export const CRM_PIPELINE_KEYS = ['FRANCHISE', 'B2B'] as const;
export type CrmPipelineKey = (typeof CRM_PIPELINE_KEYS)[number];

export interface CrmStageDef {
  key: string;
  label: string;
  color: string;
  /** 진행 중 단계(칸반 칸) — 아니면 끝난 단계(계약·수주 / 보류 / 실패) */
  open?: boolean;
  /** 계약·수주 */
  won?: boolean;
  /** 실패 */
  lost?: boolean;
  /** 진행 중 단계가 리드(발굴·첫 연락)인지 상담·영업 기회인지 — 화면 위 탭(리드 · 진행 · 계약)으로 나눈다 */
  phase?: 'lead' | 'deal';
}

/** 화면 위 탭 — 리드 · 상담(영업 기회) · 계약(수주) · 보류·실패 */
export const CRM_PHASES = ['lead', 'deal', 'won', 'closed'] as const;
export type CrmPhase = (typeof CRM_PHASES)[number];

export interface CrmFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: string[];
  placeholder?: string;
  unit?: string;
}

export interface CrmPipelineDef {
  key: CrmPipelineKey;
  /** 메뉴·제목 */
  label: string;
  /** 권한 키(READ·CREATE·UPDATE·DELETE) */
  perm: string;
  path: string;
  description: string;
  companyLabel: string;
  contactLabel: string;
  regionLabel: string;
  /** 금액(예상 매출 등) — 없으면 칸을 안 보인다 */
  amountLabel: string | null;
  /** 예정일(이전 예정일·개점 희망일) */
  expectedLabel: string | null;
  /** 계약 뒤 이어 둘 대상 — BRANCH(가맹점=지점) | PARTNER(거래처) */
  link: 'BRANCH' | 'PARTNER' | null;
  linkLabel: string;
  /** 화면 번호 앞 글자(F000012) */
  codePrefix: string;
  phaseLabels: Record<CrmPhase, string>;
  stages: CrmStageDef[];
  sources: { key: string; label: string }[];
  /** 파이프라인만의 항목(fields JSON에 저장) */
  fields: CrmFieldDef[];
}

export const CRM_PIPELINES: Record<CrmPipelineKey, CrmPipelineDef> = {
  FRANCHISE: {
    key: 'FRANCHISE',
    label: '가맹 고객관리',
    perm: 'FRANCHISE',
    path: '/franchise-leads',
    description:
      '가맹점이 될 업체(사장님)를 발굴하고 상담해 계약까지 이끄는 CRM입니다. 이사 고객(접수)과 따로 관리합니다.',
    companyLabel: '상호(또는 이름)',
    contactLabel: '담당자(사장님)',
    regionLabel: '희망·운영 지역',
    amountLabel: '예상 가맹비',
    expectedLabel: '개점 희망일',
    link: 'BRANCH',
    linkLabel: '계약 후 연결된 가맹점',
    codePrefix: 'F',
    phaseLabels: { lead: '리드', deal: '상담 진행', won: '계약', closed: '보류·실패' },
    stages: [
      { key: 'NEW', label: '발굴', color: '#9ca3af', open: true, phase: 'lead' },
      { key: 'CONTACTED', label: '첫 연락', color: '#60a5fa', open: true, phase: 'lead' },
      { key: 'CONSULTING', label: '상담 중', color: '#3b82f6', open: true, phase: 'deal' },
      { key: 'MEETING', label: '미팅·방문', color: '#8b5cf6', open: true, phase: 'deal' },
      { key: 'CONTRACTING', label: '계약 진행', color: '#f59e0b', open: true, phase: 'deal' },
      { key: 'WON', label: '계약 완료', color: '#16a34a', won: true },
      { key: 'HOLD', label: '보류', color: '#a8a29e' },
      { key: 'LOST', label: '실패', color: '#ef4444', lost: true },
    ],
    sources: [
      { key: 'DB', label: 'DB 발굴' },
      { key: 'INBOUND', label: '인바운드 문의' },
      { key: 'OUTBOUND', label: '아웃바운드' },
      { key: 'REFERRAL', label: '소개' },
      { key: 'EXPO', label: '박람회·설명회' },
      { key: 'ETC', label: '기타' },
    ],
    fields: [
      {
        key: 'currentBiz',
        label: '지금 하는 사업',
        type: 'text',
        placeholder: '예: 개인 이사업체 5년, 차량 2대',
      },
      { key: 'trucks', label: '보유 차량', type: 'number', unit: '대' },
      { key: 'capital', label: '창업 가능 자금', type: 'text', placeholder: '예: 5천만 원' },
    ],
  },
  B2B: {
    key: 'B2B',
    label: '기업영업',
    perm: 'B2B_CRM',
    path: '/b2b-crm',
    description:
      '기업 이전(사무실·공장·전산 이전) 영업을 리드 발굴부터 현장 실사·견적·수주까지 관리하는 CRM입니다. 수주하면 거래처와 이어 매출 통계에 잡힙니다.',
    companyLabel: '회사명',
    contactLabel: '담당자',
    regionLabel: '지역',
    amountLabel: '예상 매출(견적액)',
    expectedLabel: '이전 예정일',
    link: 'PARTNER',
    linkLabel: '수주 후 연결된 거래처',
    codePrefix: 'B',
    phaseLabels: { lead: '리드', deal: '영업 기회', won: '수주', closed: '보류·실패' },
    stages: [
      { key: 'LEAD', label: '리드 발굴', color: '#9ca3af', open: true, phase: 'lead' },
      { key: 'CONTACTED', label: '첫 연락', color: '#60a5fa', open: true, phase: 'lead' },
      { key: 'MEETING', label: '미팅', color: '#3b82f6', open: true, phase: 'deal' },
      { key: 'SURVEY', label: '현장 실사', color: '#8b5cf6', open: true, phase: 'deal' },
      { key: 'QUOTED', label: '견적 제출', color: '#d946ef', open: true, phase: 'deal' },
      { key: 'NEGOTIATING', label: '협상', color: '#f59e0b', open: true, phase: 'deal' },
      { key: 'WON', label: '수주', color: '#16a34a', won: true },
      { key: 'HOLD', label: '보류', color: '#a8a29e' },
      { key: 'LOST', label: '실패', color: '#ef4444', lost: true },
    ],
    sources: [
      { key: 'INBOUND', label: '인바운드 문의' },
      { key: 'OUTBOUND', label: '아웃바운드' },
      { key: 'REFERRAL', label: '소개' },
      { key: 'BID', label: '입찰·공고' },
      { key: 'EXISTING', label: '기존 고객' },
      { key: 'PARTNER', label: '제휴사' },
      { key: 'DB', label: 'DB 발굴' },
      { key: 'ETC', label: '기타' },
    ],
    fields: [
      { key: 'segment', label: 'DB 구분', type: 'text', placeholder: '예: 강남구 상장사' },
      { key: 'industry', label: '업종', type: 'text', placeholder: '예: IT, 제조, 공공기관' },
      { key: 'homepage', label: '홈페이지', type: 'text' },
      { key: 'employees', label: '직원 수', type: 'number', unit: '명' },
      { key: 'area', label: '면적', type: 'number', unit: '평' },
      {
        key: 'moveScope',
        label: '이전 범위',
        type: 'select',
        options: ['사무실 전체', '일부 층·부서', '전산·서버', '공장·창고', '연구소·실험실', '기타'],
      },
      { key: 'fromAddr', label: '현재 위치', type: 'text' },
      { key: 'toAddr', label: '이전 예정지', type: 'text' },
      { key: 'decisionMaker', label: '결정권자', type: 'text', placeholder: '예: 총무팀장 김OO' },
      { key: 'competitor', label: '경쟁사', type: 'text' },
    ],
  },
};
export const isCrmPipeline = (k: string): k is CrmPipelineKey =>
  (CRM_PIPELINE_KEYS as readonly string[]).includes(k);
export const crmStage = (p: CrmPipelineKey, key: string) =>
  CRM_PIPELINES[p].stages.find((s) => s.key === key);
/** 단계 → 화면 탭 */
export const crmPhaseOf = (def: CrmPipelineDef, stage: string): CrmPhase => {
  const s = def.stages.find((x) => x.key === stage);
  if (!s) return 'closed';
  if (s.won) return 'won';
  if (!s.open) return 'closed';
  return s.phase ?? 'deal';
};
/** 화면 번호 — 사람이 넣지 않고 시스템이 매긴 순번으로 */
export const crmCode = (def: CrmPipelineDef, seq: number) =>
  `${def.codePrefix}${String(seq).padStart(6, '0')}`;

/** 관심도 */
export const CRM_INTERESTS = ['A', 'B', 'C'] as const;
export type CrmInterest = (typeof CRM_INTERESTS)[number];
export const CRM_INTEREST_LABEL: Record<CrmInterest, string> = { A: '높음', B: '보통', C: '낮음' };

/** 상담 기록 종류(STAGE는 단계를 바꾸면 자동으로) */
export const CRM_ACTIVITY_KINDS = ['CALL', 'SMS', 'EMAIL', 'MEETING', 'MEMO', 'STAGE'] as const;
export type CrmActivityKind = (typeof CRM_ACTIVITY_KINDS)[number];
export const CRM_ACTIVITY_LABEL: Record<CrmActivityKind, string> = {
  CALL: '통화',
  SMS: '문자',
  EMAIL: '메일',
  MEETING: '미팅·방문',
  MEMO: '메모',
  STAGE: '단계 변경',
};

export interface CrmLeadView {
  id: string;
  /** 화면 번호 F000012 · B000012 */
  code: string;
  pipeline: CrmPipelineKey;
  companyName: string;
  contactName: string | null;
  contactTitle: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  source: string;
  stage: string;
  interest: CrmInterest;
  ownerEmpId: string | null;
  ownerName: string | null;
  amount: number | null;
  expectedAt: string | null;
  nextActionAt: string | null;
  nextAction: string | null;
  memo: string | null;
  lostReason: string | null;
  fields: Record<string, string | number | null>;
  linkId: string | null;
  linkName: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface CrmActivityView {
  id: string;
  kind: CrmActivityKind;
  content: string | null;
  fromStage: string | null;
  toStage: string | null;
  actorName: string | null;
  at: string;
}

/** 파이프라인 통계 — 기간 안에 만든 영업 대상 기준(수주·실패는 그 기간에 단계가 바뀐 것) */
export interface CrmStats {
  pipeline: CrmPipelineKey;
  from: string | null;
  to: string | null;
  total: number;
  open: number;
  won: number;
  wonAmount: number;
  lost: number;
  /** 수주 ÷ (수주 + 실패) */
  winRate: number | null;
  pipelineAmount: number;
  byStage: { key: string; label: string; count: number; amount: number }[];
  bySource: { key: string; label: string; count: number; won: number }[];
  byOwner: { empId: string | null; name: string; count: number; won: number; wonAmount: number }[];
}

// ── 매출 통계(필터) — GET /stats/sales ──

/** 접수 경로(common_code RECEIPT_PATH) 이름 */
export const LEAD_SOURCE_LABEL: Record<string, string> = {
  SYSTEM: '시스템',
  HOMEPAGE: '홈페이지',
  AIBOT: 'AI상담봇',
  PHONE: '전화상담',
  NAVER: '네이버',
  INSTAGRAM: '인스타그램',
  PARTNER: '제휴사',
  WALK_IN: '방문접수',
  ETC: '기타',
};

export const SALES_GROUP_BY = [
  'day',
  'week',
  'month',
  'branch',
  'partner',
  'serviceLine',
  'source',
  'region',
] as const;
export type SalesGroupBy = (typeof SALES_GROUP_BY)[number];
export const SALES_GROUP_BY_LABEL: Record<SalesGroupBy, string> = {
  day: '일별',
  week: '주별',
  month: '월별',
  branch: '지점별',
  partner: '거래처별',
  serviceLine: '상품 종류별',
  source: '접수 경로별',
  region: '시도별',
};

export interface SalesStatsRow {
  key: string;
  label: string;
  leads: number;
  contracts: number;
  revenue: number;
}
export interface SalesStats {
  filters: {
    from: string | null;
    to: string | null;
    serviceLine: string | null;
    orgUnitId: string | null;
    partnerId: string | null;
    source: string | null;
    groupBy: SalesGroupBy;
  };
  total: {
    leads: number;
    contracts: number;
    revenue: number;
    avgContract: number | null;
    /** 계약 ÷ 접수 */
    conversion: number | null;
  };
  rows: SalesStatsRow[];
}

// ── 가져오기(엑셀·구글 시트 붙여넣기 · CSV · xlsx) ──
export interface CrmImportPreview {
  /** 원본 칸 → 맞춘 항목(못 맞춘 칸은 null) */
  columns: { header: string; field: string | null; label: string | null }[];
  total: number;
  /** 새로 넣을 것 · 이미 있어 건너뛸 것 · 업체명이 없어 못 넣는 것 */
  create: number;
  duplicate: number;
  invalid: number;
  warnings: string[];
  rows: {
    status: 'create' | 'duplicate' | 'invalid';
    companyName: string;
    contactName: string | null;
    phone: string | null;
    region: string | null;
    stage: string;
    interest: string;
    ownerName: string | null;
    createdAt: string | null;
  }[];
  imported?: number;
}
