import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddonServiceDto } from './dto/create-addon-service.dto';
import { UpdateAddonServiceDto } from './dto/update-addon-service.dto';

@Injectable()
export class AddonServiceService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.addonService.findMany({ orderBy: { code: 'asc' } });
  }

  async findOne(id: string) {
    const found = await this.prisma.addonService.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`옵션을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreateAddonServiceDto) {
    try {
      return await this.prisma.addonService.create({ data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async update(id: string, dto: UpdateAddonServiceDto) {
    await this.findOne(id);
    try {
      return await this.prisma.addonService.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.addonService.delete({ where: { id } });
  }

  private mapError(e: unknown, code?: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`이미 존재하는 코드입니다: ${code}`);
    }
    return e as Error;
  }
}
