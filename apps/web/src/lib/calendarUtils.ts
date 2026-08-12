// 캘린더 날짜/포맷 유틸 — calendar-app 레퍼런스 구현과 동일한 규칙(일요일 시작, 6주 매트릭스).

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_NAMES = WEEKDAYS;
export const MONTH_LABELS = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
];

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatTime(time?: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? '오전' : '오후';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${period} ${hour}시`;
  return `${period} ${hour}:${String(m).padStart(2, '0')}`;
}

/** 일요일 시작 6x7 = 42칸 그리드(앞뒤 달 날짜 포함). */
export function getMonthMatrix(year: number, month: number): Date[] {
  const startOffset = new Date(year, month, 1).getDay();
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** 해당 날짜가 속한 주(일요일 시작) 7일. */
export function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

export function addYears(date: Date, n: number): Date {
  return new Date(date.getFullYear() + n, date.getMonth(), 1);
}

// 제목 표기는 "8월 2026"처럼 월(또는 일)을 앞에, 연도를 뒤에 둔다.

export function formatDayTitle(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getFullYear()} ${DAY_NAMES[date.getDay()]}요일`;
}

export function formatSelectedDate(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${DAY_NAMES[date.getDay()]}요일`;
}

export function formatWeekTitle(date: Date): string {
  const w = getWeekDays(date);
  const a = w[0];
  const b = w[6];
  if (a.getMonth() === b.getMonth()) {
    return `${a.getMonth() + 1}월 ${a.getDate()} – ${b.getDate()}일 ${a.getFullYear()}`;
  }
  return `${a.getMonth() + 1}월 ${a.getDate()}일 – ${b.getMonth() + 1}월 ${b.getDate()}일 ${b.getFullYear()}`;
}

export function formatMonthTitle(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getFullYear()}`;
}

export function formatYearTitle(date: Date): string {
  return `${date.getFullYear()}`;
}

/** 조회 구간 — 뷰에 따라 필요한 앞뒤 여유까지 포함해 서버에 한 번만 요청. */
export function rangeFor(view: CalendarView, date: Date): { from: string; to: string } {
  if (view === 'day') return { from: dateKey(date), to: dateKey(date) };
  if (view === 'week') {
    const w = getWeekDays(date);
    return { from: dateKey(w[0]), to: dateKey(w[6]) };
  }
  if (view === 'year') {
    return { from: `${date.getFullYear()}-01-01`, to: `${date.getFullYear()}-12-31` };
  }
  const grid = getMonthMatrix(date.getFullYear(), date.getMonth());
  return { from: dateKey(grid[0]), to: dateKey(grid[41]) };
}

export type CalendarView = 'day' | 'week' | 'month' | 'year';

export const COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55'];

export const EVENT_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  '#FF3B30': { dot: '#FF3B30', bg: 'rgba(255, 59, 48, 0.15)', text: '#D42020' },
  '#007AFF': { dot: '#007AFF', bg: 'rgba(0, 122, 255, 0.15)', text: '#0062CC' },
  '#34C759': { dot: '#34C759', bg: 'rgba(52, 199, 89, 0.15)', text: '#248A3D' },
  '#FF9500': { dot: '#FF9500', bg: 'rgba(255, 149, 0, 0.15)', text: '#C77800' },
  '#AF52DE': { dot: '#AF52DE', bg: 'rgba(175, 82, 222, 0.15)', text: '#8944AB' },
  '#FF2D55': { dot: '#FF2D55', bg: 'rgba(255, 45, 85, 0.15)', text: '#D41F4B' },
};

/** 서버가 내려주는 캘린더 항목(자체 일정 + 작업오더 통합). */
export interface CalendarItem {
  id: string;
  source: 'LOCAL' | 'GOOGLE' | 'WORK_ORDER';
  title: string;
  /** 시작 날짜 YYYY-MM-DD */
  date: string;
  /** 마지막 날(포함). 하루짜리면 date와 같다 */
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  color: string;
  location: string | null;
  description: string | null;
  visibility: 'PRIVATE' | 'ORG';
  ownerUserId: string | null;
  ownerName: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  editable: boolean;
  refId: string | null;
}

