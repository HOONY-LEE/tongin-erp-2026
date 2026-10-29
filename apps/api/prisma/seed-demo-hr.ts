/**
 * 인사 데모 데이터 — 휴가 종류, 전사 기본 결재선, (개발 DB만) 본사 직원 입사일 보정,
 * 최근 근태 기록, 휴가 신청 몇 건, 입·퇴사 체크리스트 기본 항목.
 *
 *   pnpm --filter @tongin/api demo:seed:hr
 *
 * seed-demo.ts(조직도·직원)를 먼저 돌려야 한다. 멱등하다 — 코드·이름으로 upsert 하고,
 * 데모 근태·휴가는 데모 표식(note/reason이 '[데모]'로 시작)을 단 것만 지우고 다시 넣는다.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { addDaysYmd, countWorkdays, isWorkday } from '@tongin/shared';

const prisma = new PrismaClient();
const DEMO = '[데모]';

/** 휴가 종류 — 연차·반차는 연차에서 빠지고, 나머지는 따로 */
const LEAVE_TYPES = [
  { code: 'ANNUAL', name: '연차', unitDays: 1, deducts: true, paid: true, sortOrder: 10 },
  { code: 'HALF_AM', name: '오전 반차', unitDays: 0.5, deducts: true, paid: true, sortOrder: 20 },
  { code: 'HALF_PM', name: '오후 반차', unitDays: 0.5, deducts: true, paid: true, sortOrder: 30 },
  { code: 'QUARTER', name: '반반차', unitDays: 0.25, deducts: true, paid: true, sortOrder: 35 },
  { code: 'SICK', name: '병가', unitDays: 1, deducts: false, paid: false, sortOrder: 40 },
  { code: 'FAMILY', name: '경조 휴가', unitDays: 1, deducts: false, paid: true, sortOrder: 50 },
  { code: 'OFFICIAL', name: '공가', unitDays: 1, deducts: false, paid: true, sortOrder: 60 },
  { code: 'UNPAID', name: '무급 휴가', unitDays: 1, deducts: false, paid: false, sortOrder: 70 },
];

async function seedLeaveTypes() {
  for (const t of LEAVE_TYPES) {
    await prisma.leaveType.upsert({
      where: { code: t.code },
      update: {},
      create: t,
    });
  }
  console.log(`휴가 종류 ${LEAVE_TYPES.length}개`);
}

/** 전사 기본 결재선 — 부서장 → 통인그룹 대표, 참조: 경영관리 부서장. 이미 있으면 그대로 */
async function seedLines() {
  const group = await prisma.orgUnit.findFirst({ where: { name: '통인그룹' } });
  const mgmt = await prisma.orgUnit.findFirst({ where: { name: '경영관리' } });
  if (!group || !mgmt) {
    console.log('결재선: 통인그룹·경영관리 조직이 없어 건너뜀(seed-demo.ts 먼저)');
    return;
  }
  const steps = [
    { kind: 'APPROVER', resolver: 'DEPT_HEAD', orgUnitId: null, employeeId: null },
    { kind: 'APPROVER', resolver: 'ORG_HEAD', orgUnitId: group.id, employeeId: null },
    { kind: 'CC', resolver: 'ORG_HEAD', orgUnitId: mgmt.id, employeeId: null },
  ];
  let made = 0;
  for (const docType of ['LEAVE', 'ATTENDANCE_FIX', 'GENERAL']) {
    const exists = await prisma.approvalLineTemplate.findFirst({
      where: { docType, orgUnitId: null },
    });
    if (exists) continue;
    await prisma.approvalLineTemplate.create({
      data: { docType, orgUnitId: null, name: '전사 기본', steps: steps as Prisma.InputJsonValue },
    });
    made++;
  }
  console.log(`전사 기본 결재선 ${made}개 새로 만듦`);
}

/**
 * 본사 직원 입사일 보정 — 입사일이 비어 있으면 연차를 계산할 수 없어 데모가 안 된다.
 * 사번이 '입사연도 4자리 + 일련번호'라 그 연도의 3월 2일로 둔다(월·일은 임시).
 * 실제 인물 데이터라 운영(NODE_ENV=production)에서는 하지 않는다.
 */
