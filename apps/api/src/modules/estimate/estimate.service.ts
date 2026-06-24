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

  /** 견적서 문서를 데이터에서 즉석 HTML로 생성(무저장, 설계노트 E-0). 브라우저에서 인쇄→PDF. */
  async document(id: string): Promise<string> {
    const e = await this.prisma.estimate.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        zones: { orderBy: { sortOrder: 'asc' } },
        lines: true,
      },
    });
    if (!e) throw new NotFoundException(`견적을 찾을 수 없습니다: ${id}`);

    const esc = (s: unknown) =>
      String(s ?? '').replace(/[&<>"]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
      );
    const handling: Record<string, string> = { CARRY: '운반', LEAVE: '방치', DISPOSE: '폐기' };
    const zoneName = (zid: string | null) => e.zones.find((z) => z.id === zid)?.name ?? '-';
    const rows = e.lines
      .map(
        (l) =>
          `<tr><td>${esc(zoneName(l.zoneId))}</td><td>${esc(l.itemName)}</td><td class="r">${esc(
            l.qty,
          )}</td><td class="r">${esc(l.cbm)}</td><td>${esc(handling[l.handling] ?? l.handling)}</td></tr>`,
      )
      .join('');

    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>견적서 ${esc(
      e.estimateNo,
    )}</title><style>
body{font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111827;max-width:800px;margin:24px auto;padding:0 24px}
h1{font-size:24px;border-bottom:2px solid #111827;padding-bottom:8px}
.meta{display:flex;justify-content:space-between;color:#4b5563;font-size:14px;margin:12px 0 20px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left}
th{background:#f9fafb}
td.r,th.r{text-align:right}
.sum{margin-top:16px;text-align:right;font-size:16px;font-weight:700}
.info{font-size:14px;margin-bottom:6px}
@media print{body{margin:0}}
</style></head><body>
<h1>견 적 서</h1>
<div class="meta"><div><b>통인익스프레스</b></div><div>견적번호: ${esc(e.estimateNo)} · 작성일: ${new Date()
      .toISOString()
      .slice(0, 10)}</div></div>
<div class="info">고객: ${esc(e.customer?.name)}</div>
<div class="info">이사종류(상품): ${esc(e.product?.name)}</div>
<div class="info">작업조건: 출발 ${esc(e.fromPyeong ?? '-')}평${e.fromElevator ? '(엘리베이터)' : ''} → 도착 ${esc(
      e.toPyeong ?? '-',
    )}평${e.toElevator ? '(엘리베이터)' : ''}</div>
<table><thead><tr><th>구역</th><th>품목</th><th class="r">수량</th><th class="r">CBM</th><th>처리</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">품목 없음</td></tr>'}</tbody></table>
<div class="sum">총 물량(CBM): ${esc(e.totalCbm)}</div>
</body></html>`;
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
