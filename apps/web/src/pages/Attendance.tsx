import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AttendanceStatus, type WorkSettings } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { notifyApprovalsChanged, toLinePayload, type LineEntry } from '../lib/approvals';
import {
  Badge,
  Button,
  DataTable,
  Input,
  ListPage,
  Modal,
  SegmentedControl,
  StatusBadge,
  Textarea,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';
import { ApprovalLineEditor } from '../components/approval/ApprovalLineEditor';
import astyles from '../components/approval/approval.module.css';
import styles from './attendance.module.css';
import { ATTENDANCE_STATUS_LABEL } from '../i18n/codes';
import { DatePicker } from '../components/ui';

type Tab = 'my' | 'daily' | 'monthly' | 'import' | 'settings';

export const ATT_STATUS_MAP: StatusMap = {
  NORMAL: { label: ATTENDANCE_STATUS_LABEL.NORMAL, color: 'success' },
  LATE: { label: ATTENDANCE_STATUS_LABEL.LATE, color: 'warning' },
  EARLY: { label: ATTENDANCE_STATUS_LABEL.EARLY, color: 'warning' },
  LATE_EARLY: { label: ATTENDANCE_STATUS_LABEL.LATE_EARLY, color: 'warning' },
  ABSENT: { label: ATTENDANCE_STATUS_LABEL.ABSENT, color: 'error' },
  LEAVE: { label: ATTENDANCE_STATUS_LABEL.LEAVE, color: 'primary' },
  HOLIDAY: { label: ATTENDANCE_STATUS_LABEL.HOLIDAY, color: 'neutral' },
  WORKING: { label: ATTENDANCE_STATUS_LABEL.WORKING, color: 'info' },
  NO_OUT: { label: ATTENDANCE_STATUS_LABEL.NO_OUT, color: 'warning' },
  BEFORE: { label: ATTENDANCE_STATUS_LABEL.BEFORE, color: 'neutral' },
  UPCOMING: { label: ATTENDANCE_STATUS_LABEL.UPCOMING, color: 'neutral' },
  NOT_TRACKED: { label: ATTENDANCE_STATUS_LABEL.NOT_TRACKED, color: 'neutral' },
};

const WEEK = [
  i18n.t('att.dow.0'),
  i18n.t('att.dow.1'),
  i18n.t('att.dow.2'),
  i18n.t('att.dow.3'),
  i18n.t('att.dow.4'),
  i18n.t('att.dow.5'),
  i18n.t('att.dow.6'),
];
const dow = (ymd: string) => WEEK[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
/** 한국 날짜 기준 오늘·이번 달 */
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const SOURCE_LABEL: Record<string, string> = {
  WEB: i18n.t('att.src.WEB'),
  IMPORT: i18n.t('att.src.IMPORT'),
  FIX: i18n.t('att.src.FIX'),
};

/**
 * 근태 — 내 근태(월별·정정 신청) / 오늘 현황·월간 현황(ATTENDANCE.READ) /
 * 엑셀 업로드(ATTENDANCE.IMPORT) / 근무시간 설정(ATTENDANCE.UPDATE).
 * 출근·퇴근은 머리글 버튼으로 찍는다.
 */
export default function Attendance() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const { tab, setTab } = useTabParam<Tab>(user?.employeeId ? 'my' : 'daily');
  const [refreshKey, setRefreshKey] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();

  // 머리글 버튼으로 출퇴근하면 화면도 다시 읽는다
  useEffect(() => {
    const on = () => setRefreshKey((k) => k + 1);
    window.addEventListener('attendance:changed', on);
    return () => window.removeEventListener('attendance:changed', on);
  }, []);

  const options = [
    ...(user?.employeeId ? [{ value: 'my', label: t('att.tab.mine') }] : []),
    ...(can('ATTENDANCE.READ')
      ? [
          { value: 'daily', label: t('att.tab.daily') },
          { value: 'monthly', label: t('att.tab.monthly') },
        ]
      : []),
    ...(can('ATTENDANCE.IMPORT') ? [{ value: 'import', label: t('att.tab.import') }] : []),
    ...(can('ATTENDANCE.UPDATE') ? [{ value: 'settings', label: t('att.tab.hours') }] : []),
  ];

  return (
    <ListPage
      title={t('nav.attendance')}
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
      {tab === 'my' && <MyAttendance key={`my-${refreshKey}`} />}
      {tab === 'daily' && <Daily key={`daily-${refreshKey}`} />}
      {tab === 'monthly' && <Monthly key={`monthly-${refreshKey}`} />}
      {tab === 'import' && <ImportTab />}
      {tab === 'settings' && <SettingsTab />}
    </ListPage>
  );
}

interface DayRow {
  date: string;
  holiday: string | null;
  clockIn: string | null;
  clockOut: string | null;
  source: string | null;
  note: string | null;
  leave: string | null;
  status: AttendanceStatus;
}

/** 한 직원의 한 달 근태(내 근태·직원 상세 공용) */
export function MonthDays({ employeeId, mine }: { employeeId?: string; mine?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [month, setMonth] = useState(kstToday().slice(0, 7));
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<DayRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ days: DayRow[] }>(
        mine
          ? `/attendance/me?month=${month}`
          : `/attendance/employees/${employeeId}?month=${month}`,
      );
      setDays(r.days);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('att.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [month, mine, employeeId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = kstToday();
  const counts = useMemo(() => {
    const c: Partial<Record<AttendanceStatus, number>> = {};
    for (const d of days) if (d.date <= today) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [days, today]);

  const columns: Column[] = [
    {
      title: t('att.col.date'),
      render: (r) => (
        <span
          className={
            r.holiday || [0, 6].includes(new Date(`${String(r.date)}T00:00:00Z`).getUTCDay())
              ? styles.offDay
              : ''
          }
        >
          {String(r.date).slice(5)} ({dow(String(r.date))})
        </span>
      ),
    },
    { title: t('att.in'), render: (r) => String(r.clockIn ?? '-') },
    { title: t('att.out'), render: (r) => String(r.clockOut ?? '-') },
    {
      title: t('att.col.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={ATT_STATUS_MAP} />,
    },
    {
      title: t('att.col.note'),
      flex: 1,
      minWidth: 160,
      render: (r) =>
        [
          r.holiday,
          r.leave,
          r.source ? t('att.recordBy', { v0: SOURCE_LABEL[String(r.source)] ?? r.source }) : null,
          r.note,
        ]
          .filter(Boolean)
          .join(' · ') || '-',
    },
  ];

  return (
    <>
      <div className={styles.monthBar}>
        <DatePicker
          mode="month"
          value={month}
          onChange={(v) => v && setMonth(v)}
          aria-label={t('att.month')}
          style={{ width: 170 }}
        />
        <span className={styles.counts}>
          {(['NORMAL', 'LATE', 'EARLY', 'ABSENT', 'LEAVE', 'NO_OUT'] as AttendanceStatus[])
            .filter((s) => counts[s])
            .map((s) => (
              <Badge key={s} variant="subtle" color={ATT_STATUS_MAP[s].color}>
                {ATT_STATUS_MAP[s].label} {counts[s]}
              </Badge>
            ))}
        </span>
        {mine && <span className={styles.hint}>{t('att.fixHint')}</span>}
      </div>
      <DataTable
        columns={columns}
        rows={days.map((d) => ({ ...d, id: d.date })) as unknown as Row[]}
        loading={loading}
        pageSize={0}
        onRowClick={
          mine ? (r) => String(r.date) <= today && setFixing(r as unknown as DayRow) : undefined
        }
      />
      {fixing && (
        <FixRequestModal
          day={fixing}
          onClose={() => setFixing(null)}
          onDone={() => {
            setFixing(null);
            notifyApprovalsChanged();
            void load();
          }}
        />
      )}
    </>
  );
}

function MyAttendance() {
  return <MonthDays mine />;
}

function FixRequestModal({
  day,
  onClose,
  onDone,
}: {
  day: DayRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [clockIn, setClockIn] = useState(day.clockIn ?? '');
  const [clockOut, setClockOut] = useState(day.clockOut ?? '');
  const [reason, setReason] = useState('');
  const [line, setLine] = useState<LineEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/attendance/fix-requests', {
        method: 'POST',
        body: JSON.stringify({
          workDate: day.date,
          clockIn: clockIn || undefined,
          clockOut: clockOut || undefined,
          reason: reason.trim(),
          line: line ? toLinePayload(line) : undefined,
        }),
      });
      toast({ type: 'success', title: t('att.fixRequested') });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('att.requestFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('att.fixTitle', { v0: day.date, v1: dow(day.date) })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('att.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!reason.trim() || (!clockIn && !clockOut)}
            onClick={() => void submit()}
          >
            {t('att.fixSubmit')}
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <p className={styles.hint}>
          {t('att.nowIn')} {day.clockIn ?? '-'} {t('att.nowOut')} {day.clockOut ?? '-'}{' '}
          {t('att.nowHint')}
        </p>
        <div className={styles.row2}>
          <label className={astyles.fieldLabel}>
            {t('att.in')}
            <Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </label>
          <label className={astyles.fieldLabel}>
            {t('att.out')}
            <Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </label>
        </div>
        <label className={astyles.fieldLabel}>
          {t('att.reasonReq')}
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t('att.reasonPh')}
          />
        </label>
        <ApprovalLineEditor
          docType="ATTENDANCE_FIX"
          value={line}
          onChange={setLine}
          myEmployeeId={user?.employeeId}
        />
      </div>
    </Modal>
  );
}

interface DailyRow {
  employeeId: string;
  name: string;
  positionName: string | null;
  orgUnitName: string | null;
  clockIn: string | null;
  clockOut: string | null;
  source: string | null;
  leave: string | null;
  status: AttendanceStatus;
}

function ScopeToggle({
  value,
  onChange,
}: {
  value: 'hq' | 'all';
  onChange: (v: 'hq' | 'all') => void;
}) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      value={value}
      onChange={(v) => onChange(v as 'hq' | 'all')}
      options={[
        { value: 'hq', label: t('att.hq') },
        { value: 'all', label: t('att.allIncl') },
      ]}
    />
  );
}

