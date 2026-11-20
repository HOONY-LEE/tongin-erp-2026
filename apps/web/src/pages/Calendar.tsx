import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { Spinner, useToast } from '../components/ui';
import CalendarGrid, { type CalendarSource } from '../components/calendar/CalendarGrid';
import EventModal, { type EventFormValues } from '../components/calendar/EventModal';
import { ClosureDayModal } from '../components/closure/ClosureDayModal';
import { closedOnly, type ClosureData } from '../components/closure/useClosures';

/** 로컬 날짜 → YYYY-MM-DD */
const ymdOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
import {
  addDays,
  addMonths,
  addYears,
  dateKey,
  rangeFor,
  type CalendarItem,
  type CalendarView,
} from '../lib/calendarUtils';

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
}

interface OrgUnitRow {
  id: string;
  name: string;
  type: string;
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  /** 표시할 캘린더(내 일정·조직 일정·작업 일정) — 기본 전체 선택 */
  // ?only=closure(상담 콘솔 마감 달력에서 새 창) — 이사일 마감만
  const [selectedSources, setSelectedSources] = useState<string[]>(() =>
    searchParams.get('only') === 'closure'
      ? ['CLOSURE']
      : ['MINE', 'ORG', 'WORK', 'LEAVE', 'CLOSURE'],
  );
  /** 이사일 마감 — 하루 창(지점별 마감·마감 예정) */
  const [closures, setClosures] = useState<ClosureData>({ closures: [], counts: [] });
  const [closureDay, setClosureDay] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<CalendarItem[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRow[]>([]);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { touch } = useUpdatedAt();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editing, setEditing] = useState<CalendarItem | null>(null);
  /** 방금 연결을 마쳤을 때 스로틀을 무시하고 즉시 한 번 동기화하기 위한 플래그 */
  const [justConnected, setJustConnected] = useState(false);

  const range = useMemo(() => rangeFor(view, currentDate), [view, currentDate]);

