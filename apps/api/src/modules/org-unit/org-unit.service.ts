import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';

@Injectable()
export class OrgUnitService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.orgUnit.findMany({ orderBy: { code: 'asc' } });
  }

  async findOne(id: string) {
    const orgUnit = await this.prisma.orgUnit.findUnique({ where: { id } });
    if (!orgUnit) throw new NotFoundException(`조직단위를 찾을 수 없습니다: ${id}`);
    return orgUnit;
  }

  async create(dto: CreateOrgUnitDto) {
    try {
      return await this.prisma.orgUnit.create({ data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async update(id: string, dto: UpdateOrgUnitDto) {
    await this.findOne(id);
    try {
      return await this.prisma.orgUnit.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.orgUnit.delete({ where: { id } });
  }

  private mapError(e: unknown, code?: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`이미 존재하는 코드입니다: ${code}`);
    }
    return e as Error;
  }
}
