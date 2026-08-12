import { Injectable, UnauthorizedException } from '@nestjs/common';
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
  ) {}

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

  /** 주체의 권한·스코프를 집계해 AuthPrincipal 생성 (JwtStrategy·/auth/me 공용). */
  async buildPrincipal(userId: string): Promise<AuthPrincipal | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      include: {
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
      };
    });

    const permissions = permSet.has(PERMISSION_WILDCARD) ? [PERMISSION_WILDCARD] : [...permSet];
    return {
      userId: user.id,
      loginId: user.loginId,
      principalType: user.principalType as PrincipalType,
      employeeId: user.employeeId,
      partnerId: user.partnerId,
      permissions,
      scopes,
    };
  }
}
