/**
 * 시드 — 통인 실제 조직도 + 기존 전산 계정 목록으로 조직·직원·계정을 만든다(2026-10 자료 기준). 가짜 직원·지점은 없다.
 *
 *   pnpm --filter @tongin/api demo:seed
 *
 *   통인그룹(GROUP) ─ 대표이사
 *   ├ 그룹 기획 관리실(DEPT)
 *   ├ 통인익스프레스(COMPANY)
 *   │  ├ 경영관리 · 가맹 · 기업영업 · 홈플래너 · 고객관리부 · 디자인 · 마케팅 · 무브제 · 전속제휴(DEPT)
 *   │  └ 지점(BRANCH) — 계정 목록의 소속 코드(BE0000)대로, 같은 이름이면 한 지점
 *   ├ 통인에이치앤씨(COMPANY)
 *   └ 부동산사업부(DEPT)
 *
 * - 로그인 ID = 이름_성(이성훈 → sunghoon_lee). 같은 ID가 또 나오면 뒤에 2, 3 …(조직도 → 목록 순서)
 * - 비밀번호는 모두 DEMO_PASSWORD(기본 tongin1234!). 설치용 admin은 서버 부팅 시더가 따로 만든다
 * - 목록에서 비활성인 사람은 계정을 만들되 꺼 둔다
 * - 조직도 사람이 목록 본사 칸(홈플래너팀 등)에도 있으면 같은 사람으로 보고 목록의 사번·활성 여부를 쓴다
 * - 이름 칸에서 이름만 뽑는다('유봉기(분당구미)_TI-144' → 유봉기, '0026. 김지애' → 김지애). 사람 이름이 아닌 공용·시험 계정은 뺀다
 *
 * 여러 번 돌려도 같은 결과(조직 코드·사번·로그인 ID 기준 upsert).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_FRANCHISE, ROLE_SUPER_ADMIN } from '@tongin/shared';
import { LEGACY_ACCOUNTS } from './data/legacy-accounts';
import { romanizeName } from './data/romanize';

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'tongin1234!';

/** 직책 — 정렬 순서(작을수록 위). 기존 직책(대표·부장·차장·과장·대리·사원 등) 사이에 끼운다 */
const POSITIONS: { name: string; sortOrder: number }[] = [
  { name: '대표이사', sortOrder: 15 },
  { name: '본부장', sortOrder: 35 },
  { name: '실장', sortOrder: 45 },
  { name: '소장', sortOrder: 46 },
  { name: '팀장', sortOrder: 55 },
  { name: '지점장', sortOrder: 90 },
];

/** 본사 조직 — parent: 'GROUP'(통인그룹) | 'COMPANY'(통인익스프레스) */
const DEPTS: { code: string; name: string; type: string; parent: 'GROUP' | 'COMPANY' }[] = [
  { code: 'GRP-PLAN', name: '그룹 기획 관리실', type: 'DEPT', parent: 'GROUP' },
  { code: 'DEPT-MGMT', name: '경영관리', type: 'DEPT', parent: 'COMPANY' },
  { code: 'DEPT-FRAN', name: '가맹', type: 'DEPT', parent: 'COMPANY' },
  { code: 'DEPT-B2B', name: '기업영업', type: 'DEPT', parent: 'COMPANY' },
  { code: 'DEPT-HOME', name: '홈플래너', type: 'DEPT', parent: 'COMPANY' },
  { code: 'DEPT-CS', name: '고객관리부', type: 'DEPT', parent: 'COMPANY' },
  { code: 'DEPT-DESIGN', name: '디자인', type: 'DEPT', parent: 'COMPANY' },
  { code: 'DEPT-MKT', name: '마케팅', type: 'DEPT', parent: 'COMPANY' },
  { code: 'DEPT-MOVEJE', name: '무브제', type: 'DEPT', parent: 'COMPANY' },
  { code: 'DEPT-PARTNER', name: '전속제휴', type: 'DEPT', parent: 'COMPANY' },
  { code: 'CO-HNC', name: '통인에이치앤씨', type: 'COMPANY', parent: 'GROUP' },
  { code: 'DEPT-REALTY', name: '부동산사업부', type: 'DEPT', parent: 'GROUP' },
];

