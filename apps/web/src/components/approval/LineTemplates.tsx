import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Combobox } from '@sunghoon_lee/akron-ui';
import {
  APPROVAL_DOC_TYPES,
  APPROVAL_LINE_MAX_STEPS,
  type ApprovalLineRule,
  type ApprovalResolver,
  type ApprovalStepKind,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { lineKeyLabel, useApprovalForms, useDirectory } from '../../lib/approvals';
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
import { APPROVAL_DOC_TYPE_LABEL, APPROVAL_RESOLVER_LABEL } from '../../i18n/codes';

interface Template {
  id: string;
  /** 문서 종류 또는 결재 양식 'FORM:<id>' */
  docType: string;
  orgUnitId: string | null;
  name: string;
  steps: ApprovalLineRule[];
  isActive: boolean;
}

const COMPANY = '__COMPANY__';
export const EMPTY_RULE: ApprovalLineRule = { kind: 'APPROVER', resolver: 'DEPT_HEAD' };

/**
 * 기본 결재선 설정 — 문서 종류 × 조직마다 결재 규칙을 정한다.
 * 신청자 조직부터 위로 올라가며 가장 가까운 결재선을 쓰고, 없으면 전사 기본, 그것도 없으면 부서장 결재 한 단계.
 */
/** tabs: 표 툴바 셋째 줄 왼쪽 탭(결재함의 상자 탭) */
export function LineTemplates({ tabs }: { tabs?: ReactNode } = {}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { people, orgs } = useDirectory();
  const { forms } = useApprovalForms(true);
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Template[]>('/approvals/line-templates'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('appr.loadFailed') });
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
      ? t('appr.head')
      : r.resolver === 'ORG_HEAD'
        ? t('appr.headOf', { v0: orgName.get(r.orgUnitId ?? '') ?? '?' })
        : (personName.get(r.employeeId ?? '') ?? '?');
  const summary = (tpl: Template) => {
    const a = tpl.steps.filter((s) => s.kind === 'APPROVER').map(ruleText);
    const c = tpl.steps.filter((s) => s.kind === 'CC').map(ruleText);
    return a.join(' → ') + (c.length ? t('appr.ccOf', { v0: c.join(', ') }) : '');
  };

  const columns: Column[] = [
    {
      title: t('appr.docType'),
      render: (r) => lineKeyLabel(String(r.docType), forms),
    },
    {
      title: t('appr.appliesTo'),
      render: (r) =>
        r.orgUnitId ? (orgName.get(String(r.orgUnitId)) ?? '-') : t('appr.companyDefault'),
    },
    { title: t('appr.name'), dataIndex: 'name' },
    {
      title: t('appr.line'),
      flex: 1,
      minWidth: 260,
      render: (r) => summary(r as unknown as Template),
    },
    {
      title: t('appr.status'),
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? t('appr.on') : t('appr.off')}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <DataTable
        tabs={tabs}
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => setEditing(r as unknown as Template)}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            {t('appr.lineAddBtn')}
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
  const { t } = useTranslation();
  const toast = useToast();
  const { orgs } = useDirectory();
  const { forms } = useApprovalForms(true);
  const [docType, setDocType] = useState<string>(initial?.docType ?? 'LEAVE');
  // 문서 종류 + 관리자가 만든 결재 양식(양식마다 결재선을 따로 둘 수 있다)
  const keyOptions = [
    ...APPROVAL_DOC_TYPES.filter((d) => d !== 'FORM').map((d) => ({
      value: d as string,
      label: APPROVAL_DOC_TYPE_LABEL[d],
    })),
    ...forms
      .filter((f) => f.kind === 'CUSTOM')
      .map((f) => ({ value: `FORM:${f.id}`, label: t('appr.formOf', { v0: f.name }) })),
  ];
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

  const save = async () => {
    setBusy(true);
    try {
      const body = JSON.stringify({
        docType,
        orgUnitId: orgUnitId === COMPANY ? null : orgUnitId,
        name: name.trim() || t('appr.lineOf', { v0: lineKeyLabel(docType, forms) }),
        steps,
        isActive,
      });
      if (initial) await api(`/approvals/line-templates/${initial.id}`, { method: 'PATCH', body });
      else await api('/approvals/line-templates', { method: 'POST', body });
      toast({ type: 'success', title: t('appr.saved') });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('appr.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!initial || !window.confirm(t('appr.lineDeleteQ'))) return;
    try {
      await api(`/approvals/line-templates/${initial.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('appr.deleted') });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('appr.deleteFailed') });
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={initial ? t('appr.lineEdit') : t('appr.lineAdd')}
      footer={
        <>
          {initial && (
            <Button variant="ghost" onClick={() => void remove()} style={{ marginRight: 'auto' }}>
              {t('appr.delete')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('appr.cancel')}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('appr.save')}
          </Button>
        </>
      }
    >
      <div className={styles.formCol}>
        <div className={styles.lineAdd}>
          <label className={styles.fieldLabel} style={{ flex: '1 1 160px' }}>
            {t('appr.docType')}
            <Select value={docType} onValueChange={setDocType} options={keyOptions} />
          </label>
          <label className={styles.fieldLabel} style={{ flex: '1 1 180px' }}>
            {t('appr.appliesTo')}
            <Select
              value={orgUnitId}
              onValueChange={setOrgUnitId}
              options={[{ value: COMPANY, label: t('appr.companyDefault') }, ...orgOptions]}
            />
          </label>
          <label className={styles.fieldLabel} style={{ flex: '1 1 120px' }}>
            {t('appr.status')}
            <Select
              value={isActive ? '1' : '0'}
              onValueChange={(v) => setIsActive(v === '1')}
              options={[
                { value: '1', label: t('appr.on') },
                { value: '0', label: t('appr.off') },
              ]}
            />
          </label>
        </div>
        <label className={styles.fieldLabel}>
          {t('appr.name')}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('appr.linePh', { v0: lineKeyLabel(docType, forms) })}
          />
        </label>

        <div className={styles.fieldLabel}>
          {t('appr.steps')} <span className={styles.muted}>{t('appr.stepsHint')}</span>
        </div>
        <LineStepsEditor steps={steps} onChange={setSteps} />
      </div>
    </Modal>
  );
}

/** 결재선 단계 고치기 — 결재/참조 × 부서장·지정 조직의 장·특정 직원. 결재선 설정과 결재 양식 편집이 같이 쓴다 */
export function LineStepsEditor({
  steps,
  onChange,
}: {
  steps: ApprovalLineRule[];
  onChange: (next: ApprovalLineRule[]) => void;
}) {
  const { t } = useTranslation();
  const { people, orgs } = useDirectory();
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
    onChange(steps.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...steps];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <>
      <ol className={styles.lineList}>
        {steps.map((r, i) => (
          <li key={i} className={styles.lineRow} style={{ flexWrap: 'wrap' }}>
            <div style={{ width: 96 }}>
              <Select
                size="sm"
                value={r.kind}
                onValueChange={(v) => patch(i, { kind: v as ApprovalStepKind })}
                options={[
                  { value: 'APPROVER', label: t('appr.approver') },
                  { value: 'CC', label: t('appr.cc') },
                ]}
              />
            </div>
            <div style={{ width: 150 }}>
              <Select
                size="sm"
                value={r.resolver}
                onValueChange={(v) => patch(i, { resolver: v as ApprovalResolver })}
                options={(Object.keys(APPROVAL_RESOLVER_LABEL) as ApprovalResolver[]).map((k) => ({
                  value: k,
                  label: APPROVAL_RESOLVER_LABEL[k],
                }))}
              />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              {r.resolver === 'ORG_HEAD' && (
                <Select
                  size="sm"
                  value={r.orgUnitId ?? ''}
                  onValueChange={(v) => patch(i, { orgUnitId: v })}
                  options={orgOptions}
                  placeholder={t('appr.pickOrg')}
                />
              )}
              {r.resolver === 'EMPLOYEE' && (
                <Combobox
                  size="sm"
                  options={personOptions}
                  value={r.employeeId ?? null}
                  onChange={(v) => patch(i, { employeeId: v })}
                  placeholder={t('appr.findEmp')}
                />
              )}
              {r.resolver === 'DEPT_HEAD' && (
                <span className={styles.muted}>{t('appr.highestInOrg')}</span>
              )}
            </div>
            <span className={styles.lineActions}>
              <button
                type="button"
                aria-label={t('appr.up')}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={t('appr.down')}
                disabled={i === steps.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                aria-label={t('appr.stepRemove')}
                disabled={steps.length === 1}
                onClick={() => onChange(steps.filter((_, k) => k !== i))}
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
          disabled={steps.length >= APPROVAL_LINE_MAX_STEPS}
          onClick={() => onChange([...steps, { ...EMPTY_RULE }])}
        >
          {t('appr.stepAdd')}
        </Button>
      </div>
    </>
  );
}

/** 결재 규칙을 사람이 읽는 글로 — '부서장', '경영관리의 장', '김완성' */
export function useRuleText() {
  const { people, orgs } = useDirectory();
  const orgName = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const personName = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  return (r: ApprovalLineRule) =>
    r.resolver === 'DEPT_HEAD'
      ? i18n.t('appr.head')
      : r.resolver === 'ORG_HEAD'
        ? i18n.t('appr.headOf', { v0: orgName.get(r.orgUnitId ?? '') ?? '?' })
        : (personName.get(r.employeeId ?? '') ?? '?');
}
