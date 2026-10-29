import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Combobox } from '@sunghoon_lee/akron-ui';
import {
  LEAVE_SLOT_LABEL,
  LEAVE_STATUS_LABEL,
  countWorkdays,
  leaveSlotsFor,
  type LeaveSlot,
} from '@tongin/shared';
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
const fmtDays = (n: number) => `${Number.isInteger(n) ? n : String(Number(n.toFixed(2)))}일`;

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
    ...(can('LEAVE.UPDATE')
      ? [
          { value: 'types', label: '휴가 종류' },
          { value: 'grant', label: '연차 부여' },
        ]
      : []),
    ...(can('APPROVAL.MANAGE') ? [{ value: 'form', label: '신청서 양식' }] : []),
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
          slot: half && !fixedSlot ? slot || undefined : undefined,
          substituteEmpId: substitute[0],
          handover: substitute[0] ? handover.trim() || undefined : undefined,
          extra: extraFields.length ? extra : undefined,
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
            disabled={
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
        {half && !fixedSlot && slots.length > 0 && (
          <div className={astyles.fieldLabel}>
            <span>
              시간대 <span className={styles.over}>*</span>
            </span>
            <SegmentedControl
              size="sm"
              value={slot}
              onChange={(v) => setSlot(v as LeaveSlot)}
              options={slots.map((x) => ({ value: x, label: LEAVE_SLOT_LABEL[x] }))}
            />
          </div>
        )}
        <label className={astyles.fieldLabel}>
          <span>사유{reasonRequired && <span className={styles.over}> *</span>}</span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </label>
        {subMode !== 'NONE' && (
          <div className={astyles.fieldLabel}>
            <span>
              업무 대리인{subMode === 'REQUIRED' && <span className={styles.over}> *</span>}
            </span>
            <PersonPicker
              value={substitute}
              onChange={(v) => setSubstitute(v.filter((x) => x !== user?.employeeId).slice(-1))}
            />
            <span className={styles.cardLabel}>휴가가 승인되면 대리인에게 알림이 갑니다.</span>
          </div>
        )}
        {substitute.length > 0 && (
          <label className={astyles.fieldLabel}>
            인수인계
            <Textarea
              rows={2}
              value={handover}
              maxLength={1000}
              placeholder="대리인이 챙길 일(진행 중인 건·연락처 등)"
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
    {
      title: '단위',
      render: (r) =>
        num(r.unitDays) >= 1
          ? '하루 단위'
          : num(r.unitDays) >= 0.5
            ? '반차(0.5일)'
            : '반반차(0.25일)',
    },
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
        { value: '0.5', label: '반차(0.5일, 오전/오후 고름)' },
        { value: '0.25', label: '반반차(0.25일, 시간대 고름)' },
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
function LeaveGrant() {
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
        title: `${r.count}명에게 연차 ${n > 0 ? '+' : ''}${n}일을 ${n > 0 ? '부여' : '차감'}했습니다`,
      });
      setPeople([]);
      setOrgIds([]);
      setDays('');
      setReason('');
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '부여하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column[] = [
    { title: '날짜', width: 110, render: (r) => d10(r.effectiveDate) },
    {
      title: '직원',
      minWidth: 140,
      render: (r) => {
        const a = r as unknown as AdjustmentRow;
        return [a.employee.name, a.employee.orgUnit?.name].filter(Boolean).join(' · ');
      },
    },
    {
      title: '일수',
      width: 90,
      numeric: true,
      render: (r) => `${num(r.days) > 0 ? '+' : ''}${fmtDays(num(r.days))}`,
    },
    { title: '사유', dataIndex: 'reason', flex: 1, minWidth: 200 },
  ];

  return (
    <>
      <section className="rd-card" style={{ marginBottom: 16 }}>
        <h3 className="rd-title">연차 부여·차감</h3>
        <div className={astyles.formCol}>
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={(v) => setMode(v as 'people' | 'orgs')}
            options={[
              { value: 'people', label: '직원 고르기' },
              { value: 'orgs', label: '조직 전체' },
            ]}
          />
          {mode === 'people' ? (
            <div className={astyles.fieldLabel}>
              대상 직원
              <PersonPicker value={people} onChange={setPeople} />
            </div>
          ) : (
            <div className={astyles.fieldLabel}>
              대상 조직(하위 조직 포함)
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {orgIds.map((id) => (
                  <Badge key={id} variant="subtle" color="info">
                    {orgName.get(id)}{' '}
                    <button
                      type="button"
                      aria-label="빼기"
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
                  placeholder="조직 찾기"
                  onChange={(v) => v && setOrgIds([...orgIds, v])}
                />
              </div>
            </div>
          )}
          <div className={styles.dates}>
            <label className={astyles.fieldLabel}>
              <span>
                일수 <span className={styles.over}>*</span>
              </span>
              <Input
                inputMode="decimal"
                value={days}
                placeholder="예: 1, 0.5, -1"
                onChange={(e) => setDays(e.target.value.replace(/[^\d.-]/g, ''))}
              />
              <span className={styles.cardLabel}>+는 부여, -는 차감(0.25일 단위)</span>
            </label>
            <label className={astyles.fieldLabel}>
              적용 날짜
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <span className={styles.cardLabel}>
                그 날짜가 속한 연차 기간에 들어갑니다(비우면 오늘)
              </span>
            </label>
          </div>
          <label className={astyles.fieldLabel}>
            <span>
              사유 <span className={styles.over}>*</span>
            </span>
            <Input
              value={reason}
              maxLength={200}
              placeholder="예: 창립기념 특별휴가, 우수사원 포상"
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
              {n < 0 ? '차감하기' : '부여하기'}
            </Button>
          </div>
        </div>
      </section>
      <DataTable columns={columns} rows={rows as unknown as Row[]} loading={loading} />
    </>
  );
}

/** 휴가 신청서 양식 — 업무 대리인·사유 필수 설정과 추가 항목(결재 양식 관리 권한) */
function LeaveFormSettings() {
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
