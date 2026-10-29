/**
 * 메뉴 구성 — 대표님 + 본사 7개 팀 + 가맹점(지점) + 기본(전체).
 *
 *   pnpm --filter @tongin/api demo:seed:menus
 *
 * - 같은 이름의 구성이 이미 있으면 건드리지 않는다(관리자가 고친 내용 보존). 적용 대상만 비어 있으면 채운다.
 * - 팀 = 조직도의 부서(DEPT)에 건다 — 그 부서와 하위 조직 직원에게 적용된다.
 * - 대표님 = 직책(회장·대표이사·대표)에 건다. 우선순위가 가장 높아 소속 구성보다 앞선다.
 * - 메뉴가 구성에 있어도 권한이 없으면 안 보인다(권한은 계정·권한 메뉴에서).
 *   그래서 팀 전용 메뉴(계약·자산, 지점 관리 기록, 공지 작성)는 팀 권한 그룹을 만들어 그 부서 계정에 붙인다
 *   — 그룹이 이미 있으면 권한은 건드리지 않고(관리자 수정 보존), 아직 안 붙은 계정에만 붙인다.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  DEFAULT_MENU_LAYOUT,
  ROLE_FRANCHISE,
  normalizeLayout,
  type MenuLayout,
} from '@tongin/shared';

const prisma = new PrismaClient();

const MY = { label: '내 업무', items: ['approvals', 'leave', 'attendance'], collapsed: true };

interface Spec {
  name: string;
  description: string;
  priority: number;
  orgs?: string[];
  positions?: string[];
  roles?: string[];
  /** 계정(로그인 아이디) 직접 지정 — 소속은 다르지만 이 팀 메뉴가 필요한 사람 */
  users?: string[];
  isDefault?: boolean;
  layout: MenuLayout;
}

