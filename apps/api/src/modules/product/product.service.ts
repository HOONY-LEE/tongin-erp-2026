import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(serviceLine?: string) {
    return this.prisma.product.findMany({
      where: serviceLine ? { serviceLine } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.product.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`상품을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async findOneWithAddons(id: string) {
    const found = await this.prisma.product.findUnique({
      where: { id },
      include: {
        addons: {
          include: { addon: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!found) throw new NotFoundException(`상품을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async addAddon(productId: string, addonServiceId: string, priceOverride?: number) {
    await this.findOne(productId);
    const addon = await this.prisma.addonService.findUnique({ where: { id: addonServiceId } });
    if (!addon) throw new NotFoundException(`옵션을 찾을 수 없습니다: ${addonServiceId}`);
    try {
      return await this.prisma.productAddon.create({
        data: { productId, addonServiceId, priceOverride },
        include: { addon: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('이미 연결된 옵션입니다.');
      }
      throw e;
    }
  }

  async removeAddon(productId: string, addonServiceId: string) {
    await this.prisma.productAddon
      .delete({
        where: { productId_addonServiceId: { productId, addonServiceId } },
      })
      .catch(() => {
        throw new NotFoundException('연결된 옵션이 없습니다.');
      });
  }

  async create(dto: CreateProductDto) {
    try {
      return await this.prisma.product.create({ data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    try {
      return await this.prisma.product.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.product.delete({ where: { id } });
  }

  private mapError(e: unknown, code?: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException(`이미 존재하는 코드입니다: ${code}`);
      if (e.code === 'P2003')
        return new BadRequestException('존재하지 않는 브랜드 조직(brandOrgId)입니다.');
    }
    return e as Error;
  }
}
