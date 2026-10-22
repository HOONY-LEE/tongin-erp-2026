import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createWithCode, normalizeName } from '../../common/util/master-code';
import { EventBusService } from '../../events/event-bus.service';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';

@Injectable()
export class OrgUnitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  findAll() {
    return this.prisma.orgUnit.findMany({ orderBy: { code: 'asc' } });
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
      return await this.prisma.orgUnit.update({ where: { id }, data: { ...dto, name } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.orgUnit.delete({ where: { id } });
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
