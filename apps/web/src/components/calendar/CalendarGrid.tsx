import { Button, SegmentedControl } from '../ui';
import {
  WEEKDAYS,
  MONTH_LABELS,
  EVENT_COLORS,
  dateKey,
  isSameDay,
  formatTime,
  getMonthMatrix,
  getWeekDays,
  formatDayTitle,
  formatWeekTitle,
  formatMonthTitle,
  formatYearTitle,
  buildEventMap,
  sortEvents,
  type CalendarItem,
  type CalendarView,
} from '../../lib/calendarUtils';

const VIEW_OPTIONS = [
  { value: 'day', label: '일' },
  { value: 'week', label: '주' },
  { value: 'month', label: '월' },
  { value: 'year', label: '년' },
];

const weekendColor = (i: number) =>
  i === 0 ? '#FF3B30' : i === 6 ? '#007AFF' : 'var(--ark-color-text-secondary)';

function NavBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: 'transparent',
        color: 'var(--ark-color-text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
      }}
    >
      {children}
    </button>
  );
}

function EventChip({
  event,
  onClick,
  compact,
}: {
  event: CalendarItem;
  onClick: (e: CalendarItem) => void;
  compact?: boolean;
}) {
  const c = EVENT_COLORS[event.color] || EVENT_COLORS['#FF3B30'];
  return (
    <button
      type="button"
      title={[event.title, event.ownerName ? `· ${event.ownerName}` : '']
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: compact ? '1px 5px' : '4px 8px',
        borderRadius: 5,
        border: 'none',
        background: c.bg,
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: c.dot,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: compact ? 11 : 13,
          fontWeight: 500,
          color: c.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {event.startTime ? `${formatTime(event.startTime)} ` : ''}
        {event.title}
      </span>
    </button>
  );
}

interface ViewProps {
  currentDate: Date;
  today: Date;
  eventMap: Map<string, CalendarItem[]>;
  onDateClick: (d: Date) => void;
  onEventClick: (e: CalendarItem) => void;
}

function MonthView({ currentDate, today, eventMap, onDateClick, onEventClick }: ViewProps) {
  const days = getMonthMatrix(currentDate.getFullYear(), currentDate.getMonth());
  const month = currentDate.getMonth();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid var(--ark-color-border)',
        }}
      >
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 0',
              color: weekendColor(i),
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{ flex: 1, display: 'grid', gridTemplateRows: 'repeat(6, 1fr)', minHeight: 0 }}
      >
        {Array.from({ length: 6 }, (_, w) => (
          <div key={w} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {days.slice(w * 7, w * 7 + 7).map((date, i) => {
              const key = dateKey(date);
              const outside = date.getMonth() !== month;
              const isToday = isSameDay(date, today);
              const list = sortEvents(eventMap.get(key) || []);
              return (
                <div
                  key={i}
                  onClick={() => onDateClick(date)}
                  style={{
                    borderRight: i < 6 ? '1px solid var(--ark-color-border)' : 'none',
                    borderBottom: w < 5 ? '1px solid var(--ark-color-border)' : 'none',
                    padding: '4px 4px 0',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    opacity: outside ? 0.4 : 1,
                  }}
                >
                  <div style={{ textAlign: 'center', marginBottom: 2 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 22,
                        height: 22,
                        padding: '0 5px',
                        borderRadius: 999,
                        fontSize: 12.5,
                        fontWeight: isToday ? 700 : 500,
                        background: isToday ? 'var(--ark-color-primary-500)' : 'transparent',
                        color: isToday ? '#fff' : weekendColor(i),
                      }}
                    >
                      {date.getDate()}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {list.slice(0, 3).map((ev) => (
                      <EventChip key={ev.id} event={ev} onClick={onEventClick} compact />
                    ))}
                    {list.length > 3 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--ark-color-text-secondary)',
                          paddingLeft: 5,
                        }}
                      >
                        +{list.length - 3}개 더보기
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekView({ currentDate, today, eventMap, onDateClick, onEventClick }: ViewProps) {
  const days = getWeekDays(currentDate);
  return (
    <div
      style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 0 }}
    >
      {days.map((date, i) => {
        const key = dateKey(date);
        const isToday = isSameDay(date, today);
        const list = sortEvents(eventMap.get(key) || []);
        return (
          <div
            key={i}
            onClick={() => onDateClick(date)}
            style={{
              borderRight: i < 6 ? '1px solid var(--ark-color-border)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                textAlign: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--ark-color-border)',
              }}
            >
              <div style={{ fontSize: 12, color: weekendColor(i) }}>{WEEKDAYS[i]}</div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  marginTop: 4,
                  borderRadius: '50%',
                  fontSize: 15,
                  fontWeight: 600,
                  background: isToday ? 'var(--ark-color-primary-500)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--ark-color-text)',
                }}
              >
                {date.getDate()}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: 6,
                overflowY: 'auto',
              }}
            >
              {list.map((ev) => (
                <EventChip key={ev.id} event={ev} onClick={onEventClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({
  currentDate,
  eventMap,
  onDateClick,
  onEventClick,
}: Omit<ViewProps, 'today'>) {
  const list = sortEvents(eventMap.get(dateKey(currentDate)) || []);
  return (
    <div onClick={() => onDateClick(currentDate)} style={{ flex: 1, overflowY: 'auto', cursor: 'pointer' }}>
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {list.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--ark-color-text-secondary)',
              padding: '60px 0',
              fontSize: 14,
            }}
          >
            일정이 없습니다. 클릭해서 추가하세요.
          </div>
        ) : (
          list.map((ev) => {
            const c = EVENT_COLORS[ev.color] || EVENT_COLORS['#FF3B30'];
            return (
              <div
                key={ev.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(ev);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'var(--ark-color-bg-subtle)',
                  borderLeft: `4px solid ${c.dot}`,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{ minWidth: 78, fontSize: 13, color: 'var(--ark-color-text-secondary)' }}
                >
                  {ev.startTime ? formatTime(ev.startTime) : '종일'}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ark-color-text)' }}>
                  {ev.title}
                </span>
                {ev.ownerName && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 12,
                      color: 'var(--ark-color-text-tertiary)',
                    }}
                  >
                    {ev.ownerName}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MiniMonth({
  year,
  month,
  today,
  eventMap,
  onPick,
}: {
  year: number;
  month: number;
  today: Date;
  eventMap: Map<string, CalendarItem[]>;
  onPick: (d: Date) => void;
}) {
  const days = getMonthMatrix(year, month);
  return (
    <div
      onClick={() => onPick(new Date(year, month, 1))}
      style={{ cursor: 'pointer', padding: 8, borderRadius: 10 }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--ark-color-primary-500)',
          marginBottom: 6,
          paddingLeft: 2,
        }}
      >
        {MONTH_LABELS[month]}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, color: weekendColor(i) }}>
            {d}
          </div>
        ))}
        {days.map((date, i) => {
          const outside = date.getMonth() !== month;
          const isToday = isSameDay(date, today);
          const has = eventMap.has(dateKey(date)) && !outside;
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                textAlign: 'center',
                fontSize: 10,
                padding: '2px 0',
                opacity: outside ? 0.25 : 1,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: isToday ? 'var(--ark-color-primary-500)' : 'transparent',
                  color: isToday
                    ? '#fff'
                    : date.getDay() === 0
                      ? '#FF3B30'
                      : date.getDay() === 6
                        ? '#007AFF'
                        : 'var(--ark-color-text)',
                }}
              >
                {date.getDate()}
              </span>
              {has && !isToday && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: 'var(--ark-color-primary-500)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearView({
  currentDate,
  today,
  eventMap,
  onPickMonth,
}: {
  currentDate: Date;
  today: Date;
  eventMap: Map<string, CalendarItem[]>;
  onPickMonth: (d: Date) => void;
}) {
  const year = currentDate.getFullYear();
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          padding: 16,
        }}
      >
        {Array.from({ length: 12 }, (_, m) => (
          <MiniMonth
            key={m}
            year={year}
            month={m}
            today={today}
            eventMap={eventMap}
            onPick={onPickMonth}
          />
        ))}
      </div>
    </div>
  );
}

interface Props {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  events: CalendarItem[];
  onDateClick: (d: Date) => void;
  onEventClick: (e: CalendarItem) => void;
  onPickMonth: (d: Date) => void;
  /** 헤더 우측(오늘 버튼 앞)에 끼워넣을 추가 컨트롤 — 범위 전환·구글 연동 등 */
  toolbar?: React.ReactNode;
}

/** 일/주/월/년 뷰 캘린더 (calendar-app 레퍼런스와 동일한 UI). */
export default function CalendarGrid({
  view,
  onViewChange,
  currentDate,
  onPrev,
  onNext,
  onToday,
  events,
  onDateClick,
  onEventClick,
  onPickMonth,
  toolbar,
}: Props) {
  const today = new Date();
  const eventMap = buildEventMap(events);

  const title =
    view === 'day'
      ? formatDayTitle(currentDate)
      : view === 'week'
        ? formatWeekTitle(currentDate)
        : view === 'year'
          ? formatYearTitle(currentDate)
          : formatMonthTitle(currentDate);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        border: '1px solid var(--ark-color-border)',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--ark-color-bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--ark-color-border)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <NavBtn onClick={onPrev} label="이전">
            ‹
          </NavBtn>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--ark-color-text)',
              minWidth: 180,
              textAlign: 'center',
            }}
          >
            {title}
          </span>
          <NavBtn onClick={onNext} label="다음">
            ›
          </NavBtn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {toolbar}
          <Button variant="outline" size="sm" onClick={onToday}>
            오늘
          </Button>
          <SegmentedControl
            options={VIEW_OPTIONS}
            value={view}
            onChange={(v) => onViewChange(v as CalendarView)}
            size="sm"
          />
        </div>
      </div>

      {view === 'day' && (
        <DayView
          currentDate={currentDate}
          eventMap={eventMap}
          onDateClick={onDateClick}
          onEventClick={onEventClick}
        />
      )}
      {view === 'week' && (
        <WeekView
          currentDate={currentDate}
          today={today}
          eventMap={eventMap}
          onDateClick={onDateClick}
          onEventClick={onEventClick}
        />
      )}
      {view === 'month' && (
        <MonthView
          currentDate={currentDate}
          today={today}
          eventMap={eventMap}
          onDateClick={onDateClick}
          onEventClick={onEventClick}
        />
      )}
      {view === 'year' && (
        <YearView
          currentDate={currentDate}
          today={today}
          eventMap={eventMap}
          onPickMonth={onPickMonth}
        />
      )}
    </div>
  );
}
