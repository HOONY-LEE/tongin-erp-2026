import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Combobox } from '@sunghoon_lee/akron-ui';
import { countWorkdays, leaveSlotsFor, type LeaveSlot } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  notifyApprovalsChanged,
  toLinePayload,
  useDirectory,
  type ApprovalFormDef,
  type LineEntry,
} from '../lib/approvals';
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
import {
  FormFieldInputs,
  PersonPicker,
  formReady,
  type FormDraft,
} from '../components/approval/FormFields';
import { FormEditor } from '../components/approval/FormsAdmin';
import astyles from '../components/approval/approval.module.css';
import styles from './leave.module.css';
import { LEAVE_SLOT_LABEL, LEAVE_STATUS_LABEL } from '../i18n/codes';
import { ChoiceChips, DatePicker } from '../components/ui';

type Tab = 'my' | 'all' | 'types' | 'grant' | 'form';

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
const fmtDays = (n: number) =>
  i18n.t('leave.days', { v0: Number.isInteger(n) ? n : String(Number(n.toFixed(2))) });

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
    ...(user?.employeeId ? [{ value: 'my', label: t('leave.tab.mine') }] : []),
    ...(can('LEAVE.READ') ? [{ value: 'all', label: t('leave.tab.all') }] : []),
    ...(can('LEAVE.UPDATE')
      ? [
          { value: 'types', label: t('leave.tab.types') },
          { value: 'grant', label: t('leave.tab.grant') },
        ]
      : []),
    ...(can('APPROVAL.MANAGE') ? [{ value: 'form', label: t('leave.tab.form') }] : []),
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
      {tab === 'grant' && <LeaveGrant key={`grant-${refreshKey}`} />}
      {tab === 'form' && <LeaveFormSettings key={`form-${refreshKey}`} />}
    </ListPage>
  );
}

