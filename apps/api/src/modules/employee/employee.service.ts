import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStoreService } from '../../prisma/file-store.service';
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrincipalCache } from '../../auth/principal-cache.service';
import { CreateEmployeeDto, ChecklistTemplateDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { nextEmpNo, withEmpNoRetry } from './emp-no';

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly principals: PrincipalCache,
    private readonly store: FileStoreService,
  ) {}

  // ── 프로필 사진 ──

  /** 사진 바꾸기 — 인사 수정 권한이 있거나 본인만 */
  async setPhoto(id: string, p: AuthPrincipal, data: string) {
    this.assertPhotoEditor(id, p);
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length) throw new BadRequestException('사진 내용이 비어 있습니다.');
    if (bytes.length > 2 * 1024 * 1024)
      throw new BadRequestException('사진은 2MB까지 올릴 수 있습니다.');
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50;
    if (!jpeg && !png) throw new BadRequestException('JPG·PNG 사진만 올릴 수 있습니다.');
    const exists = await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('직원을 찾을 수 없습니다.');
    const stored = await this.store.put(bytes, jpeg ? 'image/jpeg' : 'image/png');
    const row = await this.prisma.employee.update({
      where: { id },
      data: { photoBytes: stored.bytes, photoKey: stored.storageKey, photoAt: new Date() },
      select: { photoAt: true },
    });
    return { photoAt: row.photoAt };
  }

  async removePhoto(id: string, p: AuthPrincipal) {
    this.assertPhotoEditor(id, p);
    await this.prisma.employee.update({
      where: { id },
      data: { photoBytes: null, photoKey: null, photoAt: null },
    });
    return { photoAt: null };
  }

  // ── 프로필(누구나 보는 직원 정보 페이지) ──

  /**
   * 프로필 — 로그인한 직원이면 누구나 본다(사내 연락처처럼).
   * 주소·메모는 본인이거나 인사 열람 권한(EMPLOYEE.READ)이 있을 때만.
   */
  async profile(id: string, p: AuthPrincipal) {
    const e = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        empNo: true,
        hireDate: true,
        employmentType: true,
        phone: true,
        email: true,
        zipcode: true,
        addr: true,
        addrDetail: true,
        memo: true,
        isActive: true,
        resignDate: true,
        photoAt: true,
        position: { select: { name: true } },
        orgUnit: { select: { name: true } },
        appUsers: {
          select: {
            loginId: true,
            isActive: true,
            userRoles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    });
    if (!e) throw new NotFoundException('직원을 찾을 수 없습니다.');
    const self = p.employeeId === id;
    const hr =
      p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes('EMPLOYEE.READ');
    const { appUsers, zipcode, addr, addrDetail, memo, ...rest } = e;
    return {
      ...rest,
      self,
      loginIds: appUsers.map((u) => ({ loginId: u.loginId, isActive: u.isActive })),
      roles: [...new Set(appUsers.flatMap((u) => u.userRoles.map((r) => r.role.name)))],
      ...(self || hr ? { zipcode, addr, addrDetail, memo } : {}),
    };
  }

  /** 내 프로필 고치기 — 본인은 연락처·이메일·주소만(직책·소속·사번은 인사 담당이) */
  async updateMyProfile(
    id: string,
    p: AuthPrincipal,
    dto: {
      phone?: string | null;
      email?: string | null;
      zipcode?: string | null;
      addr?: string | null;
      addrDetail?: string | null;
    },
  ) {
    if (p.employeeId !== id) throw new ForbiddenException('내 프로필만 고칠 수 있습니다.');
    const clean = (v: string | null | undefined) =>
      v === undefined ? undefined : v?.trim() || null;
    await this.prisma.employee.update({
      where: { id },
      data: {
        phone: clean(dto.phone),
        email: clean(dto.email),
        zipcode: clean(dto.zipcode),
        addr: clean(dto.addr),
        addrDetail: clean(dto.addrDetail),
      },
    });
    return this.profile(id, p);
  }

  /** 사진 있는 직원 — { id: photoAt } */
  async photoIndex(): Promise<Record<string, string>> {
    const rows = await this.prisma.employee.findMany({
      where: { photoAt: { not: null } },
      select: { id: true, photoAt: true },
    });
    return Object.fromEntries(rows.map((r) => [r.id, r.photoAt!.toISOString()]));
  }

  /** 사진 받기 — 로그인한 직원이면 누구나(사내 연락처처럼) */
  async photo(id: string) {
    const e = await this.prisma.employee.findUnique({
      where: { id },
      select: { photoBytes: true, photoKey: true },
    });
    if (!e || (!e.photoBytes && !e.photoKey)) throw new NotFoundException('사진이 없습니다.');
    const bytes = await this.store.read({ bytes: e.photoBytes, storageKey: e.photoKey });
    return { bytes, mediaType: bytes[0] === 0x89 ? 'image/png' : 'image/jpeg' };
  }

  private assertPhotoEditor(id: string, p: AuthPrincipal) {
    const ok =
      p.employeeId === id ||
      p.permissions.includes(PERMISSION_WILDCARD) ||
      p.permissions.includes('EMPLOYEE.UPDATE');
    if (!ok)
      throw new ForbiddenException('본인 사진이나 인사 수정 권한이 있을 때만 바꿀 수 있습니다.');
  }

  findAll(orgUnitId?: string) {
    return this.prisma.employee.findMany({
      where: orgUnitId ? { orgUnitId } : undefined,
      include: {
        position: { select: { name: true, sortOrder: true } },
        orgUnit: { select: { name: true } },
        concurrentOrgs: {
          select: { orgUnitId: true, position: { select: { name: true, sortOrder: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.employee.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`직원을 찾을 수 없습니다: ${id}`);
    return found;
  }

  /** 날짜 칸(YYYY-MM-DD) → Date, 빈 문자열은 null로 */
  private hrFields(dto: Partial<CreateEmployeeDto>) {
    const blank = (v: string | null | undefined) =>
      v === undefined ? undefined : v?.trim() || null;
    return {
      birthDate: dto.birthDate === undefined ? undefined : toDate(dto.birthDate),
      email: blank(dto.email),
      zipcode: blank(dto.zipcode),
      addr: blank(dto.addr),
      addrDetail: blank(dto.addrDetail),
      emergencyName: blank(dto.emergencyName),
      emergencyPhone: blank(dto.emergencyPhone),
      emergencyRelation: blank(dto.emergencyRelation),
      memo: blank(dto.memo),
    };
  }

  /** 체크리스트 기본 항목을 그 직원 체크리스트로 복사(이미 그 종류 항목이 있으면 건너뜀) */
  private async seedChecklist(
    tx: Prisma.TransactionClient,
    employeeId: string,
    kind: 'ONBOARD' | 'OFFBOARD',
  ) {
    const has = await tx.employeeChecklistItem.count({ where: { employeeId, kind } });
    if (has > 0) return;
    const templates = await tx.hrChecklistTemplate.findMany({
      where: { kind, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (templates.length === 0) return;
    await tx.employeeChecklistItem.createMany({
      data: templates.map((t) => ({ employeeId, kind, title: t.title, sortOrder: t.sortOrder })),
    });
  }

  async create(dto: CreateEmployeeDto, actorUserId?: string) {
    const hireDate = toDate(dto.hireDate);
    try {
      return await withEmpNoRetry(async () => {
        const empNo = dto.empNo?.trim() || (await nextEmpNo(this.prisma, hireDate));
        return this.prisma.$transaction(async (tx) => {
          const row = await tx.employee.create({
            data: { ...dto, ...this.hrFields(dto), hireDate, empNo },
          });
          // 입사 이력 + 입사 체크리스트
          await tx.employeeHistory.create({
            data: {
              employeeId: row.id,
              kind: 'JOIN',
              toOrgId: row.orgUnitId,
              toPositionId: row.positionId,
              effectiveDate: hireDate ?? todayDate(),
              createdByUserId: actorUserId ?? null,
            },
          });
          await this.seedChecklist(tx, row.id, 'ONBOARD');
          return row;
        });
      });
    } catch (e) {
      throw this.mapError(e, dto.empNo);
    }
  }

  async update(id: string, dto: UpdateEmployeeDto, actorUserId?: string) {
    const before = await this.findOne(id);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const row = await tx.employee.update({
          where: { id },
          data: {
            ...dto,
            ...this.hrFields(dto),
            empNo: dto.empNo?.trim() || undefined, // 비워도 이미 매긴 사번은 그대로 둔다
            hireDate: dto.hireDate === undefined ? undefined : toDate(dto.hireDate),
          },
        });
        // 직원을 '비활성'으로 바꾸면 그 사람 계정도 로그인 못 하게(퇴사 처리와 같게)
        if (dto.isActive === false && before.isActive)
          await tx.appUser.updateMany({ where: { employeeId: id }, data: { isActive: false } });
        // 겸직하던 조직이 주 소속이 되면 겸직 줄은 지운다
        if (row.orgUnitId !== before.orgUnitId)
          await tx.employeeConcurrentOrg.deleteMany({
            where: { employeeId: id, orgUnitId: row.orgUnitId },
          });
        // 소속·직책이 바뀌면 발령 이력을 남긴다
        if (row.orgUnitId !== before.orgUnitId)
          await tx.employeeHistory.create({
            data: {
              employeeId: id,
              kind: 'TRANSFER',
              fromOrgId: before.orgUnitId,
              toOrgId: row.orgUnitId,
              effectiveDate: todayDate(),
              createdByUserId: actorUserId ?? null,
            },
          });
        if (row.positionId !== before.positionId)
          await tx.employeeHistory.create({
            data: {
              employeeId: id,
              kind: 'POSITION',
              fromPositionId: before.positionId,
              toPositionId: row.positionId,
              effectiveDate: todayDate(),
              createdByUserId: actorUserId ?? null,
            },
          });
        return row;
      });
      this.principals.invalidateAll(); // 계정 주체에 직원 이름·소속·직책이 실린다
      return row;
    } catch (e) {
      throw this.mapError(e, dto.empNo);
    }
  }

  // ── 인사기록 ──

  /** 인사기록 카드 — 기본·인사 정보 + 입·퇴사 체크리스트 + 발령 이력(이름까지 풀어서) */
  async hrRecord(id: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        position: { select: { name: true } },
        orgUnit: { select: { name: true, type: true } },
        concurrentOrgs: {
          select: {
            orgUnitId: true,
            positionId: true,
            createdAt: true,
            orgUnit: { select: { name: true, type: true } },
            position: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        appUsers: {
          select: {
            loginId: true,
            isActive: true,
            userRoles: { select: { role: { select: { name: true } } } },
          },
        },
        checklistItems: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
        histories: { orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!emp) throw new NotFoundException(`직원을 찾을 수 없습니다: ${id}`);
    const orgIds = emp.histories
      .flatMap((h) => [h.fromOrgId, h.toOrgId])
      .filter(Boolean) as string[];
    const posIds = emp.histories
      .flatMap((h) => [h.fromPositionId, h.toPositionId])
      .filter(Boolean) as string[];
    const [orgs, positions] = await Promise.all([
      this.prisma.orgUnit.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      }),
      this.prisma.position.findMany({
        where: { id: { in: posIds } },
        select: { id: true, name: true },
      }),
    ]);
    const on = new Map(orgs.map((o) => [o.id, o.name]));
    const pn = new Map(positions.map((p) => [p.id, p.name]));
    return {
      ...emp,
      histories: emp.histories.map((h) => ({
        ...h,
        fromOrgName: h.fromOrgId ? (on.get(h.fromOrgId) ?? null) : null,
        toOrgName: h.toOrgId ? (on.get(h.toOrgId) ?? null) : null,
        fromPositionName: h.fromPositionId ? (pn.get(h.fromPositionId) ?? null) : null,
        toPositionName: h.toPositionId ? (pn.get(h.toPositionId) ?? null) : null,
      })),
    };
  }

  // ── 겸직(추가 소속) ──

  /** 겸직 추가 — 주 소속과 같은 조직은 안 된다. 이미 있으면 직책만 바꾼다. 발령 이력을 남긴다 */
  async addConcurrent(
    id: string,
    input: { orgUnitId: string; positionId?: string | null },
    actorUserId?: string,
  ) {
    const emp = await this.findOne(id);
    if (emp.orgUnitId === input.orgUnitId) {
      throw new BadRequestException('주 소속 조직은 겸직으로 더할 수 없습니다.');
    }
    const org = await this.prisma.orgUnit.findUnique({ where: { id: input.orgUnitId } });
    if (!org) throw new BadRequestException('없는 조직입니다. 목록에서 다시 골라 주세요.');
    const positionId = input.positionId || null;
    await this.prisma.$transaction(async (tx) => {
      const had = await tx.employeeConcurrentOrg.findUnique({
        where: { employeeId_orgUnitId: { employeeId: id, orgUnitId: input.orgUnitId } },
      });
      await tx.employeeConcurrentOrg.upsert({
        where: { employeeId_orgUnitId: { employeeId: id, orgUnitId: input.orgUnitId } },
        create: { employeeId: id, orgUnitId: input.orgUnitId, positionId },
        update: { positionId },
      });
      if (!had)
        await tx.employeeHistory.create({
          data: {
            employeeId: id,
            kind: 'CONCURRENT_ADD',
            toOrgId: input.orgUnitId,
            toPositionId: positionId,
            effectiveDate: todayDate(),
            createdByUserId: actorUserId ?? null,
          },
        });
    });
    this.principals.invalidateAll(); // 메뉴·공지·작업관리가 겸직 조직을 따른다
    return this.hrRecord(id);
  }

  /** 겸직 해제 */
  async removeConcurrent(id: string, orgUnitId: string, actorUserId?: string) {
    const row = await this.prisma.employeeConcurrentOrg.findUnique({
      where: { employeeId_orgUnitId: { employeeId: id, orgUnitId } },
    });
    if (!row) throw new NotFoundException('겸직 중인 조직이 아닙니다.');
    await this.prisma.$transaction([
      this.prisma.employeeConcurrentOrg.delete({ where: { id: row.id } }),
      this.prisma.employeeHistory.create({
        data: {
          employeeId: id,
          kind: 'CONCURRENT_END',
          fromOrgId: orgUnitId,
          fromPositionId: row.positionId,
          effectiveDate: todayDate(),
          createdByUserId: actorUserId ?? null,
        },
      }),
    ]);
    this.principals.invalidateAll();
    return this.hrRecord(id);
  }

  /** 퇴사 처리 — 퇴사일·사유, 재직 해제, 연결 계정 로그인 막기, 퇴사 이력·체크리스트 */
  async resign(id: string, input: { resignDate: string; reason?: string }, actorUserId?: string) {
    const before = await this.findOne(id);
    if (before.resignDate) throw new BadRequestException('이미 퇴사 처리된 직원입니다.');
    const resignDate = toDate(input.resignDate)!;
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { resignDate, resignReason: input.reason?.trim() || null, isActive: false },
      });
      await tx.appUser.updateMany({ where: { employeeId: id }, data: { isActive: false } });
      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          kind: 'RESIGN',
          fromOrgId: before.orgUnitId,
          fromPositionId: before.positionId,
          effectiveDate: resignDate,
          note: input.reason?.trim() || null,
          createdByUserId: actorUserId ?? null,
        },
      });
      await this.seedChecklist(tx, id, 'OFFBOARD');
    });
    this.principals.invalidateAll(); // 막은 계정의 로그인 세션 정보도 다시 읽게
    return this.hrRecord(id);
  }

  /** 체크리스트 항목 완료/취소 */
  async toggleChecklist(employeeId: string, itemId: string, done: boolean, actorUserId?: string) {
    const item = await this.prisma.employeeChecklistItem.findFirst({
      where: { id: itemId, employeeId },
    });
    if (!item) throw new NotFoundException('체크리스트 항목을 찾을 수 없습니다.');
    return this.prisma.employeeChecklistItem.update({
      where: { id: itemId },
      data: done
        ? { doneAt: new Date(), doneByUserId: actorUserId ?? null }
        : { doneAt: null, doneByUserId: null },
    });
  }

  /** 체크리스트가 없는 직원(예전에 등록한 직원)에게 기본 항목을 펼친다 */
  async openChecklist(employeeId: string, kind: 'ONBOARD' | 'OFFBOARD') {
    await this.findOne(employeeId);
    await this.prisma.$transaction((tx) => this.seedChecklist(tx, employeeId, kind));
    return this.hrRecord(employeeId);
  }

  // ── 체크리스트 기본 항목 ──

  checklistTemplates() {
    return this.prisma.hrChecklistTemplate.findMany({
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  createChecklistTemplate(dto: ChecklistTemplateDto) {
    return this.prisma.hrChecklistTemplate.create({ data: { ...dto, title: dto.title.trim() } });
  }

  updateChecklistTemplate(id: string, dto: ChecklistTemplateDto) {
    return this.prisma.hrChecklistTemplate.update({
      where: { id },
      data: { ...dto, title: dto.title.trim() },
    });
  }

  async removeChecklistTemplate(id: string) {
    await this.prisma.hrChecklistTemplate.delete({ where: { id } });
  }

  async remove(id: string) {
    await this.findOne(id);
    const row = await this.prisma.employee.delete({ where: { id } });
    this.principals.invalidateAll();
    return row;
  }

  private mapError(e: unknown, empNo?: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException(`이미 존재하는 사번입니다: ${empNo}`);
      if (e.code === 'P2003')
        return new BadRequestException('소속 지점이나 직책을 목록에서 다시 골라 주세요.');
    }
    return e as Error;
  }
}

/** 'YYYY-MM-DD' → Date(없으면 null) */
export function toDate(v?: string | null) {
  return v ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null;
}

/** 한국 날짜 기준 오늘(발령 이력의 날짜) */
function todayDate() {
  return toDate(new Date(Date.now() + 9 * 3600_000).toISOString())!;
}
