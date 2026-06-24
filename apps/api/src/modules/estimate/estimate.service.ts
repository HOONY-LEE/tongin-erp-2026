import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { LeadService } from '../lead/lead.service';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { CreateLineDto, CreateZoneDto } from './dto/estimate-child.dto';

@Injectable()
export class EstimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly leadService: LeadService,
  ) {}

  findAll(leadId?: string) {
    return this.prisma.estimate.findMany({
      where: leadId ? { leadId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id },
      include: {
        zones: { orderBy: { sortOrder: 'asc' } },
        lines: true,
      },
    });
    if (!estimate) throw new NotFoundException(`견적을 찾을 수 없습니다: ${id}`);
    return estimate;
  }

  async create(dto: CreateEstimateDto) {
    try {
      const created = await this.prisma.estimate.create({
        data: {
          estimateNo: this.genNo(),
          leadId: dto.leadId,
          customerId: dto.customerId,
          orgUnitId: dto.orgUnitId,
          productId: dto.productId,
          estimatorEmpId: dto.estimatorEmpId,
          fromAddr: dto.fromAddr,
          fromPyeong: dto.fromPyeong,
          fromElevator: dto.fromElevator,
          toAddr: dto.toAddr,
          toPyeong: dto.toPyeong,
          toElevator: dto.toElevator,
          workInstructions: dto.workInstructions,
          baseAmount: dto.baseAmount,
          totalAmount: dto.totalAmount,
        },
      });
      await this.eventBus.record({
        aggregateType: 'estimate',
        aggregateId: created.id,
        eventType: 'estimate.created',
        payload: { estimateNo: created.estimateNo, leadId: created.leadId },
      });
      return created;
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async addZone(estimateId: string, dto: CreateZoneDto) {
    await this.findOne(estimateId);
    return this.prisma.estimateZone.create({
      data: { estimateId, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async addLine(estimateId: string, dto: CreateLineDto) {
    await this.findOne(estimateId);
    const qty = dto.qty ?? 1;
    let itemName = dto.itemName;
    let lineCbm = dto.cbm ?? 0;

    if (dto.cbmItemId) {
      const item = await this.prisma.cbmItem.findUnique({ where: { id: dto.cbmItemId } });
      if (!item) throw new BadRequestException('존재하지 않는 품목(cbmItemId)입니다.');
      itemName = itemName ?? item.name;
      lineCbm = Math.round(Number(item.cbm) * qty * 100) / 100; // 단위CBM × 수량
    }
    if (!itemName) throw new BadRequestException('itemName 또는 cbmItemId가 필요합니다.');

    try {
      const line = await this.prisma.estimateLine.create({
        data: {
          estimateId,
          zoneId: dto.zoneId,
          cbmItemId: dto.cbmItemId,
          itemName,
          qty,
          cbm: lineCbm,
          handling: dto.handling ?? 'CARRY',
          memo: dto.memo,
        },
      });
      await this.recomputeTotalCbm(estimateId);
      return line;
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async removeLine(estimateId: string, lineId: string) {
    await this.findOne(estimateId);
    await this.prisma.estimateLine.delete({ where: { id: lineId } });
    await this.recomputeTotalCbm(estimateId);
    return { deleted: true };
  }

  /** 견적 확정 → 리드 QUOTED 전이 + 이벤트 */
  async quote(estimateId: string) {
    const estimate = await this.findOne(estimateId);
    const updated = await this.prisma.estimate.update({
      where: { id: estimateId },
      data: { status: 'QUOTED' },
    });
    await this.leadService.transitionTo(estimate.leadId, 'QUOTED');
    await this.eventBus.record({
      aggregateType: 'estimate',
      aggregateId: estimateId,
      eventType: 'estimate.quoted',
      payload: { estimateNo: estimate.estimateNo, totalCbm: Number(estimate.totalCbm) },
    });
    return updated;
  }

  private async recomputeTotalCbm(estimateId: string) {
    const agg = await this.prisma.estimateLine.aggregate({
      where: { estimateId },
      _sum: { cbm: true },
    });
    await this.prisma.estimate.update({
      where: { id: estimateId },
      data: { totalCbm: agg._sum.cbm ?? 0 },
    });
  }

  private genNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `EST${ymd}${rand}`;
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException('견적번호 충돌 — 다시 시도하세요.');
      if (e.code === 'P2003')
        return new BadRequestException('참조 대상(리드/고객/조직/상품/품목)이 존재하지 않습니다.');
    }
    return e as Error;
  }
}
