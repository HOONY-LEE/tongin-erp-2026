import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FRANCHISE_RENEWAL_DAYS,
  FRANCHISE_STATUSES,
  FRANCHISE_STATUS_LABEL,
  type FranchiseBranchRow,
  type FranchiseStatus,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useDetailParam, useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { formatPhone } from '../lib/phone';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  PageHeader,
  RecordDetail,
  SegmentedControl,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';
import styles from './franchise.module.css';

type Tab = 'all' | 'renewal' | 'unpaid' | 'empty' | 'ended';
interface Res {
  rows: FranchiseBranchRow[];
  summary: Record<string, number>;
}

const won = (n: number | null) =>
  n === null ? '—' : i18n.t('fran.won', { v0: n.toLocaleString('ko-KR') });
const STATUS_COLOR: Record<FranchiseStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  OPERATING: 'success',
  PREPARING: 'info',
  SUSPENDED: 'warning',
  TERMINATED: 'neutral',
};

function Dday({ r }: { r: FranchiseBranchRow }) {
  const { t } = useTranslation();
  if (!r.contractEnd) return <span className={styles.muted}>—</span>;
  const d = r.daysLeft ?? 0;
  return (
    <span className={d < 0 ? styles.over : r.renewalDue ? styles.soon : ''}>
      {r.contractEnd}
      {r.status !== 'TERMINATED' &&
        (d < 0 ? t('fran.expiredDays', { v0: -d }) : r.renewalDue ? ` (D-${d})` : '')}
    </span>
  );
}

function Paid({ amount, at }: { amount: number | null; at: string | null }) {
  const { t } = useTranslation();
  if (!amount) return <span className={styles.muted}>—</span>;
  return (
    <span className={styles.paid}>
      {won(amount)}
      <Badge variant="subtle" color={at ? 'success' : 'warning'} size="sm">
        {at ? t('fran.paid') : t('fran.unconfirmed')}
      </Badge>
    </span>
  );
}

/**
 * 가맹점 현황 — 지점(가맹점)마다 가맹주·계약 기간·가맹비·보증금·상호사용료.
 * 재계약 대상(만료 90일 안·지남), 가맹비·보증금 입금 미확인, 계약 정보를 안 넣은 곳을 탭으로 모은다.
 */
