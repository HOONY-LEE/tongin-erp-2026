// ── 인사: 전자결재 · 휴가 · 근태 ──
// 화면·API가 같이 쓰는 코드표와 순수 계산 함수.

/** 결재 문서 종류 */
export const APPROVAL_DOC_TYPES = ['LEAVE', 'ATTENDANCE_FIX', 'GENERAL'] as const;
export type ApprovalDocType = (typeof APPROVAL_DOC_TYPES)[number];
export const APPROVAL_DOC_TYPE_LABEL: Record<ApprovalDocType, string> = {
  LEAVE: '휴가 신청',
  ATTENDANCE_FIX: '근태 정정',
  GENERAL: '일반 품의',
};

/** 결재 문서 상태 */
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: '진행 중',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '회수',
};

/** 결재 단계 상태 — CC(참조)는 결재하지 않아 WAITING 그대로 둔다 */
export const APPROVAL_STEP_STATUS_LABEL: Record<string, string> = {
  WAITING: '대기',
  PENDING: '결재 차례',
  APPROVED: '승인',
  REJECTED: '반려',
  SKIPPED: '건너뜀',
};

/** 결재선 단계: 결재(APPROVER) 또는 참조(CC) */
export type ApprovalStepKind = 'APPROVER' | 'CC';
/**
 * 결재자를 정하는 방법
 * - DEPT_HEAD: 신청자 소속 조직의 장(재직자 중 직책이 가장 높은 사람, 본인이면 상위 조직의 장)
 * - ORG_HEAD: 지정한 조직의 장(그 조직에 사람이 없으면 상위로 올라간다)
 * - EMPLOYEE: 특정 직원
 */
export type ApprovalResolver = 'DEPT_HEAD' | 'ORG_HEAD' | 'EMPLOYEE';
export const APPROVAL_RESOLVER_LABEL: Record<ApprovalResolver, string> = {
  DEPT_HEAD: '신청자 부서장',
  ORG_HEAD: '지정 조직의 장',
  EMPLOYEE: '특정 직원',
};

/** 기본 결재선(템플릿)의 한 단계 — 사람으로 풀기 전의 규칙 */
export interface ApprovalLineRule {
  kind: ApprovalStepKind;
  resolver: ApprovalResolver;
  orgUnitId?: string | null;
  employeeId?: string | null;
}

/** 상신할 때 실제 사람으로 정해진 결재선 한 단계(신청 화면에서 고칠 수 있다) */
export interface ApprovalLineEntry {
  kind: ApprovalStepKind;
  employeeId: string;
}

// ── 휴가 ──

/**
 * 법정 공휴일(관공서의 공휴일에 관한 규정) — 달력 빨간 날, 휴가 일수·근태 판정에서 뺀다.
 * 설·추석은 일요일과 겹칠 때만, 국경일·어린이날·부처님오신날·성탄절은 토·일과 겹칠 때 대체공휴일.
 * (2026 추석 9/24~26은 일요일과 안 겹쳐 대체공휴일 없음) — 해가 바뀌면 다음 해를 덧붙인다.
 */
export const KR_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일',
  '2026-06-03': '지방선거',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  '2027-01-01': '신정',
};

/** 'YYYY-MM-DD' ↔ UTC 자정 Date — 시간대에 흔들리지 않게 날짜 계산은 UTC로만 한다 */
const ymdToUtc = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
const utcToYmd = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysYmd = (ymd: string, n: number) => {
  const d = ymdToUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToYmd(d);
};
/** n달 뒤 같은 날(그 달에 없는 날이면 그 달 마지막 날 — 1/31 + 1달 = 2/28) */
export const addMonthsYmd = (ymd: string, n: number) => {
  const d = ymdToUtc(ymd);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return utcToYmd(t);
};

/** 근무일인가 — 주말·공휴일이 아니면 */
export const isWorkday = (ymd: string) => {
  const dow = ymdToUtc(ymd).getUTCDay();
  return dow !== 0 && dow !== 6 && !KR_HOLIDAYS[ymd.slice(0, 10)];
};

/** 시작~끝(포함) 사이 근무일 수 */
export function countWorkdays(start: string, end: string): number {
  let n = 0;
  for (let d = start.slice(0, 10); d <= end.slice(0, 10); d = addDaysYmd(d, 1))
    if (isWorkday(d)) n++;
  return n;
}

export interface LeaveEntitlement {
  /** 이 연차가 속한 기간(입사기념일 기준 1년) */
  periodStart: string;
  periodEnd: string;
  /** 이 기간에 생긴 연차 일수 */
  days: number;
  /** 만 근속 연수 */
  years: number;
  /** 입사 1년 미만(월 단위로 생기는 중) */
  firstYear: boolean;
}

/**
 * 입사일 기준 연차(근로기준법 60조) — asOf 날짜가 속한 기간의 발생 일수.
 * - 1년 미만: 1개월 개근마다 1일, 최대 11일(입사 후 다달이 생긴다)
 * - 1년 이상: 15일, 3년차부터 2년마다 1일 더해 최대 25일
 * 개근 여부는 따지지 않는다(결근 차감은 관리자가 연차 조정으로).
 */
