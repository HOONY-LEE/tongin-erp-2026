import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BRANCH_CASE_KIND,
  BRANCH_CASE_KIND_LABEL,
  BRANCH_CASE_STATUS,
  BRANCH_CASE_STATUS_LABEL,
  type BranchCaseKind,
  type BranchCaseStatus,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDetailParam } from '../lib/useDetailParam';
import { useOrgScope } from '../lib/useOrgScope';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  ddayInfo,
  shortDate,
  toInitial,
  useWorkDirectory,
  won,
  ymd,
  type OrgRef,
  type PersonRef,
} from '../lib/workMenus';
import {
  Button,
  DataTable,
  FormModal,
  ListPage,
  RecordDetail,
  SegmentedControl,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import styles from './work.module.css';

interface BranchCase {
  id: string;
  branchId: string;
  branch: OrgRef;
  kind: BranchCaseKind;
  title: string;
  content: string | null;
  status: BranchCaseStatus;
  occurredAt: string;
  dueDate: string | null;
  assigneeEmpId: string | null;
  assignee: PersonRef | null;
  amount: string | null;
  createdAt: string;
}

const KIND: StatusMap = {
  INSPECTION: { label: BRANCH_CASE_KIND_LABEL.INSPECTION, color: 'info' },
  ILLEGAL: { label: BRANCH_CASE_KIND_LABEL.ILLEGAL, color: 'error' },
  INSURANCE: { label: BRANCH_CASE_KIND_LABEL.INSURANCE, color: 'primary' },
  LAWSUIT: { label: BRANCH_CASE_KIND_LABEL.LAWSUIT, color: 'error' },
  RENEWAL: { label: BRANCH_CASE_KIND_LABEL.RENEWAL, color: 'success' },
  COMPLAINT: { label: BRANCH_CASE_KIND_LABEL.COMPLAINT, color: 'warning' },
};
const STATUS: StatusMap = {
  OPEN: { label: BRANCH_CASE_STATUS_LABEL.OPEN, color: 'warning' },
  IN_PROGRESS: { label: BRANCH_CASE_STATUS_LABEL.IN_PROGRESS, color: 'info' },
  CLOSED: { label: BRANCH_CASE_STATUS_LABEL.CLOSED, color: 'neutral' },
};

/** 기한 — 종결 안 된 건만 지남·임박(7일)을 색으로 */
function Due({ c }: { c: BranchCase }) {
  if (!c.dueDate) return <>-</>;
  const info = c.status === 'CLOSED' ? null : ddayInfo(c.dueDate, 7);
  const cls = info?.level === 'over' ? styles.over : info?.level === 'soon' ? styles.soon : '';
  return (
    <span className={cls}>
      {ymd(c.dueDate)}
      {info && info.level !== 'ok' ? ` (${info.label})` : ''}
    </span>
  );
}

/**
 * 지점 관리 기록(가맹팀) — 지점별 현장점검·불법영업·보험처리·소송·재계약·민원.
 * 데이터 범위가 소속 조직인 계정(지점)은 자기 지점 기록만 본다(서버 ScopeService).
 */
export default function BranchCases() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();
  const dir = useWorkDirectory();
  const scope = useOrgScope();
  const [rows, setRows] = useState<BranchCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<'ALL' | BranchCaseKind>('ALL');
  const [status, setStatus] = useState<'ACTIVE' | 'ALL' | BranchCaseStatus>('ACTIVE');
  const [editing, setEditing] = useState<BranchCase | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<BranchCase[]>('/branch-cases'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // 지점 선택지 — 범위 밖 지점은 흐리게(서버도 막는다). 조직 목록 권한이 없으면 결재 명부의 지점 목록
  const branchOptions = useMemo(() => {
    const disabled = new Set(scope.options.filter((o) => o.disabled).map((o) => o.value));
    return dir.branchOptions.map((o) => ({ ...o, disabled: disabled.has(o.value) }));
  }, [dir.branchOptions, scope.options]);

  const fields: FormField[] = useMemo(
    () => [
      {
        name: 'branchId',
        label: '지점',
        required: true,
        type: 'select',
        options: branchOptions,
        pairWithNext: true,
      },
      {
        name: 'kind',
        label: '종류',
        required: true,
        type: 'select',
        options: BRANCH_CASE_KIND.map((k) => ({ value: k, label: BRANCH_CASE_KIND_LABEL[k] })),
      },
      { name: 'title', label: '제목', required: true },
      { name: 'occurredAt', label: '발생일', required: true, type: 'date', pairWithNext: true },
      { name: 'dueDate', label: '처리 기한', type: 'date', alwaysShow: true },
      {
        name: 'status',
        label: '상태',
        type: 'select',
        options: BRANCH_CASE_STATUS.map((s) => ({ value: s, label: BRANCH_CASE_STATUS_LABEL[s] })),
        alwaysShow: true,
        pairWithNext: true,
      },
      {
        name: 'assigneeEmpId',
        label: '담당자',
        type: 'select',
        optionGroups: dir.peopleGroups,
        alwaysShow: true,
      },
      { name: 'amount', label: '금액(원) — 보험금·합의금 등', type: 'number' },
      { name: 'content', label: '내용', type: 'textarea', alwaysShow: true },
    ],
    [branchOptions, dir.peopleGroups],
  );

  const save = async (values: Record<string, unknown>) => {
    const isNew = editing === 'new';
    try {
      const saved = await api<BranchCase>(
        isNew ? '/branch-cases' : `/branch-cases/${(editing as BranchCase).id}`,
        { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(values) },
      );
      toast({ type: 'success', title: isNew ? '등록했습니다' : '저장했습니다' });
      await load();
      if (isNew) detail.open(saved.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const changeStatus = async (c: BranchCase, to: BranchCaseStatus) => {
    try {
      await api(`/branch-cases/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: to }) });
      toast({ type: 'success', title: `${BRANCH_CASE_STATUS_LABEL[to]}(으)로 바꿨습니다` });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const remove = async (c: BranchCase) => {
    if (!window.confirm(`'${c.title}' 기록을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/branch-cases/${c.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '삭제했습니다' });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  const formModal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? '지점 관리 기록 등록' : '지점 관리 기록 수정'}
      size="md"
      fields={fields}
      initialValues={
        editing === 'new'
          ? { status: 'OPEN', occurredAt: new Date().toLocaleDateString('sv-SE') }
          : editing
            ? toInitial(
                editing as unknown as Record<string, unknown>,
                fields.map((f) => f.name),
              )
            : undefined
      }
      onSubmit={save}
    />
  );

  if (detail.id) {
    const d = rows.find((r) => r.id === detail.id);
    return (
      <>
        <RecordDetail
          loading={!d && loading}
          title={d ? `${d.branch?.name ?? ''} · ${d.title}` : '찾을 수 없습니다'}
          backLabel={t('nav.branchCases')}
          onBack={detail.close}
          actions={
            d ? (
              <>
                {can('BRANCH_CASE.DELETE') && (
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                    삭제
                  </Button>
                )}
                {can('BRANCH_CASE.UPDATE') && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(d)}>
                      수정
                    </Button>
                    <SegmentedControl
                      size="sm"
                      value={d.status}
                      onChange={(v) =>
                        v !== d.status && void changeStatus(d, v as BranchCaseStatus)
                      }
                      options={BRANCH_CASE_STATUS.map((s) => ({
                        value: s,
                        label: BRANCH_CASE_STATUS_LABEL[s],
                      }))}
                    />
                  </>
                )}
              </>
            ) : undefined
          }
          sections={
            d
              ? [
                  {
                    items: [
                      { label: '지점', value: d.branch?.name },
                      { label: '종류', value: <StatusBadge value={d.kind} map={KIND} /> },
                      { label: '상태', value: <StatusBadge value={d.status} map={STATUS} /> },
                      { label: '발생일', value: ymd(d.occurredAt) },
                      { label: '처리 기한', value: d.dueDate ? <Due c={d} /> : null },
                      { label: '담당자', value: d.assignee?.name },
                      { label: '금액', value: won(d.amount) },
                      { label: '등록일', value: shortDate(d.createdAt) },
                    ],
                  },
                  {
                    title: '내용',
                    items: [
                      {
                        label: '내용',
                        value: d.content ? <p className={styles.body}>{d.content}</p> : null,
                        wide: true,
                      },
                    ],
                  },
                ]
              : []
          }
        />
        {formModal}
      </>
    );
  }

  const byKind = kind === 'ALL' ? rows : rows.filter((r) => r.kind === kind);
  const statusMatch = (c: BranchCase, s: typeof status) =>
    s === 'ALL' ? true : s === 'ACTIVE' ? c.status !== 'CLOSED' : c.status === s;
  const statusCount = (s: typeof status) => byKind.filter((r) => statusMatch(r, s)).length;
  const kindOptions = [
    { value: 'ALL', label: `전체 ${rows.length}` },
    ...BRANCH_CASE_KIND.map((k) => ({
      value: k,
      label: `${BRANCH_CASE_KIND_LABEL[k]} ${rows.filter((r) => r.kind === k).length}`,
    })),
  ];
  const statusOptions = [
    { value: 'ACTIVE', label: `미결 ${statusCount('ACTIVE')}` },
    ...BRANCH_CASE_STATUS.map((s) => ({
      value: s,
      label: `${BRANCH_CASE_STATUS_LABEL[s]} ${statusCount(s)}`,
    })),
    { value: 'ALL', label: '전체' },
  ];

  const columns: Column[] = [
    {
      title: '발생일',
      dataIndex: 'occurredAt',
      width: 110,
      render: (r) => ymd(r.occurredAt),
    },
    { title: '지점', width: 130, render: (r) => (r as unknown as BranchCase).branch?.name ?? '-' },
    {
      title: '종류',
      width: 100,
      render: (r) => <StatusBadge value={String(r.kind)} map={KIND} />,
    },
    { title: '제목', dataIndex: 'title', flex: 1, minWidth: 240 },
    {
      title: '상태',
      width: 100,
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS} />,
    },
    {
      title: '처리 기한',
      width: 160,
      dataIndex: 'dueDate',
      render: (r) => <Due c={r as unknown as BranchCase} />,
      exportValue: (r) => ymd(r.dueDate) || null,
    },
    {
      title: '담당',
      width: 90,
      render: (r) => (r as unknown as BranchCase).assignee?.name ?? '-',
    },
    { title: '금액', numeric: true, width: 120, render: (r) => won(r.amount) || '-' },
  ];

  return (
    <ListPage
      fit
      title={t('nav.branchCases')}
      onRefresh={load}
      updatedAt={updatedAt}
      footer={
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as 'ALL' | BranchCaseKind)}
          options={kindOptions}
        />
      }
    >
      <DataTable
        fit
        columns={columns}
        rows={byKind.filter((r) => statusMatch(r, status)) as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => detail.open(String(r.id))}
        filters={
          <SegmentedControl
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={statusOptions}
          />
        }
        toolbarActions={
          can('BRANCH_CASE.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              + 기록 등록
            </Button>
          ) : undefined
        }
        exportable
        exportFileName="지점관리기록"
      />
      {formModal}
    </ListPage>
  );
}
