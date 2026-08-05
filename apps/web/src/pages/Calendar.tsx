import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, ApiError, downloadFile } from '../lib/api';
import { Badge, Button, PageCard, Spinner, useToast, type Row } from '../components/ui';
import { WORK_STATUS } from './WorkOrders';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/work-orders'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const sd = r.scheduledDate as string | null;
      if (!sd) continue;
      const key = sd.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return map;
  }, [rows]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = ymd(new Date());

  const cells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const exportIcs = async () => {
    try {
      await downloadFile('/calendar/work-orders.ics', 'tongin-schedule.ics');
      toast({ type: 'success', title: t('work.exportDone') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    }
  };

  return (
    <PageCard
      title={t('nav.calendar')}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft size={16} />
          </Button>
          <span style={{ fontWeight: 600, fontSize: 14, minWidth: 90, textAlign: 'center' }}>
            {year}. {pad(month + 1)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            {t('calendar.today')}
          </Button>
          <Button variant="outline" size="sm" onClick={exportIcs}>
            📅 {t('work.exportIcs')}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                style={{
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--ark-color-text-secondary)',
                  padding: '6px 0',
                }}
              >
                {w}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
            {cells.map((d, i) => {
              const key = d ? ymd(d) : `empty-${i}`;
              const items = d ? (byDate.get(ymd(d)) ?? []) : [];
              const isToday = d && ymd(d) === today;
              return (
                <div
                  key={key}
                  style={{
                    minHeight: 96,
                    border: '1px solid var(--ark-color-border)',
                    borderRadius: 6,
                    padding: 6,
                    background: d ? 'var(--ark-color-bg)' : 'var(--ark-color-bg-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {d && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isToday ? 700 : 500,
                        color: isToday ? 'var(--ark-color-primary-500)' : 'var(--ark-color-text)',
                      }}
                    >
                      {d.getDate()}
                    </span>
                  )}
                  {items.map((it) => (
                    <div
                      key={it.id as string}
                      onClick={() => navigate(`/work-orders/${it.id as string}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Badge
                        variant="subtle"
                        color={
                          WORK_STATUS[it.status as string]?.color === 'success'
                            ? 'success'
                            : WORK_STATUS[it.status as string]?.color === 'error'
                              ? 'error'
                              : 'primary'
                        }
                      >
                        {String(it.workNo)}
                      </Badge>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageCard>
  );
}
