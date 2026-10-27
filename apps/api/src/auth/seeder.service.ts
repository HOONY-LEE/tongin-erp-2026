import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  PERMISSIONS,
  PERMISSION_WILDCARD,
  ROLE_FIELD,
  ROLE_FRANCHISE,
  ROLE_OUTSOURCE,
  ROLE_SUPER_ADMIN,
  permissionLabel,
} from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 부팅 시 RBAC 기본 데이터(권한·슈퍼관리자 역할·초기 관리자)를 보장한다. 멱등.
 * 권한=데이터 원칙(개발원칙 §5): 코드의 PERMISSIONS 목록을 DB로 동기화.
 */
/** 등록·수정·삭제 세 가지(예전 'WRITE') */
const crud = (key: string) => [`${key}.CREATE`, `${key}.UPDATE`, `${key}.DELETE`];

@Injectable()
export class AuthSeederService implements OnModuleInit {
  private readonly logger = new Logger(AuthSeederService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedPermissions();
    const role = await this.seedSuperAdminRole();
    await this.seedAdminUser(role.id);
    await this.seedDemoAdmin(role.id);
    await this.linkAdminsToSystemEmployee();
    await this.seedOutsourceRole();
    await this.seedFieldRole();
    await this.seedFranchiseRoleAndUser();
  }