  // 서버에서는 항상 조직 범위까지 받아오고(권한 밖 데이터는 서버가 걸러줌),
  // 어떤 캘린더를 보여줄지는 아래 selectedSources로 화면에서 거른다.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, cl] = await Promise.all([
        api<CalendarItem[]>(`/calendar/events?from=${range.from}&to=${range.to}&scope=ORG`),
        api<ClosureData>(`/move-closures?from=${range.from}&to=${range.to}`).catch(() => ({
          closures: [],
          counts: [],
        })),
      ]);
      setEvents(rows);
      setClosures(closedOnly(cl));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 구글 일정은 "동기화" 시점에 우리 DB로 미러링된다(화면 조회 때마다 구글을 직접 부르면
   * 월 이동마다 느려지고 API 할당량을 소모하므로). 사용자가 버튼을 누르지 않아도 되도록
   * 보고 있는 기간이 바뀌면 조용히 백그라운드 동기화하고, 같은 기간은 스로틀로 재호출을 막는다.
   */
  const syncedRangesRef = useRef<Map<string, number>>(new Map());
  const AUTO_SYNC_TTL = 60_000;

  const autoSync = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!google?.connected) return;
      const key = `${range.from}~${range.to}`;
      const last = syncedRangesRef.current.get(key) ?? 0;
      if (!opts?.force && Date.now() - last < AUTO_SYNC_TTL) return;
      syncedRangesRef.current.set(key, Date.now());
      setSyncing(true);
      try {
        const r = await api<{ imported: number; exported: number; removed: number }>(
          `/calendar/google/sync?from=${range.from}&to=${range.to}`,
          { method: 'POST' },
        );
        // 변화가 있을 때만 다시 읽어 불필요한 깜빡임을 피한다
        if (r.imported || r.exported || r.removed) await load();
      } catch {
        // 자동 동기화 실패는 조용히 넘어간다(수동 버튼으로 원인 확인 가능)
        syncedRangesRef.current.delete(key);
      } finally {
        setSyncing(false);
      }
    },
    [google?.connected, range.from, range.to, load],
  );

  useEffect(() => {
    void autoSync();
  }, [autoSync]);

  // 연결 직후에는 스로틀을 무시하고 즉시 동기화
  useEffect(() => {
    if (!justConnected || !google?.connected) return;
    setJustConnected(false);
    void autoSync({ force: true });
  }, [justConnected, google?.connected, autoSync]);

  // 조직 목록 · 구글 연동 상태는 최초 1회
  useEffect(() => {
    void api<OrgUnitRow[]>('/calendar/org-units')
      .then(setOrgUnits)
      .catch(() => setOrgUnits([]));
    void api<GoogleStatus>('/calendar/google/status')
      .then(setGoogle)
      .catch(() => setGoogle(null));
  }, []);

  // 구글 OAuth 콜백 결과 처리(?google=connected|denied|error)
  useEffect(() => {
    const result = searchParams.get('google');
    if (!result) return;
    if (result === 'connected') {
      toast({ type: 'success', title: t('cal.g.connected') });
      // 연결 직후 곧바로 1회 동기화 — 사용자가 별도로 버튼을 누르지 않아도 일정이 보이게 한다.
      void api<GoogleStatus>('/calendar/google/status')
        .then((s) => {
          setGoogle(s);
          setJustConnected(true);
        })
        .catch(() => undefined);
    } else if (result === 'denied') {
      toast({ type: 'warning', title: t('cal.g.canceled') });
    } else {
      toast({ type: 'error', title: searchParams.get('message') ?? t('cal.g.failed') });
    }
    searchParams.delete('google');
    searchParams.delete('message');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  // ── 네비게이션 ──
  const handlePrev = useCallback(() => {
    setCurrentDate((d) =>
      view === 'day'
        ? addDays(d, -1)
        : view === 'week'
          ? addDays(d, -7)
          : view === 'year'
            ? addYears(d, -1)
            : addMonths(d, -1),
    );
  }, [view]);

  const handleNext = useCallback(() => {
    setCurrentDate((d) =>
      view === 'day'
        ? addDays(d, 1)
        : view === 'week'
          ? addDays(d, 7)
          : view === 'year'
            ? addYears(d, 1)
            : addMonths(d, 1),
    );
  }, [view]);

  const handleToday = useCallback(() => setCurrentDate(new Date()), []);

  const handlePickMonth = useCallback((date: Date) => {
    setCurrentDate(date);
    setView('month');
  }, []);

  // ── 일정 CRUD ──
  const onlyClosure = selectedSources.length === 1 && selectedSources[0] === 'CLOSURE';
  const openAdd = useCallback(
    (date: Date) => {
      // 이사일 마감만 보고 있으면 날짜를 눌러 마감을 건다
      if (onlyClosure) {
        setClosureDay(ymdOf(date));
        return;
      }
      setSelectedDate(date);
      setEditing(null);
      setModalOpen(true);
    },
    [onlyClosure],
  );

  const openEdit = useCallback((ev: CalendarItem) => {
    if (ev.source === 'CLOSURE') {
      setClosureDay(ev.date);
      return;
    }
    const [y, m, d] = ev.date.split('-').map(Number);
    setSelectedDate(new Date(y, m - 1, d));
    setEditing(ev);
    setModalOpen(true);
  }, []);

  const handleSave = async (v: EventFormValues) => {
    if (!selectedDate) return;
    setSaving(true);
    const body = {
      title: v.title,
      date: dateKey(selectedDate),
      endDate: v.endDate || undefined,
      startTime: v.startTime || undefined,
      endTime: v.endTime || undefined,
      color: v.color,
      location: v.location || undefined,
      description: v.description || undefined,
      visibility: v.visibility,
      orgUnitId: v.visibility === 'ORG' ? v.orgUnitId : undefined,
    };
    try {
      if (editing) {
        await api(`/calendar/events/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await api('/calendar/events', { method: 'POST', body: JSON.stringify(body) });
      }
      toast({
        type: 'success',
        title: editing ? t('cal.updated') : t('cal.created'),
      });
      setModalOpen(false);
      await load();
      // 구글 연결 상태면 새 일정을 곧바로 구글에도 반영
      void autoSync({ force: true });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    try {
      await api(`/calendar/events/${editing.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('cal.deleted') });
      setModalOpen(false);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  // ── 구글 연동 ──
  const connectGoogle = async () => {
    try {
      const { url } = await api<{ url: string }>('/calendar/google/auth-url');
      window.location.href = url;
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cal.connectFailed') });
    }
  };

  /** 수동 동기화 — 자동 동기화 스로틀과 무관하게 항상 즉시 실행하고 결과를 알려준다. */
  const syncGoogle = async () => {
    setSyncing(true);
    try {
      syncedRangesRef.current.set(`${range.from}~${range.to}`, Date.now());
      const r = await api<{ imported: number; exported: number; removed: number }>(
        `/calendar/google/sync?from=${range.from}&to=${range.to}`,
        { method: 'POST' },
      );
      toast({
        type: 'success',
        title: t('cal.g.synced', { v0: r.imported, v1: r.exported, v2: r.removed }),
      });
      await api<GoogleStatus>('/calendar/google/status').then(setGoogle);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cal.g.syncFailed') });
    } finally {
      setSyncing(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      await api('/calendar/google', { method: 'DELETE' });
      toast({ type: 'success', title: t('cal.g.disconnected') });
      syncedRangesRef.current.clear(); // 재연결 시 곧바로 다시 동기화되도록
      await api<GoogleStatus>('/calendar/google/status').then(setGoogle);
      await load();
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('cal.g.disconnectFailed'),
      });
    }
  };

  const orgOptions = orgUnits.map((o) => ({ value: o.id, label: o.name }));
  const defaultOrgUnitId = orgUnits[0]?.id;

  /** 드롭다운에 노출할 캘린더 목록 */
  const sources: CalendarSource[] = [
    { key: 'MINE', label: t('cal.src.MINE'), color: '#AF52DE' },
    { key: 'ORG', label: t('cal.src.ORG'), color: '#34C759' },
    { key: 'WORK', label: t('cal.src.WORK'), color: '#007AFF' },
    { key: 'LEAVE', label: t('cal.src.LEAVE'), color: '#8B5CF6' },
    { key: 'CLOSURE', label: t('cal.src.CLOSURE'), color: '#8E8E93' },
  ];
  /** 이사일 마감을 캘린더 일정처럼 — 마감은 회색 */
  const closureItems = useMemo<CalendarItem[]>(
    () =>
      closures.closures.map((c) => ({
        id: `closure-${c.id}`,
        source: 'CLOSURE',
        title: t('cal.closure', { v0: c.orgName ?? '전체' }),
        date: c.date,
        endDate: c.date,
        startTime: null,
        endTime: null,
        color: '#8E8E93',
        location: null,
        description: c.memo,
        visibility: 'ORG',
        ownerUserId: null,
        ownerName: null,
        orgUnitId: c.orgUnitId,
        orgUnitName: c.orgName,
        editable: false,
        refId: c.id,
      })),
    [closures],
  );

  const toggleSource = (key: string) =>
    setSelectedSources((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  /** 선택한 캘린더 + 검색어로 필터링 */
  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...events, ...closureItems].filter((e) => {
      const kind =
        e.source === 'CLOSURE'
          ? 'CLOSURE'
          : e.source === 'WORK_ORDER'
            ? 'WORK'
            : e.source === 'LEAVE'
              ? 'LEAVE'
              : e.visibility === 'ORG'
                ? 'ORG'
                : 'MINE';
      if (!selectedSources.includes(kind)) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, closureItems, selectedSources, search]);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 0 }}
    >
      {/* 제목·새로고침 줄은 두지 않는다 — 캘린더가 화면을 최대한 쓴다(탭 이름이 제목 역할) */}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'color-mix(in srgb, var(--ark-color-bg) 60%, transparent)',
            }}
          >
            <Spinner />
          </div>
        )}
        <CalendarGrid
          view={view}
          onViewChange={setView}
          currentDate={currentDate}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          events={visibleEvents}
          onDateClick={openAdd}
          onEventClick={openEdit}
          onPickMonth={handlePickMonth}
          sources={sources}
          selectedSources={selectedSources}
          onToggleSource={toggleSource}
          search={search}
          onSearchChange={setSearch}
          onAddEvent={() => openAdd(currentDate)}
          google={google}
          syncing={syncing}
          onGoogleConnect={connectGoogle}
          onGoogleSync={syncGoogle}
          onGoogleDisconnect={disconnectGoogle}
        />
      </div>

      <ClosureDayModal
        date={closureDay}
        closures={closures.closures.filter((c) => c.date === closureDay)}
        leads={closures.counts.find((c) => c.date === closureDay)?.leads ?? 0}
        onClose={() => setClosureDay(null)}
        onChanged={load}
      />
      <EventModal
        open={modalOpen}
        event={editing}
        selectedDate={selectedDate}
        orgOptions={orgOptions}
        defaultOrgUnitId={defaultOrgUnitId}
        saving={saving}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => setModalOpen(false)}
        onOpenRef={(e) =>
          e.refId &&
          navigate(
            e.source === 'LEAVE' ? `/approvals?detail=${e.refId}` : `/work-orders/${e.refId}`,
          )
        }
      />
    </div>
  );
}