export function leaveEntitlement(hireDate: string, asOf: string): LeaveEntitlement {
  const hire = hireDate.slice(0, 10);
  const today = asOf.slice(0, 10);
  let years = 0;
  while (addMonthsYmd(hire, (years + 1) * 12) <= today) years++;
  if (years < 1) {
    let months = 0;
    while (months < 11 && addMonthsYmd(hire, months + 1) <= today) months++;
    return {
      periodStart: hire,
      periodEnd: addDaysYmd(addMonthsYmd(hire, 12), -1),
      days: months,
      years: 0,
      firstYear: true,
    };
  }
  return {
    periodStart: addMonthsYmd(hire, years * 12),
    periodEnd: addDaysYmd(addMonthsYmd(hire, (years + 1) * 12), -1),
    days: Math.min(25, 15 + Math.floor((years - 1) / 2)),
    years,
    firstYear: false,
  };
}

/** 휴가 신청 상태 */
export const LEAVE_STATUS_LABEL: Record<string, string> = {
  PENDING: '결재 중',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
};

// ── 근태 ──

/** 근무시간 설정(공통코드 HR_SETTING) — 화면·판정이 같이 쓴다 */
export interface WorkSettings {
  /** 출근 기준 'HH:MM' */
  workStart: string;
  /** 퇴근 기준 'HH:MM' */
  workEnd: string;
  /** 반차 기준 'HH:MM' — 오전 반차면 이 시각까지 출근, 오후 반차면 이 시각 이후 퇴근 */
  halfSplit: string;
  /** 지각 유예(분) — 출근 기준 + 유예까지는 정상 */
  lateGraceMin: number;
  /**
   * 근태 집계 시작일 'YYYY-MM-DD' — 이보다 앞선 날은 '기록 전'(ERP로 근태를 쓰기 전이라 결근으로 세지 않는다).
   * 비우면 시스템의 첫 근태 기록 날짜
   */
  trackFrom: string;
}
export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  workStart: '09:00',
  workEnd: '18:00',
  halfSplit: '14:00',
  lateGraceMin: 0,
  trackFrom: '',
};

export const ATTENDANCE_STATUSES = [
  'NORMAL',
  'LATE',
  'EARLY',
  'LATE_EARLY',
  'ABSENT',
  'LEAVE',
  'HOLIDAY',
  'WORKING',
  'NO_OUT',
  'BEFORE',
  'UPCOMING',
  'NOT_TRACKED',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  NORMAL: '정상',
  LATE: '지각',
  EARLY: '조퇴',
  LATE_EARLY: '지각·조퇴',
  ABSENT: '결근',
  LEAVE: '휴가',
  HOLIDAY: '휴일',
  WORKING: '근무 중',
  NO_OUT: '퇴근 기록 없음',
  BEFORE: '출근 전',
  UPCOMING: '-',
  NOT_TRACKED: '기록 전',
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * 하루 근태 판정 — 기록(출근·퇴근 'HH:MM', 한국 시각)·휴가·근무시간 설정으로 상태를 정한다.
 * leave: 그날 승인된 휴가 — FULL(종일) | AM(오전 반차) | PM(오후 반차) | null
 * today/now: 오늘 날짜·지금 'HH:MM'(한국 시각) — 오늘은 아직 끝나지 않아 결근·미퇴근을 바로 매기지 않는다
 */
export function judgeAttendance(input: {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  leave: 'FULL' | 'AM' | 'PM' | null;
  today: string;
  now: string;
  settings?: WorkSettings;
}): AttendanceStatus {
  const s = input.settings ?? DEFAULT_WORK_SETTINGS;
  const { date, clockIn, clockOut, leave, today, now } = input;
  if (date > today) return leave === 'FULL' ? 'LEAVE' : 'UPCOMING';
  if (leave === 'FULL') return 'LEAVE';
  if (!isWorkday(date)) return 'HOLIDAY';
  // ERP로 근태를 쓰기 전 — 기록이 없어도 결근으로 세지 않는다
  if (s.trackFrom && date < s.trackFrom && !clockIn && !clockOut) return 'NOT_TRACKED';
  const start = leave === 'AM' ? s.halfSplit : s.workStart;
  const end = leave === 'PM' ? s.halfSplit : s.workEnd;
  if (!clockIn) {
    if (date === today && toMin(now) < toMin(start) + s.lateGraceMin) return 'BEFORE';
    return 'ABSENT';
  }
  const late = toMin(clockIn) > toMin(start) + s.lateGraceMin;
  if (!clockOut) {
    if (date === today) return late ? 'LATE' : 'WORKING';
    return late ? 'LATE' : 'NO_OUT';
  }
  const early = toMin(clockOut) < toMin(end);
  if (late && early) return 'LATE_EARLY';
  if (late) return 'LATE';
  if (early) return 'EARLY';
  return 'NORMAL';
}

// ── 인사기록 ──

export const EMPLOYMENT_TYPES = ['REGULAR', 'CONTRACT', 'PART_TIME', 'INTERN'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  REGULAR: '정규직',
  CONTRACT: '계약직',
  PART_TIME: '파트타임',
  INTERN: '인턴',
};

export const CHECKLIST_KINDS = ['ONBOARD', 'OFFBOARD'] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];
export const CHECKLIST_KIND_LABEL: Record<ChecklistKind, string> = {
  ONBOARD: '입사',
  OFFBOARD: '퇴사',
};

export const EMPLOYEE_HISTORY_LABEL: Record<string, string> = {
  JOIN: '입사',
  TRANSFER: '소속 이동',
  POSITION: '직책 변경',
  RESIGN: '퇴사',
  REHIRE: '재입사',
};
