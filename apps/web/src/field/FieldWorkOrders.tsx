import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin, RefreshCw, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Badge, Spinner, useToast } from '../components/ui';
import { SegmentedControl } from '../components/ui';
import { formatDay, todayKey, WORK_STATUS, type FieldWorkOrder } from './fieldTypes';

type Filter = 'TODAY' | 'UPCOMING' | 'ALL';

/** 현장 첫 화면 — 오늘 할 일이 맨 위에 오도록. */
export default function FieldWorkOrders() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<FieldWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('TODAY');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<FieldWorkOrder[]>('/field/work-orders'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '조회에 실패했습니다' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayKey();
  const counts = useMemo(
    () => ({
      TODAY: rows.filter((w) => w.scheduledDate === today).length,
      UPCOMING: rows.filter((w) => w.scheduledDate && w.scheduledDate > today).length,
      ALL: rows.length,
    }),
    [rows, today],
  );

  const filtered = useMemo(() => {
    if (filter === 'TODAY') return rows.filter((w) => w.scheduledDate === today);
    if (filter === 'UPCOMING')
      return rows.filter((w) => w.scheduledDate && w.scheduledDate > today);
    return rows;
  }, [rows, filter, today]);

  // 날짜별로 묶어 보여준다 — 현장은 "언제"가 첫 기준
  const groups = useMemo(() => {
    const map = new Map<string, FieldWorkOrder[]>();
    for (const w of filtered) {
      const key = w.scheduledDate ?? '';
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>내 작업</h1>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="새로고침"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 40,
            height: 40,
            borderRadius: 10,
            border: '1px solid var(--ark-color-gray-200)',
            background: 'var(--ark-color-bg)',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        options={[
          { value: 'TODAY', label: `오늘 (${counts.TODAY})` },
          { value: 'UPCOMING', label: `예정 (${counts.UPCOMING})` },
          { value: 'ALL', label: `전체 (${counts.ALL})` },
        ]}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <div
          style={{
            padding: '48px 16px',
            textAlign: 'center',
            color: 'var(--ark-color-text-tertiary)',
          }}
        >
          {filter === 'TODAY' ? '오늘 배정된 작업이 없습니다' : '작업이 없습니다'}
        </div>
      ) : (
        groups.map(([day, list]) => (
          <section key={day} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ark-color-text-secondary)',
              }}
            >
              {formatDay(day || null)}
            </h2>
            {list.map((w) => (
              <WorkCard key={w.id} w={w} onOpen={() => navigate(`/field/work-orders/${w.id}`)} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function WorkCard({ w, onOpen }: { w: FieldWorkOrder; onOpen: () => void }) {
  const st = WORK_STATUS[w.status] ?? { label: w.status, color: 'neutral' as const };
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: 14,
        borderRadius: 12,
        border: '1px solid var(--ark-color-gray-200)',
        background: 'var(--ark-color-bg)',
        cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{w.customerName}</span>
          <Badge variant="subtle" color={st.color}>
            {st.label}
          </Badge>
        </div>
        <Route from={w.fromAddr} to={w.toAddr} />
        <div
          style={{
            display: 'flex',
            gap: 12,
            fontSize: 12,
            color: 'var(--ark-color-text-tertiary)',
          }}
        >
          <span>{w.workNo}</span>
          {w.crewCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Users size={12} /> {w.crewCount}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={20} style={{ color: 'var(--ark-color-text-tertiary)', flexShrink: 0 }} />
    </button>
  );
}

function Route({ from, to }: { from: string | null; to: string | null }) {
  if (!from && !to) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        color: 'var(--ark-color-text-secondary)',
        minWidth: 0,
      }}
    >
      <MapPin size={13} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {from ?? '-'} → {to ?? '-'}
      </span>
    </div>
  );
}
