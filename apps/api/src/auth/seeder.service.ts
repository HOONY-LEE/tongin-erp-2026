import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  PERMISSIONS,
  PERMISSION_WILDCARD,
  ROLE_FIELD,
  ROLE_FRANCHISE,
  ROLE_OUTSOURCE,
  ROLE_SUPER_ADMIN,
} from '@tongin/shared';
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
    await this.seedOutsourceRole();
    await this.seedFieldRole();
    await this.seedFranchiseRoleAndUser();
  }

  /** APP-02: 가맹점 역할 + 데모 가맹점 사용자(첫 BRANCH 조직 스코프). 멱등. */
  private async seedFranchiseRoleAndUser(): Promise<void> {
    const role = await this.prisma.role.upsert({
      where: { code: ROLE_FRANCHISE },
      update: {},
      create: {
        code: ROLE_FRANCHISE,
        name: '가맹점',
        description: '본인 소속 조직(+하위)의 리드·견적·계약·작업·발주 조회/발주',
      },
    });
    const grant = [
      'ORG_UNIT.READ',
      'CUSTOMER.READ',
      'PRODUCT.READ',
      'CBM_ITEM.READ',
      'MATERIAL.READ',
      'LEAD.READ',
      'ESTIMATE.READ',
      'CONTRACT.READ',
      'PAYMENT.READ',
      'WORK_ORDER.READ',
      'MATERIAL_ORDER.READ',
      'MATERIAL_ORDER.WRITE',
      'SERVICE_ORDER.READ',
      'SERVICE_ORDER.WRITE',
      'SUPPORT.READ',
      'SUPPORT.WRITE',
      'CALENDAR.READ',
      'CALENDAR.WRITE',
      // 대시보드 — 로그인 후 첫 화면이다. 통계는 조직 스코프로 집계되므로
      // 지점장은 자기 지점 수치만 본다(stats.service 참고).
      'STATS.READ',
    ];
    for (const code of grant) {
      const perm = await this.prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      await this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }

    const existing = await this.prisma.appUser.findUnique({ where: { loginId: 'franchise' } });
    if (existing) return;
    const branch = await this.prisma.orgUnit.findFirst({
      where: { type: 'BRANCH' },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      this.logger.log('가맹점 데모 사용자 생략: BRANCH 조직이 아직 없습니다.');
      return;
    }
    const passwordHash = await bcrypt.hash('franchise1234', 10);
    const user = await this.prisma.appUser.create({
      data: { loginId: 'franchise', passwordHash, principalType: 'HUMAN' },
    });
    await this.prisma.userRole.create({
      data: { userId: user.id, roleId: role.id, orgScopeId: branch.id, dataScope: 'ORG' },
    });
    this.logger.warn(
      `가맹점 데모 사용자 생성: loginId=franchise / password=franchise1234 (조직 스코프: ${branch.name})`,
    );
  }

  /** OPS-04: 외부 전속업체 제한 역할 — 작업오더 조회만(데이터범위는 app_user.partnerId로 제한). */
  private async seedOutsourceRole(): Promise<void> {
    const role = await this.prisma.role.upsert({
      where: { code: ROLE_OUTSOURCE },
      update: {},
      create: {
        code: ROLE_OUTSOURCE,
        name: '전속업체',
        description: '본인 소속 작업오더 조회(원가 마스킹)',
      },
    });
    const perm = await this.prisma.permission.findUnique({ where: { code: 'WORK_ORDER.READ' } });
    if (perm) {
      await this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  /** APP-03: 현장 작업팀 역할 — 본인에게 배정된 작업 조회 + 시작·완료. */
  private async seedFieldRole(): Promise<void> {
    const role = await this.prisma.role.upsert({
      where: { code: ROLE_FIELD },
      update: {},
      create: {
        code: ROLE_FIELD,
        name: '현장 작업팀',
        description: '본인 배정 작업 조회 + 시작·완료 (현장 화면)',
      },
    });
    for (const code of ['WORK_ORDER.READ', 'WORK_ORDER.WRITE']) {
      const perm = await this.prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      await this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
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
