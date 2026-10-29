import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  PERMISSION_WILDCARD,
  type AuthPrincipal,
  type DataScope,
  type LoginResponse,
  type PrincipalType,
} from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { PrincipalCache } from './principal-cache.service';

export interface JwtPayload {
  sub: string; // app_user.id
  loginId: string;
}

export const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12h

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cache: PrincipalCache,
  ) {}

  /**
   * 내 비밀번호 바꾸기 — 지금 비밀번호를 확인한다. 틀려도 401이 아니라 400(401은 화면이 로그아웃으로 받는다)
   */
  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user?.passwordHash)
      throw new BadRequestException('이 계정은 비밀번호로 로그인하지 않습니다.');
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      throw new BadRequestException('지금 비밀번호가 맞지 않습니다.');
    }
    if (current === next) throw new BadRequestException('새 비밀번호가 지금과 같습니다.');
    await this.prisma.appUser.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(next, 10) },
    });
    return { ok: true };
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.appUser.findUnique({ where: { loginId: dto.loginId } });
    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');

    const payload: JwtPayload = { sub: user.id, loginId: user.loginId };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, tokenType: 'Bearer', expiresIn: TOKEN_TTL_SECONDS };
  }

  /**
   * 요청 인증용 주체 — 60초 캐시(PrincipalCache). 권한·계정이 바뀌면 해당 서비스가 캐시를 비운다.
   * DB가 멀어 요청마다 buildPrincipal(쿼리 5~7회)을 다시 돌리면 그것만으로 1초 넘게 든다.
   */
  principal(userId: string): Promise<AuthPrincipal | null> {
    return this.cache.get(userId, () => this.buildPrincipal(userId));
  }

  /** 주체의 권한·스코프를 집계해 AuthPrincipal 생성 (JwtStrategy·/auth/me 공용). 캐시 없이 DB에서 읽는다. */
  async buildPrincipal(userId: string): Promise<AuthPrincipal | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      include: {
        // 담당자 기본값을 이름으로 보여주려면 직원명이 필요하다(직원 목록 조회 권한이
        // 없는 역할도 자기 이름은 봐야 하므로 여기서 함께 실어 보낸다).
        employee: {
          select: {
            name: true,
            orgUnitId: true,
            position: { select: { name: true } },
            concurrentOrgs: { select: { orgUnitId: true } },
          },
        },
        userRoles: {
          include: { role: { include: { rolePerms: { include: { permission: true } } } } },
        },
      },
    });
    if (!user || !user.isActive) return null;

    const permSet = new Set<string>();
    const scopes = user.userRoles.map((ur) => {
      ur.role.rolePerms.forEach((rp) => permSet.add(rp.permission.code));
      return {
        roleCode: ur.role.code,
        dataScope: ur.dataScope as DataScope,
        orgScopeId: ur.orgScopeId,
        fieldApp: ur.role.fieldApp,
      };
    });

    const permissions = permSet.has(PERMISSION_WILDCARD) ? [PERMISSION_WILDCARD] : [...permSet];
    return {
      userId: user.id,
      loginId: user.loginId,
      principalType: user.principalType as PrincipalType,
      employeeId: user.employeeId,
      employeeName: user.employee?.name ?? null,
      employeeOrgUnitId: user.employee?.orgUnitId ?? null,
      concurrentOrgUnitIds: user.employee?.concurrentOrgs.map((c) => c.orgUnitId) ?? [],
      partnerId: user.partnerId,
      positionName: user.employee?.position?.name ?? null,
      permissions,
      scopes,
    };
  }
}
