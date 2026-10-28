import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus, type WorkSettings } from '@tongin/shared';
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

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const dow = (ymd: string) => WEEK[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
/** 한국 날짜 기준 오늘·이번 달 */
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const SOURCE_LABEL: Record<string, string> = { WEB: '버튼', IMPORT: '엑셀', FIX: '정정' };

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
    ...(user?.employeeId ? [{ value: 'my', label: '내 근태' }] : []),
    ...(can('ATTENDANCE.READ')
      ? [
          { value: 'daily', label: '일별 현황' },
          { value: 'monthly', label: '월간 현황' },
        ]
      : []),
    ...(can('ATTENDANCE.IMPORT') ? [{ value: 'import', label: '엑셀 업로드' }] : []),
    ...(can('ATTENDANCE.UPDATE') ? [{ value: 'settings', label: '근무시간 설정' }] : []),
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
      title: '날짜',
      render: (r) => (
        <span
          className={r.holiday || ['토', '일'].includes(dow(String(r.date))) ? styles.offDay : ''}
        >
          {String(r.date).slice(5)} ({dow(String(r.date))})
        </span>
      ),
    },
    { title: '출근', render: (r) => String(r.clockIn ?? '-') },
    { title: '퇴근', render: (r) => String(r.clockOut ?? '-') },
    {
      title: '상태',
      render: (r) => <StatusBadge value={String(r.status)} map={ATT_STATUS_MAP} />,
    },
    {
      title: '비고',
      flex: 1,
      minWidth: 160,
      render: (r) =>
        [
          r.holiday,
          r.leave,
          r.source ? `${SOURCE_LABEL[String(r.source)] ?? r.source} 기록` : null,
          r.note,
        ]
          .filter(Boolean)
          .join(' · ') || '-',
    },
  ];

  return (
    <>
      <div className={styles.monthBar}>
        <Input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          aria-label="달"
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
        {mine && (
          <span className={styles.hint}>
            잘못 찍혔거나 빠진 날은 그 날짜를 눌러 정정 신청하세요(결재 후 반영).
          </span>
        )}
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
      toast({ type: 'success', title: '정정을 신청했습니다(결재 상신)' });
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
      title={`근태 정정 — ${day.date} (${dow(day.date)})`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!reason.trim() || (!clockIn && !clockOut)}
            onClick={() => void submit()}
          >
            정정 신청(결재 상신)
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <p className={styles.hint}>
          지금 기록: 출근 {day.clockIn ?? '-'} · 퇴근 {day.clockOut ?? '-'} — 고칠 시각만 바꾸세요.
        </p>
        <div className={styles.row2}>
          <label className={astyles.fieldLabel}>
            출근
            <Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </label>
          <label className={astyles.fieldLabel}>
            퇴근
            <Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </label>
        </div>
        <label className={astyles.fieldLabel}>
          사유 (필수)
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="예: 외근 후 바로 출근, 버튼을 늦게 누름"
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
  return (
    <SegmentedControl
      value={value}
      onChange={(v) => onChange(v as 'hq' | 'all')}
      options={[
        { value: 'hq', label: '본사' },
        { value: 'all', label: '전체(지점 포함)' },
      ]}
    />
  );
}

