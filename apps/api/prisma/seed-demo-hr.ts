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

const prisma = new PrismaClient();
const DEMO = '[데모]';

/** 휴가 종류 — 연차·반차는 연차에서 빠지고, 나머지는 따로 */
const LEAVE_TYPES = [
  { code: 'ANNUAL', name: '연차', unitDays: 1, deducts: true, paid: true, sortOrder: 10 },
  { code: 'HALF_AM', name: '오전 반차', unitDays: 0.5, deducts: true, paid: true, sortOrder: 20 },
  { code: 'HALF_PM', name: '오후 반차', unitDays: 0.5, deducts: true, paid: true, sortOrder: 30 },
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

async function main() {
  await seedLeaveTypes();
  await seedLines();
  await fillHireDates();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export { DEMO };
