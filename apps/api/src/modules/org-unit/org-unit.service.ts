import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createWithCode, normalizeName } from '../../common/util/master-code';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';

/** 목록 순서 — 본사(그룹·법인·부서·TF)가 먼저, 지점, 외부업체 */
const ORG_TYPE_ORDER: Record<string, number> = {
  GROUP: 0,
  COMPANY: 1,
  DEPT: 2,
  TF: 2,
  BRANCH: 10,
  PARTNER: 20,
};

const STAFF_SELECT = {
  id: true,
  name: true,
  orgUnitId: true,
  position: { select: { name: true, sortOrder: true } },
} satisfies Prisma.EmployeeSelect;

/** 직책 높은 순(직책 순서 값이 작을수록 높다), 같으면 이름 순 */
function rankStaff<
  T extends { name: string; position: { name: string; sortOrder: number } | null },
>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      (a.position?.sortOrder ?? 9999) - (b.position?.sortOrder ?? 9999) ||
      a.name.localeCompare(b.name, 'ko'),
  );
}

@Injectable()
export class OrgUnitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * 조직 목록 — 고르는 칸(소속 등)에서 본사가 먼저 나오게: 그룹 → 법인 → 부서·TF(코드순, 조직도 순서) →
   * 지점(이름순) → 외부업체
   */
  async findAll() {
    const [rows, staff] = await Promise.all([
      this.prisma.orgUnit.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.employee.findMany({
        where: { isActive: true },
        select: STAFF_SELECT,
      }),
    ]);
    // 조직별 인원·조직장(그 조직에서 직책이 가장 높은 사람 — 결재선 '부서장'과 같은 기준)
    const byOrg = new Map<string, typeof staff>();
    for (const e of staff) {
      const list = byOrg.get(e.orgUnitId) ?? [];
      list.push(e);
      byOrg.set(e.orgUnitId, list);
    }
    const rank = (t: string) => ORG_TYPE_ORDER[t] ?? 50;
    return rows
      .sort(
        (a, b) =>
          rank(a.type) - rank(b.type) ||
          (a.type === 'BRANCH' ? a.name.localeCompare(b.name, 'ko') : 0),
      )
      .map((o) => {
        const list = byOrg.get(o.id) ?? [];
        const head = rankStaff(list)[0];
        return {
          ...o,
          memberCount: list.length,
          headName: head ? head.name : null,
          headPosition: head?.position?.name ?? null,
        };
      });
  }

  /** 조직 직원 — 조직장(직책이 가장 높은 사람) 먼저, 직책·이름 순 */
  async members(id: string) {
    await this.findOne(id);
    const staff = await this.prisma.employee.findMany({
      where: { orgUnitId: id, isActive: true },
      select: { ...STAFF_SELECT, empNo: true, hireDate: true, email: true },
    });
    return rankStaff(staff).map((e, i) => ({
      id: e.id,
      name: e.name,
      empNo: e.empNo,
      position: e.position?.name ?? null,
      hireDate: e.hireDate,
      email: e.email,
      isHead: i === 0,
    }));
  }

  async findOne(id: string) {
    const orgUnit = await this.prisma.orgUnit.findUnique({ where: { id } });
    if (!orgUnit) throw new NotFoundException(`조직단위를 찾을 수 없습니다: ${id}`);
    return orgUnit;
  }

  async create(dto: CreateOrgUnitDto) {
    const name = normalizeName(dto.name);
    await this.assertNameFree(name);
    try {
      const created = await createWithCode(
        (prefix) =>
          this.prisma.orgUnit.findMany({
            where: { code: { startsWith: prefix } },
            select: { code: true },
          }),
        'ORG',
        (code) => this.prisma.orgUnit.create({ data: { ...dto, name, code } }),
      );
      this.scope.invalidateOrgTree();
      // 도메인 이벤트 발행(outbox) — 이벤트 기반 토대 시연
      await this.eventBus.record({
        aggregateType: 'org_unit',
        aggregateId: created.id,
        eventType: 'org_unit.created',
        payload: { code: created.code, name: created.name, type: created.type },
      });
      return created;
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateOrgUnitDto) {
    await this.findOne(id);
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    if (name !== undefined) await this.assertNameFree(name, id);
    try {
      const row = await this.prisma.orgUnit.update({ where: { id }, data: { ...dto, name } });
      this.scope.invalidateOrgTree(); // 상위 조직이 바뀌면 하위 범위가 달라진다
      return row;
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      const row = await this.prisma.orgUnit.delete({ where: { id } });
      this.scope.invalidateOrgTree();
      return row;
    } catch (e) {
      // 접수·작업·견적 등에서 참조 중 — 지우면 기록이 깨진다
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          "다른 데이터에서 쓰고 있는 조직이라 삭제할 수 없습니다. 더 쓰지 않으려면 '사용 안 함'으로 바꿔 주세요.",
        );
      }
      throw e;
    }
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('이미 같은 값이 있습니다.');
    }
    return e as Error;
  }

  /** 이름 중복 검사(대소문자·공백 차이 무시) */
  private async assertNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.orgUnit.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`이미 같은 이름의 조직이 있습니다: ${name}`);
  }
}