function Daily() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const [date, setDate] = useState(kstToday());
  const [scope, setScope] = useState<'hq' | 'all'>('hq');
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<DailyRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await api<DailyRow[]>(`/attendance/daily?date=${date}${scope === 'hq' ? '&hq=1' : ''}`),
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('att.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [date, scope, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Partial<Record<AttendanceStatus, number>> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const columns: Column[] = [
    { title: t('att.col.name'), dataIndex: 'name' },
    { title: t('att.col.position'), render: (r) => String(r.positionName ?? '-') },
    { title: t('att.col.org'), render: (r) => String(r.orgUnitName ?? '-') },
    { title: t('att.in'), render: (r) => String(r.clockIn ?? '-') },
    { title: t('att.out'), render: (r) => String(r.clockOut ?? '-') },
    {
      title: t('att.col.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={ATT_STATUS_MAP} />,
    },
    {
      title: t('att.col.note'),
      flex: 1,
      minWidth: 140,
      render: (r) =>
        [
          r.leave,
          r.source ? t('att.recordBy', { v0: SOURCE_LABEL[String(r.source)] ?? r.source }) : null,
        ]
          .filter(Boolean)
          .join(' · ') || '-',
    },
  ];

  return (
    <>
      <div className={styles.monthBar}>
        <DatePicker
          value={date}
          onChange={(v) => v && setDate(v)}
          aria-label={t('att.col.date')}
          style={{ width: 170 }}
        />
        <span className={styles.counts}>
          {(Object.keys(counts) as AttendanceStatus[]).map((s) => (
            <Badge key={s} variant="subtle" color={ATT_STATUS_MAP[s]?.color ?? 'neutral'}>
              {ATT_STATUS_MAP[s]?.label ?? s} {counts[s]}
            </Badge>
          ))}
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={rows.map((r) => ({ ...r, id: r.employeeId })) as unknown as Row[]}
        loading={loading}
        exportable
        exportFileName={t('att.exportName', { v0: date })}
        filters={<ScopeToggle value={scope} onChange={setScope} />}
        onRowClick={
          can('ATTENDANCE.UPDATE') ? (r) => setEditing(r as unknown as DailyRow) : undefined
        }
      />
      {editing && (
        <EditRecordModal
          row={editing}
          date={date}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function EditRecordModal({
  row,
  date,
  onClose,
  onDone,
}: {
  row: DailyRow;
  date: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [clockIn, setClockIn] = useState(row.clockIn ?? '');
  const [clockOut, setClockOut] = useState(row.clockOut ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api('/attendance/records', {
        method: 'PUT',
        body: JSON.stringify({
          employeeId: row.employeeId,
          workDate: date,
          clockIn: clockIn || null,
          clockOut: clockOut || null,
          note: note.trim() || undefined,
        }),
      });
      toast({ type: 'success', title: t('att.edited') });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('att.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('att.editTitle', { v0: row.name, v1: date })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('att.cancel')}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('att.save')}
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <div className={styles.row2}>
          <label className={astyles.fieldLabel}>
            {t('att.in')}
            <Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </label>
          <label className={astyles.fieldLabel}>
            {t('att.out')}
            <Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </label>
        </div>
        <label className={astyles.fieldLabel}>
          {t('att.memo')}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('att.memoPh')}
          />
        </label>
      </div>
    </Modal>
  );
}

interface MonthlyRow {
  employeeId: string;
  name: string;
  positionName: string | null;
  orgUnitName: string | null;
  worked: number;
  late: number;
  early: number;
  absent: number;
  leave: number;
  noOut: number;
}

function Monthly() {
  const { t } = useTranslation();
  const toast = useToast();
  const [month, setMonth] = useState(kstToday().slice(0, 7));
  const [scope, setScope] = useState<'hq' | 'all'>('hq');
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await api<MonthlyRow[]>(
          `/attendance/monthly?month=${month}${scope === 'hq' ? '&hq=1' : ''}`,
        ),
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('att.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [month, scope, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const n = (v: unknown) => (Number(v) ? String(v) : '-');
  const columns: Column[] = [
    { title: t('att.col.name'), dataIndex: 'name' },
    { title: t('att.col.position'), render: (r) => String(r.positionName ?? '-') },
    { title: t('att.col.org'), render: (r) => String(r.orgUnitName ?? '-') },
    { title: t('att.sum.workDays'), numeric: true, render: (r) => n(r.worked) },
    { title: t('att.sum.late'), numeric: true, render: (r) => n(r.late) },
    { title: t('att.sum.early'), numeric: true, render: (r) => n(r.early) },
    { title: t('att.sum.absent'), numeric: true, render: (r) => n(r.absent) },
    { title: t('att.sum.leave'), numeric: true, render: (r) => n(r.leave) },
    { title: t('att.sum.noOut'), numeric: true, render: (r) => n(r.noOut) },
  ];

  return (
    <>
      <div className={styles.monthBar}>
        <DatePicker
          mode="month"
          value={month}
          onChange={(v) => v && setMonth(v)}
          aria-label={t('att.month')}
          style={{ width: 170 }}
        />
        <span className={styles.hint}>{t('att.sumHint')}</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows.map((r) => ({ ...r, id: r.employeeId })) as unknown as Row[]}
        loading={loading}
        exportable
        exportFileName={t('att.exportName', { v0: month })}
        filters={<ScopeToggle value={scope} onChange={setScope} />}
      />
    </>
  );
}

interface ImportRow {
  rowNo: number;
  empNo: string | null;
  name: string | null;
  workDate: string | null;
  clockIn: string | null;
  clockOut: string | null;
  employeeId: string | null;
  employeeName: string | null;
  problem: string | null;
}

function ImportTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setRows(null);
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000)
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await api<{ rows: ImportRow[] }>('/attendance/import/preview', {
        method: 'POST',
        body: JSON.stringify({ name: f.name, dataBase64: btoa(bin) }),
      });
      setFileName(f.name);
      setRows(r.rows);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('att.fileFailed') });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const good = (rows ?? []).filter((r) => !r.problem);
  const commit = async () => {
    setBusy(true);
    try {
      const r = await api<{ saved: number; skipped: number }>('/attendance/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          rows: good.map((x) => ({
            employeeId: x.employeeId,
            workDate: x.workDate,
            clockIn: x.clockIn,
            clockOut: x.clockOut,
          })),
        }),
      });
      toast({
        type: 'success',
        title: t('att.imported', {
          v0: r.saved,
          v1: r.skipped ? t('att.skipped', { v0: r.skipped }) : '',
        }),
      });
      setRows(null);
      setFileName('');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('att.importFailed') });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column[] = [
    { title: t('att.col.row'), numeric: true, render: (r) => String(r.rowNo) },
    { title: t('att.col.empNo'), render: (r) => String(r.empNo ?? '-') },
    { title: t('att.col.fileName'), render: (r) => String(r.name ?? '-') },
    { title: t('att.col.date'), render: (r) => String(r.workDate ?? '-') },
    { title: t('att.in'), render: (r) => String(r.clockIn ?? '-') },
    { title: t('att.out'), render: (r) => String(r.clockOut ?? '-') },
    { title: t('att.col.matched'), render: (r) => String(r.employeeName ?? '-') },
    {
      title: t('att.col.result'),
      flex: 1,
      minWidth: 180,
      render: (r) =>
        r.problem ? (
          <span className={styles.problem}>{String(r.problem)}</span>
        ) : (
          <Badge variant="subtle" color="success">
            {t('att.apply')}
          </Badge>
        ),
    },
  ];

  return (
    <div className={styles.importBox}>
      <div className={styles.monthBar}>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm,.csv"
          hidden
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button variant="outline" loading={busy && !rows} onClick={() => fileRef.current?.click()}>
          {t('att.pickFile')}
        </Button>
        <span className={styles.hint}>
          {t('att.fileHelp1')}
          {t('att.fileHelp2')}
          {t('att.fileHelp3')}
        </span>
      </div>
      {rows && (
        <>
          <div className={styles.monthBar}>
            <b>{fileName}</b>
            <span className={styles.counts}>
              <Badge variant="subtle" color="success">
                {t('att.apply')} {good.length}
              </Badge>
              {rows.length - good.length > 0 && (
                <Badge variant="subtle" color="error">
                  {t('att.excluded')} {rows.length - good.length}
                </Badge>
              )}
            </span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setRows(null)}>
              {t('att.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!good.length}
              onClick={() => void commit()}
            >
              {good.length}
              {t('att.applyN')}
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={rows.map((r) => ({ ...r, id: String(r.rowNo) })) as unknown as Row[]}
          />
        </>
      )}
    </div>
  );
}

