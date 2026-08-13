/**
 * 데모 데이터 시드 — 조직(지점)·직원·계정·전속업체.
 *
 * 앱 부팅 시더(seeder.service.ts)와 분리한 이유: 그쪽은 권한·역할·관리자처럼
 * 어느 환경에나 있어야 하는 것만 만든다. 데모 데이터는 원할 때만 넣는다.
 *
 *   pnpm --filter @tongin/api demo:seed                  # .env 의 DATABASE_URL
 *   DATABASE_URL="postgresql://..." pnpm --filter @tongin/api demo:seed
 *
 * 멱등하다 — 코드(code)·로그인ID 기준 upsert 라 여러 번 돌려도 중복이 생기지 않는다.
 * 기존 데이터를 지우지 않으므로 운영 DB에 실행해도 파괴적이지 않다.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_FIELD, ROLE_FRANCHISE, ROLE_OUTSOURCE } from '@tongin/shared';

const prisma = new PrismaClient();

/** 데모 계정 공통 비밀번호. 운영에 데모를 넣을 일은 없지만, 넣더라도 바꿔 쓰라고 env 로 뺀다. */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'tongin1234';

// ── 조직 ──────────────────────────────────────────────
// 그룹사 > 법인 > 지점. 설계노트의 4단계(그룹/법인/지점/외부업체) 구조를 따른다.
const BRANCHES = [
  { code: 'BR-GN', name: '강남점' },
  { code: 'BR-SP', name: '송파점' },
  { code: 'BR-BD', name: '분당점' },
  { code: 'BR-IS', name: '일산점' },
  { code: 'BR-BS', name: '부산점' },
];

// ── 전속업체(외부) ────────────────────────────────────
const PARTNERS = [
  { code: 'OS-HANIL', name: '한일운수', phone: '010-4411-2201', type: 'OUTSOURCE' },
  { code: 'OS-DAEYANG', name: '대양물류', phone: '010-4411-2202', type: 'OUTSOURCE' },
  { code: 'B2B-LGU', name: 'LG유플러스', phone: '010-4411-2203', type: 'B2B_CLIENT' },
];

/**
 * 직원 10명.
 * role: 지점장(가맹점 권한, 지점 전체 조회) / 견적(견적사원) / 현장(작업팀)
 */
const EMPLOYEES = [
  { empNo: 'E1001', name: '김성호', branch: 'BR-GN', phone: '010-2201-1001', role: '지점장' },
  { empNo: 'E1002', name: '이재훈', branch: 'BR-GN', phone: '010-2201-1002', role: '견적' },
  { empNo: 'E1003', name: '박민수', branch: 'BR-GN', phone: '010-2201-1003', role: '현장' },
  { empNo: 'E1004', name: '정우진', branch: 'BR-SP', phone: '010-2201-1004', role: '지점장' },
  { empNo: 'E1005', name: '최동혁', branch: 'BR-SP', phone: '010-2201-1005', role: '현장' },
  { empNo: 'E1006', name: '한지원', branch: 'BR-BD', phone: '010-2201-1006', role: '지점장' },
  { empNo: 'E1007', name: '오세영', branch: 'BR-BD', phone: '010-2201-1007', role: '견적' },
  { empNo: 'E1008', name: '윤태경', branch: 'BR-IS', phone: '010-2201-1008', role: '지점장' },
  { empNo: 'E1009', name: '강현우', branch: 'BR-IS', phone: '010-2201-1009', role: '현장' },
  { empNo: 'E1010', name: '서준호', branch: 'BR-BS', phone: '010-2201-1010', role: '지점장' },
];

