import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PrincipalCache } from '../../auth/principal-cache.service';
import { ScopeService } from '../../scope/scope.service';
import { PUBLIC_DEFAULT_PASSWORDS } from '../../common/util/demo-mode';
import { AccessService } from '../access/access.service';
import { nextEmpNo, withEmpNoRetry } from '../employee/emp-no';
import { toDate } from '../employee/employee.service';
import type { RoleAssignmentDto } from '../access/dto/access.dto';
import { AccountEmployeeDto, CreateAccountDto, LOGIN_ID_PATTERN } from './dto/create-account.dto';

/** 계정관리(관리자) — 계정 생성·활성/비활성·역할 부여. */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly principals: PrincipalCache,
    private readonly scope: ScopeService,
  ) {}

  /**
   * 계정을 고칠 수 있는 사람인지 — 권한 그룹 바꾸기(setUserRoles)와 같은 기준을 직원 연결·직원 정보·활성 전환에도.
   *  - 전체관리자('*') 계정은 전체관리자만 고친다
   *  - 데이터 범위가 조직이면 그 안 조직의 계정만, 옮기는 조직도 그 안으로만(orgUnitIds)
   */
  private async assertCanManage(userId: string, actor: AuthPrincipal, orgUnitIds: string[] = []) {
    if (actor.permissions.includes(PERMISSION_WILDCARD)) return;
    const target = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        employee: { select: { orgUnitId: true } },
        userRoles: {
          select: {
            role: {
              select: { rolePerms: { where: { permission: { code: PERMISSION_WILDCARD } } } },
            },
          },
        },
      },
    });
    if (!target) throw new NotFoundException('계정을 찾을 수 없습니다.');
    if (target.userRoles.some((ur) => ur.role.rolePerms.length > 0)) {
      throw new ForbiddenException('전체관리자 계정은 전체관리자만 고칠 수 있습니다.');
    }
    const myOrgIds = await this.scope.orgScopeIds(actor);
    if (myOrgIds === null) return;
    const targetOrg = target.employee?.orgUnitId ?? null;
    if (
      !targetOrg ||
      !myOrgIds.includes(targetOrg) ||
      orgUnitIds.some((o) => !myOrgIds.includes(o))
    ) {
      throw new ForbiddenException('내 데이터 범위 밖 조직의 계정은 고칠 수 없습니다.');
    }
  }

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
        partner: { select: { name: true } },
        employee: {
          select: {
            id: true,
            name: true,
            orgUnitId: true,
            phone: true,
            empNo: true,
            hireDate: true,
            isActive: true,
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
      partnerName: u.partner?.name ?? null,
      employeeName: u.employee?.name ?? null,
      orgUnitId: u.employee?.orgUnitId ?? null,
      positionId: u.employee?.position?.id ?? null,
      phone: u.employee?.phone ?? null,
      empNo: u.employee?.empNo ?? null,
      hireDate: u.employee?.hireDate?.toISOString().slice(0, 10) ?? null,
      /** 재직 여부(직원) — 계정 활성 여부(isActive)와 따로다. 외부 계정이면 null */
      employeeActive: u.employee?.isActive ?? null,
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

  /** 아이디 중복 확인(계정 생성 폼) — 형식이 틀려도 쓸 수 없다고 알려 준다. */
  async checkLoginId(loginId: string) {
    const id = loginId.trim();
    if (!LOGIN_ID_PATTERN.test(id)) {
      return { available: false, reason: '영문·숫자·. _ - 로 3~50자로 입력해 주세요.' };
    }
    const exists = await this.prisma.appUser.findUnique({ where: { loginId: id } });
    return exists
      ? { available: false, reason: '이미 사용 중인 아이디입니다.' }
      : { available: true, reason: null };
  }

  /**
   * 계정 생성 = 직원 등록. 직원 정보(이름·소속·직책)를 함께 받아 직원과 계정을 한 번에 만든다.
   * 권한 그룹은 여러 개를 함께 줄 수 있다(roles). 예전 화면 호환으로 employeeId(기존 직원 연결)·
   * roleId 하나만 와도 받는다. 권한 상승·조직 검사는 권한 부여와 같은 규칙을 탄다.
   */
  async create(dto: CreateAccountDto, actor: AuthPrincipal) {
    const loginId = dto.loginId.trim();
    const exists = await this.prisma.appUser.findUnique({ where: { loginId } });
    if (exists) throw new ConflictException('이미 사용 중인 아이디입니다.');
    const roles =
      dto.roles ??
      (dto.roleId
        ? [{ roleId: dto.roleId, dataScope: dto.dataScope ?? 'OWN', orgScopeId: dto.orgScopeId }]
        : []);
    if (!roles.length) throw new BadRequestException('권한 그룹을 하나 이상 골라 주세요.');
    if (!dto.employee && dto.employeeId) {
      const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
      if (!emp) throw new BadRequestException('직원을 목록에서 다시 골라 주세요.');
      // 이미 계정이 있는 직원에 계정을 하나 더 만들어 그 사람으로 결재·인사 화면을 여는 일을 막는다
      if (await this.prisma.appUser.count({ where: { employeeId: dto.employeeId } })) {
        throw new ConflictException('이미 계정이 있는 직원입니다.');
      }
    }
    if (PUBLIC_DEFAULT_PASSWORDS.includes(dto.password)) {
      throw new BadRequestException(
        '누구나 아는 기본 비밀번호는 쓸 수 없습니다. 다른 비밀번호로 해 주세요.',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { user, createdEmployeeId } = await withEmpNoRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const emp = dto.employee
          ? await tx.employee.create({ data: await this.newEmployeeData(tx, dto.employee) })
          : null;
        const employeeId = emp?.id ?? dto.employeeId ?? null;
        const user = await tx.appUser.create({
          data: { loginId, passwordHash, principalType: 'HUMAN', employeeId },
        });
        return { user, createdEmployeeId: emp?.id ?? null };
      }),
    ).catch((e) => {
      throw this.mapError(e);
    });
    try {
      await this.access.setUserRoles(user.id, roles, actor);
    } catch (e) {
      // 권한 부여가 막히면 빈 계정(과 같이 만든 직원)이 남지 않게 지운다
      await this.prisma.appUser.delete({ where: { id: user.id } });
      if (createdEmployeeId)
        await this.prisma.employee.delete({ where: { id: createdEmployeeId } });
      throw e;
    }
    return { id: user.id, loginId: user.loginId };
  }

  /** 계정의 직원 정보 고치기 — 연결된 직원이 없으면(예전 계정) 새로 만들어 붙인다. */
  async setProfile(id: string, dto: AccountEmployeeDto, actor: AuthPrincipal) {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');
    // 소속을 내 범위로 끌어와 권한을 바꾸는 우회도 막는다(옮길 조직도 범위 안이어야)
    await this.assertCanManage(id, actor, [dto.orgUnitId]);
    const data = this.employeeData(dto);
    try {
      if (user.employeeId) {
        // 비워 둔 사번은 이미 매긴 번호를 그대로 둔다
        await this.prisma.employee.update({
          where: { id: user.employeeId },
          data: { ...data, empNo: data.empNo ?? undefined },
        });
      } else {
        await withEmpNoRetry(() =>
          this.prisma.$transaction(async (tx) => {
            const emp = await tx.employee.create({ data: await this.newEmployeeData(tx, dto) });
            await tx.appUser.update({ where: { id }, data: { employeeId: emp.id } });
          }),
        );
      }
    } catch (e) {
      throw this.mapError(e);
    }
    this.principals.invalidateUser(id);
    return { id };
  }

  private employeeData(dto: AccountEmployeeDto) {
    return {
      name: dto.name.trim(),
      orgUnitId: dto.orgUnitId,
      positionId: dto.positionId ?? null,
      phone: dto.phone?.trim() || null,
      empNo: dto.empNo?.trim() || null,
      hireDate: toDate(dto.hireDate),
    };
  }

  /** 새 직원 — 사번을 비웠으면 입사연도+일련번호로 매긴다 */
  private async newEmployeeData(tx: Prisma.TransactionClient, dto: AccountEmployeeDto) {
    const data = this.employeeData(dto);
    return { ...data, empNo: data.empNo ?? (await nextEmpNo(tx, data.hireDate)) };
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        const target = String(e.meta?.target ?? '');
        return new ConflictException(
          target.includes('emp_no') ? '이미 존재하는 사번입니다.' : '이미 사용 중인 아이디입니다.',
        );
      }
      if (e.code === 'P2003') {
        return new BadRequestException('소속이나 직책을 목록에서 다시 골라 주세요.');
      }
    }
    return e as Error;
  }

  /** 계정의 권한 그룹(+데이터 범위)을 통째로 바꾼다. */
  setRoles(id: string, roles: RoleAssignmentDto[], actor: AuthPrincipal) {
    return this.access.setUserRoles(id, roles, actor);
  }

  /** 계정에 연결할 직원 바꾸기(직책·소속은 직원 정보를 따른다). */
  async setEmployee(id: string, employeeId: string | null, actor: AuthPrincipal) {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');
    // 내 계정을 다른 직원(예: 대표)에 다시 이어 그 사람 결재·인사 화면을 여는 일을 막는다
    if (actor.userId === id && !actor.permissions.includes(PERMISSION_WILDCARD)) {
      throw new ForbiddenException('본인 계정의 연결 직원은 바꿀 수 없습니다.');
    }
    let empOrg: string[] = [];
    if (employeeId) {
      const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
      if (!emp) throw new BadRequestException('직원을 목록에서 다시 골라 주세요.');
      if (!emp.isActive || emp.resignDate) {
        throw new BadRequestException('퇴사·비활성 직원에는 계정을 이을 수 없습니다.');
      }
      const taken = await this.prisma.appUser.count({
        where: { employeeId, id: { not: id } },
      });
      if (taken) throw new ConflictException('이미 다른 계정과 이어진 직원입니다.');
      empOrg = [emp.orgUnitId];
    }
    await this.assertCanManage(id, actor, empOrg);
    const row = await this.prisma.appUser.update({
      where: { id },
      data: { employeeId },
      select: { id: true, loginId: true, employeeId: true },
    });
    this.principals.invalidateUser(id);
    return row;
  }

  /**
   * 비밀번호 재설정(관리자) — 비밀번호를 잊은 직원, 공개된 기본 비밀번호를 쓰던 시드 계정을 새 비밀번호로.
   * 고칠 수 있는 계정 기준은 다른 계정 수정과 같다(범위 안, 전체관리자 계정은 전체관리자만).
   * 본인 비밀번호는 지금 비밀번호를 확인하는 '내 비밀번호 바꾸기'(POST /auth/password)로만.
   * 새 비밀번호는 감사 기록에 남지 않는다(응답은 id뿐).
   */
  async resetPassword(id: string, password: string, actor: AuthPrincipal) {
    if (actor.userId === id) {
      throw new BadRequestException("본인 비밀번호는 '내 비밀번호 바꾸기'에서 바꿔 주세요.");
    }
    const user = await this.prisma.appUser.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');
    await this.assertCanManage(id, actor);
    if (PUBLIC_DEFAULT_PASSWORDS.includes(password)) {
      throw new BadRequestException(
        '누구나 아는 기본 비밀번호는 쓸 수 없습니다. 다른 비밀번호로 해 주세요.',
      );
    }
    await this.prisma.appUser.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { id };
  }

  /**
   * 활성/비활성 전환. 비활성화는 두 경우를 막는다 —
   *  1) 본인 계정: 지금 쓰고 있는 관리자가 스스로를 잠가 버린다.
   *  2) 마지막 전체관리자('*'): 다시 켜 줄 사람이 아무도 남지 않는다.
   * 화면에서 버튼을 숨기는 것만으로는 API·다른 클라이언트 호출을 못 막아 서버에서 판정한다.
   */
  async setActive(id: string, isActive: boolean, actor?: AuthPrincipal) {
    const user = await this.prisma.appUser.findUnique({
      where: { id },
      include: { employee: { select: { isActive: true, resignDate: true } } },
    });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');
    if (actor) await this.assertCanManage(id, actor);
    // 퇴사자 계정을 다시 켜 로그인하게 두지 않는다 — 다시 쓰려면 직원부터 재직으로 되돌린다
    if (isActive && user.employee && (!user.employee.isActive || user.employee.resignDate)) {
      throw new BadRequestException(
        '퇴사·비활성 직원의 계정은 켤 수 없습니다. 직원 정보를 먼저 고쳐 주세요.',
      );
    }
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
    const row = await this.prisma.appUser.update({
      where: { id },
      data: { isActive },
      select: { id: true, loginId: true, isActive: true },
    });
    this.principals.invalidateUser(id); // 비활성화는 다음 요청부터 바로 막힌다
    return row;
  }
}
