/**
 * 통인 실제 조직도로 본사 조직·직원·계정을 다시 만든다(2026-10 조직도 기준).
 *
 *   통인그룹(GROUP) ─ 대표이사
 *   ├ 그룹 기획 관리실(DEPT)
 *   ├ 통인익스프레스(COMPANY)
 *   │  ├ 경영관리 · 가맹 · 기업영업 · 홈플래너 · 고객관리부 · 디자인 · 마케팅 · 무브제 · 전속제휴(DEPT)
 *   │  └ 지점 38곳(BRANCH) — 그대로 둔다
 *   └ 부동산사업부(DEPT)
 *
 * 본사 사람마다 직원 + 계정(로그인ID = 이름 영문.성, 비밀번호 DEMO_PASSWORD)을 만든다.
 * 예전 시연용 본사 계정(demo.admin)과 임시 본사 조직(HQ-OFFICE)은 지운다. 지점·지점 계정·전속업체 계정은 건드리지 않는다.
 * 시스템 관리자(admin)는 서버가 부팅 때 만드는 설치용 계정이라 남긴다(최상위 조직 소속 '시스템관리자').
 *
 * seed-demo-once.ts의 ADDONS로 한 번만 돈다. 여러 번 돌려도 같은 결과(코드·사번·로그인ID 기준 upsert).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_SUPER_ADMIN } from '@tongin/shared';

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'tongin1234';

/** 조직도에 없는 입사일은 모른다 — 사번 규칙(입사연도+일련번호)에 맞춰 같은 날로 두고, 화면에서 고친다 */
const HIRE_DATE = new Date('2015-03-02T00:00:00Z');
const HIRE_YEAR = '2015';

/** 직책 — 정렬 순서(작을수록 위). 기존 직책(대표·부장·차장·과장·대리·사원 등) 사이에 끼운다 */
const POSITIONS: { name: string; sortOrder: number }[] = [
  { name: '대표이사', sortOrder: 15 },
  { name: '본부장', sortOrder: 35 },
  { name: '실장', sortOrder: 45 },
  { name: '소장', sortOrder: 46 },
  { name: '팀장', sortOrder: 55 },
];

/** 본사 조직 — parent: 'GROUP'(통인그룹) | 'COMPANY'(통인익스프레스) */
const DEPTS: { code: string; name: string; parent: 'GROUP' | 'COMPANY' }[] = [
  { code: 'GRP-PLAN', name: '그룹 기획 관리실', parent: 'GROUP' },
  { code: 'DEPT-MGMT', name: '경영관리', parent: 'COMPANY' },
  { code: 'DEPT-FRAN', name: '가맹', parent: 'COMPANY' },
  { code: 'DEPT-B2B', name: '기업영업', parent: 'COMPANY' },
  { code: 'DEPT-HOME', name: '홈플래너', parent: 'COMPANY' },
  { code: 'DEPT-CS', name: '고객관리부', parent: 'COMPANY' },
  { code: 'DEPT-DESIGN', name: '디자인', parent: 'COMPANY' },
  { code: 'DEPT-MKT', name: '마케팅', parent: 'COMPANY' },
  { code: 'DEPT-MOVEJE', name: '무브제', parent: 'COMPANY' },
  { code: 'DEPT-PARTNER', name: '전속제휴', parent: 'COMPANY' },
  { code: 'DEPT-REALTY', name: '부동산사업부', parent: 'GROUP' },
];

/**
 * 조직도 순서 그대로. org: 조직 코드('HQ' = 그룹 직속). admin: 전체 권한(슈퍼관리자), 나머지는 '본사 직원' 권한 그룹.
 * 사번은 이 순서대로 2015NNNN.
 */
const PEOPLE: { name: string; loginId: string; org: string; position: string; admin?: true }[] = [
  { name: '고국종', loginId: 'gukjong.ko', org: 'HQ', position: '대표이사', admin: true },
  { name: '배기덕', loginId: 'giduk.bae', org: 'GRP-PLAN', position: '실장', admin: true },
  { name: '김완성', loginId: 'wansung.kim', org: 'DEPT-MGMT', position: '본부장', admin: true },
  { name: '강은숙', loginId: 'eunsook.kang', org: 'DEPT-MGMT', position: '차장' },
  { name: '이상은', loginId: 'sangeun.lee', org: 'DEPT-MGMT', position: '대리' },
  { name: '정철민', loginId: 'chulmin.jung', org: 'DEPT-FRAN', position: '본부장' },
  { name: '김준영', loginId: 'junyoung.kim', org: 'DEPT-FRAN', position: '부장' },
  { name: '곽성수', loginId: 'sungsoo.kwak', org: 'DEPT-FRAN', position: '과장' },
  { name: '최봉준', loginId: 'bongjun.choi', org: 'DEPT-FRAN', position: '대리' },
  { name: '이경철', loginId: 'kyungchul.lee', org: 'DEPT-B2B', position: '부장' },
  { name: '주미선', loginId: 'misun.joo', org: 'DEPT-HOME', position: '부장' },
  { name: '허윤무', loginId: 'yunmu.heo', org: 'DEPT-HOME', position: '실장' },
  { name: '최동희', loginId: 'donghee.choi', org: 'DEPT-HOME', position: '실장' },
  { name: '안수지', loginId: 'suji.ahn', org: 'DEPT-HOME', position: '사원' },
  { name: '권기영', loginId: 'kiyoung.kwon', org: 'DEPT-HOME', position: '사원' },
  { name: '김미영', loginId: 'miyoung.kim', org: 'DEPT-CS', position: '과장' },
  { name: '노은주', loginId: 'eunju.noh', org: 'DEPT-CS', position: '과장' },
  { name: '김은혜', loginId: 'eunhye.kim', org: 'DEPT-CS', position: '대리' },
  { name: '임기숙', loginId: 'kisook.lim', org: 'DEPT-CS', position: '사원' },
  { name: '이명원', loginId: 'myungwon.lee', org: 'DEPT-CS', position: '사원' },
  { name: '김미선', loginId: 'misun.kim', org: 'DEPT-CS', position: '팀장' },
  { name: '전지숙', loginId: 'jisook.jeon', org: 'DEPT-DESIGN', position: '실장' },
  { name: '왕채은', loginId: 'chaeeun.wang', org: 'DEPT-DESIGN', position: '사원' },
  { name: '정주연', loginId: 'juyeon.jung', org: 'DEPT-DESIGN', position: '사원' },
  { name: '송승호', loginId: 'seungho.song', org: 'DEPT-MKT', position: '팀장' },
  { name: '김수빈', loginId: 'subin.kim', org: 'DEPT-MKT', position: '사원' },
  { name: '피규열', loginId: 'kyuyeol.pi', org: 'DEPT-MOVEJE', position: '팀장' },
  { name: '김태원', loginId: 'taewon.kim', org: 'DEPT-MOVEJE', position: '과장' },
  { name: '오태환', loginId: 'taehwan.oh', org: 'DEPT-PARTNER', position: '과장' },
  { name: '신민근', loginId: 'mingeun.shin', org: 'DEPT-REALTY', position: '소장' },
];