export function SettingsTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const [s, setS] = useState<WorkSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<WorkSettings>('/attendance/settings').then(setS);
  }, []);

  if (!s) return null;
  const set = <K extends keyof WorkSettings>(k: K, v: WorkSettings[K]) => setS({ ...s, [k]: v });

  const save = async () => {
    setBusy(true);
    try {
      setS(
        await api<WorkSettings>('/attendance/settings', { method: 'PUT', body: JSON.stringify(s) }),
      );
      toast({ type: 'success', title: t('att.saved') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('att.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`rd-card ${styles.settings}`}>
      <div className={styles.row2}>
        <label className={astyles.fieldLabel}>
          {t('att.std.in')}
          <Input
            type="time"
            value={s.workStart}
            onChange={(e) => set('workStart', e.target.value)}
          />
        </label>
        <label className={astyles.fieldLabel}>
          {t('att.std.out')}
          <Input type="time" value={s.workEnd} onChange={(e) => set('workEnd', e.target.value)} />
        </label>
        <label className={astyles.fieldLabel}>
          {t('att.std.half')}
          <Input
            type="time"
            value={s.halfSplit}
            onChange={(e) => set('halfSplit', e.target.value)}
          />
          <span className={styles.hint}>{t('att.std.halfHint')}</span>
        </label>
        <label className={astyles.fieldLabel}>
          {t('att.std.grace')}
          <Input
            type="number"
            min={0}
            max={120}
            value={s.lateGraceMin}
            onChange={(e) => set('lateGraceMin', Number(e.target.value))}
          />
        </label>
        <label className={astyles.fieldLabel}>
          {t('att.std.start')}
          <DatePicker value={s.trackFrom} onChange={(v) => set('trackFrom', v)} />
          <span className={styles.hint}>{t('att.std.startHint')}</span>
        </label>
      </div>
      <div>
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          {t('att.save')}
        </Button>
      </div>
    </section>
  );
}
