import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

@Injectable()
export class PartnerService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(type?: string) {
    return this.prisma.partner.findMany({
      where: type ? { type } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.partner.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`거래처를 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreatePartnerDto) {
    try {
      return await this.prisma.partner.create({ data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async update(id: string, dto: UpdatePartnerDto) {
    await this.findOne(id);
    try {
      return await this.prisma.partner.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.partner.delete({ where: { id } });
  }

  private mapError(e: unknown, code?: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`이미 존재하는 코드입니다: ${code}`);
    }
    return e as Error;
  }
}
