import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
      return await this.prisma.cbmItem.create({ data: dto });
    } catch (e) {
      throw this.mapError(e, `${dto.category}/${dto.name}`);
    }
  }

  async update(id: string, dto: UpdateCbmItemDto) {
    await this.findOne(id);
    try {
      return await this.prisma.cbmItem.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e, `${dto.category}/${dto.name}`);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.cbmItem.delete({ where: { id } });
  }

  private mapError(e: unknown, key: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`이미 존재하는 품목입니다(중복 방지): ${key}`);
    }
    return e as Error;
  }
}
