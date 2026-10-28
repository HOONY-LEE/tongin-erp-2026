import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  PERMISSIONS,
  PERMISSION_WILDCARD,
  ROLE_SUPER_ADMIN,
  permissionLabel,
  type AuthPrincipal,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { PrincipalCache } from '../../auth/principal-cache.service';
import type {
  CreatePositionDto,
  CreateRoleDto,
  RoleAssignmentDto,
  UpdatePositionDto,
  UpdateRoleDto,
} from './dto/access.dto';

const SUPER_ADMIN_WHERE = {
  role: { rolePerms: { some: { permission: { code: PERMISSION_WILDCARD } } } },
};

/**
 * 권한 관리 — 권한 그룹(역할)·직책·계정별 권한 부여.
 *
 * 지키는 규칙
 *  - 슈퍼관리자 그룹은 '*'(전체 권한) 고정. 이름·권한을 고칠 수 없고 지울 수 없다.
 *  - 권한 상승 막기: 슈퍼관리자가 아닌 관리자는 자기가 가진 권한까지만 그룹에 넣고 빼며,
 *    자기에게 없는 권한이 든 그룹은 남에게 주거나 빼앗지 못한다.
 *  - 마지막 슈퍼관리자는 그룹을 빼앗길 수 없다(아무도 관리 화면에 못 들어가게 되므로).
 *  - 바뀐 권한은 다음 요청부터 바로 적용된다(바꿀 때 주체 캐시(PrincipalCache)를 비운다).
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly principals: PrincipalCache,
  ) {}

  // ── 권한 그룹 ──

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        rolePerms: { select: { permission: { select: { code: true } } } },
        userRoles: { select: { userId: true, user: { select: { isActive: true } } } },
        positions: { select: { name: true } },
      },
    });
    return roles.map((r) => this.toRoleView(r));
  }

  async createRole(dto: CreateRoleDto, actor: AuthPrincipal) {
    const name = dto.name.trim();
    await this.assertNameFree(name);
    const codes = this.validCodes(dto.permissions ?? []);
    this.assertCanChange(actor, [], codes);
    const last = await this.prisma.role.aggregate({ _max: { sortOrder: true } });
    const role = await this.prisma.role.create({
      data: {
        // 코드는 사람이 볼 일이 없어 자동으로 만든다(이름은 언제든 바꿀 수 있다)
        code: `ROLE_${randomBytes(4).toString('hex').toUpperCase()}`,
        name,
        description: dto.description?.trim() || null,
        fieldApp: dto.fieldApp ?? false,
        sortOrder: (last._max.sortOrder ?? 100) + 10,
      },
    });
    await this.writePermissions(role.id, codes);
    return this.getRole(role.id);
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.findRole(id);
    if (role.code === ROLE_SUPER_ADMIN) {
      throw new BadRequestException('슈퍼관리자 그룹은 고칠 수 없습니다.');
    }
    const name = dto.name?.trim();
    if (name && name !== role.name) await this.assertNameFree(name, id);
    await this.prisma.role.update({
      where: { id },
      data: {
        name: name || undefined,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        fieldApp: dto.fieldApp,
        sortOrder: dto.sortOrder,
      },
    });
    this.principals.invalidateAll();
    return this.getRole(id);
  }

  async setRolePermissions(id: string, permissions: string[], actor: AuthPrincipal) {
    const role = await this.findRole(id);
    if (role.code === ROLE_SUPER_ADMIN) {
      throw new BadRequestException('슈퍼관리자 그룹은 전체 권한으로 고정되어 있습니다.');
    }
    const next = this.validCodes(permissions);
    const current = role.rolePerms.map((rp) => rp.permission.code);
    this.assertCanChange(actor, current, next);
    await this.writePermissions(id, next);
    return this.getRole(id);
  }

  async deleteRole(id: string) {
    const role = await this.findRole(id);
    if (role.isSystem) {
      throw new BadRequestException('기본 권한 그룹은 지울 수 없습니다. 권한만 고쳐서 쓰세요.');
    }
    const users = await this.prisma.userRole.count({ where: { roleId: id } });
    if (users > 0) {
      throw new BadRequestException(
        `이 그룹을 쓰는 계정이 ${users}개 있습니다. 계정에서 그룹을 먼저 빼 주세요.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    this.principals.invalidateAll();
    return { id, deleted: true };
  }

  async reorderRoles(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.role.updateMany({
          // 슈퍼관리자는 늘 맨 위
          where: { id, code: { not: ROLE_SUPER_ADMIN } },
          data: { sortOrder: (i + 1) * 10 },
        }),
      ),
    );
    return this.listRoles();
  }

  // ── 직책 ──

  async listPositions() {
    const rows = await this.prisma.position.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        defaultRole: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      sortOrder: p.sortOrder,
      isActive: p.isActive,
      defaultRoleId: p.defaultRoleId,
      defaultRoleName: p.defaultRole?.name ?? null,
      employeeCount: p._count.employees,
    }));
  }

  async createPosition(dto: CreatePositionDto) {
    const name = dto.name.trim();
    if (await this.prisma.position.findUnique({ where: { name } })) {
      throw new ConflictException(`이미 있는 직책입니다: ${name}`);
    }
    if (dto.defaultRoleId) await this.findRole(dto.defaultRoleId);
    const last = await this.prisma.position.aggregate({ _max: { sortOrder: true } });
    const p = await this.prisma.position.create({
      data: {
        name,
        defaultRoleId: dto.defaultRoleId ?? null,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
      },
    });
    return p;
  }

  async updatePosition(id: string, dto: UpdatePositionDto) {
    const p = await this.prisma.position.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('직책을 찾을 수 없습니다.');
    const name = dto.name?.trim();
    if (name && name !== p.name && (await this.prisma.position.findUnique({ where: { name } }))) {
      throw new ConflictException(`이미 있는 직책입니다: ${name}`);
    }
    if (dto.defaultRoleId) await this.findRole(dto.defaultRoleId);
    const row = await this.prisma.position.update({
      where: { id },
      data: { name: name || undefined, defaultRoleId: dto.defaultRoleId, isActive: dto.isActive },
    });
    this.principals.invalidateAll(); // 주체에 직책 이름이 실린다
    return row;
  }

  /** 직책을 지우면 그 직책이던 직원은 '직책 없음'이 된다(직원 기록은 그대로). */
  async deletePosition(id: string) {
    const p = await this.prisma.position.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('직책을 찾을 수 없습니다.');
    await this.prisma.position.delete({ where: { id } });
    this.principals.invalidateAll();
    return { id, deleted: true };
  }

  async reorderPositions(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.position.updateMany({ where: { id }, data: { sortOrder: (i + 1) * 10 } }),
      ),
    );
    return this.listPositions();
  }

  // ── 계정에 권한 그룹 주기 ──

  async setUserRoles(userId: string, input: RoleAssignmentDto[], actor: AuthPrincipal) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      include: {
        employee: { select: { orgUnitId: true } },
        userRoles: {
          include: { role: { include: { rolePerms: { include: { permission: true } } } } },
        },
      },
    });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');

    // 같은 그룹·같은 대상 조직은 한 줄로
    const seen = new Set<string>();
    const next = input
      .map((a) => ({
        roleId: a.roleId,
        dataScope: a.dataScope,
        orgScopeId: a.dataScope === 'ORG' ? (a.orgScopeId ?? null) : null,
      }))
      .filter((a) => {
        const k = `${a.roleId}:${a.orgScopeId ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    for (const a of next) {
      if (a.dataScope === 'ORG' && !a.orgScopeId) {
        throw new BadRequestException('데이터 범위가 "소속 조직"이면 대상 조직을 골라 주세요.');
      }
    }
    const roles = await this.prisma.role.findMany({
      where: { id: { in: next.map((a) => a.roleId) } },
      include: { rolePerms: { include: { permission: true } } },
    });
    if (roles.length !== new Set(next.map((a) => a.roleId)).size) {
      throw new BadRequestException('없는 권한 그룹이 들어 있습니다. 목록에서 다시 골라 주세요.');
    }
    const orgIds = next.map((a) => a.orgScopeId).filter((x): x is string => !!x);
    if (orgIds.length) {
      const found = await this.prisma.orgUnit.count({ where: { id: { in: orgIds } } });
      if (found !== new Set(orgIds).size) {
        throw new BadRequestException('없는 조직이 들어 있습니다. 목록에서 다시 골라 주세요.');
      }
    }

    // 권한 상승 막기 — 새로 주거나 빼거나 범위를 바꾸는 그룹의 권한이 모두 내 권한 안이어야 한다
    const isWildcard = actor.permissions.includes(PERMISSION_WILDCARD);
    // 그룹·데이터 범위·대상 조직이 모두 같아야 '그대로'인 줄로 본다(범위만 바꿔도 손댄 것)
    const keyOf = (a: { roleId: string; dataScope: string; orgScopeId: string | null }) =>
      `${a.roleId}:${a.dataScope}:${a.orgScopeId ?? ''}`;
    const beforeKeys = new Set(user.userRoles.map(keyOf));
    const afterKeys = new Set(next.map(keyOf));
    const added = next.filter((a) => !beforeKeys.has(keyOf(a)));
    const removed = user.userRoles.filter((ur) => !afterKeys.has(keyOf(ur)));
    if (!isWildcard) {
      // 데이터 범위 상승 막기 — 내 데이터 범위 밖의 계정·조직은 건드릴 수 없다
      const myOrgIds = await this.scope.orgScopeIds(actor); // null = 전체(ALL)
      if (myOrgIds !== null) {
        if (added.some((a) => a.dataScope === 'ALL')) {
          throw new ForbiddenException(
            '데이터 범위 "전체"는 나도 전체 범위를 가진 경우에만 줄 수 있습니다.',
          );
        }
        const targetOrg = user.employee?.orgUnitId ?? null;
        if (!targetOrg || !myOrgIds.includes(targetOrg)) {
          throw new ForbiddenException('내 데이터 범위 밖 조직의 계정은 권한을 바꿀 수 없습니다.');
        }
        if (orgIds.some((id) => !myOrgIds.includes(id))) {
          throw new ForbiddenException(
            '내 데이터 범위 밖의 조직은 대상 조직으로 고를 수 없습니다.',
          );
        }
      }

      const touchedIds = new Set([
        ...added.map((a) => a.roleId),
        ...removed.map((ur) => ur.roleId),
      ]);
      const touched = [
        ...roles.filter((r) => touchedIds.has(r.id)),
        ...removed.map((ur) => ur.role).filter((r) => !roles.some((x) => x.id === r.id)),
      ].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
      for (const r of touched) {
        const lacking = r.rolePerms
          .map((rp) => rp.permission.code)
          .filter((c) => !actor.permissions.includes(c));
        if (lacking.length) {
          throw new ForbiddenException(
            `'${r.name}' 그룹에는 내게 없는 권한(${lacking.map(permissionLabel).slice(0, 3).join(', ')}${lacking.length > 3 ? ' 등' : ''})이 있어 주거나 뺄 수 없습니다.`,
          );
        }
      }
    }

    // 마지막 슈퍼관리자 지키기
    const wasSuper = user.userRoles.some((ur) =>
      ur.role.rolePerms.some((rp) => rp.permission.code === PERMISSION_WILDCARD),
    );
    const willBeSuper = roles.some((r) =>
      r.rolePerms.some((rp) => rp.permission.code === PERMISSION_WILDCARD),
    );
    if (wasSuper && !willBeSuper) {
      if (actor.userId === userId) {
        throw new BadRequestException('본인 계정의 슈퍼관리자 권한은 뺄 수 없습니다.');
      }
      const others = await this.prisma.appUser.count({
        where: { id: { not: userId }, isActive: true, userRoles: { some: SUPER_ADMIN_WHERE } },
      });
      if (others === 0) {
        throw new BadRequestException('마지막 슈퍼관리자입니다. 다른 슈퍼관리자를 먼저 만드세요.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.userRole.createMany({ data: next.map((a) => ({ userId, ...a })) }),
    ]);
    this.principals.invalidateAll();
    return { id: userId, roles: next };
  }

  // ── 내부 ──

  private async getRole(id: string) {
    const r = await this.prisma.role.findUniqueOrThrow({
      where: { id },
      include: {
        rolePerms: { select: { permission: { select: { code: true } } } },
        userRoles: { select: { userId: true, user: { select: { isActive: true } } } },
        positions: { select: { name: true } },
      },
    });
    return this.toRoleView(r);
  }

  private toRoleView(r: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    fieldApp: boolean;
    sortOrder: number;
    rolePerms: { permission: { code: string } }[];
    userRoles: { userId: string; user: { isActive: boolean } }[];
    positions: { name: string }[];
  }) {
    const permissions = r.rolePerms.map((rp) => rp.permission.code).sort();
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isSuperAdmin: permissions.includes(PERMISSION_WILDCARD),
      fieldApp: r.fieldApp,
      sortOrder: r.sortOrder,
      permissions,
      userCount: new Set(r.userRoles.filter((u) => u.user.isActive).map((u) => u.userId)).size,
      positions: r.positions.map((p) => p.name),
    };
  }

  private async findRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { rolePerms: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('권한 그룹을 찾을 수 없습니다.');
    return role;
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.role.findFirst({
      where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (dup) throw new ConflictException(`이미 있는 그룹 이름입니다: ${name}`);
  }

  /** 카탈로그에 있는 코드만 — '*'는 슈퍼관리자 그룹 말고는 줄 수 없다 */
  private validCodes(codes: string[]): string[] {
    const unique = [...new Set(codes)];
    const bad = unique.filter((c) => !PERMISSIONS.includes(c));
    if (bad.length) throw new BadRequestException(`알 수 없는 권한입니다: ${bad.join(', ')}`);
    return unique;
  }

  /** 슈퍼관리자가 아니면 내게 있는 권한만 넣고 뺄 수 있다 */
  private assertCanChange(actor: AuthPrincipal, before: string[], after: string[]) {
    if (actor.permissions.includes(PERMISSION_WILDCARD)) return;
    const b = new Set(before);
    const a = new Set(after);
    const changed = [...after.filter((c) => !b.has(c)), ...before.filter((c) => !a.has(c))];
    const lacking = changed.filter((c) => !actor.permissions.includes(c));
    if (lacking.length) {
      throw new ForbiddenException(
        `내게 없는 권한은 넣거나 뺄 수 없습니다: ${lacking.map(permissionLabel).slice(0, 5).join(', ')}${lacking.length > 5 ? ' 등' : ''}`,
      );
    }
  }

  private async writePermissions(roleId: string, codes: string[]) {
    const perms = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);
    this.principals.invalidateAll();
  }
}
