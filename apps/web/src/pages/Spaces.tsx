import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Settings2, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  FilterButton,
  filterRows,
  Input,
  ListToolbar,
  Modal,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  PhoneInput,
} from '../components/ui';
import { ChoiceChips } from '../components/ui';
import { PersonPicker } from '../components/approval/FormFields';
import styles from './spaces.module.css';
import { formatPhone } from '../lib/phone';
import { DatePicker } from '../components/ui';

interface Space {
  id: string;
  name: string;
  kind: 'MEETING' | 'RENTAL';
  location: string | null;
  capacity: number | null;
  facilities: string[];
  color: string;
  hourlyFee: number | null;
  openHour: number;
  closeHour: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}
interface Reservation {
  id: string;
  spaceId: string;
  title: string;
  startAt: string;
  endAt: string;
  description: string | null;
  bookedBy: string;
  bookedByName: string;
  bookedByOrg: string | null;
  attendees: { id: string; name: string }[];
  customerName: string | null;
  customerPhone: string | null;
  headcount: number | null;
  fee: number | null;
  paid: boolean | null;
  canEdit: boolean;
}

/** 1시간 높이(px) */
const HOUR_H = 56;
const KIND_LABEL = {
  MEETING: i18n.t('space.kind.MEETING'),
  RENTAL: i18n.t('space.kind.RENTAL'),
} as const;
const WEEK = [
  i18n.t('space.dow.0'),
  i18n.t('space.dow.1'),
  i18n.t('space.dow.2'),
  i18n.t('space.dow.3'),
  i18n.t('space.dow.4'),
  i18n.t('space.dow.5'),
  i18n.t('space.dow.6'),
];
const SWATCHES = [
  '#3b82f6',
  '#6366f1',
  '#10b981',
  '#f97316',
  '#ef4444',
  '#8b5cf6',
  '#0ea5e9',
  '#eab308',
];

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const pad = (n: number) => String(n).padStart(2, '0');
/** 한국 날짜 YYYY-MM-DD */
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
/** ISO → 한국 시각의 시(소수) */
const kstHour = (iso: string) => {
  const k = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return k.getUTCHours() + k.getUTCMinutes() / 60;
};
const hm = (h: number) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** 그날 h시(24 = 다음날 0시) → ISO */
const isoAt = (date: string, h: number) =>
  h >= 24 ? `${addDays(date, 1)}T00:00:00+09:00` : `${date}T${hm(h)}:00+09:00`;
const dateLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return i18n.t('space.dateLong', {
    v0: d.getUTCFullYear(),
    v1: d.getUTCMonth() + 1,
    v2: d.getUTCDate(),
    v3: WEEK[d.getUTCDay()],
  });
};
const won = (n: number | null | undefined) =>
  n == null ? '—' : i18n.t('space.won', { v0: n.toLocaleString('ko-KR') });
