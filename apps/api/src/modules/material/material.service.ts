import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { CreateMovementDto } from './dto/create-movement.dto';

@Injectable()
export class MaterialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /** 자재 목록 + 현재고(수불 합산) + 안전재고 미만 경고. */
  async findAll(category?: string) {
    const materials = await this.prisma.material.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    const stockMap = await this.stockMap();
    return materials.map((m) => {
      const stock = stockMap.get(m.id) ?? 0;
      return { ...m, stock, lowStock: stock < m.safetyStock };
    });
  }

  async findOne(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { movements: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!material) throw new NotFoundException(`자재를 찾을 수 없습니다: ${id}`);
    const stock = await this.stockOf(id);
    return { ...material, stock, lowStock: stock < material.safetyStock };
  }

  async create(dto: CreateMaterialDto) {
    try {
      return await this.prisma.material.create({ data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code);
    }
  }

  async update(id: string, dto: UpdateMaterialDto) {
    await this.findOne(id);
    try {
      return await this.prisma.material.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e, dto.code ?? id);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.material.delete({ where: { id } });
  }

  /** 입출고/조정 기록 → 현재고 갱신은 수불 합산이므로 별도 잔고 테이블 불필요. */
  async createMovement(materialId: string, dto: CreateMovementDto) {
    await this.findOne(materialId);
    let qtyDelta: number;
    if (dto.type === 'IN') qtyDelta = dto.qty;
    else if (dto.type === 'OUT') qtyDelta = -dto.qty;
    else qtyDelta = dto.adjustIncrease === false ? -dto.qty : dto.qty;

    if (qtyDelta < 0) {
      const current = await this.stockOf(materialId);
      if (current + qtyDelta < 0) {
        throw new BadRequestException(`재고 부족: 현재고 ${current}, 출고/감소 ${-qtyDelta}`);
      }
    }

    const movement = await this.prisma.stockMovement.create({
      data: {
        materialId,
        orgUnitId: dto.orgUnitId,
        type: dto.type,
        qtyDelta,
        reason: dto.reason,
      },
    });
    await this.eventBus.record({
      aggregateType: 'material',
      aggregateId: materialId,
      eventType: 'stock.moved',
      payload: { type: dto.type, qtyDelta },
    });
    return movement;
  }

  private async stockOf(materialId: string): Promise<number> {
    const agg = await this.prisma.stockMovement.aggregate({
      where: { materialId },
      _sum: { qtyDelta: true },
    });
    return agg._sum.qtyDelta ?? 0;
  }

  private async stockMap(): Promise<Map<string, number>> {
    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['materialId'],
      _sum: { qtyDelta: true },
    });
    return new Map(grouped.map((g) => [g.materialId, g._sum.qtyDelta ?? 0]));
  }

  private mapError(e: unknown, key: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`이미 존재하는 자재코드입니다: ${key}`);
    }
    return e as Error;
  }
}
