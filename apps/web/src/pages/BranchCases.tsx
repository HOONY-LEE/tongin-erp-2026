import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BRANCH_CASE_KIND,
  BRANCH_CASE_STATUS,
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
  FilterButton,
  filterRows,
  FormModal,
  ListPage,
  RecordDetail,
  SegmentedControl,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import styles from './work.module.css';
import { BRANCH_CASE_KIND_LABEL, BRANCH_CASE_STATUS_LABEL } from '../i18n/codes';

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
  /** 검색 옆 필터 — 기간·지점·담당자 */
  const [flt, setFlt] = useState<FilterValues>({});
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
        label: t('biz.branch'),
        required: true,
        type: 'select',
        options: branchOptions,
        pairWithNext: true,
      },
      {
        name: 'kind',
        label: t('biz.kind'),
        required: true,
        type: 'select',
        options: BRANCH_CASE_KIND.map((k) => ({ value: k, label: BRANCH_CASE_KIND_LABEL[k] })),
      },
      { name: 'title', label: t('biz.title'), required: true },
      {
        name: 'occurredAt',
        label: t('biz.occurredAt'),
        required: true,
        type: 'date',
        pairWithNext: true,
      },
      { name: 'dueDate', label: t('biz.dueAt'), type: 'date', alwaysShow: true },
      {
        name: 'status',
        label: t('biz.status'),
        type: 'select',
        options: BRANCH_CASE_STATUS.map((s) => ({ value: s, label: BRANCH_CASE_STATUS_LABEL[s] })),
        alwaysShow: true,
        pairWithNext: true,
      },
      {
        name: 'assigneeEmpId',
        label: t('biz.owner'),
        type: 'select',
        optionGroups: dir.peopleGroups,
        alwaysShow: true,
      },
      { name: 'amount', label: t('biz.amountLabel'), type: 'number' },
      { name: 'content', label: t('biz.content'), type: 'textarea', alwaysShow: true },
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
      toast({ type: 'success', title: isNew ? t('biz.created') : t('biz.saved') });
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
      toast({
        type: 'success',
        title: t('biz.statusChanged', { v0: BRANCH_CASE_STATUS_LABEL[to] }),
      });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const remove = async (c: BranchCase) => {
    if (!window.confirm(t('biz.caseDeleteQ', { v0: c.title }))) return;
    try {
      await api(`/branch-cases/${c.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('biz.deleted') });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('biz.deleteFailed') });
    }
  };

  const formModal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? t('biz.caseCreate') : t('biz.caseEdit')}
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
          title={d ? `${d.branch?.name ?? ''} · ${d.title}` : t('biz.notFound')}
          backLabel={t('nav.branchCases')}
          onBack={detail.close}
          actions={
            d ? (
              <>
                {can('BRANCH_CASE.DELETE') && (
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                    {t('biz.delete')}
                  </Button>
                )}
                {can('BRANCH_CASE.UPDATE') && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(d)}>
                      {t('biz.edit')}
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
                      { label: t('biz.branch'), value: d.branch?.name },
                      { label: t('biz.kind'), value: <StatusBadge value={d.kind} map={KIND} /> },
                      {
                        label: t('biz.status'),
                        value: <StatusBadge value={d.status} map={STATUS} />,
                      },
                      { label: t('biz.occurredAt'), value: ymd(d.occurredAt) },
                      { label: t('biz.dueAt'), value: d.dueDate ? <Due c={d} /> : null },
                      { label: t('biz.owner'), value: d.assignee?.name },
                      { label: t('biz.amount'), value: won(d.amount) },
                      { label: t('biz.createdAt'), value: shortDate(d.createdAt) },
                    ],
                  },
                  {
                    title: t('biz.content'),
                    items: [
                      {
                        label: t('biz.content'),
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

  const names = (xs: (string | undefined)[]) =>
    [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'ko'));
  const branchNames = names(rows.map((c) => c.branch?.name));
  const ownerNames = names(rows.map((c) => c.assignee?.name));
  const filterFields: FilterField[] = [
    {
      key: 'period',
      label: t('biz.flt.period'),
      type: 'date',
      options: [
        { value: 'occurredAt', label: t('biz.flt.occurredAt') },
        { value: 'dueDate', label: t('biz.flt.dueDate') },
        { value: 'createdAt', label: t('biz.flt.createdAt') },
      ],
    },
    ...(branchNames.length > 1
      ? [
          {
            key: 'branch',
            label: t('biz.flt.branch'),
            type: 'multi',
            options: branchNames.map((x) => ({ value: x, label: x })),
          } as FilterField,
        ]
      : []),
    ...(ownerNames.length
      ? [
          {
            key: 'owner',
            label: t('biz.flt.owner'),
            type: 'multi',
            options: [
              ...ownerNames.map((x) => ({ value: x, label: x })),
              { value: '', label: t('biz.flt.noOwner') },
            ],
          } as FilterField,
        ]
      : []),
  ];
  // 필터를 먼저 걸고, 종류 탭·상태 숫자도 걸린 목록 기준으로
  const picked = filterRows(rows, filterFields, flt, (c, key) =>
    key === 'branch'
      ? (c.branch?.name ?? '')
      : key === 'owner'
        ? (c.assignee?.name ?? '')
        : c[key as keyof BranchCase],
  );
  const byKind = kind === 'ALL' ? picked : picked.filter((r) => r.kind === kind);
  const statusMatch = (c: BranchCase, s: typeof status) =>
    s === 'ALL' ? true : s === 'ACTIVE' ? c.status !== 'CLOSED' : c.status === s;
  const statusCount = (s: typeof status) => byKind.filter((r) => statusMatch(r, s)).length;
  const kindOptions = [
    { value: 'ALL', label: t('biz.allN', { v0: picked.length }) },
    ...BRANCH_CASE_KIND.map((k) => ({
      value: k,
      label: `${BRANCH_CASE_KIND_LABEL[k]} ${picked.filter((r) => r.kind === k).length}`,
    })),
  ];
  const statusOptions = [
    { value: 'ACTIVE', label: t('biz.openN', { v0: statusCount('ACTIVE') }) },
    ...BRANCH_CASE_STATUS.map((s) => ({
      value: s,
      label: `${BRANCH_CASE_STATUS_LABEL[s]} ${statusCount(s)}`,
    })),
    { value: 'ALL', label: t('biz.all') },
  ];

  const columns: Column[] = [
    {
      title: t('biz.occurredAt'),
      dataIndex: 'occurredAt',
      width: 110,
      render: (r) => ymd(r.occurredAt),
    },
    {
      title: t('biz.branch'),
      width: 130,
      render: (r) => (r as unknown as BranchCase).branch?.name ?? '-',
    },
    {
      title: t('biz.kind'),
      width: 100,
      render: (r) => <StatusBadge value={String(r.kind)} map={KIND} />,
    },
    { title: t('biz.title'), dataIndex: 'title', flex: 1, minWidth: 240 },
    {
      title: t('biz.status'),
      width: 100,
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS} />,
    },
    {
      title: t('biz.dueAt'),
      width: 160,
      dataIndex: 'dueDate',
      render: (r) => <Due c={r as unknown as BranchCase} />,
      exportValue: (r) => ymd(r.dueDate) || null,
    },
    {
      title: t('biz.ownerShort'),
      width: 90,
      render: (r) => (r as unknown as BranchCase).assignee?.name ?? '-',
    },
    { title: t('biz.amount'), numeric: true, width: 120, render: (r) => won(r.amount) || '-' },
  ];

  return (
    <ListPage fit title={t('nav.branchCases')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        tabs={
          <SegmentedControl
            value={kind}
            onChange={(v) => setKind(v as 'ALL' | BranchCaseKind)}
            options={kindOptions}
          />
        }
        fit
        columns={columns}
        rows={byKind.filter((r) => statusMatch(r, status)) as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => detail.open(String(r.id))}
        filters={
          <>
            <FilterButton fields={filterFields} value={flt} onChange={setFlt} />
            <SegmentedControl
              value={status}
              onChange={(v) => setStatus(v as typeof status)}
              options={statusOptions}
            />
          </>
        }
        toolbarActions={
          can('BRANCH_CASE.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              {t('biz.caseCreateBtn')}
            </Button>
          ) : undefined
        }
        exportable
        exportFileName={t('biz.caseExport')}
      />
      {formModal}
    </ListPage>
  );
}