const monthRange = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`] as const;
};

/**
 * 공간 예약 — 회의실(사내)과 대여 공간(서초 시그니처 파티룸 등, 외부 고객).
 * 일간: 공간별 세로 칸 + 시간 줄, 빈 곳을 누르면 그 시간으로 예약. 목록: 이달 예약(대여료·입금 여부).
 * 예약·내 예약 고치기는 누구나, 공간 관리·남의 예약·대여 고객 정보는 SPACE.MANAGE.
 */
export default function Spaces() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, can } = useAuth();
  const manager = can('SPACE.MANAGE');
  const { updatedAt, touch } = useUpdatedAt();
  const [view, setView] = useState<'day' | 'list'>('day');
  const [date, setDate] = useState(kstDate());
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Reservation | null>(null);
  /** 이달 목록 검색 옆 필터 — 공간·종류·예약자·결제 */
  const [flt, setFlt] = useState<FilterValues>({});
  const [editing, setEditing] = useState<
    { res: Reservation } | { spaceId?: string; start?: number } | null
  >(null);
  const [admin, setAdmin] = useState(false);

  const loadSpaces = useCallback(async () => {
    try {
      setSpaces(await api<Space[]>('/spaces'));
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('space.spacesFailed')) });
    }
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    const [from, to] = view === 'day' ? [date, date] : monthRange(date);
    try {
      setRows(await api<Reservation[]>(`/spaces/reservations?from=${from}&to=${to}`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('space.bookingsFailed')) });
    } finally {
      setLoading(false);
    }
    // touch는 매번 새 함수라 빼 둔다
  }, [view, date, toast]);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);
  useEffect(() => {
    void load();
  }, [load]);

  const spaceOf = (id: string) => spaces.find((s) => s.id === id);
  const today = kstDate();

  const listColumns: Column[] = [
    { title: t('space.col.date'), dataIndex: 'day', width: 130 },
    { title: t('space.col.time'), dataIndex: 'time', width: 120 },
    { title: t('space.col.space'), dataIndex: 'spaceName', width: 170 },
    { title: t('space.col.purpose'), dataIndex: 'title', minWidth: 180, flex: 1 },
    { title: t('space.col.booker'), dataIndex: 'bookedByName', width: 110 },
    ...(manager
      ? [
          { title: t('space.col.customer'), dataIndex: 'customer', width: 150 },
          { title: t('space.col.people'), dataIndex: 'headcount', width: 70, numeric: true },
          { title: t('space.col.fee'), dataIndex: 'feeText', width: 120, numeric: true },
          {
            title: t('space.col.paid'),
            dataIndex: 'paidText',
            width: 80,
            render: (r: Row) =>
              r.paidText ? (
                <Badge variant="subtle" color={r.paid ? 'success' : 'warning'}>
                  {String(r.paidText)}
                </Badge>
              ) : null,
          },
        ]
      : []),
  ];
  const listRows = rows.map((r) => {
    const s = spaceOf(r.spaceId);
    const rental = s?.kind === 'RENTAL';
    return {
      ...r,
      day: dateLabel(kstDate(new Date(r.startAt))),
      time: `${hm(kstHour(r.startAt))}~${hm(kstHour(r.endAt) || 24)}`,
      spaceName: s?.name ?? t('space.inactiveSpace'),
      customer: [r.customerName, r.customerPhone && formatPhone(r.customerPhone)]
        .filter(Boolean)
        .join(' · '),
      feeText: rental && r.fee != null ? won(r.fee) : '',
      paidText:
        rental && r.paid != null && r.customerName
          ? r.paid
            ? t('space.col.paid')
            : t('space.unpaid')
          : '',
    };
  });

  const filterFields: FilterField[] = [
    {
      key: 'spaceId',
      label: t('space.flt.space'),
      type: 'multi',
      options: spaces.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      key: 'kind',
      label: t('space.flt.kind'),
      type: 'multi',
      options: (['MEETING', 'RENTAL'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] })),
    },
    {
      key: 'bookedByName',
      label: t('space.flt.booker'),
      type: 'multi',
      options: [...new Set(rows.map((r) => r.bookedByName))]
        .sort((a, b) => a.localeCompare(b, 'ko'))
        .map((v) => ({ value: v, label: v })),
    },
    {
      key: 'paid',
      label: t('space.flt.paid'),
      type: 'single',
      options: [
        { value: 'true', label: t('space.flt.paidYes') },
        { value: 'false', label: t('space.flt.paidNo') },
      ],
    },
  ];
  const listShown = filterRows(listRows, filterFields, flt, (r, key) =>
    key === 'kind'
      ? spaceOf(r.spaceId)?.kind
      : key === 'paid'
        ? r.paid == null
          ? ''
          : String(r.paid)
        : r[key as keyof typeof r],
  );

  // 목록 화면 공통 배치 — 날짜(왼쪽) ……… 일간/이달 목록(오른쪽) / ……… 공간 관리·예약하기(오른쪽)
  const dateNav = (
    <div className={styles.dateNav}>
      <button
        type="button"
        className={styles.navBtn}
        aria-label={view === 'day' ? t('space.prevDay') : t('space.prevMonth')}
        onClick={() =>
          setDate((d) => (view === 'day' ? addDays(d, -1) : addDays(monthRange(d)[0], -1)))
        }
      >
        <ChevronLeft size={16} />
      </button>
      <span className={styles.dateText}>
        {view === 'day'
          ? dateLabel(date)
          : t('space.yearMonth', { v0: date.slice(0, 4), v1: Number(date.slice(5, 7)) })}
      </span>
      <button
        type="button"
        className={styles.navBtn}
        aria-label={view === 'day' ? t('space.nextDay') : t('space.nextMonth')}
        onClick={() =>
          setDate((d) => (view === 'day' ? addDays(d, 1) : addDays(monthRange(d)[1], 1)))
        }
      >
        <ChevronRight size={16} />
      </button>
      {date !== today && (
        <Button variant="ghost" size="sm" onClick={() => setDate(today)}>
          {t('space.today')}
        </Button>
      )}
      <DatePicker
        className={styles.dateInput}
        value={date}
        aria-label={t('space.pickDate')}
        onChange={(v) => v && setDate(v)}
      />
    </div>
  );
  const viewSwitch = (
    <SegmentedControl
      value={view}
      onChange={(v) => setView(v as 'day' | 'list')}
      options={[
        { value: 'day', label: t('space.view.day') },
        { value: 'list', label: t('space.view.month') },
      ]}
    />
  );
  const actions = (
    <div className={styles.actions}>
      {manager && (
        <Button variant="outline" size="sm" onClick={() => setAdmin(true)}>
          <Settings2 size={15} /> {t('space.manage')}
        </Button>
      )}
      <Button variant="primary" size="sm" onClick={() => setEditing({})} disabled={!spaces.length}>
        <Plus size={15} /> {t('space.book')}
      </Button>
    </div>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('nav.spaces')}
        onRefresh={() => {
          void loadSpaces();
          void load();
        }}
        updatedAt={updatedAt}
      />

      {view === 'day' && <ListToolbar search={dateNav} viewSwitch={viewSwitch} actions={actions} />}

      {view === 'day' && (
        <div className={styles.cards}>
          {spaces.map((s) => {
            const n = rows.filter((r) => r.spaceId === s.id).length;
            return (
              <div key={s.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.swatch} style={{ background: s.color }} />
                  <b>{s.name}</b>
                  {s.kind === 'RENTAL' && (
                    <Badge variant="subtle" color="warning">
                      {t('space.rental')}
                    </Badge>
                  )}
                </div>
                <div className={styles.cardMeta}>
                  {s.location && (
                    <span>
                      <MapPin size={12} /> {s.location}
                    </span>
                  )}
                  {s.capacity && (
                    <span>
                      <Users size={12} /> {s.capacity}
                      {t('space.peopleSuffix')}
                    </span>
                  )}
                  <span>
                    <Clock size={12} /> {s.openHour}~{s.closeHour}
                    {t('space.hourSuffix')}
                  </span>
                </div>
                {s.facilities.length > 0 && (
                  <div className={styles.cardFac}>{s.facilities.join(' · ')}</div>
                )}
                <div className={styles.cardCount} style={{ color: n ? s.color : undefined }}>
                  {date === today ? t('space.today') : t('space.thatDay')} {t('space.bookings')} {n}
                  {t('space.countSuffix')}
                </div>
              </div>
            );
          })}
          {!spaces.length && !loading && (
            <div className={styles.empty}>
              {t('space.noSpaces')}
              {manager ? t('space.noSpacesHint') : ''}
            </div>
          )}
        </div>
      )}

      {view === 'day' ? (
        spaces.length > 0 && (
          <DayGrid
            spaces={spaces}
            rows={rows}
            date={date}
            isToday={date === today}
            onPick={(spaceId, start) => setEditing({ spaceId, start })}
            onOpen={setDetail}
          />
        )
      ) : (
        <DataTable
          columns={listColumns}
          rows={listShown as unknown as Row[]}
          loading={loading}
          onRowClick={(r) => setDetail(rows.find((x) => x.id === r.id) ?? null)}
          filters={
            <>
              <FilterButton fields={filterFields} value={flt} onChange={setFlt} />
              {dateNav}
            </>
          }
          viewSwitch={viewSwitch}
          toolbarActions={actions}
          exportable
          exportFileName={t('space.exportName', { v0: date.slice(0, 7) })}
        />
      )}

      {detail && (
        <DetailModal
          res={detail}
          space={spaceOf(detail.spaceId)}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing({ res: detail });
            setDetail(null);
          }}
          onCancelled={() => {
            setDetail(null);
            void load();
          }}
        />
      )}
      {editing && (
        <EditModal
          spaces={spaces}
          manager={manager}
          myEmployeeId={user?.employeeId ?? null}
          date={date}
          init={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            const d = kstDate(new Date(saved.startAt));
            if (view === 'day' && d !== date) setDate(d);
            else void load();
          }}
        />
      )}
      {admin && (
        <SpacesAdmin
          onClose={() => {
            setAdmin(false);
            void loadSpaces();
            void load();
          }}
        />
      )}
    </div>
  );
}

/** 일간 — 공간별 세로 칸, 위에서 아래로 시간. 예약 받는 시간 밖은 빗금 */
function DayGrid({
  spaces,
  rows,
  date,
  isToday,
  onPick,
  onOpen,
}: {
  spaces: Space[];
  rows: Reservation[];
  date: string;
  isToday: boolean;
  onPick: (spaceId: string, start: number) => void;
  onOpen: (r: Reservation) => void;
}) {
  const { t } = useTranslation();
  const startH = Math.min(...spaces.map((s) => s.openHour));
  const endH = Math.max(...spaces.map((s) => s.closeHour));
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const height = (endH - startH) * HOUR_H;
  const [now, setNow] = useState(() => kstHour(new Date().toISOString()));
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = setInterval(() => setNow(kstHour(new Date().toISOString())), 60_000);
    return () => clearInterval(h);
  }, []);
  // 오늘이면 지금 시각 근처로
  useEffect(() => {
    if (isToday && scrollRef.current)
      scrollRef.current.scrollTop = Math.max(0, (now - startH - 1) * HOUR_H);
    // 날짜가 바뀔 때만
  }, [date]);

  const click = (e: MouseEvent<HTMLDivElement>, s: Space) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const h = Math.floor((startH + y / HOUR_H) * 2) / 2; // 30분 단위
    if (h < s.openHour || h >= s.closeHour) return;
    onPick(s.id, h);
  };

  return (
    <div className={styles.grid} style={{ ['--cols' as string]: spaces.length }}>
      <div className={styles.gridHead}>
        <div className={styles.timeHead}>{t('space.col.time')}</div>
        {spaces.map((s) => (
          <div key={s.id} className={styles.colHead}>
            <span className={styles.swatch} style={{ background: s.color }} />
            {s.name}
            {s.capacity && (
              <span className={styles.muted}>
                ({s.capacity}
                {t('space.peopleClose')}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className={styles.gridBody} ref={scrollRef}>
        <div className={styles.gridInner} style={{ height }}>
          <div className={styles.timeCol}>
            {hours.map((h) => (
              <div key={h} className={styles.timeLabel} style={{ height: HOUR_H }}>
                {pad(h)}:00
              </div>
            ))}
          </div>
          {spaces.map((s) => (
            <div
              key={s.id}
              className={styles.col}
              style={{ ['--hour-h' as string]: `${HOUR_H}px` }}
              onClick={(e) => click(e, s)}
              title={t('space.clickToBook')}
            >
              {s.openHour > startH && (
                <div
                  className={styles.closed}
                  style={{ top: 0, height: (s.openHour - startH) * HOUR_H }}
                />
              )}
              {s.closeHour < endH && (
                <div
                  className={styles.closed}
                  style={{
                    top: (s.closeHour - startH) * HOUR_H,
                    height: (endH - s.closeHour) * HOUR_H,
                  }}
                />
              )}
              {rows
                .filter((r) => r.spaceId === s.id)
                .map((r) => {
                  const a = kstHour(r.startAt);
                  const b = kstHour(r.endAt) || 24;
                  const top = (a - startH) * HOUR_H;
                  const h = Math.max((b - a) * HOUR_H - 2, 22);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={styles.block}
                      style={{
                        top,
                        height: h,
                        ['--c' as string]: s.color,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r);
                      }}
                    >
                      <span className={styles.blockTitle}>{r.title}</span>
                      <span className={styles.blockMeta}>
                        {hm(a)}~{hm(b)} · {r.customerName ?? r.bookedByName}
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
          {isToday && now >= startH && now <= endH && (
            <div className={styles.nowLine} style={{ top: (now - startH) * HOUR_H }} aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  res,
  space,
  onClose,
  onEdit,
  onCancelled,
}: {
  res: Reservation;
  space: Space | undefined;
  onClose: () => void;
  onEdit: () => void;
  onCancelled: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const rental = space?.kind === 'RENTAL';
  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/spaces/reservations/${res.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('space.canceled') });
      onCancelled();
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('space.cancelFailed')) });
    } finally {
      setBusy(false);
    }
  };
  const item = (label: string, value: React.ReactNode) =>
    value ? (
      <div className={styles.dItem}>
        <span>{label}</span>
        <div>{value}</div>
      </div>
    ) : null;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={res.title}
      footer={
        res.canEdit ? (
          <>
            <Button
              variant={confirm ? 'danger' : 'ghost'}
              loading={busy}
              style={{ marginRight: 'auto' }}
              onClick={() => (confirm ? void cancel() : setConfirm(true))}
            >
              {confirm ? t('space.confirmCancel') : t('space.cancelBooking')}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t('space.close')}
            </Button>
            <Button variant="primary" onClick={onEdit}>
              {t('space.edit')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            {t('space.close')}
          </Button>
        )
      }
    >
      <div className={styles.detail}>
        {item(
          t('space.col.space'),
          space ? (
            <span className={styles.inline}>
              <span className={styles.swatch} style={{ background: space.color }} />
              {space.name}
            </span>
          ) : (
            t('space.inactiveSpace')
          ),
        )}
        {item(
          t('space.col.time'),
          `${dateLabel(kstDate(new Date(res.startAt)))} ${hm(kstHour(res.startAt))}~${hm(kstHour(res.endAt) || 24)}`,
        )}
        {item(
          t('space.col.booker'),
          [res.bookedByName, res.bookedByOrg].filter(Boolean).join(' · '),
        )}
        {item(t('space.attendees'), res.attendees.map((a) => a.name).join(', '))}
        {item(
          t('space.col.people'),
          res.headcount ? t('space.peopleN', { v0: res.headcount }) : null,
        )}
        {rental &&
          item(
            t('space.col.customer'),
            [res.customerName, res.customerPhone && formatPhone(res.customerPhone)]
              .filter(Boolean)
              .join(' · '),
          )}
        {rental && res.fee != null && item(t('space.col.fee'), won(res.fee))}
        {rental &&
          res.paid != null &&
          res.customerName &&
          item(
            t('space.col.paid'),
            <Badge variant="subtle" color={res.paid ? 'success' : 'warning'}>
              {res.paid ? t('space.paidConfirmed') : t('space.unpaid')}
            </Badge>,
          )}
        {item(
          t('space.memo'),
          res.description ? <p className={styles.pre}>{res.description}</p> : null,
        )}
      </div>
    </Modal>
  );
}

function EditModal({
  spaces,
  manager,
  myEmployeeId,
  date: baseDate,
  init,
  onClose,
  onSaved,
}: {
  spaces: Space[];
  manager: boolean;
  myEmployeeId: string | null;
  date: string;
  init: { res: Reservation } | { spaceId?: string; start?: number };
  onClose: () => void;
  onSaved: (r: Reservation) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const res = 'res' in init ? init.res : null;
  const first = res ? res.spaceId : ('spaceId' in init && init.spaceId) || spaces[0]?.id;
  const [spaceId, setSpaceId] = useState(first ?? '');
  const space = spaces.find((s) => s.id === spaceId);
  const [title, setTitle] = useState(res?.title ?? '');
  const [date, setDate] = useState(res ? kstDate(new Date(res.startAt)) : baseDate);
  const initStart = res
    ? kstHour(res.startAt)
    : ('start' in init && init.start) || Math.max(space?.openHour ?? 9, 9);
  const [start, setStart] = useState(initStart);
  const [end, setEnd] = useState(
    res ? kstHour(res.endAt) || 24 : Math.min(initStart + 1, space?.closeHour ?? 24),
  );
  const [attendees, setAttendees] = useState<string[]>(
    res ? res.attendees.map((a) => a.id) : myEmployeeId ? [myEmployeeId] : [],
  );
  const [description, setDescription] = useState(res?.description ?? '');
  const [headcount, setHeadcount] = useState(res?.headcount ? String(res.headcount) : '');
  const [customerName, setCustomerName] = useState(res?.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(res?.customerPhone ?? '');
  const [fee, setFee] = useState(res?.fee != null ? String(res.fee) : '');
  const [paid, setPaid] = useState(!!res?.paid);
  const [busy, setBusy] = useState(false);

  const open = space?.openHour ?? 8;
  const close = space?.closeHour ?? 22;
  const slots = useMemo(() => {
    const out: number[] = [];
    for (let h = open; h <= close; h += 0.5) out.push(h);
    return out;
  }, [open, close]);
  const rental = space?.kind === 'RENTAL';
  const hours = end - start;
  const autoFee = rental && space?.hourlyFee ? Math.round(space.hourlyFee * hours) : null;
  const ready = !!spaceId && !!title.trim() && end > start && start >= open && end <= close;

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        spaceId,
        title: title.trim(),
        startAt: isoAt(date, start),
        endAt: isoAt(date, end),
        attendeeEmpIds: attendees,
        description: description.trim() || null,
        headcount: headcount ? Number(headcount) : null,
        ...(manager && rental
          ? {
              customerName: customerName.trim() || null,
              customerPhone: customerPhone.trim() || null,
              fee: fee ? Number(fee.replace(/,/g, '')) : null,
              paid,
            }
          : {}),
      };
      const saved = await api<Reservation>(
        res ? `/spaces/reservations/${res.id}` : '/spaces/reservations',
        {
          method: res ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      );
      toast({ type: 'success', title: res ? t('space.updated') : t('space.booked') });
      onSaved(saved);
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('space.bookFailed')) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={res ? t('space.editTitle') : t('space.newTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('space.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void save()}>
            {res ? t('space.save') : t('space.book')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.field}>
          {t('space.col.space')}
          <ChoiceChips
            value={spaceId}
            onChange={(v) => {
              setSpaceId(v);
              const s = spaces.find((x) => x.id === v);
              if (s) {
                const a = Math.min(Math.max(start, s.openHour), s.closeHour - 0.5);
                setStart(a);
                setEnd(Math.min(Math.max(end, a + 0.5), s.closeHour));
              }
            }}
            options={spaces.map((s) => ({
              value: s.id,
              label: `${s.name}${s.kind === 'RENTAL' ? t('space.rentalSuffix') : ''}`,
            }))}
          />
        </div>
        <label className={styles.field}>
          {t('space.purposeReq')}
          <Input
            value={title}
            autoFocus
            maxLength={100}
            placeholder={rental ? t('space.purposeRentalPh') : t('space.purposePh')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className={styles.row3}>
          <label className={styles.field}>
            {t('space.col.date')}
            <DatePicker value={date} onChange={(v) => v && setDate(v)} />
          </label>
          <div className={styles.field}>
            {t('space.start')}
            <Select
              value={String(start)}
              onValueChange={(v) => {
                const a = Number(v);
                setStart(a);
                if (end <= a) setEnd(Math.min(a + 1, close));
              }}
              options={slots.slice(0, -1).map((h) => ({ value: String(h), label: hm(h) }))}
              aria-label={t('space.startTime')}
            />
          </div>
          <div className={styles.field}>
            {t('space.end')}
            <Select
              value={String(end)}
              onValueChange={(v) => setEnd(Number(v))}
              options={slots
                .filter((h) => h > start)
                .map((h) => ({ value: String(h), label: hm(h) }))}
              aria-label={t('space.endTime')}
            />
          </div>
        </div>
        <span className={styles.muted}>
          {space ? t('space.hoursNote', { v0: space.name, v1: open, v2: close }) : ''}
          {hours > 0 ? t('space.hoursN', { v0: hours }) : ''}
        </span>
        <div className={styles.field}>
          {t('space.attendees')}
          <PersonPicker value={attendees} onChange={setAttendees} />
        </div>
        <label className={styles.field}>
          {t('space.col.people')}
          <Input
            inputMode="numeric"
            className={styles.short}
            value={headcount}
            placeholder={space?.capacity ? t('space.maxN', { v0: space.capacity }) : ''}
            onChange={(e) => setHeadcount(e.target.value.replace(/\D/g, '').slice(0, 5))}
          />
        </label>
        {rental && manager && (
          <div className={styles.rental}>
            <b>{t('space.rentalCustomer')}</b>
            <div className={styles.row3}>
              <label className={styles.field}>
                {t('space.customerName')}
                <Input
                  value={customerName}
                  maxLength={50}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                {t('space.phone')}
                <PhoneInput value={customerPhone} onChange={setCustomerPhone} />
              </label>
              <label className={styles.field}>
                {t('space.feeWon')}
                <Input
                  inputMode="numeric"
                  value={fee}
                  placeholder={
                    autoFee != null
                      ? t('space.autoFee', { v0: autoFee.toLocaleString('ko-KR') })
                      : ''
                  }
                  onChange={(e) => setFee(e.target.value.replace(/[^\d,]/g, ''))}
                />
              </label>
            </div>
            <Checkbox
              checked={paid}
              onCheckedChange={(c) => setPaid(c === true)}
              label={t('space.feePaid')}
            />
          </div>
        )}
        <label className={styles.field}>
          {t('space.memo')}
          <Textarea
            rows={3}
            value={description}
            maxLength={1000}
            placeholder={rental ? t('space.rentalMemoPh') : t('space.agendaPh')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}

/** 공간 관리 — 목록(행을 누르면 편집) + 새 공간 */
function SpacesAdmin({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [list, setList] = useState<Space[]>([]);
  const [editing, setEditing] = useState<Space | 'new' | null>(null);
  const load = useCallback(async () => {
    try {
      setList(await api<Space[]>('/spaces?all=1'));
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('space.loadFailed')) });
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column[] = [
    {
      title: t('space.col.name'),
      dataIndex: 'name',
      minWidth: 160,
      flex: 1,
      render: (r) => (
        <span className={styles.inline}>
          <span className={styles.swatch} style={{ background: String(r.color) }} />
          {String(r.name)}
        </span>
      ),
    },
    { title: t('space.col.kind'), dataIndex: 'kindText', width: 100 },
    { title: t('space.col.location'), dataIndex: 'location', width: 100 },
    { title: t('space.col.people'), dataIndex: 'capacity', width: 70, numeric: true },
    { title: t('space.col.hours'), dataIndex: 'hours', width: 100 },
    {
      title: t('space.col.status'),
      dataIndex: 'activeText',
      width: 90,
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {String(r.activeText)}
        </Badge>
      ),
    },
  ];
  const rows = list.map((s) => ({
    ...s,
    kindText: KIND_LABEL[s.kind],
    hours: t('space.hoursRange', { v0: s.openHour, v1: s.closeHour }),
    activeText: s.isActive ? t('space.on') : t('space.off'),
  }));

  return (
    <>
      <Modal
        open={!editing}
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title={t('space.manage')}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('space.close')}
            </Button>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={15} /> {t('space.addSpace')}
            </Button>
          </>
        }
      >
        <DataTable
          columns={columns}
          rows={rows as unknown as Row[]}
          pageSize={0}
          onRowClick={(r) => setEditing(list.find((s) => s.id === r.id) ?? null)}
        />
      </Modal>
      {editing && (
        <SpaceEdit
          space={editing === 'new' ? null : editing}
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

function SpaceEdit({
  space,
  onClose,
  onSaved,
}: {
  space: Space | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(space?.name ?? '');
  const [kind, setKind] = useState<Space['kind']>(space?.kind ?? 'MEETING');
  const [location, setLocation] = useState(space?.location ?? '');
  const [capacity, setCapacity] = useState(space?.capacity ? String(space.capacity) : '');
  const [facilities, setFacilities] = useState((space?.facilities ?? []).join(', '));
  const [color, setColor] = useState(space?.color ?? SWATCHES[0]);
  const [hourlyFee, setHourlyFee] = useState(
    space?.hourlyFee != null ? String(space.hourlyFee) : '',
  );
  const [openHour, setOpenHour] = useState(space?.openHour ?? 8);
  const [closeHour, setCloseHour] = useState(space?.closeHour ?? 22);
  const [description, setDescription] = useState(space?.description ?? '');
  const [isActive, setIsActive] = useState(space?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        kind,
        location: location.trim() || null,
        capacity: capacity ? Number(capacity) : null,
        facilities: facilities
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean),
        color,
        hourlyFee: kind === 'RENTAL' && hourlyFee ? Number(hourlyFee.replace(/,/g, '')) : null,
        openHour,
        closeHour,
        description: description.trim() || null,
        isActive,
      };
      await api(space ? `/spaces/${space.id}` : '/spaces', {
        method: space ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      toast({ type: 'success', title: t('space.saved') });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('space.saveFailed')) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!space) return;
    setBusy(true);
    try {
      const r = await api<{ deactivated: boolean }>(`/spaces/${space.id}`, { method: 'DELETE' });
      toast({
        type: 'success',
        title: r.deactivated ? t('space.deactivatedInstead') : t('space.spaceDeleted'),
      });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('space.deleteFailed')) });
    } finally {
      setBusy(false);
    }
  };
  const hourOpts = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => ({
      value: String(h),
      label: t('space.hourN', { v0: h }),
    }));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={space ? t('space.editOf', { v0: space.name }) : t('space.newSpace')}
      footer={
        <>
          {space && (
            <Button
              variant={confirm ? 'danger' : 'ghost'}
              style={{ marginRight: 'auto' }}
              onClick={() => (confirm ? void remove() : setConfirm(true))}
            >
              {confirm ? t('space.confirmDelete') : t('space.deleteSpace')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('space.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim() || openHour >= closeHour}
            onClick={() => void save()}
          >
            {t('space.save')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <label className={styles.field}>
          {t('space.nameReq')}
          <Input value={name} autoFocus maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className={styles.field}>
          {t('space.col.kind')}
          <ChoiceChips
            value={kind}
            onChange={(v) => setKind(v as Space['kind'])}
            options={[
              { value: 'MEETING', label: t('space.kindOpt.MEETING') },
              { value: 'RENTAL', label: t('space.kindOpt.RENTAL') },
            ]}
          />
        </div>
        <div className={styles.row3}>
          <label className={styles.field}>
            {t('space.col.location')}
            <Input
              value={location}
              maxLength={60}
              placeholder={t('space.locationPh')}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            {t('space.capacity')}
            <Input
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value.replace(/\D/g, '').slice(0, 5))}
            />
          </label>
          {kind === 'RENTAL' && (
            <label className={styles.field}>
              {t('space.hourlyFee')}
              <Input
                inputMode="numeric"
                value={hourlyFee}
                onChange={(e) => setHourlyFee(e.target.value.replace(/[^\d,]/g, ''))}
              />
            </label>
          )}
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            {t('space.openFrom')}
            <Select
              value={String(openHour)}
              onValueChange={(v) => setOpenHour(Number(v))}
              options={hourOpts(0, 23)}
              aria-label={t('space.openFromTime')}
            />
          </div>
          <div className={styles.field}>
            {t('space.openTo')}
            <Select
              value={String(closeHour)}
              onValueChange={(v) => setCloseHour(Number(v))}
              options={hourOpts(1, 24)}
              aria-label={t('space.openToTime')}
            />
          </div>
        </div>
        <label className={styles.field}>
          {t('space.facilities')}
          <Input
            value={facilities}
            placeholder={t('space.facilitiesPh')}
            onChange={(e) => setFacilities(e.target.value)}
          />
        </label>
        <div className={styles.field}>
          {t('space.color')}
          <div className={styles.swatches}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('space.colorN', { v0: c })}
                aria-pressed={color === c}
                className={styles.swatchBtn}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <label className={styles.field}>
          {t('space.desc')}
          <Textarea
            rows={2}
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Checkbox
          checked={isActive}
          onCheckedChange={(c) => setIsActive(c === true)}
          label={t('space.acceptBookings')}
        />
      </div>
    </Modal>
  );
}
