import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';

/** 계정관리(관리자) — 계정 생성·활성/비활성·역할 부여. */
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  /** 역할 목록(계정 생성 폼용). */
  roles() {
    return this.prisma.role.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
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
        employee: { select: { name: true } },
        userRoles: {
          select: {
            dataScope: true,
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
      employeeName: u.employee?.name ?? null,
      createdAt: u.createdAt,
      roles: u.userRoles.map((r) => ({
        roleCode: r.role.code,
        roleName: r.role.name,
        dataScope: r.dataScope,
        orgScope: r.orgScope?.name ?? null,
      })),
    }));
  }

  async create(dto: CreateAccountDto) {
    const exists = await this.prisma.appUser.findUnique({ where: { loginId: dto.loginId } });
    if (exists) throw new ConflictException('이미 사용 중인 아이디입니다.');
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new BadRequestException('존재하지 않는 역할입니다.');

    const dataScope = dto.dataScope ?? 'OWN';
    if (dataScope === 'ORG' && !dto.orgScopeId) {
      throw new BadRequestException('데이터범위가 ORG이면 적용 조직을 지정해야 합니다.');
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
    await this.prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: dto.roleId,
        orgScopeId: dataScope === 'ORG' ? dto.orgScopeId : null,
        dataScope,
      },
    });
    return { id: user.id, loginId: user.loginId };
  }

  /** 활성/비활성 토글. */
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
