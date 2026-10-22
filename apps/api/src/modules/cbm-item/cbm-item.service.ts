import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeName } from '../../common/util/master-code';
import { CreateCbmItemDto } from './dto/create-cbm-item.dto';
import { UpdateCbmItemDto } from './dto/update-cbm-item.dto';

@Injectable()
export class CbmItemService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(category?: string) {
    return this.prisma.cbmItem.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.cbmItem.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`품목을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreateCbmItemDto) {
    try {
      return await this.prisma.cbmItem.create({
        data: { ...dto, category: normalizeName(dto.category), name: normalizeName(dto.name) },
      });
    } catch (e) {
      throw this.mapError(e, `${dto.category}/${dto.name}`);
    }
  }

  async update(id: string, dto: UpdateCbmItemDto) {
    await this.findOne(id);
    try {
      return await this.prisma.cbmItem.update({
        where: { id },
        data: {
          ...dto,
          category: dto.category === undefined ? undefined : normalizeName(dto.category),
          name: dto.name === undefined ? undefined : normalizeName(dto.name),
        },
      });
    } catch (e) {
      throw this.mapError(e, `${dto.category}/${dto.name}`);
    }
  }

  /** 견적 물품에 쓰인 품목은 지우지 않는다 — 비활성으로 */
  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.estimateLine.count({ where: { cbmItemId: id } });
    if (used) {
      throw new ConflictException(
        `견적 물품 ${used}건에서 쓰는 품목이라 삭제할 수 없습니다. 더 쓰지 않으려면 '사용 안 함'으로 바꿔 주세요.`,
      );
    }
    return this.prisma.cbmItem.delete({ where: { id } });
  }

  private mapError(e: unknown, key: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`같은 분류에 같은 이름의 품목이 이미 있습니다: ${key}`);
    }
    return e as Error;
  }
}
