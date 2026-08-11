import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X, Check, ChevronDown } from 'lucide-react';
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
  isMultiDay,
  layoutWeekSegments,
  type CalendarItem,
  type CalendarView,
} from '../../lib/calendarUtils';

const VIEW_OPTIONS = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'year', label: '연간' },
];

const BORDER = '1px solid var(--ark-color-border)';
/** 일요일 빨강 · 토요일 파랑 · 평일 기본 */
const weekendColor = (i: number) =>
  i === 0 ? '#FF3B30' : i === 6 ? '#007AFF' : 'var(--ark-color-text-secondary)';

function IconBtn({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: active ? 'var(--ark-color-bg-muted)' : 'transparent',
        color: 'var(--ark-color-text-secondary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/** 표시할 캘린더 다중 선택 — "N개 선택됨" 드롭다운. */
export interface CalendarSource {
  key: string;
  label: string;
  color: string;
}

function SourceFilter({
  sources,
  selected,
  onToggle,
}: {
  sources: CalendarSource[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          minWidth: 150,
          height: 34,
          padding: '0 12px',
          borderRadius: 8,
          border: BORDER,
          background: 'var(--ark-color-bg)',
          color: 'var(--ark-color-text)',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        <span>{selected.length}개 선택됨</span>
        <ChevronDown size={14} style={{ color: 'var(--ark-color-text-tertiary)' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 30,
            minWidth: 200,
            padding: 6,
            borderRadius: 10,
            border: BORDER,
            background: 'var(--ark-color-bg)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          {sources.map((s) => {
            const on = selected.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onToggle(s.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--ark-color-text)',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: on ? s.color : 'transparent',
                    border: on ? 'none' : `1.5px solid var(--ark-color-border-strong)`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {on && <Check size={12} color="#fff" strokeWidth={3} />}
                </span>
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 일정 한 줄 — 세로 컬러 바 + 제목, 시간이 있으면 우측에 표시. */
function EventRow({
  event,
  onClick,
  dense,
}: {
  event: CalendarItem;
  onClick: (e: CalendarItem) => void;
  dense?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const c = EVENT_COLORS[event.color] || EVENT_COLORS['#FF3B30'];
  const allDay = !event.startTime;

  return (
    <button
      type="button"
      title={event.title}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        // 종일 일정은 연한 배경 바, 시간 일정은 배경 없이 컬러 바만
        padding: dense ? '1px 5px' : '2px 6px',
        borderRadius: 4,
        border: 'none',
        background: allDay ? c.bg : hover ? 'var(--ark-color-bg-muted)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
      }}
    >
      {!allDay && (
        <span
          style={{
            width: 3,
            height: 12,
            borderRadius: 2,
            background: c.dot,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: dense ? 11.5 : 12.5,
          fontWeight: 500,
          color: allDay ? c.text : 'var(--ark-color-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {event.title}
      </span>
      {event.startTime && (
        <span
          style={{
            fontSize: dense ? 10.5 : 11.5,
            color: 'var(--ark-color-text-tertiary)',
            flexShrink: 0,
          }}
        >
          {formatTime(event.startTime)}
        </span>
      )}
    </button>
  );
}

interface ViewProps {
  currentDate: Date;
  today: Date;
  eventMap: Map<string, CalendarItem[]>;
  /** 여러 날 일정 막대 계산용 원본 목록 */
  allEvents: CalendarItem[];
  onDateClick: (d: Date) => void;
  onEventClick: (e: CalendarItem) => void;
}

/** 여러 날 일정 막대 — 이어지는 쪽 모서리를 각지게 해서 연속임을 드러낸다. */
function SpanBar({
  segment,
  onClick,
}: {
  segment: ReturnType<typeof layoutWeekSegments>[number];
  onClick: (e: CalendarItem) => void;
}) {
  const { event, continuesFromPrev, continuesToNext } = segment;
  const c = EVENT_COLORS[event.color] || EVENT_COLORS['#FF3B30'];
  return (
    <button
      type="button"
      title={event.title}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        width: '100%',
        height: SPAN_BAR_H,
        padding: '0 7px',
        border: 'none',
        background: c.bg,
        color: c.text,
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        borderTopLeftRadius: continuesFromPrev ? 0 : 4,
        borderBottomLeftRadius: continuesFromPrev ? 0 : 4,
        borderTopRightRadius: continuesToNext ? 0 : 4,
        borderBottomRightRadius: continuesToNext ? 0 : 4,
      }}
    >
      {continuesFromPrev && <span style={{ fontSize: 10, opacity: 0.7 }}>◀</span>}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11.5,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {event.title}
      </span>
      {continuesToNext && <span style={{ fontSize: 10, opacity: 0.7 }}>▶</span>}
    </button>
  );
}

const SPAN_BAR_H = 17;
const SPAN_LANE_H = SPAN_BAR_H + 2;
/** 날짜 숫자가 차지하는 높이 */
const DATE_ROW_H = 24;

function MonthView({ currentDate, today, eventMap, allEvents, onDateClick, onEventClick }: ViewProps) {
  const days = getMonthMatrix(currentDate.getFullYear(), currentDate.getMonth());
  const month = currentDate.getMonth();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 요일 헤더 — 우측 정렬 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            style={{
              textAlign: 'right',
              fontSize: 12,
              fontWeight: 500,
              padding: '7px 10px',
              color: weekendColor(i),
              borderRight: i < 6 ? BORDER : 'none',
              borderBottom: BORDER,
              background: 'var(--ark-color-bg-subtle)',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateRows: 'repeat(6, 1fr)', minHeight: 0 }}>
        {Array.from({ length: 6 }, (_, w) => {
          const weekDays = days.slice(w * 7, w * 7 + 7);
          // 여러 날 일정은 칸이 아니라 주 전체를 가로지르는 막대로 그린다.
          const segments = layoutWeekSegments(weekDays, allEvents);
          const laneCount = segments.reduce((m, s) => Math.max(m, s.lane + 1), 0);
          const spanAreaH = laneCount * SPAN_LANE_H;
          return (
          <div
            key={w}
            style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
          >
            {weekDays.map((date, i) => {
              const key = dateKey(date);
              const outside = date.getMonth() !== month;
              const isToday = isSameDay(date, today);
              // 막대로 그린 여러 날 일정은 칸 목록에서 제외(중복 방지)
              const list = sortEvents((eventMap.get(key) || []).filter((e) => !isMultiDay(e)));
              return (
                <div
                  key={i}
                  onClick={() => onDateClick(date)}
                  style={{
                    borderRight: i < 6 ? BORDER : 'none',
                    borderBottom: w < 5 ? BORDER : 'none',
                    // 다른 달 날짜는 배경을 눌러 구분
                    background: outside ? 'var(--ark-color-bg-subtle)' : 'var(--ark-color-bg)',
                    padding: '4px 5px 0',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    minHeight: 0,
                  }}
                >
                  {/* 날짜 — 우측 정렬, 오늘만 원형 강조 */}
                  <div style={{ textAlign: 'right', paddingRight: 2, marginBottom: 1 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 20,
                        height: 20,
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: isToday ? 700 : 500,
                        background: isToday ? 'var(--ark-color-primary-500)' : 'transparent',
                        color: isToday
                          ? '#fff'
                          : outside
                            ? 'var(--ark-color-text-disabled)'
                            : weekendColor(i),
                      }}
                    >
                      {date.getDate()}
                    </span>
                  </div>

                  {/* 여러 날 막대가 차지하는 만큼 자리를 비워 겹치지 않게 한다 */}
                  {spanAreaH > 0 && <div style={{ height: spanAreaH, flexShrink: 0 }} />}

                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}
                  >
                    {list.slice(0, 4).map((ev) => (
                      <EventRow key={ev.id} event={ev} onClick={onEventClick} dense />
                    ))}
                    {list.length > 4 && (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--ark-color-text-secondary)',
                          paddingLeft: 6,
                        }}
                      >
                        +{list.length - 4}개 더보기
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 여러 날 일정 막대 — 칸 위에 겹쳐 그린다 */}
            {segments.map((seg) => (
              <div
                key={seg.event.id}
                style={{
                  position: 'absolute',
                  top: DATE_ROW_H + seg.lane * SPAN_LANE_H,
                  left: `calc(${(seg.startCol / 7) * 100}% + 4px)`,
                  width: `calc(${(seg.span / 7) * 100}% - 8px)`,
                  height: SPAN_BAR_H,
                }}
              >
                <SpanBar segment={seg} onClick={onEventClick} />
              </div>
            ))}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ currentDate, today, eventMap, onDateClick, onEventClick }: Omit<ViewProps, 'allEvents'>) {
  const days = getWeekDays(currentDate);
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 0 }}>
      {days.map((date, i) => {
        const key = dateKey(date);
        const isToday = isSameDay(date, today);
        const list = sortEvents(eventMap.get(key) || []);
        return (
          <div
            key={i}
            onClick={() => onDateClick(date)}
            style={{
              borderRight: i < 6 ? BORDER : 'none',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                textAlign: 'right',
                padding: '8px 10px',
                borderBottom: BORDER,
                background: 'var(--ark-color-bg-subtle)',
              }}
            >
              <div style={{ fontSize: 12, color: weekendColor(i) }}>{WEEKDAYS[i]}</div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 26,
                  height: 26,
                  marginTop: 2,
                  borderRadius: 999,
                  fontSize: 15,
                  fontWeight: 600,
                  background: isToday ? 'var(--ark-color-primary-500)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--ark-color-text)',
                }}
              >
                {date.getDate()}
              </span>
            </div>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: 6,
                overflowY: 'auto',
              }}
            >
              {list.map((ev) => (
                <EventRow key={ev.id} event={ev} onClick={onEventClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ currentDate, eventMap, onDateClick, onEventClick }: Omit<ViewProps, 'today' | 'allEvents'>) {
  const list = sortEvents(eventMap.get(dateKey(currentDate)) || []);
  return (
    <div
      onClick={() => onDateClick(currentDate)}
      style={{ flex: 1, overflowY: 'auto', cursor: 'pointer' }}
    >
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
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
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'var(--ark-color-bg-subtle)',
                  borderLeft: `3px solid ${c.dot}`,
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
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 16 }}
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
  /** 표시할 캘린더 목록 + 선택 상태 */
  sources: CalendarSource[];
  selectedSources: string[];
  onToggleSource: (key: string) => void;
  /** 제목 검색어 */
  search: string;
  onSearchChange: (v: string) => void;
}

/** 일간/주간/월간/연간 캘린더. */
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
  sources,
  selectedSources,
  onToggleSource,
  search,
  onSearchChange,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
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
        border: BORDER,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--ark-color-bg)',
      }}
    >
      {/* 상단 툴바 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: BORDER,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--ark-color-text)',
            marginRight: 4,
          }}
        >
          {title}
        </h2>

        <IconBtn onClick={onPrev} label="이전">
          <ChevronLeft size={18} />
        </IconBtn>
        <IconBtn onClick={onNext} label="다음">
          <ChevronRight size={18} />
        </IconBtn>

        <Button variant="outline" size="sm" onClick={onToday}>
          오늘
        </Button>

        {searchOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="일정 검색"
              style={{
                height: 32,
                width: 180,
                padding: '0 10px',
                borderRadius: 8,
                border: BORDER,
                background: 'var(--ark-color-bg)',
                color: 'var(--ark-color-text)',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <IconBtn
              label="검색 닫기"
              onClick={() => {
                onSearchChange('');
                setSearchOpen(false);
              }}
            >
              <X size={16} />
            </IconBtn>
          </div>
        ) : (
          <IconBtn label="검색" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
          </IconBtn>
        )}

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <SourceFilter
            sources={sources}
            selected={selectedSources}
            onToggle={onToggleSource}
          />
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
          allEvents={events}
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
