import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOrNull } from '../../common/util/perm';
import { LIST_LIMIT, listWhere, type ListFilterRules } from '../../common/list-filter';
import { CreateCorpAssetDto, UpdateCorpAssetDto } from './dto/corp-asset.dto';

const include = {
  manager: { select: { id: true, name: true, orgUnit: { select: { name: true } } } },
} satisfies Prisma.CorpAssetInclude;

/** 계약·자산 목록 필터(화면 FilterButton key → 칸). 담당자 ''는 미지정 */
const LIST_RULES: ListFilterRules = {
  period: { date: { endDate: ['endDate', 'date'], startDate: ['startDate', 'date'] } },
  managerEmpId: {
    custom: (v) => {
      const list = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
      if (!list.length) return null;
      const ids = list.filter(Boolean);
      return {
        OR: [
          ...(ids.length ? [{ managerEmpId: { in: ids } }] : []),
          ...(list.includes('') ? [{ managerEmpId: null }] : []),
        ],
      };
    },
  },
};

/** 계약·자산(총무) — 특허·상표권·임대차·보험·리스. 본사 관리 메뉴라 조직 범위를 두지 않는다 */
@Injectable()
export class CorpAssetService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(kind?: string, q?: string, f?: string) {
    const term = q?.trim();
    return this.prisma.corpAsset.findMany({
      where: {
        AND: listWhere(LIST_RULES, f),
        ...(kind ? { kind } : {}),
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { counterparty: { contains: term, mode: 'insensitive' } },
                { refNo: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include,
      // 만료가 가까운 것부터, 기한 없는 것은 뒤로
      orderBy: [{ endDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: LIST_LIMIT,
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.corpAsset.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('계약·자산을 찾을 수 없습니다.');
    return row;
  }

  private async data(dto: UpdateCorpAssetDto) {
    if (dto.managerEmpId) {
      const e = await this.prisma.employee.findUnique({ where: { id: dto.managerEmpId } });
      if (!e) throw new BadRequestException('없는 직원입니다.');
    }
    const start = dateOrNull(dto.startDate);
    const end = dateOrNull(dto.endDate);
    if (start && end && end < start) {
      throw new BadRequestException('만료·갱신일이 시작일보다 앞설 수 없습니다.');
    }
    return {
      kind: dto.kind,
      name: dto.name?.trim(),
      counterparty: dto.counterparty,
      refNo: dto.refNo,
      startDate: start,
      endDate: end,
      amount: dto.amount,
      amountUnit: dto.amountUnit,
      managerEmpId: dto.managerEmpId,
      memo: dto.memo,
    };
  }

  async create(dto: CreateCorpAssetDto) {
    const data = await this.data(dto);
    return this.prisma.corpAsset.create({
      data: { ...data, kind: dto.kind, name: dto.name.trim() },
      include,
    });
  }

  async update(id: string, dto: UpdateCorpAssetDto) {
    await this.findOne(id);
    return this.prisma.corpAsset.update({ where: { id }, data: await this.data(dto), include });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.corpAsset.delete({ where: { id } });
    return { ok: true };
  }
}
