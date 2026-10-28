/**
 * 데모 데이터 시드 — 조직(지점)·직원·계정·전속업체. 본사 부서·본사 직원은 seed-demo-org.ts(실제 조직도).
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
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'tongin1234!';

// ── 조직 ──────────────────────────────────────────────
// 그룹사 > 법인 > 지점. 설계노트의 4단계(그룹/법인/지점/외부업체) 구조를 따른다.
// 위치는 구(區) 중심 좌표 — 대시보드 지도에 지점 점을 찍는 데 쓴다(실제 주소는 조직관리에서 검색해 고친다)
const BRANCHES = [
  { code: 'BR-GN', name: '강남점', sido: '서울', sigungu: '강남구', lat: 37.5172, lng: 127.0473 },
  { code: 'BR-SP', name: '송파점', sido: '서울', sigungu: '송파구', lat: 37.5145, lng: 127.1059 },
  {
    code: 'BR-BD',
    name: '분당점',
    sido: '경기',
    sigungu: '성남시 분당구',
    lat: 37.3827,
    lng: 127.1189,
  },
  {
    code: 'BR-IS',
    name: '일산점',
    sido: '경기',
    sigungu: '고양시 일산동구',
    lat: 37.6584,
    lng: 126.7748,
  },
  { code: 'BR-BS', name: '부산점', sido: '부산', sigungu: '해운대구', lat: 35.1631, lng: 129.1636 },
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
/** 사번 = 입사연도 4자리 + 그 해 일련번호 4자리(앱의 사번 자동 생성 규칙과 같다). 이 10명은 2019년 입사 */
const HIRE_DATE = new Date('2019-03-04T00:00:00Z');
const EMPLOYEES = [
  { empNo: '20190001', name: '김성호', branch: 'BR-GN', phone: '010-2201-1001', role: '지점장' },
  { empNo: '20190002', name: '이재훈', branch: 'BR-GN', phone: '010-2201-1002', role: '견적' },
  { empNo: '20190003', name: '박민수', branch: 'BR-GN', phone: '010-2201-1003', role: '현장' },
  { empNo: '20190004', name: '정우진', branch: 'BR-SP', phone: '010-2201-1004', role: '지점장' },
  { empNo: '20190005', name: '최동혁', branch: 'BR-SP', phone: '010-2201-1005', role: '현장' },
  { empNo: '20190006', name: '한지원', branch: 'BR-BD', phone: '010-2201-1006', role: '지점장' },
  { empNo: '20190007', name: '오세영', branch: 'BR-BD', phone: '010-2201-1007', role: '견적' },
  { empNo: '20190008', name: '윤태경', branch: 'BR-IS', phone: '010-2201-1008', role: '지점장' },
  { empNo: '20190009', name: '강현우', branch: 'BR-IS', phone: '010-2201-1009', role: '현장' },
  { empNo: '20190010', name: '서준호', branch: 'BR-BS', phone: '010-2201-1010', role: '지점장' },
];

/** 계정을 만들 직원 — 전부에게 계정을 주지는 않는다(현실도 그렇다). */
/** 데모 직원 업무 → 직책 */
const DEMO_POSITION: Record<string, string> = { 지점장: '지점장', 견적: '과장', 현장: '현장팀장' };

const ACCOUNTS: { empNo: string; loginId: string; role: string; dataScope: 'ORG' | 'OWN' }[] = [
  // 지점장: 소속 지점(+하위) 전체 조회
  { empNo: '20190001', loginId: 'gn.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  { empNo: '20190004', loginId: 'sp.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  { empNo: '20190006', loginId: 'bd.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  { empNo: '20190008', loginId: 'is.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  { empNo: '20190010', loginId: 'bs.manager', role: ROLE_FRANCHISE, dataScope: 'ORG' },
  // 현장 작업팀: 본인 배정 작업만. 로그인하면 /field 로 들어간다
  { empNo: '20190003', loginId: 'gn.field', role: ROLE_FIELD, dataScope: 'OWN' },
  { empNo: '20190005', loginId: 'sp.field', role: ROLE_FIELD, dataScope: 'OWN' },
  { empNo: '20190009', loginId: 'is.field', role: ROLE_FIELD, dataScope: 'OWN' },
];

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── 조직 계층 ──
  const group = await prisma.orgUnit.upsert({
    where: { code: 'HQ' },
    update: { name: '통인그룹' },
    create: { code: 'HQ', name: '통인그룹', type: 'GROUP' },
  });
  const company = await prisma.orgUnit.upsert({
    where: { code: 'CO-MOVING' },
    update: { name: '통인익스프레스', parentId: group.id },
    create: {
      code: 'CO-MOVING',
      name: '통인익스프레스',
      type: 'COMPANY',
      parentId: group.id,
    },
  });

  const branchByCode = new Map<string, string>();
  for (const b of BRANCHES) {
    const loc = {
      sido: b.sido,
      sigungu: b.sigungu,
      addr: `${b.sido} ${b.sigungu}`,
      lat: b.lat,
      lng: b.lng,
    };
    const row = await prisma.orgUnit.upsert({
      where: { code: b.code },
      update: { name: b.name, parentId: company.id },
      create: { code: b.code, name: b.name, type: 'BRANCH', parentId: company.id, ...loc },
    });
    branchByCode.set(b.code, row.id);
  }
  console.log(`조직: 그룹1 + 법인1 + 지점${BRANCHES.length}`);

  // ── 거래처(전속업체·기업고객) — 외부업체는 조직이 아니라 거래처로만 둔다(작업 배정·정산·외부 계정 범위) ──
  const partnerByCode = new Map<string, string>();
  for (const p of PARTNERS) {
    const row = await prisma.partner.upsert({
      where: { code: p.code },
      update: { name: p.name, phone: p.phone, type: p.type },
      create: { code: p.code, name: p.name, phone: p.phone, type: p.type },
    });
    partnerByCode.set(p.code, row.id);
  }
  console.log(`거래처: ${PARTNERS.length}개 (전속 2, 기업고객 1)`);

  // ── 직원 ──
  // 직책은 업무로 정한다(지점장→지점장, 견적→과장, 현장→현장팀장). 관리자가 바꾼 직책은 덮어쓰지 않는다
  const positionIdByName = new Map<string, string>();
  for (const name of new Set(Object.values(DEMO_POSITION))) {
    const pos = await prisma.position.upsert({ where: { name }, update: {}, create: { name } });
    positionIdByName.set(name, pos.id);
  }
  const empByNo = new Map<string, string>();
  for (const e of EMPLOYEES) {
    const orgUnitId = branchByCode.get(e.branch);
    if (!orgUnitId) continue;
    const positionId = positionIdByName.get(DEMO_POSITION[e.role] ?? '') ?? null;
    const row = await prisma.employee.upsert({
      where: { empNo: e.empNo },
      update: { name: e.name, phone: e.phone, orgUnitId, hireDate: HIRE_DATE },
      create: {
        empNo: e.empNo,
        name: e.name,
        phone: e.phone,
        orgUnitId,
        positionId,
        hireDate: HIRE_DATE,
      },
    });
    if (!row.positionId && positionId) {
      await prisma.employee.update({ where: { id: row.id }, data: { positionId } });
    }
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
