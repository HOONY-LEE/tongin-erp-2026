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

const won = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('ko-KR')}원`);
const STATUS_COLOR: Record<FranchiseStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  OPERATING: 'success',
  PREPARING: 'info',
  SUSPENDED: 'warning',
  TERMINATED: 'neutral',
};

function Dday({ r }: { r: FranchiseBranchRow }) {
  if (!r.contractEnd) return <span className={styles.muted}>—</span>;
  const d = r.daysLeft ?? 0;
  return (
    <span className={d < 0 ? styles.over : r.renewalDue ? styles.soon : ''}>
      {r.contractEnd}
      {r.status !== 'TERMINATED' && (d < 0 ? ` (만료 ${-d}일)` : r.renewalDue ? ` (D-${d})` : '')}
    </span>
  );
}

function Paid({ amount, at }: { amount: number | null; at: string | null }) {
  if (!amount) return <span className={styles.muted}>—</span>;
  return (
    <span className={styles.paid}>
      {won(amount)}
      <Badge variant="subtle" color={at ? 'success' : 'warning'} size="sm">
        {at ? '입금' : '미확인'}
      </Badge>
    </span>
  );
}

/**
 * 가맹점 현황 — 지점(가맹점)마다 가맹주·계약 기간·가맹비·보증금·상호사용료.
 * 재계약 대상(만료 90일 안·지남), 가맹비·보증금 입금 미확인, 계약 정보를 안 넣은 곳을 탭으로 모은다.
 */
export default function Franchise() {
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
      label: '상태',
      type: 'chips',
      options: FRANCHISE_STATUSES.map((v) => ({ value: v, label: FRANCHISE_STATUS_LABEL[v] })),
      alwaysShow: true,
    },
    { name: 'ownerName', label: '가맹주(대표)', alwaysShow: true, pairWithNext: true },
    { name: 'ownerPhone', label: '가맹주 연락처', type: 'tel', alwaysShow: true },
    {
      name: 'contractStart',
      label: '계약 시작',
      type: 'date',
      alwaysShow: true,
      pairWithNext: true,
    },
    { name: 'contractEnd', label: '계약 만료', type: 'date', alwaysShow: true },
    {
      name: 'franchiseFee',
      label: '가맹비(원)',
      type: 'number',
      alwaysShow: true,
      pairWithNext: true,
    },
    { name: 'feePaidAt', label: '가맹비 입금일', type: 'date', alwaysShow: true },
    { name: 'deposit', label: '보증금(원)', type: 'number', alwaysShow: true, pairWithNext: true },
    { name: 'depositPaidAt', label: '보증금 입금일', type: 'date', alwaysShow: true },
    { name: 'royalty', label: '월 상호사용료(원)', type: 'number', pairWithNext: true },
    { name: 'bizNo', label: '사업자등록번호' },
    { name: 'memo', label: '메모', type: 'textarea' },
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
      toast({ type: 'success', title: '가맹 계약 정보를 저장했습니다' });
      setEditing(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
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
      title={`${editing?.name ?? ''} · 가맹 계약 정보`}
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
          title={r ? r.name : '가맹점을 찾을 수 없습니다'}
          backLabel="가맹점 현황"
          onBack={detail.close}
          actions={
            r && can('FRANCHISE.UPDATE') ? (
              <Button variant="primary" size="sm" onClick={() => setEditing(r)}>
                계약 정보 수정
              </Button>
            ) : undefined
          }
          sections={
            r
              ? [
                  {
                    title: '가맹점',
                    items: [
                      {
                        label: '상태',
                        value: (
                          <Badge variant="subtle" color={STATUS_COLOR[r.status]}>
                            {FRANCHISE_STATUS_LABEL[r.status]}
                          </Badge>
                        ),
                      },
                      { label: '가맹주', value: r.ownerName },
                      { label: '연락처', value: r.ownerPhone ? formatPhone(r.ownerPhone) : null },
                      { label: '사업자등록번호', value: r.bizNo },
                      { label: '소속', value: r.parentName },
                      { label: '직원', value: `${r.employeeCount}명` },
                      { label: '주소', value: r.addr, wide: true },
                    ],
                  },
                  {
                    title: '계약·입금',
                    items: [
                      { label: '계약 시작', value: r.contractStart },
                      { label: '계약 만료', value: <Dday r={r} /> },
                      { label: '가맹비', value: <Paid amount={r.franchiseFee} at={r.feePaidAt} /> },
                      { label: '가맹비 입금일', value: r.feePaidAt },
                      { label: '보증금', value: <Paid amount={r.deposit} at={r.depositPaidAt} /> },
                      { label: '보증금 입금일', value: r.depositPaidAt },
                      { label: '월 상호사용료', value: r.royalty ? won(r.royalty) : null },
                      { label: '메모', value: r.memo, wide: true },
                    ],
                  },
                ]
              : []
          }
        >
          {r && (
            <div className={styles.links}>
              <Link to={`/branches?detail=${r.orgUnitId}`}>지점관리에서 보기 →</Link>
              <Link to={`/branch-cases`}>지점 관리 기록(점검·재계약 등) →</Link>
              <Link to={`/performance?scope=ORG&id=${r.orgUnitId}`}>성과 평가 →</Link>
            </div>
          )}
        </RecordDetail>
        {modal}
      </>
    );
  }

  const columns: Column[] = [
    { title: '가맹점', dataIndex: 'name', minWidth: 130, flex: 1 },
    {
      title: '상태',
      width: 90,
      render: (r) => {
        const x = r as unknown as FranchiseBranchRow;
        return x.empty ? (
          <span className={styles.muted}>정보 없음</span>
        ) : (
          <Badge variant="subtle" color={STATUS_COLOR[x.status]} size="sm">
            {FRANCHISE_STATUS_LABEL[x.status]}
          </Badge>
        );
      },
      exportValue: (r) => FRANCHISE_STATUS_LABEL[(r as unknown as FranchiseBranchRow).status],
    },
    {
      title: '가맹주',
      dataIndex: 'ownerName',
      width: 90,
      render: (r) => (r.ownerName as string) ?? '—',
    },
    {
      title: '연락처',
      width: 130,
      render: (r) => (r.ownerPhone ? formatPhone(String(r.ownerPhone)) : '—'),
    },
    {
      title: '계약 시작',
      dataIndex: 'contractStart',
      width: 110,
      render: (r) => (r.contractStart as string) ?? '—',
    },
    {
      title: '계약 만료',
      width: 160,
      render: (r) => <Dday r={r as unknown as FranchiseBranchRow} />,
      exportValue: (r) => (r.contractEnd as string) ?? '',
    },
    {
      title: '가맹비',
      width: 160,
      render: (r) => {
        const x = r as unknown as FranchiseBranchRow;
        return <Paid amount={x.franchiseFee} at={x.feePaidAt} />;
      },
      exportValue: (r) => (r.franchiseFee as number) ?? '',
    },
    {
      title: '보증금',
      width: 160,
      render: (r) => {
        const x = r as unknown as FranchiseBranchRow;
        return <Paid amount={x.deposit} at={x.depositPaidAt} />;
      },
      exportValue: (r) => (r.deposit as number) ?? '',
    },
    {
      title: '상호사용료',
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
        title="가맹점 현황"
        subtitle={`지점(가맹점)마다 가맹주·계약 기간·가맹비·보증금·상호사용료를 관리합니다. 계약 만료 ${FRANCHISE_RENEWAL_DAYS}일 안이면 재계약 대상입니다.`}
        onRefresh={load}
        updatedAt={updatedAt}
      />
      <div className={styles.tiles}>
        {tile('운영·개점 준비', s.total, 'all')}
        {tile('올해 신규 가맹', s.newThisYear)}
        {tile(`재계약 대상(${FRANCHISE_RENEWAL_DAYS}일)`, s.renewalDue, 'renewal', 'warn')}
        {tile('가맹비·보증금 미확인', s.unpaid, 'unpaid', 'warn')}
        {tile('계약 정보 미입력', s.missing, 'empty')}
        <Link className={styles.tile} to="/franchise-leads">
          <span>가맹 영업 진행 중 →</span>
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
        exportFileName="가맹점현황"
        tabs={
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: 'all', label: '전체' },
              { value: 'renewal', label: `재계약 대상 ${s.renewalDue ?? ''}` },
              { value: 'unpaid', label: `미입금 ${s.unpaid ?? ''}` },
              { value: 'empty', label: `정보 없음 ${s.missing ?? ''}` },
              { value: 'ended', label: '해지' },
            ]}
          />
        }
        onRowClick={(r) => detail.open(String(r.orgUnitId))}
      />
      {modal}
    </div>
  );
}