const SPECS: Spec[] = [
  {
    name: '대표님',
    description: '전사 실적·결재·조직을 한눈에 — 회장·대표이사·대표 직책',
    priority: 10,
    positions: ['회장', '대표이사', '대표'],
    layout: {
      groups: [
        { label: '경영 현황', items: ['dashboard', 'ai', 'notices'] },
        { label: '결재·업무', items: ['approvals', 'tasks'] },
        { label: '영업 현황', items: ['leads', 'calendar', 'payments-confirm', 'support'] },
        { label: '경영관리', items: ['settlements', 'billing', 'hr', 'assets'] },
        {
          label: '조직·지점',
          items: ['branches', 'branch-cases', 'org-mgmt', 'accounts'],
          collapsed: true,
        },
      ],
    },
  },
  {
    name: '경영관리팀',
    description: '정산·미수금·인사·총무(계약·자산)',
    priority: 50,
    orgs: ['경영관리'],
    layout: {
      groups: [
        { label: '홈', items: ['dashboard', 'ai', 'notices', 'tasks'] },
        {
          label: '정산·회계',
          items: ['settlements', 'payments-confirm', 'billing', 'material-orders', 'materials'],
        },
        { label: '인사·총무', items: ['hr', 'assets', 'approvals', 'leave', 'attendance'] },
        {
          label: '관리',
          items: [
            'branches',
            'partner-mgmt',
            'accounts',
            'org-mgmt',
            'menu-mgmt',
            'dashboard-admin',
          ],
          collapsed: true,
        },
      ],
    },
  },
  {
    name: '고객관리팀',
    description: '접수 상담·클레임/A/S·리빙케어·고객 문자',
    priority: 50,
    orgs: ['고객관리부'],
    layout: {
      groups: [
        { label: '홈', items: ['dashboard', 'ai', 'notices', 'tasks'] },
        {
          label: '고객 응대',
          items: ['leads', 'support', 'service-orders', 'customers', 'calendar'],
        },
        { label: '입금·안내', items: ['payments-confirm', 'campaigns'] },
        { label: '기준정보', items: ['product-mgmt', 'partner-mgmt'], collapsed: true },
        MY,
      ],
    },
  },
  {
    name: '기업영업팀',
    description: '기업 이전 영업·견적·파트너',
    priority: 50,
    orgs: ['기업영업'],
    users: ['minkeun_shin'], // 부동산사업부 신민근 소장 — 기업 영업도 함께 본다
    layout: {
      groups: [
        { label: '홈', items: ['dashboard', 'ai', 'notices', 'tasks'] },
        {
          label: '기업 영업',
          items: ['leads', 'customers', 'calendar', 'payments-confirm', 'support'],
        },
        { label: '파트너·기준', items: ['partner-mgmt', 'product-mgmt'] },
        MY,
      ],
    },
  },
  {
    name: '통인TF팀',
    description: '무브제·전속제휴 — 사업별 추진 업무 중심',
    priority: 50,
    orgs: ['무브제', '전속제휴', '통인TF'], // 통인TF(TF 조직)를 만들면 겸직으로 모인 사람에게도
    layout: {
      groups: [
        { label: '홈', items: ['dashboard', 'ai', 'notices'] },
        { label: '사업 추진', items: ['tasks', 'leads', 'service-orders', 'campaigns'] },
        { label: '제휴', items: ['partner-mgmt', 'customers'] },
        MY,
      ],
    },
  },
  {
    name: '가맹팀',
    description: '지점(가맹점) 관리·점검 기록·발주·지점 정산',
    priority: 50,
    orgs: ['가맹'],
    layout: {
      groups: [
        { label: '홈', items: ['dashboard', 'ai', 'notices', 'tasks'] },
        {
          label: '가맹 관리',
          items: ['branches', 'branch-cases', 'material-orders', 'materials', 'settlements'],
        },
        { label: '현장·고객', items: ['support', 'leads', 'calendar'] },
        MY,
      ],
    },
  },
  {
    name: '홍보디자인팀',
    description: '디자인·홍보 요청 처리와 마케팅 캠페인',
    priority: 50,
    orgs: ['디자인', '마케팅'],
    layout: {
      groups: [
        { label: '홈', items: ['dashboard', 'ai', 'notices'] },
        { label: '디자인·홍보', items: ['tasks', 'campaigns', 'branches'] },
        MY,
      ],
    },
  },
  {
    name: '홈플래너팀',
    description: '방문 견적·상담·계약 — 접수와 일정 중심',
    priority: 50,
    orgs: ['홈플래너'],
    layout: {
      groups: [
        { label: '홈', items: ['dashboard', 'ai', 'notices', 'tasks'] },
        { label: '상담·견적', items: ['leads', 'calendar', 'customers', 'payments-confirm'] },
        { label: '서비스', items: ['service-orders', 'support'] },
        MY,
      ],
    },
  },
  {
    name: '가맹점(지점)',
    description: '지점 계정 — 접수·일정·입금·자재 발주',
    priority: 60,
    roles: [ROLE_FRANCHISE],
    layout: {
      groups: [
        {
          label: '운영',
          items: [
            'dashboard',
            'ai',
            'leads',
            'calendar',
            'payments-confirm',
            'service-orders',
            'support',
          ],
        },
        { label: '자재', items: ['materials', 'material-orders'] },
        { label: '본사 소통', items: ['notices', 'tasks'] },
      ],
    },
  },
  {
    name: '기본(전체 메뉴)',
    description: '어느 구성에도 걸리지 않는 계정에 보이는 기본 메뉴',
    priority: 999,
    isDefault: true,
    layout: DEFAULT_MENU_LAYOUT,
  },
];

/** 팀 전용 업무 권한 그룹 — 본사 직원 그룹(공통)에 더해 그 부서 계정에만 준다 */
const TEAM_ROLES = [
  {
    code: 'TEAM_MGMT',
    name: '경영관리팀 업무',
    description:
      '인사(인사·평가·휴가·근태 정책, 결재 양식·결재선), 총무(계약·자산 관리), 전사 공지 작성',
    orgs: ['경영관리'],
    perms: [
      'HR.READ',
      'HR.CREATE',
      'HR.UPDATE',
      'HR.DELETE',
      'LEAVE.READ',
      'LEAVE.UPDATE',
      'ATTENDANCE.READ',
      'ATTENDANCE.UPDATE',
      'ATTENDANCE.IMPORT',
      'APPROVAL.MANAGE',
      'ASSET.READ',
      'ASSET.CREATE',
      'ASSET.UPDATE',
      'ASSET.DELETE',
      'NOTICE.CREATE',
      'NOTICE.UPDATE',
      'NOTICE.DELETE',
    ],
  },
  {
    code: 'TEAM_FRANCHISE',
    name: '가맹팀 업무',
    description: '지점 관리 기록(점검·불법영업·보험·소송·재계약)과 지점 공지',
    orgs: ['가맹'],
    perms: [
      'BRANCH_CASE.READ',
      'BRANCH_CASE.CREATE',
      'BRANCH_CASE.UPDATE',
      'BRANCH_CASE.DELETE',
      'NOTICE.CREATE',
      'NOTICE.UPDATE',
    ],
  },
];