async function fillHireDates() {
  if (process.env.NODE_ENV === 'production') {
    console.log('입사일 보정: 운영 환경이라 건너뜀');
    return;
  }
  const emps = await prisma.employee.findMany({
    where: { hireDate: null, isActive: true, orgUnit: { type: { not: 'BRANCH' } } },
    select: { id: true, empNo: true },
  });
  let n = 0;
  for (const e of emps) {
    const year = Number(e.empNo?.slice(0, 4));
    if (!year || year < 1980 || year > 2100) continue;
    await prisma.employee.update({
      where: { id: e.id },
      data: { hireDate: new Date(`${year}-03-02T00:00:00Z`) },
    });
    n++;
  }
  console.log(`입사일 보정(본사, 비어 있던 직원) ${n}명`);
}

/** 입·퇴사 체크리스트 기본 항목 — 그 종류 항목이 하나도 없을 때만 넣는다(관리자가 고친 목록 보존) */
const CHECKLIST: Record<'ONBOARD' | 'OFFBOARD', string[]> = {
  ONBOARD: [
    '근로계약서 작성·보관',
    '4대보험 취득 신고',
    'ERP 계정 발급·권한 그룹 지정',
    '비품 지급(PC·명함·출입카드)',
    '보안서약서·개인정보 동의서',
  ],
  OFFBOARD: [
    '사직서 수령',
    '4대보험 상실 신고',
    'ERP 계정 비활성 확인',
    '비품 회수(PC·출입카드)',
    '퇴직금·연차수당 정산',
  ],
};

async function seedChecklistTemplates() {
  let made = 0;
  for (const kind of ['ONBOARD', 'OFFBOARD'] as const) {
    if (await prisma.hrChecklistTemplate.count({ where: { kind } })) continue;
    await prisma.hrChecklistTemplate.createMany({
      data: CHECKLIST[kind].map((title, i) => ({ kind, title, sortOrder: (i + 1) * 10 })),
    });
    made += CHECKLIST[kind].length;
  }
  console.log(`입·퇴사 체크리스트 기본 항목 ${made}개 새로 만듦`);
}

// ── 데모 휴가·근태 (개발 DB만) ──

