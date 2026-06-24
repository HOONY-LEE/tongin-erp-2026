import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(phone?: string) {
    return this.prisma.customer.findMany({
      where: phone ? { phonePrimary: phone } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.customer.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`고객을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreateCustomerDto) {
    try {
      return await this.prisma.customer.create({ data: dto });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    try {
      return await this.prisma.customer.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.customer.delete({ where: { id } });
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return new BadRequestException('존재하지 않는 조직단위(ownerOrgId)입니다.');
    }
    return e as Error;
  }
}
