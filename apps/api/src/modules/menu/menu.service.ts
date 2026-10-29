import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_MENU_LAYOUT,
  MENU_CATALOG,
  PERMISSION_WILDCARD,
  applyPersonal,
  layoutKeys,
  mergeLayouts,
  normalizeLayout,
  type AuthPrincipal,
  type MenuLayout,
  type MenuTargetKind,
  type PersonalMenuLayout,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface MenuTargetInput {
  kind: MenuTargetKind;
  targetId: string;
}
export interface MenuProfileInput {
  name?: string;
  description?: string | null;
  layout?: MenuLayout;
  priority?: number;
  isDefault?: boolean;
  isActive?: boolean;
  targets?: MenuTargetInput[];
}

/** 슈퍼관리자는 전체 메뉴를 기준으로 쓴다(메뉴 관리 화면을 잃지 않게) */
const FULL_LAYOUT: MenuLayout = mergeLayouts([
  DEFAULT_MENU_LAYOUT,
  { groups: [{ label: '기타', items: MENU_CATALOG.map((m) => m.key) }] },
]);

const asLayout = (v: Prisma.JsonValue): MenuLayout => normalizeLayout(v as unknown as MenuLayout);

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 내 메뉴 ──

  /** 이 사용자에게 걸리는 구성들(우선순위 순) */
  private async matchedProfiles(userId: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        userRoles: { select: { roleId: true } },
        employee: {
          select: {
            orgUnitId: true,
            positionId: true,
            concurrentOrgs: { select: { orgUnitId: true } },
          },
        },
      },
    });
    if (!user) return [];
    // 겸직(추가 소속) 조직의 구성도 함께 걸린다 — 여러 구성은 합쳐서 보인다
    const orgIds = user.employee
      ? [
          ...new Set(
            (
              await Promise.all(
                [
                  user.employee.orgUnitId,
                  ...user.employee.concurrentOrgs.map((c) => c.orgUnitId),
                ].map((id) => this.orgChain(id)),
              )
            ).flat(),
          ),
        ]
      : [];
    const or: Prisma.MenuProfileTargetWhereInput[] = [{ kind: 'USER', targetId: userId }];
    const roleIds = user.userRoles.map((r) => r.roleId);
    if (roleIds.length) or.push({ kind: 'ROLE', targetId: { in: roleIds } });
    if (user.employee?.positionId)
      or.push({ kind: 'POSITION', targetId: user.employee.positionId });
    if (orgIds.length) or.push({ kind: 'ORG', targetId: { in: orgIds } });
    return this.prisma.menuProfile.findMany({
      where: { isActive: true, targets: { some: { OR: or } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** 소속 조직과 그 상위 조직들 — '경영관리' 구성을 걸면 그 아래 팀에도 걸린다 */
  private async orgChain(orgUnitId: string): Promise<string[]> {
    const all = await this.prisma.orgUnit.findMany({ select: { id: true, parentId: true } });
    const parent = new Map(all.map((o) => [o.id, o.parentId]));
    const chain: string[] = [];
    let cur: string | null | undefined = orgUnitId;
    while (cur && !chain.includes(cur)) {
      chain.push(cur);
      cur = parent.get(cur);
    }
    return chain;
  }

  /** 관리자 구성만으로 정한 기준 메뉴(개인 설정 전) */
  /**
   * 관리자 구성만으로 정한 기준 메뉴(개인 설정 전) + 개인이 꺼내 쓸 수 있는 메뉴(pool).
   * 슈퍼관리자도 걸린 구성(예: 대표님)을 따르되, 구성이 없으면 전체 메뉴이고 pool은 늘 카탈로그 전체다
   * (메뉴 관리 화면을 잃지 않게).
   */
  async baseLayout(principal: Pick<AuthPrincipal, 'userId' | 'permissions'>) {
    const wildcard = principal.permissions.includes(PERMISSION_WILDCARD);
    const matched = await this.matchedProfiles(principal.userId);
    let layout: MenuLayout;
    let profiles: { id: string; name: string }[];
    if (matched.length) {
      layout = mergeLayouts(matched.map((p) => asLayout(p.layout)));
      profiles = matched.map((p) => ({ id: p.id, name: p.name }));
    } else if (wildcard) {
      layout = FULL_LAYOUT;
      profiles = [];
    } else {
      const def = await this.prisma.menuProfile.findFirst({
        where: { isDefault: true, isActive: true },
      });
      layout = def ? asLayout(def.layout) : DEFAULT_MENU_LAYOUT;
      profiles = def ? [{ id: def.id, name: def.name }] : [];
    }
    const pool = wildcard ? MENU_CATALOG.map((m) => m.key) : layoutKeys(layout);
    return { layout, profiles, pool };
  }

  /** 사이드바가 쓰는 내 메뉴 = 기준 메뉴 + 개인 설정(권한 거르기는 화면에서 — 권한은 /auth/me에 있다) */
  async me(principal: AuthPrincipal) {
    const base = await this.baseLayout(principal);
    const pref = await this.prisma.userMenuPref.findUnique({ where: { userId: principal.userId } });
    const personal = pref ? (pref.layout as unknown as PersonalMenuLayout) : null;
    const layout = applyPersonal(base.layout, personal, base.pool);
    const shown = new Set(layoutKeys(layout));
    // 편집 화면의 '숨긴 메뉴' = 꺼내 쓸 수 있는데 지금 안 보이는 메뉴
    const hidden = base.pool.filter((k) => !shown.has(k));
    // 편집용 배치 — 숨긴 메뉴도 제자리에 둔다(화면에서 흐리게). 자리가 없는 메뉴는 끝 묶음에
    // 복사본으로 — 개인 설정이 없으면 applyPersonal이 기준 구성을 그대로 돌려줘서, 아래 push가 사이드바까지 바꾼다
    const picked = applyPersonal(
      base.layout,
      personal ? { ...personal, hidden: [] } : null,
      base.pool,
    );
    const editor = { groups: picked.groups.map((g) => ({ ...g, items: [...g.items] })) };
    const placed = new Set(layoutKeys(editor));
    const extra = hidden.filter((k) => !placed.has(k));
    if (extra.length) editor.groups.push({ label: '그 밖의 메뉴', items: extra });
    return {
      layout,
      editor,
      base: base.layout,
      hidden,
      personalized: !!pref,
      profiles: base.profiles,
    };
  }

  async saveMine(principal: AuthPrincipal, input: PersonalMenuLayout) {
    const base = await this.baseLayout(principal);
    const allowed = new Set(base.pool);
    const layout = normalizeLayout({
      groups: (input.groups ?? []).map((g) => ({
        ...g,
        items: (g.items ?? []).filter((k) => allowed.has(k)),
      })),
    });
    const hidden = [...new Set((input.hidden ?? []).filter((k) => allowed.has(k)))];
    if (layout.groups.length > 20)
      throw new BadRequestException('묶음은 20개까지 만들 수 있습니다');
    const value = { ...layout, hidden } as unknown as Prisma.InputJsonValue;
    await this.prisma.userMenuPref.upsert({
      where: { userId: principal.userId },
      create: { userId: principal.userId, layout: value },
      update: { layout: value },
    });
    return this.me(principal);
  }

  async resetMine(principal: AuthPrincipal) {
    await this.prisma.userMenuPref.deleteMany({ where: { userId: principal.userId } });
    return this.me(principal);
  }

  // ── 관리자: 메뉴 구성 ──

  async list() {
    const rows = await this.prisma.menuProfile.findMany({
      include: { targets: true },
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }, { name: 'asc' }],
    });
    const names = await this.targetNames(rows.flatMap((r) => r.targets));
    return rows.map((r) => this.view(r, names));
  }

  async get(id: string) {
    const row = await this.prisma.menuProfile.findUnique({
      where: { id },
      include: { targets: true },
    });
    if (!row) throw new NotFoundException('메뉴 구성을 찾을 수 없습니다');
    const names = await this.targetNames(row.targets);
    return { ...this.view(row, names), userCount: await this.countUsers(row.id) };
  }

  async create(input: MenuProfileInput) {
    if (!input.name?.trim()) throw new BadRequestException('구성 이름을 입력해 주세요');
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.menuProfile.updateMany({ data: { isDefault: false } });
      return tx.menuProfile.create({
        data: {
          name: input.name!.trim(),
          description: input.description?.trim() || null,
          layout: normalizeLayout(input.layout) as unknown as Prisma.InputJsonValue,
          priority: input.priority ?? 100,
          isDefault: !!input.isDefault,
          isActive: input.isActive ?? true,
          targets: { create: this.cleanTargets(input.targets) },
        },
      });
    });
    return this.get(row.id);
  }

  async update(id: string, input: MenuProfileInput) {
    await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.menuProfile.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      }
      await tx.menuProfile.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() || '이름 없음' } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.layout
            ? { layout: normalizeLayout(input.layout) as unknown as Prisma.InputJsonValue }
            : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      if (input.targets) {
        await tx.menuProfileTarget.deleteMany({ where: { profileId: id } });
        await tx.menuProfileTarget.createMany({
          data: this.cleanTargets(input.targets).map((t) => ({ ...t, profileId: id })),
        });
      }
    });
    return this.get(id);
  }

  async remove(id: string) {
    const row = await this.get(id);
    if (row.isDefault) {
      throw new BadRequestException(
        '기본 구성은 지울 수 없습니다 — 다른 구성을 기본으로 지정한 뒤 지워 주세요',
      );
    }
    await this.prisma.menuProfile.delete({ where: { id } });
    return { ok: true };
  }

  /** 관리자 미리보기 — 이 사람에게 보일 메뉴(개인 설정 포함) */
  async previewFor(userId: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        loginId: true,
        userRoles: {
          select: {
            role: { select: { rolePerms: { select: { permission: { select: { code: true } } } } } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다');
    const permissions = [
      ...new Set(user.userRoles.flatMap((r) => r.role.rolePerms.map((p) => p.permission.code))),
    ];
    const base = await this.baseLayout({ userId: user.id, permissions });
    const pref = await this.prisma.userMenuPref.findUnique({ where: { userId } });
    return {
      loginId: user.loginId,
      permissions,
      layout: applyPersonal(
        base.layout,
        pref ? (pref.layout as unknown as PersonalMenuLayout) : null,
        base.pool,
      ),
      profiles: base.profiles,
    };
  }

  private cleanTargets(targets?: MenuTargetInput[]) {
    const seen = new Set<string>();
    return (targets ?? []).filter((t) => {
      const k = `${t.kind}:${t.targetId}`;
      return ['ORG', 'ROLE', 'POSITION', 'USER'].includes(t.kind) && !seen.has(k) && !!seen.add(k);
    });
  }

  /** 이 구성이 걸리는 계정 수(활성) — 소속은 하위 조직까지 */
  private async countUsers(profileId: string) {
    const targets = await this.prisma.menuProfileTarget.findMany({ where: { profileId } });
    if (!targets.length) return 0;
    const ids = (k: string) => targets.filter((t) => t.kind === k).map((t) => t.targetId);
    const orgs = await this.withDescendants(ids('ORG'));
    const or: Prisma.AppUserWhereInput[] = [];
    if (ids('USER').length) or.push({ id: { in: ids('USER') } });
    if (ids('ROLE').length) or.push({ userRoles: { some: { roleId: { in: ids('ROLE') } } } });
    if (ids('POSITION').length) or.push({ employee: { positionId: { in: ids('POSITION') } } });
    if (orgs.length) {
      or.push({ employee: { orgUnitId: { in: orgs } } });
      or.push({ employee: { concurrentOrgs: { some: { orgUnitId: { in: orgs } } } } });
    }
    return this.prisma.appUser.count({ where: { isActive: true, OR: or } });
  }

  private async withDescendants(roots: string[]) {
    if (!roots.length) return [];
    const all = await this.prisma.orgUnit.findMany({ select: { id: true, parentId: true } });
    const out = new Set(roots);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of all) {
        if (o.parentId && out.has(o.parentId) && !out.has(o.id)) {
          out.add(o.id);
          grew = true;
        }
      }
    }
    return [...out];
  }

  private async targetNames(targets: { kind: string; targetId: string }[]) {
    const ids = (k: string) => [
      ...new Set(targets.filter((t) => t.kind === k).map((t) => t.targetId)),
    ];
    const [orgs, roles, positions, users] = await Promise.all([
      this.prisma.orgUnit.findMany({
        where: { id: { in: ids('ORG') } },
        select: { id: true, name: true },
      }),
      this.prisma.role.findMany({
        where: { id: { in: ids('ROLE') } },
        select: { id: true, name: true },
      }),
      this.prisma.position.findMany({
        where: { id: { in: ids('POSITION') } },
        select: { id: true, name: true },
      }),
      this.prisma.appUser.findMany({
        where: { id: { in: ids('USER') } },
        select: { id: true, loginId: true, employee: { select: { name: true } } },
      }),
    ]);
    const m = new Map<string, string>();
    orgs.forEach((o) => m.set(`ORG:${o.id}`, o.name));
    roles.forEach((o) => m.set(`ROLE:${o.id}`, o.name));
    positions.forEach((o) => m.set(`POSITION:${o.id}`, o.name));
    users.forEach((o) => m.set(`USER:${o.id}`, o.employee?.name ?? o.loginId));
    return m;
  }

  private view(
    r: Prisma.MenuProfileGetPayload<{ include: { targets: true } }>,
    names: Map<string, string>,
  ) {
    const layout = asLayout(r.layout);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      layout,
      menuCount: layoutKeys(layout).length,
      priority: r.priority,
      isDefault: r.isDefault,
      isActive: r.isActive,
      updatedAt: r.updatedAt,
      targets: r.targets.map((t) => ({
        kind: t.kind as MenuTargetKind,
        targetId: t.targetId,
        name: names.get(`${t.kind}:${t.targetId}`) ?? '(삭제됨)',
      })),
    };
  }
}