/** 계정을 만들 직원 — 전부에게 계정을 주지는 않는다(현실도 그렇다). */
const ACCOUNTS: { empNo: string; loginId: string; role: string; dataScope: 'ORG' | 'OWN' }[] = [
  // 지점장: 소속 지점(+하위) 전체 조회
  { empNo: 'E1001', loginId: 'gn.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  { empNo: 'E1004', loginId: 'sp.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  { empNo: 'E1006', loginId: 'bd.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  { empNo: 'E1008', loginId: 'is.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  { empNo: 'E1010', loginId: 'bs.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  // 현장 작업팀: 본인 배정 작업만. 로그인하면 /field 로 들어간다
  { empNo: 'E1003', loginId: 'gn.field', role: ROLE_FIELD, dataScope: 'OWN' },
  { empNo: 'E1005', loginId: 'sp.field', role: ROLE_FIELD, dataScope: 'OWN' },
  { empNo: 'E1009', loginId: 'is.field', role: ROLE_FIELD, dataScope: 'OWN' },
];

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── 조직 계층 ──
  const group = await prisma.orgUnit.upsert({
    where: { code: 'HQ' },
    update: { name: '통인익스프레스' },
    create: { code: 'HQ', name: '통인익스프레스', type: 'GROUP' },
  });
  const company = await prisma.orgUnit.upsert({
    where: { code: 'CO-MOVING' },
    update: { name: '통인익스프레스(이사)', parentId: group.id },
    create: {
      code: 'CO-MOVING',
      name: '통인익스프레스(이사)',
      type: 'COMPANY',
      parentId: group.id,
    },
  });

  const branchByCode = new Map<string, string>();
  for (const b of BRANCHES) {
    const row = await prisma.orgUnit.upsert({
      where: { code: b.code },
      update: { name: b.name, parentId: company.id },
      create: { code: b.code, name: b.name, type: 'BRANCH', parentId: company.id },
    });
    branchByCode.set(b.code, row.id);
  }
  console.log(`조직: 그룹1 + 법인1 + 지점${BRANCHES.length}`);

  // ── 전속업체 ──
  // 조직단위(PARTNER)와 거래처(Partner)를 함께 만든다.
  // 조직단위는 스코프·계층용, 거래처는 작업 배정·정산용으로 쓰인다.
  const partnerByCode = new Map<string, string>();
  for (const p of PARTNERS) {
    const row = await prisma.partner.upsert({
      where: { code: p.code },
      update: { name: p.name, phone: p.phone, type: p.type },
      create: { code: p.code, name: p.name, phone: p.phone, type: p.type },
    });
    partnerByCode.set(p.code, row.id);
    if (p.type === 'OUTSOURCE') {
      await prisma.orgUnit.upsert({
        where: { code: `ORG-${p.code}` },
        update: { name: p.name, parentId: group.id },
        create: { code: `ORG-${p.code}`, name: p.name, type: 'PARTNER', parentId: group.id },
      });
    }
  }
  console.log(`거래처: ${PARTNERS.length}개 (전속 2, 기업고객 1)`);

  // ── 직원 ──
  const empByNo = new Map<string, string>();
  for (const e of EMPLOYEES) {
    const orgUnitId = branchByCode.get(e.branch);
    if (!orgUnitId) continue;
    const row = await prisma.employee.upsert({
      where: { empNo: e.empNo },
      update: { name: e.name, phone: e.phone, orgUnitId },
      create: { empNo: e.empNo, name: e.name, phone: e.phone, orgUnitId },
    });
    empByNo.set(e.empNo, row.id);
  }
  console.log(`직원: ${EMPLOYEES.length}명`);

  // ── 계정 ──
  const roleIdByCode = new Map<string, string>();
  for (const code of [ROLE_FRANCHISE, ROLE_FIELD, ROLE_OUTSOURCE]) {
    const r = await prisma.role.findUnique({ where: { code } });
    if (r) roleIdByCode.set(code, r.id);
    else console.warn(`역할 ${code} 이 없다 — API를 한 번 띄워 기본 시더를 돌려야 한다`);
  }

  const empBranch = new Map(EMPLOYEES.map((e) => [e.empNo, e.branch]));
  for (const a of ACCOUNTS) {
    const employeeId = empByNo.get(a.empNo);
    const roleId = roleIdByCode.get(a.role);
    if (!employeeId || !roleId) continue;
    const user = await prisma.appUser.upsert({
      where: { loginId: a.loginId },
      update: { employeeId, isActive: true },
      create: { loginId: a.loginId, passwordHash: hash, employeeId, principalType: 'HUMAN' },
    });
    const orgScopeId = branchByCode.get(empBranch.get(a.empNo) ?? '') ?? null;
    const exists = await prisma.userRole.findFirst({ where: { userId: user.id, roleId } });
    if (!exists) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId, orgScopeId, dataScope: a.dataScope },
      });
    }
  }

  // ── 전속업체 계정 (직원이 아니라 외부인 — employeeId 없이 partnerId 로 범위 제한) ──
  const outsourceRoleId = roleIdByCode.get(ROLE_OUTSOURCE);
  if (outsourceRoleId) {
    for (const p of PARTNERS.filter((x) => x.type === 'OUTSOURCE')) {
      const partnerId = partnerByCode.get(p.code);
      if (!partnerId) continue;
      const loginId = `${p.code.replace('OS-', '').toLowerCase()}.partner`;
      const user = await prisma.appUser.upsert({
        where: { loginId },
        update: { partnerId, isExternal: true, isActive: true },
        create: {
          loginId,
          passwordHash: hash,
          partnerId,
          isExternal: true,
          principalType: 'HUMAN',
        },
      });
      const exists = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: outsourceRoleId },
      });
      if (!exists) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: outsourceRoleId, dataScope: 'OWN' },
        });
      }
    }
  }

  const accountCount = await prisma.appUser.count();
  console.log(`계정: 지점장 5 + 현장 3 + 전속업체 2 (전체 ${accountCount}개, admin 포함)`);
  console.log(`\n데모 계정 비밀번호: ${DEMO_PASSWORD}`);
  console.log('  지점장  gn.manager / sp.manager / bd.manager / is.manager / bs.manager');
  console.log('  현장    gn.field / sp.field / is.field   → 로그인 시 현장 화면으로');
  console.log('  전속업체 hanil.partner / daeyang.partner → 본인 소속 작업만');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