/** 여러 날에 걸친 일정인지 */
export function isMultiDay(e: CalendarItem): boolean {
  return Boolean(e.endDate) && e.endDate !== e.date;
}

/** 한 주 안에서 일정이 차지하는 자리(칸 시작 위치·길이·잘림 여부). */
export interface WeekSegment {
  event: CalendarItem;
  /** 0=일요일 … 6=토요일 */
  startCol: number;
  /** 차지하는 칸 수 */
  span: number;
  /** 이전 주에서 이어져 온 일정인지 */
  continuesFromPrev: boolean;
  /** 다음 주로 이어지는 일정인지 */
  continuesToNext: boolean;
  /** 겹치지 않게 쌓은 세로 줄 번호(0부터) */
  lane: number;
}

/**
 * 한 주(7일)에 걸쳐 있는 여러 날 일정을 겹치지 않는 줄(lane)에 배치한다.
 * 구글/애플 캘린더처럼 기간 일정이 가로 막대로 이어져 보이게 하기 위한 계산.
 */
export function layoutWeekSegments(weekDays: Date[], events: CalendarItem[]): WeekSegment[] {
  const weekStart = dateKey(weekDays[0]);
  const weekEnd = dateKey(weekDays[6]);

  const spanning = events
    .filter(isMultiDay)
    .filter((e) => e.date <= weekEnd && e.endDate >= weekStart)
    // 긴 일정을 위쪽 줄에 두어 시각적으로 안정되게 한다
    .sort((a, b) =>
      a.date === b.date ? b.endDate.localeCompare(a.endDate) : a.date.localeCompare(b.date),
    );

  const lanes: string[][] = []; // lane별로 이미 사용한 날짜 키
  const segments: WeekSegment[] = [];

  for (const e of spanning) {
    const startIdx = Math.max(
      0,
      weekDays.findIndex((d) => dateKey(d) === e.date),
    );
    const endIdxRaw = weekDays.findIndex((d) => dateKey(d) === e.endDate);
    const endIdx = endIdxRaw === -1 ? 6 : endIdxRaw;
    const startCol = e.date < weekStart ? 0 : startIdx;
    const span = endIdx - startCol + 1;
    if (span <= 0) continue;

    const usedDays = weekDays.slice(startCol, startCol + span).map(dateKey);
    let lane = lanes.findIndex((used) => usedDays.every((d) => !used.includes(d)));
    if (lane === -1) {
      lanes.push([]);
      lane = lanes.length - 1;
    }
    lanes[lane].push(...usedDays);

    segments.push({
      event: e,
      startCol,
      span,
      continuesFromPrev: e.date < weekStart,
      continuesToNext: e.endDate > weekEnd,
      lane,
    });
  }
  return segments;
}

/**
 * 날짜별 일정 맵. 여러 날 일정은 걸쳐 있는 모든 날짜에 들어간다
 * (일/주/연 뷰에서 중간 날짜에도 보여야 하므로).
 */
export function buildEventMap(events: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  const push = (key: string, e: CalendarItem) => {
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  };

  for (const e of events) {
    if (!isMultiDay(e)) {
      push(e.date, e);
      continue;
    }
    const [sy, sm, sd] = e.date.split('-').map(Number);
    const cursor = new Date(sy, sm - 1, sd);
    // 무한 루프 방지를 위해 최대 366일까지만 펼친다
    for (let i = 0; i < 366; i++) {
      const key = dateKey(cursor);
      if (key > e.endDate) break;
      push(key, e);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return map;
}

/** 종일 일정 먼저, 그 다음 시간순. */
export function sortEvents(list: CalendarItem[]): CalendarItem[] {
  return [...list].sort((a, b) => {
    if (!a.startTime && b.startTime) return -1;
    if (a.startTime && !b.startTime) return 1;
    if (!a.startTime && !b.startTime) return 0;
    return (a.startTime as string).localeCompare(b.startTime as string);
  });
}
