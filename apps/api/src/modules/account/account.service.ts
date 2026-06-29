import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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
  async setActive(id: string, isActive: boolean) {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');
    return this.prisma.appUser.update({
      where: { id },
      data: { isActive },
      select: { id: true, loginId: true, isActive: true },
    });
  }
}