/** 계정 목록의 본사 소속 코드 → 조직 코드. 여기 없는 소속 코드는 지점이다 */
const HQ_DEPT_BY_CODE: Record<string, string> = {
  BE0216: 'DEPT-HOME', // 홈플래너팀
  BE0021: 'DEPT-B2B', // 기업영업팀/기업이전팀
  BE0570: 'DEPT-B2B', // 특수_사업부
  BE0786: 'DEPT-B2B', // 특수사업부
  BE0627: 'CO-HNC', // 통인에이치앤씨
};

/** 조직도 순서 그대로. org: 조직 코드('HQ' = 그룹 직속). admin: 전체 권한(슈퍼관리자), 나머지는 '본사 직원' 권한 그룹 */
const CHART: { name: string; org: string; position: string; admin?: true }[] = [
  { name: '고국종', org: 'HQ', position: '대표이사', admin: true },
  { name: '배기덕', org: 'GRP-PLAN', position: '실장', admin: true },
  { name: '김완성', org: 'DEPT-MGMT', position: '본부장', admin: true },
  { name: '강은숙', org: 'DEPT-MGMT', position: '차장' },
  { name: '이상은', org: 'DEPT-MGMT', position: '대리' },
  { name: '정철민', org: 'DEPT-FRAN', position: '본부장' },
  { name: '김준영', org: 'DEPT-FRAN', position: '부장' },
  { name: '곽성수', org: 'DEPT-FRAN', position: '과장' },
  { name: '최봉준', org: 'DEPT-FRAN', position: '대리' },
  { name: '이경철', org: 'DEPT-B2B', position: '부장' },
  { name: '주미선', org: 'DEPT-HOME', position: '부장' },
  { name: '허윤무', org: 'DEPT-HOME', position: '실장' },
  { name: '최동희', org: 'DEPT-HOME', position: '실장' },
  { name: '안수지', org: 'DEPT-HOME', position: '사원' },
  { name: '권기영', org: 'DEPT-HOME', position: '사원' },
  { name: '김미영', org: 'DEPT-CS', position: '과장' },
  { name: '노은주', org: 'DEPT-CS', position: '과장' },
  { name: '김은혜', org: 'DEPT-CS', position: '대리' },
  { name: '임기숙', org: 'DEPT-CS', position: '사원' },
  { name: '이명원', org: 'DEPT-CS', position: '사원' },
  { name: '김미선', org: 'DEPT-CS', position: '팀장' },
  { name: '전지숙', org: 'DEPT-DESIGN', position: '실장' },
  { name: '왕채은', org: 'DEPT-DESIGN', position: '사원' },
  { name: '정주연', org: 'DEPT-DESIGN', position: '사원' },
  { name: '송승호', org: 'DEPT-MKT', position: '팀장' },
  { name: '김수빈', org: 'DEPT-MKT', position: '사원' },
  { name: '피규열', org: 'DEPT-MOVEJE', position: '팀장' },
  { name: '김태원', org: 'DEPT-MOVEJE', position: '과장' },
  { name: '오태환', org: 'DEPT-PARTNER', position: '과장' },
  { name: '신민근', org: 'DEPT-REALTY', position: '소장' },
];
/** 목록에 없어 사번을 모르는 조직도 사람 — 2015년 9000번대로 둔다(화면에서 고친다) */
const UNKNOWN_EMP_YEAR = '2015';

/** '본사 직원' 권한 그룹 — 업무 메뉴 전부. 계정·권한·감사로그·AI 관리·조직/공통코드 수정·인사는 뺀다(관리자 몫) */
const HQ_ROLE_CODE = 'HQ_STAFF';
const HQ_EXCLUDE = [
  /^USER\./,
  /^ROLE\./,
  /^HR\./,
  /^AUDIT\./,
  /^AI\.MANAGE$/,
  /^(ORG_UNIT|COMMON_CODE|EMPLOYEE)\.(CREATE|UPDATE|DELETE)$/,
  // 공지 작성·계약/자산·지점 관리 기록은 맡은 팀(경영관리·가맹)에 따로 준다 — 이미 있는 DB에 더한
  // 마이그레이션 20261029100100_team_work_permissions와 같은 범위(공지 조회, 팀 업무 조회·등록·수정)
  /^NOTICE\.(CREATE|UPDATE|DELETE)$/,
  /^TASK\.DELETE$/,
  /^(ASSET|BRANCH_CASE)\./,
];

/** 이름 칸에서 사람 이름만 — 사람 이름이 아니면(공용·시험 계정) null */
function personName(raw: string): string | null {
  const name = raw
    .replace(/^\d+\.\s*/, '')
    .split('(')[0]
    .trim();
  return /^[가-힣]{2,4}$/.test(name) ? name : null;
}