async function seedTeamRoles(orgId: Map<string, string>) {
  for (const t of TEAM_ROLES) {
    let role = await prisma.role.findUnique({ where: { code: t.code } });
    if (!role) {
      role = await prisma.role.create({
        data: { code: t.code, name: t.name, description: t.description, sortOrder: 60 },
      });
      const perms = await prisma.permission.findMany({ where: { code: { in: t.perms } } });
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: role!.id, permissionId: p.id })),
        skipDuplicates: true,
      });
      console.log(`권한 그룹 '${t.name}' 만듦 — 권한 ${perms.length}개`);
    }
    const orgIds = t.orgs.map((n) => orgId.get(n)).filter((x): x is string => !!x);
    const users = await prisma.appUser.findMany({
      where: { employee: { orgUnitId: { in: orgIds } }, userRoles: { none: { roleId: role.id } } },
      select: { id: true },
    });
    if (users.length) {
      await prisma.userRole.createMany({
        data: users.map((u) => ({ userId: u.id, roleId: role!.id, dataScope: 'ALL' })),
      });
    }
    console.log(`권한 그룹 '${t.name}' — 계정 ${users.length}개에 새로 붙임`);
  }
}

async function main() {
  const [orgs, positions, roles, users] = await Promise.all([
    prisma.orgUnit.findMany({
      where: { type: { not: 'BRANCH' } },
      select: { id: true, name: true },
    }),
    prisma.position.findMany({ select: { id: true, name: true } }),
    prisma.role.findMany({ select: { id: true, code: true } }),
    prisma.appUser.findMany({ select: { id: true, loginId: true } }),
  ]);
  const userId = new Map(users.map((u) => [u.loginId, u.id]));
  const orgId = new Map(orgs.map((o) => [o.name, o.id]));
  const posId = new Map(positions.map((p) => [p.name, p.id]));
  const roleId = new Map(roles.map((r) => [r.code, r.id]));
  await seedTeamRoles(orgId);

  for (const s of SPECS) {
    const targets = [
      ...(s.orgs ?? []).map((n) => ({ kind: 'ORG', targetId: orgId.get(n) })),
      ...(s.positions ?? []).map((n) => ({ kind: 'POSITION', targetId: posId.get(n) })),
      ...(s.roles ?? []).map((c) => ({ kind: 'ROLE', targetId: roleId.get(c) })),
      ...(s.users ?? []).map((l) => ({ kind: 'USER', targetId: userId.get(l) })),
    ].filter((t): t is { kind: string; targetId: string } => !!t.targetId);
    const missing =
      (s.orgs?.length ?? 0) +
      (s.positions?.length ?? 0) +
      (s.roles?.length ?? 0) +
      (s.users?.length ?? 0) -
      targets.length;
    if (missing) console.warn(`'${s.name}' — 조직도에 없는 대상 ${missing}개는 건너뜀`);

    const existing = await prisma.menuProfile.findFirst({
      where: { name: s.name },
      include: { targets: true },
    });
    if (existing) {
      if (!existing.targets.length && targets.length) {
        await prisma.menuProfileTarget.createMany({
          data: targets.map((t) => ({ ...t, profileId: existing.id })),
          skipDuplicates: true,
        });
        console.log(`메뉴 구성 '${s.name}' — 이미 있음, 적용 대상 ${targets.length}개만 채움`);
      } else console.log(`메뉴 구성 '${s.name}' — 이미 있음(건너뜀)`);
      continue;
    }
    if (s.isDefault && (await prisma.menuProfile.count({ where: { isDefault: true } }))) {
      console.log(`메뉴 구성 '${s.name}' — 다른 기본 구성이 있어 건너뜀`);
      continue;
    }
    await prisma.menuProfile.create({
      data: {
        name: s.name,
        description: s.description,
        priority: s.priority,
        isDefault: !!s.isDefault,
        layout: normalizeLayout(s.layout) as unknown as Prisma.InputJsonValue,
        targets: { create: targets },
      },
    });
    console.log(`메뉴 구성 '${s.name}' 만듦 — 대상 ${targets.length}개`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
