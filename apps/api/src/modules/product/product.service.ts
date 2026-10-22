import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createWithCode, normalizeName } from '../../common/util/master-code';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(serviceLine?: string, activeOnly = false) {
    return this.prisma.product.findMany({
      where: { ...(serviceLine ? { serviceLine } : {}), ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { createdAt: 'asc' },
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
    const name = normalizeName(dto.name);
    await this.assertNameFree(name);
    try {
      return await createWithCode(
        (prefix) =>
          this.prisma.product.findMany({
            where: { code: { startsWith: prefix } },
            select: { code: true },
          }),
        'PRD',
        (code) => this.prisma.product.create({ data: { ...dto, name, code } }),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    if (name !== undefined) await this.assertNameFree(name, id);
    try {
      return await this.prisma.product.update({ where: { id }, data: { ...dto, name } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /** 견적에 쓰인 상품은 지우면 견적이 깨진다 — 삭제 대신 비활성으로 돌리게 안내 */
  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.estimate.count({ where: { productId: id } });
    if (used) {
      throw new ConflictException(
        `견적 ${used}건에서 쓰는 상품이라 삭제할 수 없습니다. 더 쓰지 않으려면 '사용 안 함'으로 바꿔 주세요.`,
      );
    }
    return this.prisma.product.delete({ where: { id } });
  }

  /** 상품명 중복 검사(대소문자·공백 차이 무시) */
  private async assertNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.product.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { code: true },
    });
    if (dup) throw new ConflictException(`이미 같은 이름의 상품이 있습니다: ${name}`);
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2003')
        return new BadRequestException('존재하지 않는 브랜드 조직(brandOrgId)입니다.');
    }
    return e as Error;
  }
}
