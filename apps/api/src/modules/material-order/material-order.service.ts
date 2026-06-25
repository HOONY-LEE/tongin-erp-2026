import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { CreateMaterialOrderDto } from './dto/create-material-order.dto';

/**
 * MM-02: 가맹점 발주. 지점이 본사에 자재(박스·포장지·유니폼)를 발주 →
 * 승인 → 출고(SHIPPED) 시 본사 재고를 전표(OUT)로 차감. EST-03 차감 패턴 재사용.
 */
@Injectable()
export class MaterialOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  findAll(orgUnitId?: string, status?: string) {
    return this.prisma.materialOrder.findMany({
      where: { ...(orgUnitId ? { orgUnitId } : {}), ...(status ? { status } : {}) },
      include: { orgUnit: true, lines: { include: { material: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.materialOrder.findUnique({
      where: { id },
      include: { orgUnit: true, lines: { include: { material: true } } },
    });
    if (!order) throw new NotFoundException(`발주를 찾을 수 없습니다: ${id}`);
    return order;
  }

  async create(dto: CreateMaterialOrderDto) {
    const org = await this.prisma.orgUnit.findUnique({ where: { id: dto.orgUnitId } });
    if (!org) throw new BadRequestException('존재하지 않는 발주 지점(orgUnitId)입니다.');
    const materialIds = [...new Set(dto.lines.map((l) => l.materialId))];
    const found = await this.prisma.material.count({ where: { id: { in: materialIds } } });
    if (found !== materialIds.length)
      throw new BadRequestException('존재하지 않는 자재가 포함되어 있습니다.');

    return this.prisma.materialOrder.create({
      data: {
        orderNo: this.genNo(),
        orgUnitId: dto.orgUnitId,
        note: dto.note,
        lines: { create: dto.lines.map((l) => ({ materialId: l.materialId, qty: l.qty })) },
      },
      include: { lines: true },
    });
  }

  async approve(id: string) {
    const order = await this.findOne(id);
    if (order.status !== 'REQUESTED')
      throw new BadRequestException(`승인 불가 상태: ${order.status}`);
    return this.prisma.materialOrder.update({ where: { id }, data: { status: 'APPROVED' } });
  }

  async cancel(id: string) {
    const order = await this.findOne(id);
    if (order.status === 'SHIPPED')
      throw new BadRequestException('이미 출고된 발주는 취소할 수 없습니다.');
    if (order.status === 'CANCELED') return order;
    return this.prisma.materialOrder.update({ where: { id }, data: { status: 'CANCELED' } });
  }

  /** 출고: 승인된 발주의 자재를 본사 재고에서 일괄 OUT(전표). 트랜잭션·재고부족 방지. */
  async ship(id: string) {
    const order = await this.prisma.materialOrder.findUnique({
      where: { id },
      include: { lines: { include: { material: true } } },
    });
    if (!order) throw new NotFoundException(`발주를 찾을 수 없습니다: ${id}`);
    if (order.status !== 'APPROVED')
      throw new BadRequestException(`출고 불가 상태: ${order.status} (APPROVED만 가능)`);

    // 자재별 소요량 합산 → 재고 사전 검증(부분 출고 방지)
    const required = new Map<string, number>();
    for (const l of order.lines)
      required.set(l.materialId, (required.get(l.materialId) ?? 0) + l.qty);
    for (const [materialId, need] of required) {
      const agg = await this.prisma.stockMovement.aggregate({
        where: { materialId },
        _sum: { qtyDelta: true },
      });
      const stock = agg._sum.qtyDelta ?? 0;
      if (stock < need) {
        const name =
          order.lines.find((l) => l.materialId === materialId)?.material.name ?? materialId;
        throw new BadRequestException(`재고 부족: ${name} — 현재고 ${stock}, 필요 ${need}`);
      }
    }

    const shippedAt = new Date();
    const moved = await this.prisma.$transaction(async (tx) => {
      const result: { materialId: string; qtyDelta: number }[] = [];
      for (const l of order.lines) {
        const movement = await tx.stockMovement.create({
          data: {
            materialId: l.materialId,
            type: 'OUT',
            qtyDelta: -l.qty,
            reason: `가맹점 발주 ${order.orderNo} 출고`,
            refType: 'MATERIAL_ORDER',
            refId: id,
          },
        });
        await tx.materialOrderLine.update({
          where: { id: l.id },
          data: { stockMovementId: movement.id },
        });
        result.push({ materialId: l.materialId, qtyDelta: -l.qty });
      }
      await tx.materialOrder.update({ where: { id }, data: { status: 'SHIPPED', shippedAt } });
      return result;
    });

    await this.eventBus.record({
      aggregateType: 'material_order',
      aggregateId: id,
      eventType: 'material_order.shipped',
      payload: {
        orderNo: order.orderNo,
        orgUnitId: order.orgUnitId,
        lineCount: order.lines.length,
      },
    });
    for (const m of moved) {
      await this.eventBus.record({
        aggregateType: 'material',
        aggregateId: m.materialId,
        eventType: 'stock.moved',
        payload: { type: 'OUT', qtyDelta: m.qtyDelta, refType: 'MATERIAL_ORDER', refId: id },
      });
    }
    return { shipped: moved.length };
  }

  private genNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `MO${ymd}${rand}`;
  }
}
