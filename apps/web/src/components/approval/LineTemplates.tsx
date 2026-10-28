import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Combobox } from '@sunghoon_lee/akron-ui';
import {
  APPROVAL_DOC_TYPES,
  APPROVAL_DOC_TYPE_LABEL,
  APPROVAL_RESOLVER_LABEL,
  type ApprovalDocType,
  type ApprovalLineRule,
  type ApprovalResolver,
  type ApprovalStepKind,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { useDirectory } from '../../lib/approvals';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  Select,
  useToast,
  type Column,
  type Row,
} from '../ui';
import styles from './approval.module.css';

interface Template {
  id: string;
  docType: ApprovalDocType;
  orgUnitId: string | null;
  name: string;
  steps: ApprovalLineRule[];
  isActive: boolean;
}

const COMPANY = '__COMPANY__';
const EMPTY_RULE: ApprovalLineRule = { kind: 'APPROVER', resolver: 'DEPT_HEAD' };

/**
 * 기본 결재선 설정 — 문서 종류 × 조직마다 결재 규칙을 정한다.
 * 신청자 조직부터 위로 올라가며 가장 가까운 결재선을 쓰고, 없으면 전사 기본, 그것도 없으면 부서장 결재 한 단계.
 */
export function LineTemplates() {
  const toast = useToast();
  const { people, orgs } = useDirectory();
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Template[]>('/approvals/line-templates'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const orgName = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const personName = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  const ruleText = (r: ApprovalLineRule) =>
    r.resolver === 'DEPT_HEAD'
      ? '부서장'
      : r.resolver === 'ORG_HEAD'
        ? `${orgName.get(r.orgUnitId ?? '') ?? '?'}의 장`
        : (personName.get(r.employeeId ?? '') ?? '?');
  const summary = (t: Template) => {
    const a = t.steps.filter((s) => s.kind === 'APPROVER').map(ruleText);
    const c = t.steps.filter((s) => s.kind === 'CC').map(ruleText);
    return a.join(' → ') + (c.length ? ` · 참조: ${c.join(', ')}` : '');
  };

  const columns: Column[] = [
    {
      title: '문서 종류',
      render: (r) => APPROVAL_DOC_TYPE_LABEL[r.docType as ApprovalDocType] ?? String(r.docType),
    },
    {
      title: '적용 조직',
      render: (r) => (r.orgUnitId ? (orgName.get(String(r.orgUnitId)) ?? '-') : '전사 기본'),
    },
    { title: '이름', dataIndex: 'name' },
    { title: '결재선', flex: 1, minWidth: 260, render: (r) => summary(r as unknown as Template) },
    {
      title: '상태',
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? '사용' : '사용 안 함'}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => setEditing(r as unknown as Template)}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            + 결재선 추가
          </Button>
        }
      />
      {editing && (
        <TemplateEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function TemplateEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { people, orgs } = useDirectory();
  const [docType, setDocType] = useState<ApprovalDocType>(initial?.docType ?? 'LEAVE');
  const [orgUnitId, setOrgUnitId] = useState<string>(initial?.orgUnitId ?? COMPANY);
  const [name, setName] = useState(initial?.name ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [steps, setSteps] = useState<ApprovalLineRule[]>(
    initial?.steps?.length ? initial.steps : [EMPTY_RULE],
  );
  const [busy, setBusy] = useState(false);

  // 조직 선택지 — 본사 쪽만(지점은 부서장 규칙으로 충분하고 96곳이라 목록이 길어진다)
  const orgOptions = useMemo(
    () => orgs.filter((o) => o.type !== 'BRANCH').map((o) => ({ value: o.id, label: o.name })),
    [orgs],
  );
  const personOptions = useMemo(
    () =>
      people.map((p) => ({
        value: p.id,
        label: p.name,
        description: [p.positionName, p.orgUnitName].filter(Boolean).join(' · '),
      })),
    [people],
  );

  const patch = (i: number, p: Partial<ApprovalLineRule>) =>
    setSteps((s) => s.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = async () => {
    setBusy(true);
    try {
      const body = JSON.stringify({
        docType,
        orgUnitId: orgUnitId === COMPANY ? null : orgUnitId,
        name: name.trim() || `${APPROVAL_DOC_TYPE_LABEL[docType]} 결재선`,
        steps,
        isActive,
      });
      if (initial) await api(`/approvals/line-templates/${initial.id}`, { method: 'PATCH', body });
      else await api('/approvals/line-templates', { method: 'POST', body });
      toast({ type: 'success', title: '저장했습니다' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!initial || !window.confirm('이 결재선을 지울까요?')) return;
    try {
      await api(`/approvals/line-templates/${initial.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '지웠습니다' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={initial ? '결재선 수정' : '결재선 추가'}
      footer={
        <>
          {initial && (
            <Button variant="ghost" onClick={() => void remove()} style={{ marginRight: 'auto' }}>
              삭제
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      <div className={styles.formCol}>
        <div className={styles.lineAdd}>
          <label className={styles.fieldLabel} style={{ flex: '1 1 160px' }}>
            문서 종류
            <Select
              value={docType}
              onValueChange={(v) => setDocType(v as ApprovalDocType)}
              options={APPROVAL_DOC_TYPES.map((d) => ({
                value: d,
                label: APPROVAL_DOC_TYPE_LABEL[d],
              }))}
            />
          </label>
          <label className={styles.fieldLabel} style={{ flex: '1 1 180px' }}>
            적용 조직
            <Select
              value={orgUnitId}
              onValueChange={setOrgUnitId}
              options={[{ value: COMPANY, label: '전사 기본' }, ...orgOptions]}
            />
          </label>
          <label className={styles.fieldLabel} style={{ flex: '1 1 120px' }}>
            상태
            <Select
              value={isActive ? '1' : '0'}
              onValueChange={(v) => setIsActive(v === '1')}
              options={[
                { value: '1', label: '사용' },
                { value: '0', label: '사용 안 함' },
              ]}
            />
          </label>
        </div>
        <label className={styles.fieldLabel}>
          이름
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`예: ${APPROVAL_DOC_TYPE_LABEL[docType]} 기본`}
          />
        </label>

        <div className={styles.fieldLabel}>
          단계 <span className={styles.muted}>결재는 위에서부터 차례로, 참조는 순서와 무관</span>
        </div>
        <ol className={styles.lineList}>
          {steps.map((r, i) => (
            <li key={i} className={styles.lineRow} style={{ flexWrap: 'wrap' }}>
              <div style={{ width: 96 }}>
                <Select
                  size="sm"
                  value={r.kind}
                  onValueChange={(v) => patch(i, { kind: v as ApprovalStepKind })}
                  options={[
                    { value: 'APPROVER', label: '결재' },
                    { value: 'CC', label: '참조' },
                  ]}
                />
              </div>
              <div style={{ width: 150 }}>
                <Select
                  size="sm"
                  value={r.resolver}
                  onValueChange={(v) => patch(i, { resolver: v as ApprovalResolver })}
                  options={(Object.keys(APPROVAL_RESOLVER_LABEL) as ApprovalResolver[]).map(
                    (k) => ({ value: k, label: APPROVAL_RESOLVER_LABEL[k] }),
                  )}
                />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                {r.resolver === 'ORG_HEAD' && (
                  <Select
                    size="sm"
                    value={r.orgUnitId ?? ''}
                    onValueChange={(v) => patch(i, { orgUnitId: v })}
                    options={orgOptions}
                    placeholder="조직 고르기"
                  />
                )}
                {r.resolver === 'EMPLOYEE' && (
                  <Combobox
                    size="sm"
                    options={personOptions}
                    value={r.employeeId ?? null}
                    onChange={(v) => patch(i, { employeeId: v })}
                    placeholder="직원 찾기"
                  />
                )}
                {r.resolver === 'DEPT_HEAD' && (
                  <span className={styles.muted}>신청자 소속 조직에서 직책이 가장 높은 사람</span>
                )}
              </div>
              <span className={styles.lineActions}>
                <button
                  type="button"
                  aria-label="위로"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label="아래로"
                  disabled={i === steps.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  aria-label="단계 빼기"
                  disabled={steps.length === 1}
                  onClick={() => setSteps((s) => s.filter((_, k) => k !== i))}
                >
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={steps.length >= 10}
            onClick={() => setSteps((s) => [...s, { ...EMPTY_RULE }])}
          >
            + 단계 추가
          </Button>
        </div>
      </div>
    </Modal>
  );
}