/** 'YYYYMMDD'가 실제 날짜면 그 날, 아니면(옛 사번 일련번호가 섞인 값) null */
function toDate(s: string): Date | null {
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10).replace(/-/g, '') === s ? d : null;
}

type Person = {
  name: string;
  empNo: string | null; // null = 사번 모름(새로 매긴다)
  hireDate: Date | null;
  active: boolean;
  org: { kind: 'hq'; code: string } | { kind: 'branch'; code: string; name: string };
  position: string | null;
  role: 'admin' | 'hq' | 'branch';
};

/** 조직도 + 목록을 사람 한 줄씩으로 — 조직도 사람이 목록 본사 칸에 있으면 합친다 */
function buildPeople(): Person[] {
  const legacy = LEGACY_ACCOUNTS.map(([raw, empNo, dept, deptCode, active]) => ({
    name: personName(raw),
    empNo,
    dept,
    deptCode,
    active,
  }));
  const merged = new Set<number>();
  const people: Person[] = CHART.map((c) => {
    const i = legacy.findIndex(
      (l, idx) => !merged.has(idx) && l.name === c.name && HQ_DEPT_BY_CODE[l.deptCode],
    );
    const l = i >= 0 ? legacy[i] : null;
    if (l) merged.add(i);
    return {
      name: c.name,
      empNo: l?.empNo ?? null,
      hireDate: l ? toDate(l.empNo) : null,
      active: l?.active ?? true,
      org: { kind: 'hq', code: c.org },
      position: c.position,
      role: c.admin ? 'admin' : 'hq',
    };
  });
  legacy.forEach((l, i) => {
    if (!l.name || merged.has(i)) return;
    const hq = HQ_DEPT_BY_CODE[l.deptCode];
    people.push({
      name: l.name,
      empNo: l.empNo,
      hireDate: toDate(l.empNo),
      active: l.active,
      org: hq ? { kind: 'hq', code: hq } : { kind: 'branch', code: l.deptCode, name: l.dept },
      position: hq ? null : '지점장',
      role: hq ? 'hq' : 'branch',
    });
  });
  return people;
}

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const people = buildPeople();

  // ── 조직 ──
  const group = await prisma.orgUnit.upsert({
    where: { code: 'HQ' },
    update: { name: '통인그룹' },
    create: { code: 'HQ', name: '통인그룹', type: 'GROUP' },
  });
  const company = await prisma.orgUnit.upsert({
    where: { code: 'CO-MOVING' },
    update: { name: '통인익스프레스', parentId: group.id },
    create: { code: 'CO-MOVING', name: '통인익스프레스', type: 'COMPANY', parentId: group.id },
  });
  const orgId = new Map<string, string>([['HQ', group.id]]);
  for (const d of DEPTS) {
    const parentId = d.parent === 'GROUP' ? group.id : company.id;
    const row = await prisma.orgUnit.upsert({
      where: { code: d.code },
      update: { name: d.name, type: d.type, parentId, isActive: true },
      create: { code: d.code, name: d.name, type: d.type, parentId },
    });
    orgId.set(d.code, row.id);
  }
  // 지점 — 소속 코드로 찾고, 없으면 같은 이름의 지점에 넣고(여의도점처럼 코드가 둘인 지점), 그래도 없으면 새로 만든다
  const branchId = new Map<string, string>();
  for (const p of people) {
    if (p.org.kind !== 'branch' || branchId.has(p.org.code)) continue;
    const found =
      (await prisma.orgUnit.findUnique({ where: { code: p.org.code } })) ??
      (await prisma.orgUnit.findFirst({
        where: { type: 'BRANCH', name: p.org.name },
        orderBy: { createdAt: 'asc' },
      }));
    const row =
      found ??
      (await prisma.orgUnit.create({
        data: { code: p.org.code, name: p.org.name, type: 'BRANCH', parentId: company.id },
      }));
    branchId.set(p.org.code, row.id);
  }

  // ── 직책 ──
  for (const p of POSITIONS) {
    await prisma.position.upsert({
      where: { name: p.name },
      update: { sortOrder: p.sortOrder },
      create: p,
    });
  }
  const positionId = new Map(
    (await prisma.position.findMany({ select: { id: true, name: true } })).map((p) => [
      p.name,
      p.id,
    ]),
  );

  // ── 권한 그룹 ──
  const superAdmin = await prisma.role.findUnique({ where: { code: ROLE_SUPER_ADMIN } });
  const franchise = await prisma.role.findUnique({ where: { code: ROLE_FRANCHISE } });
  if (!superAdmin || !franchise) {
    throw new Error('기본 역할이 없다 — API를 한 번 띄워 기본 시더를 돌려야 한다');
  }
  let hqRole = await prisma.role.findUnique({ where: { code: HQ_ROLE_CODE } });
  if (!hqRole) {
    hqRole = await prisma.role.create({
      data: {
        code: HQ_ROLE_CODE,
        name: '본사 직원',
        description: '본사 업무 메뉴 전체(계정·권한·인사·조직 수정 제외), 전사 데이터',
        sortOrder: 5,
      },
    });
    const perms = await prisma.permission.findMany({ select: { id: true, code: true } });
    await prisma.rolePermission.createMany({
      data: perms
        .filter((p) => p.code !== '*' && !HQ_EXCLUDE.some((re) => re.test(p.code)))
        .map((p) => ({ roleId: hqRole!.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // ── 사번 — 목록에 없어 사번을 모르는 조직도 사람은 그 해 9000번대로 ──
  const taken = new Set(
    (await prisma.employee.findMany({ select: { empNo: true } })).map((e) => e.empNo ?? ''),
  );
  for (const p of people) if (p.empNo) taken.add(p.empNo);
  const free = (year: string) => {
    for (let n = 9001; ; n++) {
      const no = `${year}${n}`;
      if (!taken.has(no)) {
        taken.add(no);
        return no;
      }
    }
  };
  // 사번을 모르는 조직도 사람 — 이미 만든 적 있으면(이름·조직도 소속이 같으면) 그 사번을 그대로 쓴다
  for (const p of people) {
    if (p.empNo || p.org.kind !== 'hq') continue;
    const prev = await prisma.employee.findFirst({
      where: {
        name: p.name,
        orgUnitId: orgId.get(p.org.code),
        empNo: { startsWith: `${UNKNOWN_EMP_YEAR}9` },
      },
    });
    p.empNo = prev?.empNo ?? free(UNKNOWN_EMP_YEAR);
  }

  // ── 직원·계정 ──
  const idCount = new Map<string, number>();
  let created = 0;
  for (const p of people) {
    const base = romanizeName(p.name);
    const n = (idCount.get(base) ?? 0) + 1;
    idCount.set(base, n);
    const loginId = n === 1 ? base : `${base}${n}`;

    const orgUnitId = p.org.kind === 'hq' ? orgId.get(p.org.code)! : branchId.get(p.org.code)!;
    const data = {
      name: p.name,
      orgUnitId,
      positionId: p.position ? (positionId.get(p.position) ?? null) : null,
      hireDate: p.hireDate,
      isActive: true,
    };
    const emp = await prisma.employee.upsert({
      where: { empNo: p.empNo! },
      update: data,
      create: { empNo: p.empNo!, ...data },
    });
    const before = await prisma.appUser.findUnique({ where: { loginId } });
    const user = await prisma.appUser.upsert({
      where: { loginId },
      // 비밀번호는 처음 만들 때만 — 다시 시드해도 사용자가 바꾼 비밀번호를 되돌리지 않는다
      update: { employeeId: emp.id, isActive: p.active },
      create: {
        loginId,
        passwordHash: hash,
        employeeId: emp.id,
        isActive: p.active,
        principalType: 'HUMAN',
      },
    });
    if (!before) created++;

    const grant =
      p.role === 'branch'
        ? { roleId: franchise.id, orgScopeId: orgUnitId, dataScope: 'ORG' }
        : {
            roleId: p.role === 'admin' ? superAdmin.id : hqRole.id,
            orgScopeId: null,
            dataScope: 'ALL',
          };
    await prisma.userRole.deleteMany({
      where: {
        userId: user.id,
        NOT: { roleId: grant.roleId, orgScopeId: grant.orgScopeId, dataScope: grant.dataScope },
      },
    });
    if (!(await prisma.userRole.findFirst({ where: { userId: user.id } }))) {
      await prisma.userRole.create({ data: { userId: user.id, ...grant } });
    }
  }

  const inactive = people.filter((p) => !p.active).length;
  console.log(
    `조직도·계정 목록: 직원·계정 ${people.length}명(새 계정 ${created}, 비활성 ${inactive}), ` +
      `지점 ${new Set(branchId.values()).size}곳, 비밀번호 ${DEMO_PASSWORD}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
