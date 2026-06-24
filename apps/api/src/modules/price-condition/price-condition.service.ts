import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePriceConditionDto } from './dto/create-price-condition.dto';
import { UpdatePriceConditionDto } from './dto/update-price-condition.dto';

@Injectable()
export class PriceConditionService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(partnerId?: string) {
    return this.prisma.priceCondition.findMany({
      where: partnerId ? { partnerId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.priceCondition.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`가격조건을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreatePriceConditionDto) {
    try {
      return await this.prisma.priceCondition.create({
        data: {
          partnerId: dto.partnerId,
          name: dto.name,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
          validTo: dto.validTo ? new Date(dto.validTo) : undefined,
          isActive: dto.isActive,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdatePriceConditionDto) {
    await this.findOne(id);
    try {
      return await this.prisma.priceCondition.update({
        where: { id },
        data: {
          partnerId: dto.partnerId,
          name: dto.name,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
          validTo: dto.validTo ? new Date(dto.validTo) : undefined,
          isActive: dto.isActive,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.priceCondition.delete({ where: { id } });
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return new BadRequestException('존재하지 않는 거래처(partnerId)입니다.');
    }
    return e as Error;
  }
}
