import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import type { RoleAssignmentDto } from '../access/dto/access.dto';
import { CreateAccountDto } from './dto/create-account.dto';

/** 계정관리(관리자) — 계정 생성·활성/비활성·역할 부여. */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** 권한 그룹 목록(계정 생성·권한 부여 폼용). */
  roles() {
    return this.prisma.role.findMany({
      select: { id: true, code: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** 계정 목록 + 역할·소속. */
  async list() {
    const users = await this.prisma.appUser.findMany({
      where: { principalType: 'HUMAN' },
      select: {
        id: true,
        loginId: true,
        isActive: true,
        isExternal: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            name: true,
            orgUnit: { select: { name: true } },
            position: { select: { id: true, name: true, sortOrder: true } },
          },
        },
        userRoles: {
          select: {
            roleId: true,
            dataScope: true,
            orgScopeId: true,
            role: { select: { code: true, name: true } },
            orgScope: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      loginId: u.loginId,
      isActive: u.isActive,
      employeeId: u.employee?.id ?? null,
      employeeName: u.employee?.name ?? null,
      orgUnitName: u.employee?.orgUnit.name ?? null,
      positionName: u.employee?.position?.name ?? null,
      positionOrder: u.employee?.position?.sortOrder ?? null,
      createdAt: u.createdAt,
      roles: u.userRoles.map((r) => ({
        roleId: r.roleId,
        orgScopeId: r.orgScopeId,
        roleCode: r.role.code,
        roleName: r.role.name,
        dataScope: r.dataScope,
        orgScope: r.orgScope?.name ?? null,
      })),
    }));
  }

  /**
   * 계정 생성 — 권한 그룹은 여러 개를 함께 줄 수 있다(roles). 예전 화면 호환으로
   * roleId 하나만 와도 받는다. 권한 상승·조직 검사는 권한 부여와 같은 규칙을 탄다.
   */
  async create(dto: CreateAccountDto, actor: AuthPrincipal) {
    const exists = await this.prisma.appUser.findUnique({ where: { loginId: dto.loginId } });
    if (exists) throw new ConflictException('이미 사용 중인 아이디입니다.');
    const roles =
      dto.roles ??
      (dto.roleId
        ? [{ roleId: dto.roleId, dataScope: dto.dataScope ?? 'OWN', orgScopeId: dto.orgScopeId }]
        : []);
    if (!roles.length) throw new BadRequestException('권한 그룹을 하나 이상 골라 주세요.');
    if (dto.employeeId) {
      const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
      if (!emp) throw new BadRequestException('직원을 목록에서 다시 골라 주세요.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.appUser.create({
      data: {
        loginId: dto.loginId,
        passwordHash,
        principalType: 'HUMAN',
        employeeId: dto.employeeId,
      },
    });
    try {
      await this.access.setUserRoles(user.id, roles, actor);
    } catch (e) {
      // 권한 부여가 막히면 빈 계정이 남지 않게 지운다
      await this.prisma.appUser.delete({ where: { id: user.id } });
      throw e;
    }
    return { id: user.id, loginId: user.loginId };
  }

  /** 계정의 권한 그룹(+데이터 범위)을 통째로 바꾼다. */
  setRoles(id: string, roles: RoleAssignmentDto[], actor: AuthPrincipal) {
    return this.access.setUserRoles(id, roles, actor);
  }

  /** 계정에 연결할 직원 바꾸기(직책·소속은 직원 정보를 따른다). */
  async setEmployee(id: string, employeeId: string | null) {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');
    if (employeeId) {
      const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
      if (!emp) throw new BadRequestException('직원을 목록에서 다시 골라 주세요.');
    }
    return this.prisma.appUser.update({
      where: { id },
      data: { employeeId },
      select: { id: true, loginId: true, employeeId: true },
    });
  }

  /**
   * 활성/비활성 전환. 비활성화는 두 경우를 막는다 —
   *  1) 본인 계정: 지금 쓰고 있는 관리자가 스스로를 잠가 버린다.
   *  2) 마지막 전체관리자('*'): 다시 켜 줄 사람이 아무도 남지 않는다.
   * 화면에서 버튼을 숨기는 것만으로는 API·다른 클라이언트 호출을 못 막아 서버에서 판정한다.
   */
  async setActive(id: string, isActive: boolean, actor?: AuthPrincipal) {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');
    if (!isActive) {
      if (actor && actor.userId === id) {
        throw new BadRequestException('본인 계정은 비활성화할 수 없습니다.');
      }
      const superAdmin = {
        role: { rolePerms: { some: { permission: { code: PERMISSION_WILDCARD } } } },
      };
      const isSuperAdmin = await this.prisma.userRole.count({
        where: { userId: id, ...superAdmin },
      });
      if (isSuperAdmin) {
        const othersActive = await this.prisma.appUser.count({
          where: { id: { not: id }, isActive: true, userRoles: { some: superAdmin } },
        });
        if (othersActive === 0) {
          throw new BadRequestException(
            '마지막 전체관리자 계정은 비활성화할 수 없습니다. 다른 전체관리자를 먼저 만드세요.',
          );
        }
      }
    }
    return this.prisma.appUser.update({
      where: { id },
      data: { isActive },
      select: { id: true, loginId: true, isActive: true },
    });
  }
}
