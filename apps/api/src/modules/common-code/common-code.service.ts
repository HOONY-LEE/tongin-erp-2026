import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommonCodeDto } from './dto/create-common-code.dto';
import { UpdateCommonCodeDto } from './dto/update-common-code.dto';

@Injectable()
export class CommonCodeService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(codeGroup?: string) {
    return this.prisma.commonCode.findMany({
      where: codeGroup ? { codeGroup } : undefined,
      orderBy: [{ codeGroup: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.commonCode.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`공통코드를 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreateCommonCodeDto) {
    try {
      return await this.prisma.commonCode.create({ data: dto });
    } catch (e) {
      throw this.mapError(e, `${dto.codeGroup}/${dto.code}`);
    }
  }

  async update(id: string, dto: UpdateCommonCodeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.commonCode.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e, `${dto.codeGroup}/${dto.code}`);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.commonCode.delete({ where: { id } });
  }

  private mapError(e: unknown, key: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`이미 존재하는 코드입니다: ${key}`);
    }
    return e as Error;
  }
}
