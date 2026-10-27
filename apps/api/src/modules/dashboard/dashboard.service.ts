import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DASH_WIDGET_MAP,
  canUseWidget,
  defaultDashLayout,
  normalizeDashLayout,
  type AuthPrincipal,
  type DashLayout,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface TemplateInput {
  name?: string;
  description?: string;
  layout?: unknown;
  isDefault?: boolean;
  allowPersonal?: boolean;
}

/** 볼 수 없는 위젯은 빼고 보여 준다(관리자가 지정한 템플릿에 권한 밖 위젯이 있어도) */
function visibleOnly(layout: DashLayout, p: AuthPrincipal): DashLayout {
  return {
    version: 1,
    items: layout.items.filter((it) => {
      const def = DASH_WIDGET_MAP.get(it.widget);
      return !!def && canUseWidget(def, p.permissions);
    }),
  };
}

/**
 * 대시보드 — 누가 무엇을 보나
 *  1) 개인 대시보드(내가 고쳐 저장한 것) — 지정된 템플릿이 '개인 수정 허용'일 때만
 *  2) 나에게 직접 지정된 템플릿 → 내 권한 그룹에 지정된 템플릿(그룹 순서대로) → 기본 템플릿
 *  3) 아무것도 없으면 내 권한에 맞춘 기본 구성
 * 어떤 경우든 내 권한으로 볼 수 없는 위젯은 빠진다.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** 나에게 지정된 템플릿 */
  private async assignedTemplate(p: AuthPrincipal) {
    const byUser = await this.prisma.dashboardAssignment.findUnique({
      where: { targetType_targetId: { targetType: 'USER', targetId: p.userId } },
      include: { dashboard: true },
    });
    if (byUser) return { template: byUser.dashboard, via: 'USER' as const };
    const roles = await this.prisma.userRole.findMany({
      where: { userId: p.userId },
      select: { roleId: true, role: { select: { sortOrder: true } } },
      orderBy: { role: { sortOrder: 'asc' } },
    });
    if (roles.length) {
      const byRole = await this.prisma.dashboardAssignment.findMany({
        where: { targetType: 'ROLE', targetId: { in: roles.map((r) => r.roleId) } },
        include: { dashboard: true },
      });
      for (const r of roles) {
        const hit = byRole.find((a) => a.targetId === r.roleId);
        if (hit) return { template: hit.dashboard, via: 'ROLE' as const };
      }
    }
    const def = await this.prisma.dashboard.findFirst({
      where: { isDefault: true, ownerUserId: null },
      orderBy: { updatedAt: 'desc' },
    });
    return def ? { template: def, via: 'DEFAULT' as const } : null;
  }

  async mine(p: AuthPrincipal) {
    const [assigned, personal] = await Promise.all([
      this.assignedTemplate(p),
      this.prisma.dashboard.findUnique({ where: { ownerUserId: p.userId } }),
    ]);
    const canCustomize = !assigned || assigned.template.allowPersonal;
    const base = assigned
      ? normalizeDashLayout(assigned.template.layout)
      : defaultDashLayout(p.permissions);
    const usePersonal = !!personal && canCustomize;
    return {
      source: usePersonal ? 'PERSONAL' : assigned ? assigned.via : 'BUILTIN',
      name: usePersonal ? personal.name : (assigned?.template.name ?? '기본 대시보드'),
      templateName: assigned?.template.name ?? null,
      canCustomize,
      hasPersonal: !!personal,
      layout: visibleOnly(usePersonal ? normalizeDashLayout(personal.layout) : base, p),
      /** '기본으로 되돌리기'를 눌렀을 때 보일 구성 */
      baseLayout: visibleOnly(base, p),
      updatedAt: usePersonal ? personal.updatedAt : (assigned?.template.updatedAt ?? null),
    };
  }

  async saveMine(p: AuthPrincipal, layout: unknown) {
    const assigned = await this.assignedTemplate(p);
    if (assigned && !assigned.template.allowPersonal) {
      throw new ForbiddenException('관리자가 정한 대시보드라 고칠 수 없습니다.');
    }
    // 권한 밖 위젯은 저장하지 않는다
    const clean = visibleOnly(normalizeDashLayout(layout), p);
    await this.prisma.dashboard.upsert({
      where: { ownerUserId: p.userId },
      update: { layout: clean as object },
      create: {
        name: '내 대시보드',
        layout: clean as object,
        ownerUserId: p.userId,
        createdBy: p.userId,
      },
    });
    return this.mine(p);
  }

  async resetMine(p: AuthPrincipal) {
    await this.prisma.dashboard.deleteMany({ where: { ownerUserId: p.userId } });
    return this.mine(p);
  }

  // ── 템플릿(관리자) ──

  async templates() {
    const rows = await this.prisma.dashboard.findMany({
      where: { ownerUserId: null },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      include: { assignments: true },
    });
    const roleIds = rows.flatMap((r) =>
      r.assignments.filter((a) => a.targetType === 'ROLE').map((a) => a.targetId),
    );
    const userIds = rows.flatMap((r) =>
      r.assignments.filter((a) => a.targetType === 'USER').map((a) => a.targetId),
    );
    const [roles, users] = await Promise.all([
      this.prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, name: true },
      }),
      this.prisma.appUser.findMany({
        where: { id: { in: userIds } },
        select: { id: true, loginId: true, employee: { select: { name: true } } },
      }),
    ]);
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const userName = new Map(users.map((u) => [u.id, u.employee?.name ?? u.loginId]));
    return rows.map(({ assignments, layout, ...r }) => {
      const items = normalizeDashLayout(layout).items;
      return {
        ...r,
        widgetCount: items.length,
        // 카드 미리보기용 — 자리·크기·보기 방식만
        preview: items.map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h, viz: i.viz })),
        roles: assignments
          .filter((a) => a.targetType === 'ROLE')
          .map((a) => ({ id: a.targetId, name: roleName.get(a.targetId) ?? '-' })),
        users: assignments
          .filter((a) => a.targetType === 'USER')
          .map((a) => ({ id: a.targetId, name: userName.get(a.targetId) ?? '-' })),
      };
    });
  }

  async template(id: string) {
    const d = await this.prisma.dashboard.findFirst({
      where: { id, ownerUserId: null },
      include: { assignments: true },
    });
    if (!d) throw new NotFoundException('대시보드 템플릿을 찾을 수 없습니다.');
    return {
      ...d,
      layout: normalizeDashLayout(d.layout),
      roleIds: d.assignments.filter((a) => a.targetType === 'ROLE').map((a) => a.targetId),
      userIds: d.assignments.filter((a) => a.targetType === 'USER').map((a) => a.targetId),
    };
  }

  async createTemplate(input: TemplateInput, p: AuthPrincipal) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('이름을 입력해 주세요.');
    const layout = input.layout ? normalizeDashLayout(input.layout) : defaultDashLayout(['*']);
    const d = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault)
        await tx.dashboard.updateMany({ where: { ownerUserId: null }, data: { isDefault: false } });
      return tx.dashboard.create({
        data: {
          name,
          description: input.description?.trim() ?? '',
          layout: layout as object,
          isDefault: input.isDefault ?? false,
          allowPersonal: input.allowPersonal ?? true,
          createdBy: p.userId,
        },
      });
    });
    return this.template(d.id);
  }

  async updateTemplate(id: string, input: TemplateInput) {
    await this.template(id);
    await this.prisma.$transaction(async (tx) => {
      // 기본 템플릿은 하나만
      if (input.isDefault) {
        await tx.dashboard.updateMany({
          where: { ownerUserId: null, id: { not: id } },
          data: { isDefault: false },
        });
      }
      await tx.dashboard.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() || '이름 없는 대시보드' } : {}),
          ...(input.description !== undefined ? { description: input.description.trim() } : {}),
          ...(input.layout !== undefined
            ? { layout: normalizeDashLayout(input.layout) as object }
            : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.allowPersonal !== undefined ? { allowPersonal: input.allowPersonal } : {}),
        },
      });
    });
    return this.template(id);
  }

  async removeTemplate(id: string) {
    await this.template(id);
    await this.prisma.dashboard.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * 템플릿을 권한 그룹·사용자에게 지정 — 한 대상에는 템플릿 하나라서,
   * 다른 템플릿에 지정돼 있던 대상은 이 템플릿으로 옮겨 온다.
   */
  async assign(id: string, roleIds: string[], userIds: string[]) {
    await this.template(id);
    const roles = [...new Set(roleIds)];
    const users = [...new Set(userIds)];
    const [rc, uc] = await Promise.all([
      this.prisma.role.count({ where: { id: { in: roles } } }),
      this.prisma.appUser.count({ where: { id: { in: users } } }),
    ]);
    if (rc !== roles.length || uc !== users.length) {
      throw new BadRequestException('없는 권한 그룹이나 사용자가 들어 있습니다. 다시 골라 주세요.');
    }
    await this.prisma.$transaction([
      this.prisma.dashboardAssignment.deleteMany({
        where: {
          OR: [
            { dashboardId: id },
            { targetType: 'ROLE', targetId: { in: roles } },
            { targetType: 'USER', targetId: { in: users } },
          ],
        },
      }),
      this.prisma.dashboardAssignment.createMany({
        data: [
          ...roles.map((targetId) => ({ dashboardId: id, targetType: 'ROLE', targetId })),
          ...users.map((targetId) => ({ dashboardId: id, targetType: 'USER', targetId })),
        ],
      }),
    ]);
    return this.template(id);
  }

  /** 지정할 대상 목록(권한 그룹·사용자) */
  async targets() {
    const [roles, users] = await Promise.all([
      this.prisma.role.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.appUser.findMany({
        where: { principalType: 'HUMAN', isActive: true },
        orderBy: { loginId: 'asc' },
        select: {
          id: true,
          loginId: true,
          employee: {
            select: {
              name: true,
              orgUnit: { select: { name: true } },
              position: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    return {
      roles,
      users: users.map((u) => ({
        id: u.id,
        loginId: u.loginId,
        name: u.employee?.name ?? u.loginId,
        orgUnitName: u.employee?.orgUnit.name ?? null,
        positionName: u.employee?.position?.name ?? null,
      })),
    };
  }
}
