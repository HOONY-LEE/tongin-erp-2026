// ── 지식베이스 — 회사 문서·지침·원칙을 모아 AI가 일할 때 근거로 찾아 읽는다 ──
// 문서를 올리거나 직접 쓰면 AI가 요약·키워드·개념(용어·규칙·역할·절차)과 개념 사이 관계를 뽑아
// 온톨로지(문서 ─ 개념 ─ 개념) 그래프를 만든다. AI 비서·에이전트는 search_knowledge / read_knowledge 도구로 쓴다.

export const KNOWLEDGE_CATEGORIES = [
  'POLICY',
  'HR',
  'SALES',
  'OPERATION',
  'CS',
  'COMPANY',
  'ETC',
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
export const KNOWLEDGE_CATEGORY_LABEL: Record<KnowledgeCategory, string> = {
  POLICY: '규정·원칙',
  HR: '인사·휴가',
  SALES: '영업·계약',
  OPERATION: '현장·작업',
  CS: '고객 응대',
  COMPANY: '회사 소개',
  ETC: '기타',
};
export const KNOWLEDGE_CATEGORY_COLOR: Record<KnowledgeCategory, string> = {
  POLICY: '#2dd4bf',
  HR: '#fbbf24',
  SALES: '#f472b6',
  OPERATION: '#fb923c',
  CS: '#34d399',
  COMPANY: '#60a5fa',
  ETC: '#a1a1aa',
};

/** 개념 종류 — 용어 · 규칙 · 역할(누가) · 절차(어떻게) · 주제 */
export const KNOWLEDGE_CONCEPT_KINDS = ['TERM', 'RULE', 'ROLE', 'PROCESS', 'TOPIC'] as const;
export type KnowledgeConceptKind = (typeof KNOWLEDGE_CONCEPT_KINDS)[number];
export const KNOWLEDGE_CONCEPT_KIND_LABEL: Record<KnowledgeConceptKind, string> = {
  TERM: '용어',
  RULE: '규칙',
  ROLE: '역할',
  PROCESS: '절차',
  TOPIC: '주제',
};
export const KNOWLEDGE_CONCEPT_COLOR: Record<KnowledgeConceptKind, string> = {
  TERM: '#a78bfa',
  RULE: '#f87171',
  ROLE: '#22d3ee',
  PROCESS: '#818cf8',
  TOPIC: '#94a3b8',
};

/** AI 정리 상태 */
export const KNOWLEDGE_ANALYZE_STATUS = ['PENDING', 'DONE', 'ERROR'] as const;
export type KnowledgeAnalyzeStatus = (typeof KNOWLEDGE_ANALYZE_STATUS)[number];

export interface KnowledgeDocRow {
  id: string;
  title: string;
  category: KnowledgeCategory;
  summary: string | null;
  keywords: string[];
  sourceName: string | null;
  analyzeStatus: KnowledgeAnalyzeStatus;
  analyzeError: string | null;
  conceptCount: number;
  updatedAt: string;
  updatedByName: string | null;
}

export interface KnowledgeConceptView {
  id: string;
  name: string;
  kind: KnowledgeConceptKind;
  description: string | null;
}

export interface KnowledgeDocView extends KnowledgeDocRow {
  content: string;
  concepts: KnowledgeConceptView[];
  relations: { from: string; to: string; label: string }[];
  /** 같은 개념을 다루는 다른 문서 */
  related: { id: string; title: string; shared: number }[];
  canEdit: boolean;
}

export interface KnowledgeGraph {
  nodes: {
    id: string;
    type: 'doc' | 'concept';
    label: string;
    /** doc: 분류, concept: 종류 */
    group: string;
    /** 연결 수 */
    degree: number;
  }[];
  links: { source: string; target: string; label?: string }[];
}