function Daily() {
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
    { title: '이름', dataIndex: 'name' },
    { title: '직책', render: (r) => String(r.positionName ?? '-') },
    { title: '소속', render: (r) => String(r.orgUnitName ?? '-') },
    { title: '출근', render: (r) => String(r.clockIn ?? '-') },
    { title: '퇴근', render: (r) => String(r.clockOut ?? '-') },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={ATT_STATUS_MAP} /> },
    {
      title: '비고',
      flex: 1,
      minWidth: 140,
      render: (r) =>
        [r.leave, r.source ? `${SOURCE_LABEL[String(r.source)] ?? r.source} 기록` : null]
          .filter(Boolean)
          .join(' · ') || '-',
    },
  ];

  return (
    <>
      <div className={styles.monthBar}>
        <Input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="날짜"
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
        exportFileName={`근태_${date}`}
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
      toast({ type: 'success', title: '근태를 고쳤습니다' });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${row.name} — ${date} 근태 고치기`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <div className={styles.row2}>
          <label className={astyles.fieldLabel}>
            출근
            <Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </label>
          <label className={astyles.fieldLabel}>
            퇴근
            <Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </label>
        </div>
        <label className={astyles.fieldLabel}>
          메모
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="고친 이유" />
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [month, scope, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const n = (v: unknown) => (Number(v) ? String(v) : '-');
  const columns: Column[] = [
    { title: '이름', dataIndex: 'name' },
    { title: '직책', render: (r) => String(r.positionName ?? '-') },
    { title: '소속', render: (r) => String(r.orgUnitName ?? '-') },
    { title: '출근일', numeric: true, render: (r) => n(r.worked) },
    { title: '지각', numeric: true, render: (r) => n(r.late) },
    { title: '조퇴', numeric: true, render: (r) => n(r.early) },
    { title: '결근', numeric: true, render: (r) => n(r.absent) },
    { title: '휴가', numeric: true, render: (r) => n(r.leave) },
    { title: '퇴근 기록 없음', numeric: true, render: (r) => n(r.noOut) },
  ];

  return (
    <>
      <div className={styles.monthBar}>
        <Input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          aria-label="달"
          style={{ width: 170 }}
        />
        <span className={styles.hint}>
          오늘까지의 날만 셉니다. 근태 집계 시작일 이전은 세지 않습니다.
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={rows.map((r) => ({ ...r, id: r.employeeId })) as unknown as Row[]}
        loading={loading}
        exportable
        exportFileName={`근태_${month}`}
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '파일을 읽지 못했습니다' });
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
        title: `${r.saved}건 반영했습니다${r.skipped ? ` (범위 밖 ${r.skipped}건 제외)` : ''}`,
      });
      setRows(null);
      setFileName('');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '반영하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column[] = [
    { title: '줄', numeric: true, render: (r) => String(r.rowNo) },
    { title: '사번', render: (r) => String(r.empNo ?? '-') },
    { title: '이름(파일)', render: (r) => String(r.name ?? '-') },
    { title: '날짜', render: (r) => String(r.workDate ?? '-') },
    { title: '출근', render: (r) => String(r.clockIn ?? '-') },
    { title: '퇴근', render: (r) => String(r.clockOut ?? '-') },
    { title: '찾은 직원', render: (r) => String(r.employeeName ?? '-') },
    {
      title: '결과',
      flex: 1,
      minWidth: 180,
      render: (r) =>
        r.problem ? (
          <span className={styles.problem}>{String(r.problem)}</span>
        ) : (
          <Badge variant="subtle" color="success">
            반영
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
          근태 파일 고르기 (.xlsx · .csv)
        </Button>
        <span className={styles.hint}>
          지문인식기 등에서 내려받은 출퇴근 파일 — 첫 줄 근처에 &apos;일자(날짜)&apos;,
          &apos;출근&apos;, &apos;퇴근&apos;, &apos;이름(또는 사번)&apos; 칸이 있으면 알아서
          맞춥니다. 같은 직원·날짜 기록은 파일 값으로 바뀝니다.
        </span>
      </div>
      {rows && (
        <>
          <div className={styles.monthBar}>
            <b>{fileName}</b>
            <span className={styles.counts}>
              <Badge variant="subtle" color="success">
                반영 {good.length}
              </Badge>
              {rows.length - good.length > 0 && (
                <Badge variant="subtle" color="error">
                  제외 {rows.length - good.length}
                </Badge>
              )}
            </span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setRows(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!good.length}
              onClick={() => void commit()}
            >
              {good.length}건 반영
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

function SettingsTab() {
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
      toast({ type: 'success', title: '저장했습니다' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`rd-card ${styles.settings}`}>
      <div className={styles.row2}>
        <label className={astyles.fieldLabel}>
          출근 기준
          <Input
            type="time"
            value={s.workStart}
            onChange={(e) => set('workStart', e.target.value)}
          />
        </label>
        <label className={astyles.fieldLabel}>
          퇴근 기준
          <Input type="time" value={s.workEnd} onChange={(e) => set('workEnd', e.target.value)} />
        </label>
        <label className={astyles.fieldLabel}>
          반차 기준
          <Input
            type="time"
            value={s.halfSplit}
            onChange={(e) => set('halfSplit', e.target.value)}
          />
          <span className={styles.hint}>
            오전 반차는 이 시각까지 출근, 오후 반차는 이 시각 이후 퇴근이면 정상
          </span>
        </label>
        <label className={astyles.fieldLabel}>
          지각 유예(분)
          <Input
            type="number"
            min={0}
            max={120}
            value={s.lateGraceMin}
            onChange={(e) => set('lateGraceMin', Number(e.target.value))}
          />
        </label>
        <label className={astyles.fieldLabel}>
          근태 집계 시작일
          <Input
            type="date"
            value={s.trackFrom}
            onChange={(e) => set('trackFrom', e.target.value)}
          />
          <span className={styles.hint}>
            이전 날은 &apos;기록 전&apos;으로 보고 결근으로 세지 않습니다.
          </span>
        </label>
      </div>
      <div>
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          저장
        </Button>
      </div>
    </section>
  );
}
