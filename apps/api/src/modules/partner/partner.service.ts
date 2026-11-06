import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createWithCode, normalizeName } from '../../common/util/master-code';
import { CreatePartnerDto, type ImportPartnerRowDto } from './dto/create-partner.dto';
import type { PartnerContractStatus } from '@tongin/shared';
import { UpdatePartnerDto } from './dto/update-partner.dto';

@Injectable()
export class PartnerService {
  constructor(private readonly prisma: PrismaService) {}

  /** 목록 — 제휴·전속 화면은 접수 건수(전체·올해)를 함께 본다 */
  async findAll(type?: string) {
    const rows = await this.prisma.partner.findMany({
      where: type ? { type } : undefined,
      orderBy: { code: 'asc' },
      include: { _count: { select: { leads: true } } },
    });
    const yearStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00+09:00`);
    const thisYear = rows.length
      ? await this.prisma.lead.groupBy({
          by: ['partnerId'],
          where: { partnerId: { in: rows.map((r) => r.id) }, createdAt: { gte: yearStart } },
          _count: true,
        })
      : [];
    const year = new Map(thisYear.map((x) => [x.partnerId, x._count]));
    return rows.map(({ _count, ...r }) => ({
      ...r,
      leadCount: _count.leads,
      leadCountYear: year.get(r.id) ?? 0,
    }));
  }

  options() {
    return this.prisma.partner.findMany({
      where: { isActive: true, type: { in: ['AFFILIATE', 'EXCLUSIVE', 'B2B_CLIENT'] } },
      select: { id: true, name: true, type: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  /** 제휴·전속 업체 한 곳 + 최근 접수 */
  async detail(id: string) {
    const p = await this.findOne(id);
    const leads = await this.prisma.lead.findMany({
      where: { partnerId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        leadNo: true,
        status: true,
        createdAt: true,
        moveDate: true,
        orgUnit: { select: { name: true } },
        customer: { select: { name: true } },
      },
    });
    const total = await this.prisma.lead.count({ where: { partnerId: id } });
    return { ...p, leadCount: total, recentLeads: leads };
  }

  /**
   * 한꺼번에 넣기(엑셀 붙여넣기) — 같은 유형에 같은 이름이 있으면 건너뛴다.
   * 상태 글(진행중·자동연장·신규·종료)은 계약 상태로 바꾼다.
   */
  async importMany(type: 'AFFILIATE' | 'EXCLUSIVE', rows: ImportPartnerRowDto[]) {
    const STATUS: Record<string, PartnerContractStatus> = {
      진행중: 'ACTIVE',
      진행: 'ACTIVE',
      자동연장: 'AUTO_RENEW',
      신규: 'NEW',
      종료: 'ENDED',
      해지: 'ENDED',
      만료: 'ENDED',
    };
    const existing = await this.prisma.partner.findMany({
      where: { type },
      select: { name: true },
    });
    const seen = new Set(existing.map((e) => normalizeName(e.name).toLowerCase()));
    let created = 0;
    let skipped = 0;
    for (const r of rows) {
      const name = normalizeName(r.name ?? '');
      if (!name || seen.has(name.toLowerCase())) {
        skipped++;
        continue;
      }
      seen.add(name.toLowerCase());
      const status =
        STATUS[(r.status ?? '').replace(/\s/g, '')] ?? (type === 'AFFILIATE' ? 'ACTIVE' : null);
      await this.create({
        type,
        name,
        contractStatus: status,
        benefit: r.benefit?.trim() || null,
        intake: r.intake?.trim() || null,
      });
      created++;
    }
    return { created, skipped };
  }

  async findOne(id: string) {
    const found = await this.prisma.partner.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`거래처를 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreatePartnerDto) {
    const name = normalizeName(dto.name);
    await this.assertNameFree(name, dto.type);
    try {
      return await createWithCode(
        (prefix) =>
          this.prisma.partner.findMany({
            where: { code: { startsWith: prefix } },
            select: { code: true },
          }),
        'PTN',
        (code) => this.prisma.partner.create({ data: { ...dto, name, code } }),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdatePartnerDto) {
    const cur = await this.findOne(id);
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    if (name !== undefined) await this.assertNameFree(name, dto.type ?? cur.type, id);
    try {
      return await this.prisma.partner.update({ where: { id }, data: { ...dto, name } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.partner.delete({ where: { id } });
    } catch (e) {
      // 접수·작업·견적 등에서 참조 중 — 지우면 기록이 깨진다
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          "다른 데이터에서 쓰고 있는 거래처라 삭제할 수 없습니다. 더 쓰지 않으려면 '사용 안 함'으로 바꿔 주세요.",
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

  /** 이름 중복 검사(대소문자·공백 차이 무시) — 유형마다(같은 회사가 제휴·전속 둘 다일 수 있다) */
  private async assertNameFree(name: string, type: string, exceptId?: string) {
    const dup = await this.prisma.partner.findFirst({
      where: {
        type,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`이미 같은 이름의 거래처가 있습니다: ${name}`);
  }
}