const KST = 9 * 3600_000;
const todayYmd = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
const nowHHMM = () => new Date(Date.now() + KST).toISOString().slice(11, 16);
const dateOnly = (d: string) => new Date(`${d}T00:00:00Z`);
const at = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00+09:00`);

/** 날짜·사람마다 늘 같은 값이 나오는 0~1 난수(다시 돌려도 같은 데이터) */
function rand(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 근무일 n개 앞(+)·뒤(-) — 0이면 오늘이 근무일이면 오늘, 아니면 다음 근무일 */
function workdayFrom(base: string, n: number) {
  let d = base;
  while (!isWorkday(d)) d = addDaysYmd(d, 1);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) {
    d = addDaysYmd(d, step);
    if (isWorkday(d)) left--;
  }
  return d;
}

type Emp = {
  id: string;
  name: string;
  orgUnitId: string;
  hireDate: Date | null;
  position: { sortOrder: number } | null;
};

/** 결재 서비스 headOf와 같은 규칙 — 그 조직(없으면 상위)의 가장 높은 직책 재직자 */
function headOf(
  orgId: string | null,
  exclude: Set<string>,
  staff: Emp[],
  parents: Map<string, string | null>,
) {
  const seen = new Set<string>();
  for (let cur = orgId; cur && !seen.has(cur); cur = parents.get(cur) ?? null) {
    seen.add(cur);
    const top = staff
      .filter((e) => e.orgUnitId === cur && !exclude.has(e.id))
      .sort(
        (a, b) =>
          (a.position?.sortOrder ?? 9999) - (b.position?.sortOrder ?? 9999) ||
          a.name.localeCompare(b.name),
      )[0];
    if (top) return top;
  }
  return null;
}

/** 데모 휴가 — 지난주·오늘·이번 주 승인, 결재 중 1건, 반려 1건 */
const LEAVE_PLAN: {
  code: string;
  /** 오늘 기준 근무일 차이 */
  from: number;
  to?: number;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  reason: string;
  reject?: string;
}[] = [
  { code: 'ANNUAL', from: -7, to: -6, status: 'APPROVED', reason: '가족 여행' },
  { code: 'HALF_AM', from: -3, status: 'APPROVED', reason: '병원 진료' },
  { code: 'ANNUAL', from: 0, status: 'APPROVED', reason: '개인 사유' },
  { code: 'ANNUAL', from: 2, to: 3, status: 'APPROVED', reason: '이사' },
  { code: 'ANNUAL', from: 5, status: 'PENDING', reason: '개인 사유' },
  {
    code: 'HALF_PM',
    from: 1,
    status: 'REJECTED',
    reason: '은행 업무',
    reject: '월말 마감 날이라 다음 주로 조정 부탁드립니다.',
  },
];

async function seedDemoLeaveAndAttendance() {
  if (process.env.NODE_ENV === 'production') {
    console.log('데모 휴가·근태: 운영 환경이라 건너뜀');
    return;
  }
  // 지난번 데모 지우기(데모 표식이 있는 것만)
  const old = await prisma.leaveRequest.findMany({
    where: { reason: { startsWith: DEMO } },
    select: { id: true, approvalDocId: true },
  });
  await prisma.leaveRequest.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  await prisma.approvalDoc.deleteMany({
    where: { id: { in: old.flatMap((o) => (o.approvalDocId ? [o.approvalDocId] : [])) } },
  });
  await prisma.attendanceRecord.deleteMany({ where: { note: { startsWith: DEMO } } });

  const orgs = await prisma.orgUnit.findMany({ select: { id: true, parentId: true, type: true } });
  const parents = new Map(orgs.map((o) => [o.id, o.parentId]));
  const hqOrgs = new Set(orgs.filter((o) => o.type !== 'BRANCH').map((o) => o.id));
  const staff: Emp[] = (
    await prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        orgUnitId: true,
        hireDate: true,
        empNo: true,
        position: { select: { sortOrder: true } },
      },
      orderBy: { empNo: 'asc' },
    })
  ).filter((e) => hqOrgs.has(e.orgUnitId));
  const group = await prisma.orgUnit.findFirst({ where: { name: '통인그룹' } });
  const mgmt = await prisma.orgUnit.findFirst({ where: { name: '경영관리' } });
  const types = new Map((await prisma.leaveType.findMany()).map((t) => [t.code, t] as const));
  const today = todayYmd();

  // 신청자 — 위에 결재할 부서장이 있는 직원, 조직이 겹치지 않게
  const usedOrg = new Set<string>();
  const requesters = staff.filter((e) => {
    if (usedOrg.has(e.orgUnitId)) return false;
    const head = headOf(e.orgUnitId, new Set([e.id]), staff, parents);
    if (!head || (head.position?.sortOrder ?? 9999) >= (e.position?.sortOrder ?? 9999))
      return false;
    usedOrg.add(e.orgUnitId);
    return true;
  });

  const prefix = `AP-${new Date().getFullYear()}-`;
  const last = await prisma.approvalDoc.findFirst({
    where: { docNo: { startsWith: prefix } },
    orderBy: { docNo: 'desc' },
    select: { docNo: true },
  });
  let seq = last ? Number(last.docNo.slice(prefix.length)) : 0;

  /** 휴가 날짜 — 근태 만들 때 그날은 비우거나(종일) 반나절만 */
  const leaveDays = new Map<string, 'FULL' | 'AM' | 'PM'>();
  let made = 0;
  for (const [i, plan] of LEAVE_PLAN.entries()) {
    const emp = requesters[i];
    const type = types.get(plan.code);
    if (!emp || !type) continue;
    const start = workdayFrom(today, plan.from);
    const end = plan.to !== undefined ? workdayFrom(today, plan.to) : start;
    const half = Number(type.unitDays) < 1;
    const days = half ? Number(type.unitDays) : countWorkdays(start, end);

    const used = new Set([emp.id]);
    const approvers: Emp[] = [];
    for (const org of [emp.orgUnitId, group?.id ?? null]) {
      const h = headOf(org, used, staff, parents);
      if (h) {
        used.add(h.id);
        approvers.push(h);
      }
    }
    const cc = mgmt ? headOf(mgmt.id, new Set([emp.id]), staff, parents) : null;
    const submitted = at(addDaysYmd(start, -5), '10:30');
    const acted = (k: number) => new Date(submitted.getTime() + (k + 1) * 3 * 3600_000);
    const reason = `${DEMO} ${plan.reason}`;
    const period = start === end ? start : `${start} ~ ${end}`;

    const steps: Prisma.ApprovalStepCreateWithoutDocInput[] = approvers.map((a, k) => {
      const base = { seq: k + 1, kind: 'APPROVER', approver: { connect: { id: a.id } } };
      if (plan.status === 'APPROVED') return { ...base, status: 'APPROVED', actedAt: acted(k) };
      if (plan.status === 'PENDING') return { ...base, status: k === 0 ? 'PENDING' : 'WAITING' };
      return k === 0
        ? { ...base, status: 'REJECTED', comment: plan.reject, actedAt: acted(k) }
        : { ...base, status: 'WAITING' };
    });
    if (cc && !approvers.some((a) => a.id === cc.id))
      steps.push({
        seq: steps.length + 1,
        kind: 'CC',
        status: 'WAITING',
        approver: { connect: { id: cc.id } },
      });
    const done = plan.status !== 'PENDING';

    const req = await prisma.leaveRequest.create({
      data: {
        employeeId: emp.id,
        leaveTypeId: type.id,
        startDate: dateOnly(start),
        endDate: dateOnly(end),
        days,
        reason,
        status: plan.status,
      },
    });
    const doc = await prisma.approvalDoc.create({
      data: {
        docNo: `${prefix}${String(++seq).padStart(4, '0')}`,
        docType: 'LEAVE',
        title: `${emp.name} ${type.name} (${period}, ${days}일)`,
        content: reason,
        payload: {
          leaveRequestId: req.id,
          leaveType: type.name,
          startDate: start,
          endDate: end,
          days,
          deducts: type.deducts,
        },
        requester: { connect: { id: emp.id } },
        orgUnitId: emp.orgUnitId,
        status: plan.status,
        currentSeq: done ? null : 1,
        submittedAt: submitted,
        completedAt: done ? acted(plan.status === 'APPROVED' ? approvers.length - 1 : 0) : null,
        steps: { create: steps },
      },
    });
    await prisma.leaveRequest.update({ where: { id: req.id }, data: { approvalDocId: doc.id } });
    made++;
    if (plan.status === 'APPROVED')
      for (let d = start; d <= end; d = addDaysYmd(d, 1))
        leaveDays.set(
          `${emp.id}|${d}`,
          plan.code === 'HALF_AM' ? 'AM' : plan.code === 'HALF_PM' ? 'PM' : 'FULL',
        );
  }
  console.log(`데모 휴가 신청 ${made}건(승인·결재 중·반려)`);

  // 근태 — 최근 3주 근무일. 대부분 정시, 가끔 지각·조퇴·결근·퇴근 누락
  const now = nowHHMM();
  const rows: Prisma.AttendanceRecordCreateManyInput[] = [];
  for (let d = addDaysYmd(today, -21); d <= today; d = addDaysYmd(d, 1)) {
    if (!isWorkday(d)) continue;
    for (const e of staff) {
      if (e.hireDate && e.hireDate.toISOString().slice(0, 10) > d) continue;
      const leave = leaveDays.get(`${e.id}|${d}`);
      if (leave === 'FULL') continue;
      const r = rand(`${e.id}|${d}`);
      const jitter = Math.floor(rand(`${d}|${e.id}`) * 20);
      let inMin = 8 * 60 + 35 + jitter; // 08:35~08:54
      let outMin = 18 * 60 + 2 + jitter * 2; // 18:02~18:40
      let noOut = false;
      if (leave === 'AM') inMin = 13 * 60 + 40 + jitter;
      else if (leave === 'PM') outMin = 14 * 60 + jitter;
      else if (r < 0.03)
        continue; // 결근
      else if (r < 0.11)
        inMin = 9 * 60 + 3 + jitter * 2; // 지각 09:03~09:41
      else if (r < 0.14)
        outMin = 16 * 60 + 30 + jitter * 3; // 조퇴
      else if (r < 0.16) noOut = true; // 퇴근 누락
      const inAt = hhmm(inMin);
      const outAt = hhmm(outMin);
      // 오늘은 지금 시각까지 찍힌 것만
      if (d === today && inAt > now) continue;
      rows.push({
        employeeId: e.id,
        workDate: dateOnly(d),
        clockIn: at(d, inAt),
        clockOut: noOut || (d === today && outAt > now) ? null : at(d, outAt),
        source: 'WEB',
        note: DEMO,
      });
    }
  }
  // 직접 찍은 기록이 있는 날은 그대로 둔다
  const { count } = await prisma.attendanceRecord.createMany({ data: rows, skipDuplicates: true });
  console.log(`데모 근태 ${count}건(본사 ${staff.length}명, 최근 3주)`);
}

async function main() {
  await seedLeaveTypes();
  await seedLines();
  await fillHireDates();
  await seedChecklistTemplates();
  await seedDemoLeaveAndAttendance();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export { DEMO };