  /**
   * 관리자 계정(admin·demo.admin)을 '시스템관리자' 직원에 잇는다 — 관리자가 접수할 때
   * 담당자·접수 지점이 '시스템관리자'로 기본 선택되게. 조직은 그룹(HQ) 아래 SYS-ADMIN. 멱등.
   */
  private async linkAdminsToSystemEmployee(): Promise<void> {
    const parent = await this.prisma.orgUnit.findFirst({
      where: { parentId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const org = await this.prisma.orgUnit.upsert({
      where: { code: 'SYS-ADMIN' },
      update: {},
      create: { code: 'SYS-ADMIN', name: '시스템관리자', type: 'COMPANY', parentId: parent?.id },
    });
    const emp = await this.prisma.employee.upsert({
      where: { empNo: 'SYSADMIN' },
      update: {},
      create: { empNo: 'SYSADMIN', name: '시스템관리자', orgUnitId: org.id },
    });
    await this.prisma.appUser.updateMany({
      where: { loginId: { in: ['admin', 'demo.admin'] }, employeeId: null },
      data: { employeeId: emp.id },
    });
  }

  /** APP-02: 가맹점 역할 + 데모 가맹점 사용자(첫 BRANCH 조직 스코프). 멱등. */
  private async seedFranchiseRoleAndUser(): Promise<void> {
    const description = '본인 소속 조직(+하위)의 접수·견적 작성, 계약·작업·발주 조회/발주';
    const existed = await this.prisma.role.findUnique({ where: { code: ROLE_FRANCHISE } });
    const role = await this.prisma.role.upsert({
      where: { code: ROLE_FRANCHISE },
      update: {},
      create: {
        code: ROLE_FRANCHISE,
        name: '가맹점',
        description,
        isSystem: true,
        sortOrder: 10,
      },
    });
    const grant = [
      'ORG_UNIT.READ',
      'CUSTOMER.READ',
      'PRODUCT.READ',
      'CBM_ITEM.READ',
      'MATERIAL.READ',
      'LEAD.READ',
      // 지점장이 자기 지점 접수·견적을 직접 등록·작성한다(현장 견적사원 업무).
      // 쓰기도 서비스에서 소속 조직(+하위)만 허용하므로 다른 지점 건은 건드릴 수 없다.
      ...crud('LEAD'),
      'ESTIMATE.READ',
      ...crud('ESTIMATE'),
      'CONTRACT.READ',
      'PAYMENT.READ',
      'WORK_ORDER.READ',
      'MATERIAL_ORDER.READ',
      ...crud('MATERIAL_ORDER'),
      'SERVICE_ORDER.READ',
      ...crud('SERVICE_ORDER'),
      'SUPPORT.READ',
      ...crud('SUPPORT'),
      // AI 비서로 자기 지점 고객 조회·후속 문자 발송
      'AI.USE',
      'NOTIFICATION.SEND',
      'CALENDAR.READ',
      ...crud('CALENDAR'),
      // 대시보드 — 로그인 후 첫 화면이다. 통계는 조직 스코프로 집계되므로
      // 지점장은 자기 지점 수치만 본다(stats.service 참고).
      'STATS.READ',
    ];
    if (!existed) await this.grant(role.id, grant);

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
    const existed = await this.prisma.role.findUnique({ where: { code: ROLE_OUTSOURCE } });
    const role = await this.prisma.role.upsert({
      where: { code: ROLE_OUTSOURCE },
      update: {},
      create: {
        code: ROLE_OUTSOURCE,
        name: '전속업체',
        description: '본인 소속 작업오더 조회(원가 마스킹)',
        isSystem: true,
        fieldApp: true,
        sortOrder: 30,
      },
    });
    if (!existed) await this.grant(role.id, ['WORK_ORDER.READ']);
  }

  /** APP-03: 현장 작업팀 역할 — 본인에게 배정된 작업 조회 + 시작·완료. */
  private async seedFieldRole(): Promise<void> {
    const existed = await this.prisma.role.findUnique({ where: { code: ROLE_FIELD } });
    const role = await this.prisma.role.upsert({
      where: { code: ROLE_FIELD },
      update: {},
      create: {
        code: ROLE_FIELD,
        name: '현장 작업팀',
        description: '본인 배정 작업 조회 + 시작·완료 (현장 화면)',
        isSystem: true,
        fieldApp: true,
        sortOrder: 20,
      },
    });
    if (!existed) await this.grant(role.id, ['WORK_ORDER.READ', 'WORK_ORDER.UPDATE']);
  }

  /**
   * 기본 그룹의 권한은 그룹을 처음 만들 때만 넣는다 — 그 뒤로는 관리자가 권한 그룹
   * 화면에서 고친 내용이 기준이라, 서버를 다시 켤 때 빼 둔 권한이 되살아나면 안 된다.
   */
  private async grant(roleId: string, codes: string[]): Promise<void> {
    const perms = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    await this.prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  /** 카탈로그의 권한 코드를 DB와 맞춘다 — 이름은 화면용 한국어로 늘 새로 쓴다. */
  private async seedPermissions(): Promise<void> {
    const codes = [PERMISSION_WILDCARD, ...PERMISSIONS];
    for (const code of codes) {
      const name = permissionLabel(code);
      await this.prisma.permission.upsert({
        where: { code },
        update: { name },
        create: { code, name },
      });
    }
  }

  private async seedSuperAdminRole() {
    const role = await this.prisma.role.upsert({
      where: { code: ROLE_SUPER_ADMIN },
      update: { isSystem: true, sortOrder: 0 },
      create: {
        code: ROLE_SUPER_ADMIN,
        name: '슈퍼관리자',
        description: '전체 권한(*) — 새 메뉴도 자동으로 포함',
        isSystem: true,
        sortOrder: 0,
      },
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

  /**
   * 시연용 관리자(demo.admin) — 로그인 화면 데모 계정 목록에서 바로 들어가는 전체 권한 계정.
   * 진짜 admin 비밀번호(ADMIN_PASSWORD)는 알리지 않고 시연은 이 계정으로 한다.
   * 실고객 운영으로 바꿀 때는 DEMO_SEED=off 로 만들지 않게 하고, 이미 있으면 계정관리에서 끈다.
   */
  private async seedDemoAdmin(roleId: string): Promise<void> {
    if ((process.env.DEMO_SEED ?? '').toLowerCase() === 'off') return;
    const loginId = 'demo.admin';
    if (await this.prisma.appUser.findUnique({ where: { loginId } })) return;
    const passwordHash = await bcrypt.hash(process.env.DEMO_ADMIN_PASSWORD ?? 'tongin1234', 10);
    const user = await this.prisma.appUser.create({
      data: { loginId, passwordHash, principalType: 'HUMAN' },
    });
    await this.prisma.userRole.create({
      data: { userId: user.id, roleId, orgScopeId: null, dataScope: 'ALL' },
    });
    this.logger.warn('시연용 관리자 생성: loginId=demo.admin (DEMO_SEED=off면 만들지 않음)');
  }

  private async seedAdminUser(roleId: string): Promise<void> {
    const loginId = 'admin';
    const existing = await this.prisma.appUser.findUnique({ where: { loginId } });
    if (existing) {
      // 관리자 비밀번호를 잃었을 때의 복구 스위치 — ADMIN_PASSWORD_RESET=1 이면 부팅 때
      // ADMIN_PASSWORD로 다시 정하고 계정을 다시 켠다. 복구 뒤에는 이 값을 지워야 한다.
      if (process.env.ADMIN_PASSWORD_RESET === '1' && process.env.ADMIN_PASSWORD) {
        await this.prisma.appUser.update({
          where: { id: existing.id },
          data: { passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10), isActive: true },
        });
        this.logger.warn(
          '관리자(admin) 비밀번호를 ADMIN_PASSWORD로 다시 정했습니다 — ADMIN_PASSWORD_RESET을 지우세요.',
        );
      }
      return;
    }

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