/** '본사 직원' 권한 그룹 — 업무 메뉴 전부. 계정·권한·감사로그·AI 관리·조직/공통코드 수정·인사는 뺀다(관리자 몫) */
const HQ_ROLE_CODE = 'HQ_STAFF';
const HQ_EXCLUDE = [
  /^USER\./,
  /^ROLE\./,
  /^HR\./,
  /^AUDIT\./,
  /^AI\.MANAGE$/,
  /^(ORG_UNIT|COMMON_CODE|EMPLOYEE)\.(CREATE|UPDATE|DELETE)$/,
];

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

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
      update: { name: d.name, parentId, isActive: true },
      create: { code: d.code, name: d.name, type: 'DEPT', parentId },
    });
    orgId.set(d.code, row.id);
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
  if (!superAdmin)
    throw new Error('슈퍼관리자 역할이 없다 — API를 한 번 띄워 기본 시더를 돌려야 한다');
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

  // ── 직원·계정 ──
  for (const [i, p] of PEOPLE.entries()) {
    const empNo = `${HIRE_YEAR}${String(i + 1).padStart(4, '0')}`;
    const data = {
      name: p.name,
      orgUnitId: orgId.get(p.org)!,
      positionId: positionId.get(p.position) ?? null,
      hireDate: HIRE_DATE,
      isActive: true,
    };
    const emp = await prisma.employee.upsert({
      where: { empNo },
      update: data,
      create: { empNo, ...data },
    });
    const user = await prisma.appUser.upsert({
      where: { loginId: p.loginId },
      update: { employeeId: emp.id, isActive: true },
      create: {
        loginId: p.loginId,
        passwordHash: hash,
        employeeId: emp.id,
        principalType: 'HUMAN',
      },
    });
    const roleId = p.admin ? superAdmin.id : hqRole.id;
    await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: { not: roleId } } });
    if (!(await prisma.userRole.findFirst({ where: { userId: user.id, roleId } }))) {
      await prisma.userRole.create({ data: { userId: user.id, roleId, dataScope: 'ALL' } });
    }
  }

  // ── 예전 본사 계정·조직 정리 ──
  // 시연용 관리자 계정. 지울 수 없는 기록(작업 사진 등)이 걸려 있으면 끄기만 한다
  const old = await prisma.appUser.findUnique({ where: { loginId: 'demo.admin' } });
  if (old) {
    try {
      await prisma.appUser.delete({ where: { id: old.id } });
    } catch {
      await prisma.appUser.update({ where: { id: old.id }, data: { isActive: false } });
    }
  }
  // 시스템관리자(admin)는 그룹 직속, 직책 없음 — 실제 사람(대표이사)과 헷갈리지 않게
  await prisma.employee.updateMany({
    where: { empNo: 'SYSADMIN' },
    data: { orgUnitId: group.id, positionId: null },
  });
  // 임시 '본사' 조직 — 걸린 기록은 법인으로 옮기고 지운다
  const office = await prisma.orgUnit.findUnique({ where: { code: 'HQ-OFFICE' } });
  if (office) {
    const from = office.id;
    const to = company.id;
    await prisma.$transaction([
      prisma.employee.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.lead.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.estimate.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.contract.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.workOrder.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.invoice.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.materialOrder.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.calendarEvent.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.commissionRule.updateMany({ where: { orgUnitId: from }, data: { orgUnitId: to } }),
      prisma.customer.updateMany({ where: { ownerOrgId: from }, data: { ownerOrgId: to } }),
      prisma.product.updateMany({ where: { brandOrgId: from }, data: { brandOrgId: to } }),
      prisma.userRole.updateMany({ where: { orgScopeId: from }, data: { orgScopeId: to } }),
      prisma.orgUnit.updateMany({ where: { parentId: from }, data: { parentId: to } }),
      prisma.orgUnit.delete({ where: { id: from } }),
    ]);
  }

  console.log(
    `조직도: 본사 조직 ${DEPTS.length}개, 본사 직원·계정 ${PEOPLE.length}명 (비밀번호 ${DEMO_PASSWORD})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
