import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import {
  DEFAULT_WORK_SETTINGS,
  KR_HOLIDAYS,
  PERMISSION_WILDCARD,
  addDaysYmd,
  judgeAttendance,
  type ApprovalLineEntry,
  type AttendanceStatus,
  type AuthPrincipal,
  type WorkSettings,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { ApprovalService } from '../approval/approval.service';

// ── 한국 시각 도우미(서버가 UTC여도 한국 날짜·시각으로 기록·판정한다) ──
const KST = 9 * 3600_000;
const kstNow = () => new Date(Date.now() + KST).toISOString();
const todayKst = () => kstNow().slice(0, 10);
const nowHHMM = () => kstNow().slice(11, 16);
const toHHMM = (d: Date | null) =>
  d ? new Date(d.getTime() + KST).toISOString().slice(11, 16) : null;
const atKst = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+09:00`);
const dateOnly = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** 'YYYY-MM'의 마지막 날 — 다음 달 1일의 하루 전 */
const monthLast = (month: string) => {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return addDaysYmd(next, -1);
};

const SETTING_GROUP = 'HR_SETTING';
const SETTING_CODES: Record<keyof WorkSettings, string> = {
  workStart: 'WORK_START',
  workEnd: 'WORK_END',
  halfSplit: 'HALF_SPLIT',
  lateGraceMin: 'LATE_GRACE_MIN',
  trackFrom: 'TRACK_FROM',
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type LeaveKind = 'FULL' | 'AM' | 'PM';

/** 엑셀 업로드 미리보기 한 줄 */
export interface ImportRow {
  rowNo: number;
  empNo: string | null;
  name: string | null;
  workDate: string | null;
  clockIn: string | null;
  clockOut: string | null;
  employeeId: string | null;
  employeeName: string | null;
  /** 들어갈 수 없는 이유(있으면 확정에서 빠진다) */
  problem: string | null;
}

@Injectable()
export class AttendanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly approvals: ApprovalService,
  ) {}

  /** 근태 정정 결재가 승인되면 기록을 고친다(같은 트랜잭션) */
  onModuleInit() {
    this.approvals.registerHandler('ATTENDANCE_FIX', {
      onApproved: async (tx, doc) => {
        const p = doc.payload as {
          workDate?: string;
          clockIn?: string | null;
          clockOut?: string | null;
          reason?: string | null;
        } | null;
        if (!p?.workDate) return;
        await this.upsert(
          tx,
          doc.requesterEmpId,
          p.workDate,
          p.clockIn ?? null,
          p.clockOut ?? null,
          'FIX',
          `정정 승인: ${p.reason ?? ''}`.trim(),
        );
      },
    });
  }

  // ── 설정 ──

  async settings(): Promise<WorkSettings> {
    const rows = await this.prisma.commonCode.findMany({ where: { codeGroup: SETTING_GROUP } });
    const get = (k: keyof WorkSettings) => rows.find((r) => r.code === SETTING_CODES[k])?.name;
    let trackFrom = get('trackFrom') ?? '';
    if (!trackFrom) {
      // 따로 정하지 않았으면 시스템의 첫 근태 기록 날짜부터 센다
      const first = await this.prisma.attendanceRecord.findFirst({
        orderBy: { workDate: 'asc' },
        select: { workDate: true },
      });
      trackFrom = first ? ymd(first.workDate) : todayKst();
    }
    return {
      workStart: get('workStart') ?? DEFAULT_WORK_SETTINGS.workStart,
      workEnd: get('workEnd') ?? DEFAULT_WORK_SETTINGS.workEnd,
      halfSplit: get('halfSplit') ?? DEFAULT_WORK_SETTINGS.halfSplit,
      lateGraceMin: Number(get('lateGraceMin') ?? DEFAULT_WORK_SETTINGS.lateGraceMin) || 0,
      trackFrom,
    };
  }

  async saveSettings(input: WorkSettings) {
    for (const k of ['workStart', 'workEnd', 'halfSplit'] as const)
      if (!HHMM.test(input[k]))
        throw new BadRequestException(`시각은 HH:MM 형식이어야 합니다(${input[k]}).`);
    if (input.workStart >= input.workEnd)
      throw new BadRequestException('퇴근 기준이 출근 기준보다 늦어야 합니다.');
    if (input.halfSplit <= input.workStart || input.halfSplit >= input.workEnd)
      throw new BadRequestException('반차 기준은 출근과 퇴근 기준 사이여야 합니다.');
    if (input.trackFrom && !/^\d{4}-\d{2}-\d{2}$/.test(input.trackFrom))
      throw new BadRequestException('집계 시작일은 YYYY-MM-DD 형식입니다.');
    const labels: Record<keyof WorkSettings, string> = {
      workStart: input.workStart,
      workEnd: input.workEnd,
      halfSplit: input.halfSplit,
      lateGraceMin: String(Math.max(0, Math.min(120, Math.round(input.lateGraceMin)))),
      trackFrom: input.trackFrom ?? '',
    };
    for (const k of Object.keys(SETTING_CODES) as (keyof WorkSettings)[]) {
      // 집계 시작일을 비우면 행을 지워 '첫 기록 날짜' 기본값으로 돌아간다
      if (k === 'trackFrom' && !labels.trackFrom) {
        await this.prisma.commonCode.deleteMany({
          where: { codeGroup: SETTING_GROUP, code: SETTING_CODES.trackFrom },
        });
        continue;
      }
      await this.prisma.commonCode.upsert({
        where: { codeGroup_code: { codeGroup: SETTING_GROUP, code: SETTING_CODES[k] } },
        update: { name: labels[k] },
        create: { codeGroup: SETTING_GROUP, code: SETTING_CODES[k], name: labels[k] },
      });
    }
    return this.settings();
  }

  // ── 권한·범위 ──

  private requireEmployee(p: AuthPrincipal) {
    if (!p.employeeId)
      throw new ForbiddenException('직원과 연결된 계정만 출퇴근을 기록할 수 있습니다.');
    return p.employeeId;
  }

  private has(p: AuthPrincipal, code: string) {
    return p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes(code);
  }

  private async assertCanSee(p: AuthPrincipal, employeeId: string) {
    if (p.employeeId === employeeId) return;
    if (!this.has(p, 'ATTENDANCE.READ'))
      throw new ForbiddenException('이 직원의 근태를 볼 권한이 없습니다.');
    const ids = await this.scope.orgScopeIds(p);
    if (ids === null) return;
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { orgUnitId: true },
    });
    if (!emp || !ids.includes(emp.orgUnitId))
      throw new ForbiddenException('이 직원의 근태를 볼 권한이 없습니다.');
  }

  /** 범위 안 재직 직원(hqOnly면 본사만) */
  private async scopedEmployees(p: AuthPrincipal, hqOnly: boolean) {
    const ids = await this.scope.orgScopeIds(p);
    return this.prisma.employee.findMany({
      where: {
        isActive: true,
        ...(ids === null ? {} : { orgUnitId: { in: ids } }),
        ...(hqOnly ? { orgUnit: { type: { not: 'BRANCH' } } } : {}),
      },
      select: {
        id: true,
        name: true,
        empNo: true,
        position: { select: { name: true, sortOrder: true } },
        orgUnit: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── 휴가(판정용) ──

  /** 기간 안 승인된 휴가 → `${empId}|${date}` → 종일/오전/오후 */
  private async leaveMap(employeeIds: string[], from: string, to: string) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        startDate: { lte: dateOnly(to) },
        endDate: { gte: dateOnly(from) },
      },
      include: { leaveType: { select: { code: true, unitDays: true, name: true } } },
    });
    const map = new Map<string, { kind: LeaveKind; name: string }>();
    for (const r of rows) {
      const half = Number(r.leaveType.unitDays) < 1;
      const kind: LeaveKind = !half ? 'FULL' : r.leaveType.code.includes('PM') ? 'PM' : 'AM';
      for (let d = ymd(r.startDate); d <= ymd(r.endDate); d = addDaysYmd(d, 1)) {
        if (d < from || d > to) continue;
        map.set(`${r.employeeId}|${d}`, { kind, name: r.leaveType.name });
      }
    }
    return map;
  }

  // ── 출퇴근 버튼 ──

  /** 출근은 그날 첫 기록을 지키고, 퇴근은 마지막 누른 시각으로 덮는다 */
  async clock(p: AuthPrincipal, type: 'IN' | 'OUT') {
    const empId = this.requireEmployee(p);
    const date = todayKst();
    const now = new Date();
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: empId, workDate: dateOnly(date) } },
    });
    if (type === 'OUT' && !existing?.clockIn)
      throw new BadRequestException('오늘 출근 기록이 없습니다. 먼저 출근을 누르세요.');
    if (type === 'IN' && existing?.clockIn) return this.today(p);
    await this.prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: empId, workDate: dateOnly(date) } },
      update: type === 'IN' ? { clockIn: now } : { clockOut: now },
      create: { employeeId: empId, workDate: dateOnly(date), clockIn: now, source: 'WEB' },
    });
    return this.today(p);
  }

  /** 내 오늘 — 머리글 출퇴근 버튼이 읽는다 */
  async today(p: AuthPrincipal) {
    const empId = this.requireEmployee(p);
    const date = todayKst();
    const [rec, settings, leaves] = await Promise.all([
      this.prisma.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId: empId, workDate: dateOnly(date) } },
      }),
      this.settings(),
      this.leaveMap([empId], date, date),
    ]);
    const clockIn = toHHMM(rec?.clockIn ?? null);
    const clockOut = toHHMM(rec?.clockOut ?? null);
    const leave = leaves.get(`${empId}|${date}`) ?? null;
    return {
      date,
      clockIn,
      clockOut,
      leave: leave?.name ?? null,
      status: judgeAttendance({
        date,
        clockIn,
        clockOut,
        leave: leave?.kind ?? null,
        today: date,
        now: nowHHMM(),
        settings,
      }),
      settings,
    };
  }

  // ── 조회 ──

  /** 한 직원의 한 달 — 날짜마다 출퇴근·상태 */
  async month(p: AuthPrincipal, employeeId: string, month: string) {
    await this.assertCanSee(p, employeeId);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('month는 YYYY-MM 형식입니다.');
    const from = `${month}-01`;
    const last = monthLast(month);
    const [records, settings, leaves] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { employeeId, workDate: { gte: dateOnly(from), lte: dateOnly(last) } },
      }),
      this.settings(),
      this.leaveMap([employeeId], from, last),
    ]);
    const byDate = new Map(records.map((r) => [ymd(r.workDate), r]));
    const today = todayKst();
    const now = nowHHMM();
    const days = [];
    for (let d = from; d <= last; d = addDaysYmd(d, 1)) {
      const r = byDate.get(d);
      const leave = leaves.get(`${employeeId}|${d}`) ?? null;
      const clockIn = toHHMM(r?.clockIn ?? null);
      const clockOut = toHHMM(r?.clockOut ?? null);
      days.push({
        date: d,
        holiday: KR_HOLIDAYS[d] ?? null,
        clockIn,
        clockOut,
        source: r?.source ?? null,
        note: r?.note ?? null,
        leave: leave?.name ?? null,
        status: judgeAttendance({
          date: d,
          clockIn,
          clockOut,
          leave: leave?.kind ?? null,
          today,
          now,
          settings,
        }),
      });
    }
    return { employeeId, month, settings, days };
  }

  myMonth(p: AuthPrincipal, month: string) {
    return this.month(p, this.requireEmployee(p), month);
  }

  /** 하루 현황 — 범위 안 직원마다 출퇴근·상태(ATTENDANCE.READ) */
  async daily(p: AuthPrincipal, date: string, hqOnly: boolean) {
    const emps = await this.scopedEmployees(p, hqOnly);
    const ids = emps.map((e) => e.id);
    const [records, settings, leaves] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { employeeId: { in: ids }, workDate: dateOnly(date) },
      }),
      this.settings(),
      this.leaveMap(ids, date, date),
    ]);
    const byEmp = new Map(records.map((r) => [r.employeeId, r]));
    const today = todayKst();
    const now = nowHHMM();
    return emps.map((e) => {
      const r = byEmp.get(e.id);
      const leave = leaves.get(`${e.id}|${date}`) ?? null;
      const clockIn = toHHMM(r?.clockIn ?? null);
      const clockOut = toHHMM(r?.clockOut ?? null);
      return {
        employeeId: e.id,
        name: e.name,
        empNo: e.empNo,
        positionName: e.position?.name ?? null,
        orgUnitName: e.orgUnit?.name ?? null,
        clockIn,
        clockOut,
        source: r?.source ?? null,
        leave: leave?.name ?? null,
        status: judgeAttendance({
          date,
          clockIn,
          clockOut,
          leave: leave?.kind ?? null,
          today,
          now,
          settings,
        }),
      };
    });
  }

  /** 한 달 집계 — 직원마다 상태별 일수(ATTENDANCE.READ) */
  async monthly(p: AuthPrincipal, month: string, hqOnly: boolean) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('month는 YYYY-MM 형식입니다.');
    const emps = await this.scopedEmployees(p, hqOnly);
    const ids = emps.map((e) => e.id);
    const from = `${month}-01`;
    const last = monthLast(month);
    const today = todayKst();
    const until = last < today ? last : today; // 아직 오지 않은 날은 세지 않는다
    const [records, settings, leaves] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { employeeId: { in: ids }, workDate: { gte: dateOnly(from), lte: dateOnly(until) } },
      }),
      this.settings(),
      this.leaveMap(ids, from, until),
    ]);
    const rec = new Map(records.map((r) => [`${r.employeeId}|${ymd(r.workDate)}`, r]));
    const now = nowHHMM();
    return emps.map((e) => {
      const count: Partial<Record<AttendanceStatus, number>> = {};
      for (let d = from; d <= until; d = addDaysYmd(d, 1)) {
        const r = rec.get(`${e.id}|${d}`);
        const leave = leaves.get(`${e.id}|${d}`) ?? null;
        const st = judgeAttendance({
          date: d,
          clockIn: toHHMM(r?.clockIn ?? null),
          clockOut: toHHMM(r?.clockOut ?? null),
          leave: leave?.kind ?? null,
          today,
          now,
          settings,
        });
        count[st] = (count[st] ?? 0) + 1;
      }
      const worked =
        (count.NORMAL ?? 0) +
        (count.LATE ?? 0) +
        (count.EARLY ?? 0) +
        (count.LATE_EARLY ?? 0) +
        (count.NO_OUT ?? 0) +
        (count.WORKING ?? 0);
      return {
        employeeId: e.id,
        name: e.name,
        positionName: e.position?.name ?? null,
        orgUnitName: e.orgUnit?.name ?? null,
        worked,
        late: (count.LATE ?? 0) + (count.LATE_EARLY ?? 0),
        early: (count.EARLY ?? 0) + (count.LATE_EARLY ?? 0),
        absent: count.ABSENT ?? 0,
        leave: count.LEAVE ?? 0,
        noOut: count.NO_OUT ?? 0,
      };
    });
  }

  // ── 기록 쓰기 ──

  private async upsert(
    db: Prisma.TransactionClient | PrismaService,
    employeeId: string,
    workDate: string,
    clockIn: string | null,
    clockOut: string | null,
    source: 'WEB' | 'IMPORT' | 'FIX',
    note?: string | null,
  ) {
    for (const t of [clockIn, clockOut])
      if (t && !HHMM.test(t)) throw new BadRequestException(`시각은 HH:MM 형식입니다(${t}).`);
    if (clockIn && clockOut && clockOut < clockIn)
      throw new BadRequestException('퇴근 시각이 출근보다 빠릅니다.');
    const data = {
      clockIn: clockIn ? atKst(workDate, clockIn) : null,
      clockOut: clockOut ? atKst(workDate, clockOut) : null,
      source,
      note: note ?? null,
    };
    return db.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId, workDate: dateOnly(workDate) } },
      update: data,
      create: { employeeId, workDate: dateOnly(workDate), ...data },
    });
  }

  /** 관리자 수정(ATTENDANCE.UPDATE, 범위 안) */
  async fix(
    p: AuthPrincipal,
    input: {
      employeeId: string;
      workDate: string;
      clockIn?: string | null;
      clockOut?: string | null;
      note?: string;
    },
  ) {
    const ids = await this.scope.orgScopeIds(p);
    if (ids !== null) {
      const emp = await this.prisma.employee.findUnique({
        where: { id: input.employeeId },
        select: { orgUnitId: true },
      });
      if (!emp || !ids.includes(emp.orgUnitId))
        throw new ForbiddenException('이 직원의 근태를 고칠 권한이 없습니다.');
    }
    return this.upsert(
      this.prisma,
      input.employeeId,
      input.workDate.slice(0, 10),
      input.clockIn ?? null,
      input.clockOut ?? null,
      'FIX',
      input.note?.trim() || '관리자 수정',
    );
  }

  /** 근태 정정 신청 → 결재(ATTENDANCE_FIX). 승인되면 onModuleInit 핸들러가 기록을 고친다 */
  async requestFix(
    p: AuthPrincipal,
    input: {
      workDate: string;
      clockIn?: string | null;
      clockOut?: string | null;
      reason: string;
      line?: ApprovalLineEntry[];
    },
  ) {
    const empId = this.requireEmployee(p);
    const date = input.workDate.slice(0, 10);
    if (date > todayKst()) throw new BadRequestException('지나간 날짜만 정정할 수 있습니다.');
    if (!input.clockIn && !input.clockOut)
      throw new BadRequestException('출근이나 퇴근 시각 중 하나는 넣어 주세요.');
    for (const t of [input.clockIn, input.clockOut])
      if (t && !HHMM.test(t)) throw new BadRequestException(`시각은 HH:MM 형식입니다(${t}).`);
    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: empId },
      select: { name: true },
    });
    const cur = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: empId, workDate: dateOnly(date) } },
    });
    // 빈칸으로 둔 쪽은 지금 기록을 그대로 둔다
    const clockIn = input.clockIn ?? toHHMM(cur?.clockIn ?? null);
    const clockOut = input.clockOut ?? toHHMM(cur?.clockOut ?? null);
    const doc = await this.prisma.$transaction((tx) =>
      this.approvals.submit(tx, {
        docType: 'ATTENDANCE_FIX',
        title: `${emp.name} 근태 정정 (${date} 출근 ${clockIn ?? '-'} / 퇴근 ${clockOut ?? '-'})`,
        content: input.reason.trim(),
        payload: {
          workDate: date,
          clockIn,
          clockOut,
          reason: input.reason.trim(),
          before: {
            clockIn: toHHMM(cur?.clockIn ?? null),
            clockOut: toHHMM(cur?.clockOut ?? null),
          },
        },
        requesterEmpId: empId,
        line: input.line ?? null,
      }),
    );
    await this.approvals.announceSubmitted(doc);
    return { approvalDocId: doc.id, status: doc.status };
  }

  // ── 엑셀 업로드 ──

  /**
   * 근태 엑셀(.xlsx) 또는 CSV를 읽어 미리보기. 머리글 줄을 찾아 칸을 자동으로 맞춘다
   * (사번 | 이름·성명 / 일자·날짜 / 출근 / 퇴근). 직원은 사번 우선, 없으면 이름으로 찾는다.
   */
  async importPreview(input: {
    name: string;
    dataBase64: string;
  }): Promise<{ rows: ImportRow[]; header: string[] }> {
    const buf = Buffer.from(input.dataBase64, 'base64');
    if (buf.length === 0) throw new BadRequestException('빈 파일입니다.');
    const lower = input.name.toLowerCase();
    let grid: unknown[][];
    // 엑셀이 만든 CSV는 맨 앞에 BOM이 붙어 있어 첫 머리글 글자가 달라지므로 떼어 낸다
    if (lower.endsWith('.csv')) {
      let text = buf.toString('utf8');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      grid = parseCsv(text);
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) grid = await readXlsx(buf);
    else
      throw new BadRequestException(
        '엑셀(.xlsx) 또는 CSV 파일을 올려 주세요. 예전 .xls는 엑셀에서 .xlsx로 다시 저장해 주세요.',
      );

    // 머리글 줄 찾기 — 앞 15줄 안에서 '출근'과 날짜 칸이 함께 있는 줄
    const norm = (v: unknown) => String(cellText(v) ?? '').replace(/\s/g, '');
    let headerIdx = -1;
    let col: { empNo: number; name: number; date: number; in: number; out: number } | null = null;
    for (let i = 0; i < Math.min(15, grid.length); i++) {
      const cells = grid[i].map(norm);
      const find = (re: RegExp) => cells.findIndex((c) => re.test(c));
      const date = find(/일자|날짜|근무일|^date$/i);
      const inC = find(/출근/);
      if (date >= 0 && inC >= 0) {
        headerIdx = i;
        col = {
          empNo: find(/사번|사원번호|직원번호|^id$/i),
          name: find(/이름|성명|직원명|사원명/),
          date,
          in: inC,
          out: find(/퇴근/),
        };
        break;
      }
    }
    if (!col)
      throw new BadRequestException(
        "머리글을 찾지 못했습니다. 첫 줄 근처에 '일자(날짜)', '출근', '퇴근', '이름(또는 사번)' 칸이 있어야 합니다.",
      );
    if (col.empNo < 0 && col.name < 0)
      throw new BadRequestException("'이름' 또는 '사번' 칸이 필요합니다.");

    const emps = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true, empNo: true },
    });
    const byEmpNo = new Map(emps.filter((e) => e.empNo).map((e) => [e.empNo!, e]));
    const byName = new Map<string, typeof emps>();
    for (const e of emps) byName.set(e.name, [...(byName.get(e.name) ?? []), e]);

    const rows: ImportRow[] = [];
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i];
      const empNo = col.empNo >= 0 ? (cellText(r[col.empNo]) ?? null) : null;
      const name = col.name >= 0 ? (cellText(r[col.name]) ?? null) : null;
      if (!empNo && !name && !cellText(r[col.date])) continue; // 빈 줄
      const workDate = toDate(r[col.date]);
      const clockIn = toTime(r[col.in]);
      const clockOut = col.out >= 0 ? toTime(r[col.out]) : null;
      let match: { id: string; name: string } | null = null;
      let problem: string | null = null;
      if (empNo && byEmpNo.has(empNo)) match = byEmpNo.get(empNo)!;
      else if (name) {
        const cands = byName.get(name) ?? [];
        if (cands.length === 1) match = cands[0];
        else
          problem = cands.length > 1 ? '동명이인 — 사번 칸이 필요합니다' : '직원을 찾지 못했습니다';
      } else problem = '직원을 찾지 못했습니다';
      if (!problem && !workDate) problem = '날짜를 읽지 못했습니다';
      if (!problem && !clockIn && !clockOut) problem = '출근·퇴근 시각이 없습니다';
      if (!problem && workDate && workDate > todayKst()) problem = '앞으로의 날짜입니다';
      rows.push({
        rowNo: i + 1,
        empNo,
        name,
        workDate,
        clockIn,
        clockOut,
        employeeId: match?.id ?? null,
        employeeName: match?.name ?? null,
        problem,
      });
    }
    return { rows, header: grid[headerIdx].map((c) => String(cellText(c) ?? '')) };
  }

  /** 미리보기에서 문제없는 줄만 확정(같은 직원·날짜 기록은 업로드 값으로 바꾼다) */
  async importCommit(
    p: AuthPrincipal,
    rows: {
      employeeId: string;
      workDate: string;
      clockIn?: string | null;
      clockOut?: string | null;
    }[],
  ) {
    const ids = await this.scope.orgScopeIds(p);
    let allowed: Set<string> | null = null;
    if (ids !== null) {
      const emps = await this.prisma.employee.findMany({
        where: { orgUnitId: { in: ids } },
        select: { id: true },
      });
      allowed = new Set(emps.map((e) => e.id));
    }
    let saved = 0;
    let skipped = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        if (allowed && !allowed.has(r.employeeId)) {
          skipped++;
          continue;
        }
        await this.upsert(
          tx,
          r.employeeId,
          r.workDate.slice(0, 10),
          r.clockIn ?? null,
          r.clockOut ?? null,
          'IMPORT',
          '엑셀 업로드',
        );
        saved++;
      }
    });
    return { saved, skipped };
  }
}

// ── 엑셀·CSV 읽기 도우미 ──

/** exceljs 셀 값 → 글자(서식 있는 글·수식 결과 포함) */
function cellText(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return String(o.text);
  }
  return String(v).trim() || null;
}

/** 날짜 칸 → 'YYYY-MM-DD' (엑셀 날짜·엑셀 일련번호·2026-10-27·2026.10.27·2026/10/27·20261027) */
function toDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400_000).toISOString().slice(0, 10);
  }
  const s = cellText(v);
  if (!s) return null;
  const m = /(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** 시각 칸 → 'HH:MM' (엑셀 시각·하루의 비율 숫자·'08:55'·'08:55:12'·'2026-10-27 08:55') */
function toTime(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(11, 16); // exceljs는 엑셀 시각을 UTC로 준다
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const s = cellText(v);
  if (!s) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(s.includes('T') ? s.split('T')[1] : (s.split(' ').pop() ?? s));
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

async function readXlsx(buf: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException(
      '엑셀 파일을 읽지 못했습니다. 파일이 손상됐거나 암호가 걸려 있는지 확인해 주세요.',
    );
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new NotFoundException('시트가 없습니다.');
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = (row.values as unknown[]).slice(1); // exceljs는 1부터 센다
    grid.push(vals);
  });
  return grid;
}

/** 간단한 CSV 읽기 — 따옴표 안 쉼표·줄바꿈, ""(따옴표) 처리 */
function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
