import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, downloadFile } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  PageHeader,
  SegmentedControl,
  Spinner,
  useToast,
} from '../components/ui';
import CalendarGrid from '../components/calendar/CalendarGrid';
import EventModal, { type EventFormValues } from '../components/calendar/EventModal';
import {
  addDays,
  addMonths,
  addYears,
  dateKey,
  rangeFor,
  type CalendarItem,
  type CalendarView,
} from '../lib/calendarUtils';

type Scope = 'MINE' | 'ORG';

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
  const [scope, setScope] = useState<Scope>('MINE');
  const [events, setEvents] = useState<CalendarItem[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRow[]>([]);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editing, setEditing] = useState<CalendarItem | null>(null);
  /** 방금 연결을 마쳤을 때 스로틀을 무시하고 즉시 한 번 동기화하기 위한 플래그 */
  const [justConnected, setJustConnected] = useState(false);

  const range = useMemo(() => rangeFor(view, currentDate), [view, currentDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api<CalendarItem[]>(
        `/calendar/events?from=${range.from}&to=${range.to}&scope=${scope}`,
      );
      setEvents(rows);
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, scope, toast, t]);

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
      toast({ type: 'success', title: '구글 캘린더가 연결되었습니다. 일정을 불러오는 중…' });
      // 연결 직후 곧바로 1회 동기화 — 사용자가 별도로 버튼을 누르지 않아도 일정이 보이게 한다.
      void api<GoogleStatus>('/calendar/google/status')
        .then((s) => {
          setGoogle(s);
          setJustConnected(true);
        })
        .catch(() => undefined);
    } else if (result === 'denied') {
      toast({ type: 'warning', title: '구글 계정 연결이 취소되었습니다.' });
    } else {
      toast({ type: 'error', title: searchParams.get('message') ?? '구글 연결에 실패했습니다.' });
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
  const openAdd = useCallback((date: Date) => {
    setSelectedDate(date);
    setEditing(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((ev: CalendarItem) => {
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
      toast({ type: 'success', title: editing ? '일정이 수정되었습니다.' : '일정이 등록되었습니다.' });
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
      toast({ type: 'success', title: '일정이 삭제되었습니다.' });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '연결에 실패했습니다.' });
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
        title: `동기화 완료 — 가져오기 ${r.imported} · 내보내기 ${r.exported} · 정리 ${r.removed}`,
      });
      await api<GoogleStatus>('/calendar/google/status').then(setGoogle);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '동기화에 실패했습니다.' });
    } finally {
      setSyncing(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      await api('/calendar/google', { method: 'DELETE' });
      toast({ type: 'success', title: '구글 캘린더 연결을 해제했습니다.' });
      syncedRangesRef.current.clear(); // 재연결 시 곧바로 다시 동기화되도록
      await api<GoogleStatus>('/calendar/google/status').then(setGoogle);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '해제에 실패했습니다.' });
    }
  };

  const exportIcs = async () => {
    try {
      await downloadFile('/calendar/work-orders.ics', 'tongin-schedule.ics');
      toast({ type: 'success', title: t('work.exportDone') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    }
  };

  const orgOptions = orgUnits.map((o) => ({ value: o.id, label: o.name }));
  const defaultOrgUnitId = orgUnits[0]?.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 0 }}>
      <PageHeader
        title={t('nav.calendar')}
        onRefresh={load}
        updatedAt={updatedAt}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {google?.connected && (
              <Badge variant="subtle" color="success">
                {google.googleEmail}
              </Badge>
            )}
            {google?.configured ? (
              google.connected ? (
                <>
                  <Button variant="outline" size="sm" onClick={syncGoogle} disabled={syncing}>
                    {syncing ? '동기화 중…' : '구글 동기화'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={disconnectGoogle}>
                    연결 해제
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={connectGoogle}>
                  구글 캘린더 연결
                </Button>
              )
            ) : (
              <Badge variant="subtle" color="neutral">
                구글 연동 미설정
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={exportIcs}>
              📅 {t('work.exportIcs')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => openAdd(currentDate)}>
              일정 추가
            </Button>
          </div>
        }
      />

      <div style={{ flex: 1, minHeight: 520, position: 'relative' }}>
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
          events={events}
          onDateClick={openAdd}
          onEventClick={openEdit}
          onPickMonth={handlePickMonth}
          toolbar={
            <SegmentedControl
              size="sm"
              value={scope}
              onChange={(v) => setScope(v as Scope)}
              options={[
                { value: 'MINE', label: '내 일정' },
                { value: 'ORG', label: '조직 전체' },
              ]}
            />
          }
        />
      </div>

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
        onOpenRef={(e) => e.refId && navigate(`/work-orders/${e.refId}`)}
      />
    </div>
  );
}
