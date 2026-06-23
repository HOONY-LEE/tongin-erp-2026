import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PERMISSIONS, PERMISSION_WILDCARD, ROLE_SUPER_ADMIN } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 부팅 시 RBAC 기본 데이터(권한·슈퍼관리자 역할·초기 관리자)를 보장한다. 멱등.
 * 권한=데이터 원칙(개발원칙 §5): 코드의 PERMISSIONS 목록을 DB로 동기화.
 */
@Injectable()
export class AuthSeederService implements OnModuleInit {
  private readonly logger = new Logger(AuthSeederService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedPermissions();
    const role = await this.seedSuperAdminRole();
    await this.seedAdminUser(role.id);
  }

  private async seedPermissions(): Promise<void> {
    const codes = [PERMISSION_WILDCARD, ...PERMISSIONS];
    for (const code of codes) {
      await this.prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, name: code === PERMISSION_WILDCARD ? '전체 권한' : code },
      });
    }
  }

  private async seedSuperAdminRole() {
    const role = await this.prisma.role.upsert({
      where: { code: ROLE_SUPER_ADMIN },
      update: {},
      create: { code: ROLE_SUPER_ADMIN, name: '슈퍼관리자', description: '전체 권한(*)' },
    });
    const wildcard = await this.prisma.permission.findUnique({
      where: { code: PERMISSION_WILDCARD },
    });
    if (wildcard) {
      await this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: wildcard.id } },
        update: {},
        create: { roleId: role.id, permissionId: wildcard.id },
      });
    }
    return role;
  }

  private async seedAdminUser(roleId: string): Promise<void> {
    const loginId = 'admin';
    const existing = await this.prisma.appUser.findUnique({ where: { loginId } });
    if (existing) return;

    const usedEnv = Boolean(process.env.ADMIN_PASSWORD);
    const password = process.env.ADMIN_PASSWORD ?? 'admin1234';
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.appUser.create({
      data: { loginId, passwordHash, principalType: 'HUMAN' },
    });
    await this.prisma.userRole.create({
      data: { userId: user.id, roleId, orgScopeId: null, dataScope: 'ALL' },
    });

    this.logger.warn(
      `초기 관리자 생성: loginId=admin / password=${
        usedEnv ? '(env ADMIN_PASSWORD)' : 'admin1234 (기본값 — 운영 전 반드시 변경)'
      }`,
    );
  }
}