/** 잔여 연차 카드 줄 — 직원 한 명 기준(내 휴가·직원 상세) */
export function BalanceCards({ b }: { b: LeaveBalance }) {
  const { t } = useTranslation();
  const items: [string, string, string?][] = [
    [t('leave.remain'), fmtDays(b.remaining), 'strong'],
    [t('leave.accrued'), fmtDays(b.granted)],
    [t('leave.adjusted'), `${b.adjusted > 0 ? '+' : ''}${fmtDays(b.adjusted)}`],
    [t('leave.used'), fmtDays(b.used)],
    [t('leave.pending'), fmtDays(b.pending)],
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
          ? t('leave.basis', {
              v0: b.hireDate,
              v1: b.firstYear ? t('leave.firstYear') : t('leave.yearN', { v0: b.years }),
              v2: b.periodStart,
              v3: b.periodEnd,
            })
          : t('leave.noHire')}
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const columns: Column[] = [
    { title: t('leave.col.type'), render: (r) => (r as unknown as LeaveRequestRow).leaveType.name },
    {
      title: t('leave.col.period'),
      minWidth: 200,
      render: (r) =>
        d10(r.startDate) === d10(r.endDate)
          ? d10(r.startDate)
          : `${d10(r.startDate)} ~ ${d10(r.endDate)}`,
    },
    { title: t('leave.col.days'), numeric: true, render: (r) => fmtDays(num(r.days)) },
    {
      title: t('leave.col.reason'),
      flex: 1,
      minWidth: 160,
      render: (r) => String(r.reason ?? '-'),
    },
    {
      title: t('leave.col.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS_MAP} />,
    },
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
  // 결재함 '새 결재 → 휴가 신청'으로 왔으면 신청 창을 바로 연다
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get('apply') === '1');
  useEffect(() => {
    if (params.get('apply') !== '1') return;
    const n = new URLSearchParams(params);
    n.delete('apply');
    setParams(n, { replace: true });
  }, [params, setParams]);

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
            {t('leave.requestBtn')}
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

/**
 * 휴가 신청 창 — 남은 연차를 읽어 와서 띄운다. 결재함(바로 신청하기·새 결재)·결재 양식 목록에서도 연다.
 * onEdit을 주면(결재 양식 목록) 왼쪽 아래 「결재 양식 편집하기」, 신청 버튼은 「결재 올리기」.
 */
export function LeaveApplyModal({
  onClose,
  onDone,
  onEdit,
}: {
  onClose: () => void;
  onDone: () => void;
  onEdit?: () => void;
}) {
  const [balance, setBalance] = useState<LeaveBalance | null | undefined>(undefined);
  useEffect(() => {
    api<{ balance: LeaveBalance }>('/leave/me')
      .then((d) => setBalance(d.balance))
      .catch(() => setBalance(null)); // 직원과 연결 안 된 계정 — 신청은 막고 모양만 보인다
  }, []);
  if (balance === undefined) return null;
  return <RequestModal balance={balance} onClose={onClose} onDone={onDone} onEdit={onEdit} />;
}

function RequestModal({
  balance,
  onClose,
  onDone,
  onEdit,
}: {
  balance: LeaveBalance | null;
  onClose: () => void;
  onDone: () => void;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [slot, setSlot] = useState<LeaveSlot | ''>('');
  const [substitute, setSubstitute] = useState<string[]>([]);
  const [handover, setHandover] = useState('');
  const [extra, setExtra] = useState<FormDraft>({});
  const [form, setForm] = useState<ApprovalFormDef | null>(null);
  const [line, setLine] = useState<LineEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<LeaveType[]>('/leave/types').then((ts) => {
      setTypes(ts);
      setTypeId((cur) => cur || ts[0]?.id || '');
    });
    // 신청서 설정(업무 대리인·사유 필수)과 관리자가 더한 항목
    void api<ApprovalFormDef>('/approval-forms/leave')
      .then(setForm)
      .catch(() => setForm(null));
  }, []);

  const type = types.find((x) => x.id === typeId);
  const half = !!type && num(type.unitDays) < 1;
  // 반차는 오전/오후, 반반차는 넷 중 하나 — 예전 '오전 반차·오후 반차' 종류는 이름에 시간대가 들어 있다
  const slots = type ? leaveSlotsFor(num(type.unitDays)) : [];
  const fixedSlot = type && /(AM|PM)$/.test(type.code) && num(type.unitDays) === 0.5;
  useEffect(() => setSlot(''), [typeId]);
  const subMode = form?.settings.substitute ?? 'OPTIONAL';
  const reasonRequired = !!form?.settings.reasonRequired;
  const extraFields = form?.fields ?? [];
  const days = useMemo(() => {
    if (!type || !start) return 0;
    if (half) return num(type.unitDays);
    return end && end >= start ? countWorkdays(start, end) : 0;
  }, [type, half, start, end]);
  const available = balance ? balance.remaining - balance.pending : 0;
  const blocked = balance ? null : t('leave.needEmployee');

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
          slot: half && !fixedSlot ? slot || undefined : undefined,
          substituteEmpId: substitute[0],
          handover: substitute[0] ? handover.trim() || undefined : undefined,
          extra: extraFields.length ? extra : undefined,
          line: line ? toLinePayload(line) : undefined,
        }),
      });
      toast({ type: 'success', title: t('leave.requested') });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('leave.requestFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('leave.requestTitle')}
      footer={
        <>
          {onEdit && (
            <Button variant="outline" onClick={onEdit} style={{ marginRight: 'auto' }}>
              {t('leave.editForm')}
            </Button>
          )}
          {blocked && <span className={astyles.muted}>{blocked}</span>}
          <Button variant="ghost" onClick={onClose}>
            {t('leave.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={
              !!blocked ||
              !typeId ||
              !start ||
              (!half && !end) ||
              days <= 0 ||
              (half && !fixedSlot && !slot) ||
              (subMode === 'REQUIRED' && !substitute.length) ||
              (reasonRequired && !reason.trim()) ||
              !formReady(extraFields, extra)
            }
            onClick={() => void submit()}
          >
            {onEdit ? t('leave.submit') : t('leave.submitNew')}
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <label className={astyles.fieldLabel}>
          {t('leave.tab.types')}
          <Select
            value={typeId}
            onValueChange={setTypeId}
            options={types.map((x) => ({
              value: x.id,
              label: `${x.name}${x.deducts ? '' : t('leave.noDeduct')}`,
            }))}
          />
        </label>
        <div className={styles.dates}>
          <label className={astyles.fieldLabel}>
            {half ? t('leave.date') : t('leave.start')}
            <DatePicker value={start} onChange={(v) => setStart(v)} />
          </label>
          {!half && (
            <label className={astyles.fieldLabel}>
              {t('leave.end')}
              <DatePicker value={end} min={start || undefined} onChange={(v) => setEnd(v)} />
            </label>
          )}
          <div className={styles.daysBox}>
            <span className={styles.cardLabel}>{t('leave.useDays')}</span>
            <b>{fmtDays(days)}</b>
            {type?.deducts && (
              <span className={days > available ? styles.over : styles.cardLabel}>
                {t('leave.available')} {fmtDays(available)}
              </span>
            )}
          </div>
        </div>
        {half && !fixedSlot && slots.length > 0 && (
          <div className={astyles.fieldLabel}>
            <span>
              {t('leave.slot')} <span className={styles.over}>*</span>
            </span>
            <ChoiceChips
              aria-label={t('leave.slot')}
              value={slot}
              onChange={setSlot}
              options={slots.map((x) => ({ value: x, label: LEAVE_SLOT_LABEL[x] }))}
            />
          </div>
        )}
        <label className={astyles.fieldLabel}>
          <span>
            {t('leave.col.reason')}
            {reasonRequired && <span className={styles.over}> *</span>}
          </span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </label>
        {subMode !== 'NONE' && (
          <div className={astyles.fieldLabel}>
            <span>
              {t('leave.delegate')}
              {subMode === 'REQUIRED' && <span className={styles.over}> *</span>}
            </span>
            <PersonPicker
              value={substitute}
              onChange={(v) => setSubstitute(v.filter((x) => x !== user?.employeeId).slice(-1))}
            />
            <span className={styles.cardLabel}>{t('leave.delegateHint')}</span>
          </div>
        )}
        {substitute.length > 0 && (
          <label className={astyles.fieldLabel}>
            {t('leave.handover')}
            <Textarea
              rows={2}
              value={handover}
              maxLength={1000}
              placeholder={t('leave.handoverPh')}
              onChange={(e) => setHandover(e.target.value)}
            />
          </label>
        )}
        <FormFieldInputs fields={extraFields} values={extra} onChange={setExtra} />
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
  const { t } = useTranslation();
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('leave.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [scope, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column[] = [
    { title: t('leave.col.name'), dataIndex: 'name' },
    { title: t('leave.col.position'), render: (r) => String(r.positionName ?? '-') },
    { title: t('leave.col.org'), render: (r) => String(r.orgUnitName ?? '-') },
    { title: t('leave.col.hire'), render: (r) => String(r.hireDate ?? t('leave.noHireShort')) },
    {
      title: t('leave.col.leaveYear'),
      minWidth: 190,
      render: (r) => (r.hireDate ? `${String(r.periodStart)} ~ ${String(r.periodEnd)}` : '-'),
    },
    { title: t('leave.accrued'), numeric: true, render: (r) => fmtDays(num(r.granted)) },
    { title: t('leave.adjusted'), numeric: true, render: (r) => fmtDays(num(r.adjusted)) },
    { title: t('leave.used'), numeric: true, render: (r) => fmtDays(num(r.used)) },
    { title: t('leave.pending'), numeric: true, render: (r) => fmtDays(num(r.pending)) },
    {
      title: t('leave.remain'),
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
        exportFileName={t('leave.statusTitle')}
        onRowClick={
          can('LEAVE.UPDATE') ? (r) => setAdjusting(r as unknown as SummaryRow) : undefined
        }
        filters={
          <SegmentedControl
            value={scope}
            onChange={(v) => setScope(v as 'hq' | 'all')}
            options={[
              { value: 'hq', label: t('leave.hq') },
              { value: 'all', label: t('leave.allIncl') },
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
  const { t } = useTranslation();
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
      toast({ type: 'success', title: t('leave.adjustedOk') });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('leave.adjustFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('leave.adjustTitle', { v0: row.name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('leave.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!Number(days) || !reason.trim()}
            onClick={() => void save()}
          >
            {t('leave.adjusted')}
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <BalanceCards b={row} />
        <label className={astyles.fieldLabel}>
          {t('leave.adjustDays')}
          <Input
            type="number"
            step={0.5}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder={t('leave.adjustDaysPh')}
          />
        </label>
        <label className={astyles.fieldLabel}>
          {t('leave.col.reason')}
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('leave.adjustReasonPh')}
          />
        </label>
      </div>
    </Modal>
  );
}

export function LeaveTypes() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<LeaveType[]>('/leave/types?all=1'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('leave.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const yesNo = (v: unknown) => (v ? t('leave.yes') : t('leave.no'));
  const columns: Column[] = [
    { title: t('leave.col.name'), dataIndex: 'name' },
    {
      title: t('leave.unitLabel'),
      render: (r) =>
        num(r.unitDays) >= 1
          ? t('leave.unit.DAY')
          : num(r.unitDays) >= 0.5
            ? t('leave.unit.HALF')
            : t('leave.unit.QUARTER'),
    },
    { title: t('leave.deducts'), render: (r) => yesNo(r.deducts) },
    { title: t('leave.paid'), render: (r) => yesNo(r.paid) },
    {
      title: t('leave.col.status'),
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? t('leave.used') : t('leave.off')}
        </Badge>
      ),
    },
  ];

  const fields: FormField[] = [
    { name: 'name', label: t('leave.col.name'), required: true },
    {
      name: 'unitDays',
      label: t('leave.unitLabel'),
      required: true,
      type: 'select',
      options: [
        { value: '1', label: t('leave.unitL.DAY') },
        { value: '0.5', label: t('leave.unitL.HALF') },
        { value: '0.25', label: t('leave.unitL.QUARTER') },
      ],
    },
    { name: 'deducts', label: t('leave.deductsL'), type: 'boolean', alwaysShow: true },
    { name: 'paid', label: t('leave.paid'), type: 'boolean', alwaysShow: true },
    ...(editing !== 'new'
      ? [{ name: 'isActive', label: t('leave.used'), type: 'boolean' as const }]
      : []),
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
      toast({ type: 'success', title: t('leave.saved') });
      setEditing(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('leave.saveFailed') });
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
            {t('leave.typeAddBtn')}
          </Button>
        }
      />
      <FormModal
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? t('leave.typeAdd') : t('leave.typeEdit')}
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

interface AdjustmentRow {
  id: string;
  days: string | number;
  reason: string;
  effectiveDate: string;
  createdAt: string;
  employee: { name: string; orgUnit: { name: string } | null };
}

/**
 * 연차 부여 — 직원 여럿 또는 조직(하위 포함) 전체에 같은 일수를 더하거나(+) 뺀다(-).
 * 포상·이월·특별휴가·결근 차감 등. 아래에 최근 부여·조정 내역.
 */
export function LeaveGrant() {
  const { t } = useTranslation();
  const toast = useToast();
  const { orgs } = useDirectory();
  const [mode, setMode] = useState<'people' | 'orgs'>('people');
  const [people, setPeople] = useState<string[]>([]);
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<AdjustmentRow[]>('/leave/adjustments'));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const n = Number(days);
  const targets = mode === 'people' ? people.length : orgIds.length;
  const ready = targets > 0 && !!days && Number.isFinite(n) && n !== 0 && !!reason.trim();
  const orgOptions = orgs
    .filter((o) => !orgIds.includes(o.id))
    .map((o) => ({ value: o.id, label: o.name }));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ count: number }>('/leave/adjustments/bulk', {
        method: 'POST',
        body: JSON.stringify({
          employeeIds: mode === 'people' ? people : undefined,
          orgUnitIds: mode === 'orgs' ? orgIds : undefined,
          days: n,
          reason: reason.trim(),
          effectiveDate: date || undefined,
        }),
      });
      toast({
        type: 'success',
        title: t('leave.granted', {
          v0: r.count,
          v1: n > 0 ? '+' : '',
          v2: n,
          v3: n > 0 ? t('leave.grantWord') : t('leave.deductWord'),
        }),
      });
      setPeople([]);
      setOrgIds([]);
      setDays('');
      setReason('');
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('leave.grantFailed') });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column[] = [
    { title: t('leave.date'), width: 110, render: (r) => d10(r.effectiveDate) },
    {
      title: t('leave.employee'),
      minWidth: 140,
      render: (r) => {
        const a = r as unknown as AdjustmentRow;
        return [a.employee.name, a.employee.orgUnit?.name].filter(Boolean).join(' · ');
      },
    },
    {
      title: t('leave.col.days'),
      width: 90,
      numeric: true,
      render: (r) => `${num(r.days) > 0 ? '+' : ''}${fmtDays(num(r.days))}`,
    },
    { title: t('leave.col.reason'), dataIndex: 'reason', flex: 1, minWidth: 200 },
  ];

  return (
    <>
      <section className="rd-card" style={{ marginBottom: 16 }}>
        <h3 className="rd-title">{t('leave.grantTitle')}</h3>
        <div className={astyles.formCol}>
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={(v) => setMode(v as 'people' | 'orgs')}
            options={[
              { value: 'people', label: t('leave.pickEmployees') },
              { value: 'orgs', label: t('leave.wholeOrg') },
            ]}
          />
          {mode === 'people' ? (
            <div className={astyles.fieldLabel}>
              {t('leave.targetEmployees')}
              <PersonPicker value={people} onChange={setPeople} />
            </div>
          ) : (
            <div className={astyles.fieldLabel}>
              {t('leave.targetOrg')}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {orgIds.map((id) => (
                  <Badge key={id} variant="subtle" color="info">
                    {orgName.get(id)}{' '}
                    <button
                      type="button"
                      aria-label={t('leave.remove')}
                      style={{ border: 0, background: 'none', cursor: 'pointer' }}
                      onClick={() => setOrgIds(orgIds.filter((x) => x !== id))}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
                <Combobox
                  options={orgOptions}
                  value={null}
                  placeholder={t('leave.findOrg')}
                  onChange={(v) => v && setOrgIds([...orgIds, v])}
                />
              </div>
            </div>
          )}
          <div className={styles.dates}>
            <label className={astyles.fieldLabel}>
              <span>
                {t('leave.col.days')} <span className={styles.over}>*</span>
              </span>
              <Input
                inputMode="decimal"
                value={days}
                placeholder={t('leave.grantDaysPh')}
                onChange={(e) => setDays(e.target.value.replace(/[^\d.-]/g, ''))}
              />
              <span className={styles.cardLabel}>{t('leave.grantDaysHint')}</span>
            </label>
            <label className={astyles.fieldLabel}>
              {t('leave.applyDate')}
              <DatePicker value={date} onChange={(v) => setDate(v)} />
              <span className={styles.cardLabel}>{t('leave.applyDateHint')}</span>
            </label>
          </div>
          <label className={astyles.fieldLabel}>
            <span>
              {t('leave.col.reason')} <span className={styles.over}>*</span>
            </span>
            <Input
              value={reason}
              maxLength={200}
              placeholder={t('leave.grantReasonPh')}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={!ready}
              onClick={() => void submit()}
            >
              {n < 0 ? t('leave.deductBtn') : t('leave.grantBtn')}
            </Button>
          </div>
        </div>
      </section>
      <DataTable columns={columns} rows={rows as unknown as Row[]} loading={loading} />
    </>
  );
}

/** 휴가 신청서 양식 — 업무 대리인·사유 필수 설정과 추가 항목(결재 양식 관리 권한) */
export function LeaveFormSettings() {
  const [form, setForm] = useState<ApprovalFormDef | null>(null);
  const load = useCallback(async () => {
    setForm(await api<ApprovalFormDef>('/approval-forms/leave'));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!form) return null;
  return <FormEditor initial={form} onSaved={() => void load()} />;
}
