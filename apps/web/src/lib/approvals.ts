import { useCallback, useEffect, useState } from 'react';
import type { ApprovalDocType, ApprovalStepKind } from '@tongin/shared';
import { api, cachedApi } from './api';
import type { StatusMap } from '../components/ui';

/** 화면에 보일 사람 — 이름·직책·소속 */
export interface Person {
  id: string;
  name: string;
  positionName: string | null;
  orgUnitName: string | null;
}

export interface DirectoryPerson extends Person {
  orgUnitId: string;
  positionOrder: number;
}
export interface DirectoryOrg {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

/** 결재선 한 단계(사람으로 정해진 것) — 신청 화면에서 고친다 */
export interface LineEntry {
  kind: ApprovalStepKind;
  person: Person;
}

export interface ApprovalStepView {
  seq: number;
  kind: ApprovalStepKind;
  status: string;
  comment: string | null;
  actedAt: string | null;
  approver: Person;
}

export interface ApprovalDocView {
  id: string;
  docNo: string;
  docType: ApprovalDocType;
  docTypeLabel: string;
  title: string;
  content: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  submittedAt: string;
  completedAt: string | null;
  requester: Person;
  currentApprover: Person | null;
  steps: ApprovalStepView[];
  canAct: boolean;
  canCancel: boolean;
}

export const APPROVAL_STATUS_MAP: StatusMap = {
  PENDING: { label: '진행 중', color: 'info' },
  APPROVED: { label: '승인', color: 'success' },
  REJECTED: { label: '반려', color: 'error' },
  CANCELED: { label: '회수', color: 'neutral' },
};

export const STEP_STATUS_MAP: StatusMap = {
  WAITING: { label: '대기', color: 'neutral' },
  PENDING: { label: '결재 차례', color: 'info' },
  APPROVED: { label: '승인', color: 'success' },
  REJECTED: { label: '반려', color: 'error' },
  SKIPPED: { label: '건너뜀', color: 'neutral' },
};

/** '김수빈 사원 · 마케팅' */
export const personLabel = (p: Person) =>
  [p.name, p.positionName].filter(Boolean).join(' ') + (p.orgUnitName ? ` · ${p.orgUnitName}` : '');

/** 결재선을 상신용({kind, employeeId}[])으로 */
export const toLinePayload = (line: LineEntry[]) =>
  line.map((l) => ({ kind: l.kind, employeeId: l.person.id }));

/** 결재자 고르기용 명부(재직 직원·조직) — 잠깐 캐시 */
export function useDirectory() {
  const [data, setData] = useState<{ people: DirectoryPerson[]; orgs: DirectoryOrg[] }>({
    people: [],
    orgs: [],
  });
  useEffect(() => {
    let alive = true;
    cachedApi<{ people: DirectoryPerson[]; orgs: DirectoryOrg[] }>('/approvals/directory')
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** 내 결재 차례 건수 — 사이드바 배지. 1분마다 다시 읽는다 */
export function usePendingApprovals(enabled: boolean) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setCount((await api<{ count: number }>('/approvals/pending-count')).count);
    } catch {
      /* 네트워크 실패는 배지를 그대로 둔다 */
    }
  }, [enabled]);
  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const t = setInterval(() => void refresh(), 60_000);
    // 결재하고 돌아오면 바로 갱신되도록 화면들이 이 이벤트를 쏜다
    const onChange = () => void refresh();
    window.addEventListener('approvals:changed', onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener('approvals:changed', onChange);
    };
  }, [enabled, refresh]);
  return count;
}

export const notifyApprovalsChanged = () => window.dispatchEvent(new Event('approvals:changed'));