export default function Franchise() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const [data, setData] = useState<Res | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<FranchiseBranchRow | null>(null);
  const { tab, setTab } = useTabParam<Tab>('all');
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Res>('/franchise/branches'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('fran.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, touch]);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.rows ?? [];
  const s = data?.summary ?? {};
  const shown = useMemo(
    () =>
      rows.filter((r) =>
        tab === 'renewal'
          ? r.renewalDue
          : tab === 'unpaid'
            ? r.unpaid
            : tab === 'empty'
              ? r.empty
              : tab === 'ended'
                ? r.status === 'TERMINATED'
                : r.status !== 'TERMINATED',
      ),
    [rows, tab],
  );

  const fields: FormField[] = [
    {
      name: 'status',
      label: t('fran.status'),
      type: 'chips',
      options: FRANCHISE_STATUSES.map((v) => ({ value: v, label: FRANCHISE_STATUS_LABEL[v] })),
      alwaysShow: true,
    },
    { name: 'ownerName', label: t('fran.owner'), alwaysShow: true, pairWithNext: true },
    { name: 'ownerPhone', label: t('fran.ownerPhone'), type: 'tel', alwaysShow: true },
    {
      name: 'contractStart',
      label: t('fran.contractStart'),
      type: 'date',
      alwaysShow: true,
      pairWithNext: true,
    },
    { name: 'contractEnd', label: t('fran.contractEnd'), type: 'date', alwaysShow: true },
    {
      name: 'franchiseFee',
      label: t('fran.feeWon'),
      type: 'number',
      alwaysShow: true,
      pairWithNext: true,
    },
    { name: 'feePaidAt', label: t('fran.feePaidAt'), type: 'date', alwaysShow: true },
    {
      name: 'deposit',
      label: t('fran.depositWon'),
      type: 'number',
      alwaysShow: true,
      pairWithNext: true,
    },
    { name: 'depositPaidAt', label: t('fran.depositPaidAt'), type: 'date', alwaysShow: true },
    { name: 'royalty', label: t('fran.royaltyWon'), type: 'number', pairWithNext: true },
    { name: 'bizNo', label: t('fran.bizNo') },
    { name: 'memo', label: t('fran.memo'), type: 'textarea' },
  ];
  const save = async (v: Record<string, unknown>) => {
    if (!editing) return;
    const n = (k: string) => (v[k] === '' || v[k] == null ? null : Number(v[k]));
    const str = (k: string) => (v[k] === '' || v[k] == null ? null : String(v[k]));
    try {
      await api(`/franchise/branches/${editing.orgUnitId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: v.status || 'OPERATING',
          ownerName: str('ownerName'),
          ownerPhone: str('ownerPhone'),
          bizNo: str('bizNo'),
          contractStart: str('contractStart'),
          contractEnd: str('contractEnd'),
          franchiseFee: n('franchiseFee'),
          feePaidAt: str('feePaidAt'),
          deposit: n('deposit'),
          depositPaidAt: str('depositPaidAt'),
          royalty: n('royalty'),
          memo: str('memo'),
        }),
      });
      toast({ type: 'success', title: t('fran.saved') });
      setEditing(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('fran.saveFailed') });
      throw e;
    }
  };
  const initial = (r: FranchiseBranchRow) =>
    Object.fromEntries(
      Object.entries({
        status: r.status,
        ownerName: r.ownerName,
        ownerPhone: r.ownerPhone,
        bizNo: r.bizNo,
        contractStart: r.contractStart,
        contractEnd: r.contractEnd,
        franchiseFee: r.franchiseFee,
        feePaidAt: r.feePaidAt,
        deposit: r.deposit,
        depositPaidAt: r.depositPaidAt,
        royalty: r.royalty,
        memo: r.memo,
      })
        .filter(([, x]) => x !== null && x !== undefined)
        .map(([k, x]) => [k, String(x)]),
    );
  const modal = (
    <FormModal
      open={!!editing}
      onOpenChange={(o) => !o && setEditing(null)}
      title={t('fran.editTitle', { v0: editing?.name ?? '' })}
      size="md"
      fields={fields}
      initialValues={editing ? initial(editing) : undefined}
      onSubmit={save}
    />
  );

  if (detail.id) {
    const r = rows.find((x) => x.orgUnitId === detail.id);
    return (
      <>
        <RecordDetail
          loading={!r && loading}
          title={r ? r.name : t('fran.notFound')}
          backLabel={t('fran.title')}
          onBack={detail.close}
          actions={
            r && can('FRANCHISE.UPDATE') ? (
              <Button variant="primary" size="sm" onClick={() => setEditing(r)}>
                {t('fran.editBtn')}
              </Button>
            ) : undefined
          }
          sections={
            r
              ? [
                  {
                    title: t('fran.franchise'),
                    items: [
                      {
                        label: t('fran.status'),
                        value: (
                          <Badge variant="subtle" color={STATUS_COLOR[r.status]}>
                            {FRANCHISE_STATUS_LABEL[r.status]}
                          </Badge>
                        ),
                      },
                      { label: t('fran.ownerShort'), value: r.ownerName },
                      {
                        label: t('fran.phone'),
                        value: r.ownerPhone ? formatPhone(r.ownerPhone) : null,
                      },
                      { label: t('fran.bizNo'), value: r.bizNo },
                      { label: t('fran.org'), value: r.parentName },
                      {
                        label: t('fran.employees'),
                        value: t('fran.peopleN', { v0: r.employeeCount }),
                      },
                      { label: t('fran.address'), value: r.addr, wide: true },
                    ],
                  },
                  {
                    title: t('fran.contractPay'),
                    items: [
                      { label: t('fran.contractStart'), value: r.contractStart },
                      { label: t('fran.contractEnd'), value: <Dday r={r} /> },
                      {
                        label: t('fran.fee'),
                        value: <Paid amount={r.franchiseFee} at={r.feePaidAt} />,
                      },
                      { label: t('fran.feePaidAt'), value: r.feePaidAt },
                      {
                        label: t('fran.deposit'),
                        value: <Paid amount={r.deposit} at={r.depositPaidAt} />,
                      },
                      { label: t('fran.depositPaidAt'), value: r.depositPaidAt },
                      { label: t('fran.royalty'), value: r.royalty ? won(r.royalty) : null },
                      { label: t('fran.memo'), value: r.memo, wide: true },
                    ],
                  },
                ]
              : []
          }
        >
          {r && (
            <div className={styles.links}>
              <Link to={`/branches?detail=${r.orgUnitId}`}>{t('fran.viewBranch')}</Link>
              <Link to={`/branch-cases`}>{t('fran.branchCases')}</Link>
              <Link to={`/performance?scope=ORG&id=${r.orgUnitId}`}>{t('fran.perf')}</Link>
            </div>
          )}
        </RecordDetail>
        {modal}
      </>
    );
  }

  const columns: Column[] = [
    { title: t('fran.franchise'), dataIndex: 'name', minWidth: 130, flex: 1 },
    {
      title: t('fran.status'),
      width: 90,
      render: (r) => {
        const x = r as unknown as FranchiseBranchRow;
        return x.empty ? (
          <span className={styles.muted}>{t('fran.noInfo')}</span>
        ) : (
          <Badge variant="subtle" color={STATUS_COLOR[x.status]} size="sm">
            {FRANCHISE_STATUS_LABEL[x.status]}
          </Badge>
        );
      },
      exportValue: (r) => FRANCHISE_STATUS_LABEL[(r as unknown as FranchiseBranchRow).status],
    },
    {
      title: t('fran.ownerShort'),
      dataIndex: 'ownerName',
      width: 90,
      render: (r) => (r.ownerName as string) ?? '—',
    },
    {
      title: t('fran.phone'),
      render: (r) => (r.ownerPhone ? formatPhone(String(r.ownerPhone)) : '—'),
    },
    {
      title: t('fran.contractStart'),
      dataIndex: 'contractStart',
      width: 110,
      render: (r) => (r.contractStart as string) ?? '—',
    },
    {
      title: t('fran.contractEnd'),
      width: 160,
      render: (r) => <Dday r={r as unknown as FranchiseBranchRow} />,
      exportValue: (r) => (r.contractEnd as string) ?? '',
    },
    {
      title: t('fran.fee'),
      width: 160,
      render: (r) => {
        const x = r as unknown as FranchiseBranchRow;
        return <Paid amount={x.franchiseFee} at={x.feePaidAt} />;
      },
      exportValue: (r) => (r.franchiseFee as number) ?? '',
    },
    {
      title: t('fran.deposit'),
      width: 160,
      render: (r) => {
        const x = r as unknown as FranchiseBranchRow;
        return <Paid amount={x.deposit} at={x.depositPaidAt} />;
      },
      exportValue: (r) => (r.deposit as number) ?? '',
    },
    {
      title: t('fran.royaltyShort'),
      width: 110,
      numeric: true,
      render: (r) => (r.royalty ? won(r.royalty as number) : '—'),
    },
  ];

  const tile = (label: string, value: number | undefined, to?: Tab, tone?: 'warn') => (
    <button
      type="button"
      className={`${styles.tile} ${tone === 'warn' && value ? styles.tileWarn : ''} ${to && tab === to ? styles.tileOn : ''}`}
      onClick={() => to && setTab(to)}
      disabled={!to}
    >
      <span>{label}</span>
      <b>{value ?? '—'}</b>
    </button>
  );

  return (
    <div className="list-page fit">
      <PageHeader
        title={t('fran.title')}
        subtitle={t('fran.subtitle', { v0: FRANCHISE_RENEWAL_DAYS })}
        onRefresh={load}
        updatedAt={updatedAt}
      />
      <div className={styles.tiles}>
        {tile(t('fran.stat.active'), s.total, 'all')}
        {tile(t('fran.stat.newThisYear'), s.newThisYear)}
        {tile(
          t('fran.stat.renewal', { v0: FRANCHISE_RENEWAL_DAYS }),
          s.renewalDue,
          'renewal',
          'warn',
        )}
        {tile(t('fran.stat.unpaid'), s.unpaid, 'unpaid', 'warn')}
        {tile(t('fran.stat.missing'), s.missing, 'empty')}
        <Link className={styles.tile} to="/franchise-leads">
          <span>{t('fran.inSales')}</span>
          <b>{s.leadsOpen ?? '—'}</b>
        </Link>
      </div>
      <DataTable
        columns={columns}
        rows={shown as unknown as Row[]}
        rowKey="orgUnitId"
        loading={loading}
        fit
        exportable
        exportFileName={t('fran.exportName')}
        tabs={
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: 'all', label: t('fran.all') },
              { value: 'renewal', label: t('fran.renewalN', { v0: s.renewalDue ?? '' }) },
              { value: 'unpaid', label: t('fran.unpaidN', { v0: s.unpaid ?? '' }) },
              { value: 'empty', label: t('fran.missingN', { v0: s.missing ?? '' }) },
              { value: 'ended', label: t('fran.terminated') },
            ]}
          />
        }
        onRowClick={(r) => detail.open(String(r.orgUnitId))}
      />
      {modal}
    </div>
  );
}
