import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LEAVE_STATUS_LABEL, countWorkdays } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { notifyApprovalsChanged, toLinePayload, type LineEntry } from '../lib/approvals';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  Input,
  ListPage,
  Modal,
  SegmentedControl,
  Select,
  StatusBadge,
  Textarea,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import { ApprovalLineEditor } from '../components/approval/ApprovalLineEditor';
import astyles from '../components/approval/approval.module.css';
import styles from './leave.module.css';

type Tab = 'my' | 'all' | 'types';

interface LeaveType {
  id: string;
  code: string;
  name: string;
  unitDays: string | number;
  deducts: boolean;
  paid: boolean;
  sortOrder: number;
  isActive: boolean;
}
export interface LeaveBalance {
  hireDate: string | null;
  periodStart: string;
  periodEnd: string;
  granted: number;
  adjusted: number;
  used: number;
  pending: number;
  remaining: number;
  firstYear: boolean;
  years: number;
}
interface LeaveRequestRow {
  id: string;
  startDate: string;
  endDate: string;
  days: string | number;
  reason: string | null;
  status: string;
  approvalDocId: string | null;
  leaveType: { name: string; deducts: boolean };
}

const STATUS_MAP: StatusMap = {
  PENDING: { label: LEAVE_STATUS_LABEL.PENDING, color: 'info' },
  APPROVED: { label: LEAVE_STATUS_LABEL.APPROVED, color: 'success' },
  REJECTED: { label: LEAVE_STATUS_LABEL.REJECTED, color: 'error' },
  CANCELED: { label: LEAVE_STATUS_LABEL.CANCELED, color: 'neutral' },
};
const d10 = (v: unknown) => String(v ?? '').slice(0, 10);
const num = (v: unknown) => Number(v ?? 0);
const fmtDays = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}일`;

/**
 * 휴가 — 내 휴가(잔여·신청·내역) / 전 직원 현황(LEAVE.READ, 조정은 LEAVE.UPDATE) / 휴가 종류(LEAVE.UPDATE).
 * 신청은 전자결재로 올라가고, 승인되면 연차에서 빠지고 캘린더에 표시된다.
 */
export default function Leave() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const { tab, setTab } = useTabParam<Tab>(user?.employeeId ? 'my' : 'all');
  const [refreshKey, setRefreshKey] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();

  const options = [
    ...(user?.employeeId ? [{ value: 'my', label: '내 휴가' }] : []),
    ...(can('LEAVE.READ') ? [{ value: 'all', label: '전 직원 현황' }] : []),
    ...(can('LEAVE.UPDATE') ? [{ value: 'types', label: '휴가 종류' }] : []),
  ];

  return (
    <ListPage
      title={t('nav.leave')}
      onRefresh={() => {
        setRefreshKey((k) => k + 1);
        touch();
      }}
      updatedAt={updatedAt}
      footer={
        options.length > 1 ? (
          <SegmentedControl value={tab} onChange={(v) => setTab(v as Tab)} options={options} />
        ) : undefined
      }
    >
      {tab === 'my' && <MyLeave key={`my-${refreshKey}`} />}
      {tab === 'all' && <LeaveSummary key={`all-${refreshKey}`} />}
      {tab === 'types' && <LeaveTypes key={`types-${refreshKey}`} />}
    </ListPage>
  );
}

/** 잔여 연차 카드 줄 — 직원 한 명 기준(내 휴가·직원 상세) */
export function BalanceCards({ b }: { b: LeaveBalance }) {
  const items: [string, string, string?][] = [
    ['남은 연차', fmtDays(b.remaining), 'strong'],
    ['발생', fmtDays(b.granted)],
    ['조정', `${b.adjusted > 0 ? '+' : ''}${fmtDays(b.adjusted)}`],
    ['사용', fmtDays(b.used)],
    ['결재 중', fmtDays(b.pending)],
  ];
  return (
    <div className={styles.balance}>
      <div className={styles.cards}>
        {items.map(([label, value, strong]) => (
          <div key={label} className={`${styles.card} ${strong ? styles.cardStrong : ''}`}>
            <span className={styles.cardLabel}>{label}</span>
            <span className={styles.cardValue}>{value}</span>
          </div>
        ))}
      </div>
      <p className={styles.period}>
        {b.hireDate
          ? `입사 ${b.hireDate} · ${b.firstYear ? '1년 미만(매달 1일씩)' : `${b.years}년차`} · 이번 연차 기간 ${b.periodStart} ~ ${b.periodEnd}`
          : '입사일이 없어 연차를 계산하지 못했습니다 — 인사 담당자에게 입사일 입력을 요청하세요.'}
      </p>
    </div>
  );
}

/** 휴가 신청 내역 표(본인·직원 상세 공용) — 행을 누르면 결재 문서 */
export function LeaveRequestTable({
  rows,
  loading,
  toolbarActions,
}: {
  rows: LeaveRequestRow[];
  loading?: boolean;
  toolbarActions?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const columns: Column[] = [
    { title: '종류', render: (r) => (r as unknown as LeaveRequestRow).leaveType.name },
    {
      title: '기간',
      minWidth: 200,
      render: (r) =>
        d10(r.startDate) === d10(r.endDate)
          ? d10(r.startDate)
          : `${d10(r.startDate)} ~ ${d10(r.endDate)}`,
    },
    { title: '일수', numeric: true, render: (r) => fmtDays(num(r.days)) },
    { title: '사유', flex: 1, minWidth: 160, render: (r) => String(r.reason ?? '-') },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS_MAP} /> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows as unknown as Row[]}
      loading={loading}
      onRowClick={(r) =>
        r.approvalDocId && navigate(`/approvals?detail=${String(r.approvalDocId)}`)
      }
      toolbarActions={toolbarActions}
    />
  );
}

function MyLeave() {
  const toast = useToast();
  const { t } = useTranslation();
  const [data, setData] = useState<{ balance: LeaveBalance; requests: LeaveRequestRow[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api('/leave/me'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {data && <BalanceCards b={data.balance} />}
      <LeaveRequestTable
        rows={data?.requests ?? []}
        loading={loading}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            + 휴가 신청
          </Button>
        }
      />
      {open && data && (
        <RequestModal
          balance={data.balance}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            notifyApprovalsChanged();
            void load();
          }}
        />
      )}
    </>
  );
}

function RequestModal({
  balance,
  onClose,
  onDone,
}: {
  balance: LeaveBalance;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [line, setLine] = useState<LineEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<LeaveType[]>('/leave/types').then((ts) => {
      setTypes(ts);
      setTypeId((cur) => cur || ts[0]?.id || '');
    });
  }, []);

  const type = types.find((x) => x.id === typeId);
  const half = !!type && num(type.unitDays) < 1;
  const days = useMemo(() => {
    if (!type || !start) return 0;
    if (half) return num(type.unitDays);
    return end && end >= start ? countWorkdays(start, end) : 0;
  }, [type, half, start, end]);
  const available = balance.remaining - balance.pending;

  const submit = async () => {
    setBusy(true);
    try {
      await api('/leave/requests', {
        method: 'POST',
        body: JSON.stringify({
          leaveTypeId: typeId,
          startDate: start,
          endDate: half ? undefined : end,
          reason: reason.trim() || undefined,
          line: line ? toLinePayload(line) : undefined,
        }),
      });
      toast({ type: 'success', title: '휴가를 신청했습니다(결재 상신)' });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '신청하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="휴가 신청"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!typeId || !start || (!half && !end) || days <= 0}
            onClick={() => void submit()}
          >
            신청(결재 상신)
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <label className={astyles.fieldLabel}>
          휴가 종류
          <Select
            value={typeId}
            onValueChange={setTypeId}
            options={types.map((x) => ({
              value: x.id,
              label: `${x.name}${x.deducts ? '' : ' (연차 차감 없음)'}`,
            }))}
          />
        </label>
        <div className={styles.dates}>
          <label className={astyles.fieldLabel}>
            {half ? '날짜' : '시작일'}
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          {!half && (
            <label className={astyles.fieldLabel}>
              끝일
              <Input
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          )}
          <div className={styles.daysBox}>
            <span className={styles.cardLabel}>쓰는 일수(주말·공휴일 제외)</span>
            <b>{fmtDays(days)}</b>
            {type?.deducts && (
              <span className={days > available ? styles.over : styles.cardLabel}>
                쓸 수 있는 연차 {fmtDays(available)}
              </span>
            )}
          </div>
        </div>
        <label className={astyles.fieldLabel}>
          사유
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </label>
        <ApprovalLineEditor
          docType="LEAVE"
          value={line}
          onChange={setLine}
          myEmployeeId={user?.employeeId}
        />
      </div>
    </Modal>
  );
}

interface SummaryRow extends LeaveBalance {
  id: string;
  name: string;
  positionName: string | null;
  orgUnitName: string | null;
}

function LeaveSummary() {
  const toast = useToast();
  const { can } = useAuth();
  const [scope, setScope] = useState<'hq' | 'all'>('hq');
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adjusting, setAdjusting] = useState<SummaryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<SummaryRow[]>(`/leave/summary${scope === 'hq' ? '?hq=1' : ''}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [scope, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column[] = [
    { title: '이름', dataIndex: 'name' },
    { title: '직책', render: (r) => String(r.positionName ?? '-') },
    { title: '소속', render: (r) => String(r.orgUnitName ?? '-') },
    { title: '입사일', render: (r) => String(r.hireDate ?? '입사일 없음') },
    {
      title: '연차 기간',
      minWidth: 190,
      render: (r) => (r.hireDate ? `${String(r.periodStart)} ~ ${String(r.periodEnd)}` : '-'),
    },
    { title: '발생', numeric: true, render: (r) => fmtDays(num(r.granted)) },
    { title: '조정', numeric: true, render: (r) => fmtDays(num(r.adjusted)) },
    { title: '사용', numeric: true, render: (r) => fmtDays(num(r.used)) },
    { title: '결재 중', numeric: true, render: (r) => fmtDays(num(r.pending)) },
    {
      title: '남은 연차',
      numeric: true,
      render: (r) => <b>{fmtDays(num(r.remaining))}</b>,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        exportable
        exportFileName="연차현황"
        onRowClick={
          can('LEAVE.UPDATE') ? (r) => setAdjusting(r as unknown as SummaryRow) : undefined
        }
        filters={
          <SegmentedControl
            value={scope}
            onChange={(v) => setScope(v as 'hq' | 'all')}
            options={[
              { value: 'hq', label: '본사' },
              { value: 'all', label: '전체(지점 포함)' },
            ]}
          />
        }
      />
      {adjusting && (
        <AdjustModal
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={() => {
            setAdjusting(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function AdjustModal({
  row,
  onClose,
  onDone,
}: {
  row: SummaryRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api('/leave/adjustments', {
        method: 'POST',
        body: JSON.stringify({ employeeId: row.id, days: Number(days), reason: reason.trim() }),
      });
      toast({ type: 'success', title: '연차를 조정했습니다' });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '조정하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${row.name} 연차 조정`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!Number(days) || !reason.trim()}
            onClick={() => void save()}
          >
            조정
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <BalanceCards b={row} />
        <label className={astyles.fieldLabel}>
          조정 일수 (+ 더하기 / − 빼기, 0.5 단위)
          <Input
            type="number"
            step={0.5}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="예: 1 또는 -0.5"
          />
        </label>
        <label className={astyles.fieldLabel}>
          사유
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 결근 차감, 전년도 이월, 포상"
          />
        </label>
      </div>
    </Modal>
  );
}

function LeaveTypes() {
  const toast = useToast();
  const [rows, setRows] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<LeaveType[]>('/leave/types?all=1'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const yesNo = (v: unknown) => (v ? '예' : '아니오');
  const columns: Column[] = [
    { title: '이름', dataIndex: 'name' },
    { title: '코드', dataIndex: 'code' },
    { title: '단위', render: (r) => (num(r.unitDays) < 1 ? '반나절(0.5일)' : '하루 단위') },
    { title: '연차 차감', render: (r) => yesNo(r.deducts) },
    { title: '유급', render: (r) => yesNo(r.paid) },
    {
      title: '상태',
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? '사용' : '사용 안 함'}
        </Badge>
      ),
    },
  ];

  const fields: FormField[] = [
    { name: 'name', label: '이름', required: true },
    ...(editing === 'new'
      ? [{ name: 'code', label: '코드(영문 대문자)', required: true, placeholder: '예: REFRESH' }]
      : []),
    {
      name: 'unitDays',
      label: '단위',
      required: true,
      type: 'select',
      options: [
        { value: '1', label: '하루 단위(기간)' },
        { value: '0.5', label: '반나절(0.5일, 하루만)' },
      ],
    },
    { name: 'deducts', label: '연차에서 차감', type: 'boolean', alwaysShow: true },
    { name: 'paid', label: '유급', type: 'boolean', alwaysShow: true },
    ...(editing !== 'new' ? [{ name: 'isActive', label: '사용', type: 'boolean' as const }] : []),
  ];

  const onSubmit = async (v: Record<string, unknown>) => {
    const body = {
      ...v,
      unitDays: Number(v.unitDays),
      deducts: v.deducts === true || v.deducts === 'true',
      paid: v.paid === true || v.paid === 'true',
      ...(v.isActive !== undefined
        ? { isActive: v.isActive === true || v.isActive === 'true' }
        : {}),
    };
    try {
      if (editing && editing !== 'new')
        await api(`/leave/types/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/leave/types', { method: 'POST', body: JSON.stringify(body) });
      toast({ type: 'success', title: '저장했습니다' });
      setEditing(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
      throw e;
    }
  };

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => setEditing(r as unknown as LeaveType)}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            + 휴가 종류
          </Button>
        }
      />
      <FormModal
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? '휴가 종류 추가' : '휴가 종류 수정'}
        fields={fields}
        initialValues={
          editing && editing !== 'new'
            ? {
                name: editing.name,
                unitDays: String(num(editing.unitDays)),
                deducts: String(editing.deducts),
                paid: String(editing.paid),
                isActive: String(editing.isActive),
              }
            : { unitDays: '1', deducts: 'true', paid: 'true' }
        }
        onSubmit={onSubmit}
      />
    </>
  );
}
