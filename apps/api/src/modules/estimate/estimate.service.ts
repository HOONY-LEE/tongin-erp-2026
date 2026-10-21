import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACCESS_LABEL,
  HANDLING_LABEL,
  LEAD_STATUS_LABEL,
  type AccessMethod,
  type AuthPrincipal,
  type EstimateMeta,
  type LeadStatus,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { LeadService } from '../lead/lead.service';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import {
  CreateAddonDto,
  CreateLineDto,
  CreateZoneDto,
  UpdateAmountsDto,
  UpdateConditionsDto,
} from './dto/estimate-child.dto';
import { CreateCostLineDto } from './dto/cost-line.dto';

@Injectable()
export class EstimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
    private readonly leadService: LeadService,
  ) {}

  async findAll(leadId?: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    return this.prisma.estimate.findMany({
      where: {
        ...(leadId ? { leadId } : {}),
        ...(ids === null ? {} : { orgUnitId: { in: ids } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id },
      include: {
        zones: { orderBy: { sortOrder: 'asc' } },
        lines: true,
        addons: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        costLines: { include: { material: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!estimate) throw new NotFoundException(`견적을 찾을 수 없습니다: ${id}`);
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(estimate.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 견적만 조회할 수 있습니다.');
    }
    return estimate;
  }

  /**
   * 화면용 견적 상세 = 견적 본문 + 견적서 메타(접수·계약·작업에서 모은 머리 정보).
   * 메타는 쓰기 작업의 권한 확인용 findOne에는 넣지 않는다 — 옵션 하나 추가할 때마다
   * 계약·작업까지 조인할 이유가 없어서.
   */
  async detail(id: string, principal?: AuthPrincipal) {
    const estimate = await this.findOne(id, principal);
    return { ...estimate, meta: await this.buildMeta(id) };
  }

  private async buildMeta(id: string): Promise<EstimateMeta> {
    const e = await this.prisma.estimate.findUnique({
      where: { id },
      select: {
        customer: { select: { name: true, phonePrimary: true } },
        product: { select: { name: true } },
        orgUnit: { select: { name: true } },
        estimator: { select: { name: true, phone: true } },
        contract: { select: { id: true, contractNo: true, signedAt: true, createdAt: true } },
        lead: {
          select: {
            status: true,
            createdAt: true,
            visitDate: true,
            moveDate: true,
            workOrders: {
              where: { scheduledDate: { not: null } },
              select: { scheduledDate: true },
              orderBy: { scheduledDate: 'asc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!e) throw new NotFoundException(`견적을 찾을 수 없습니다: ${id}`);

    // 시각(timestamptz)은 한국 날짜로, 날짜 전용(@db.Date) 값은 그대로 자른다.
    const kst = (d?: Date | null) =>
      d ? d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) : null;
    const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

    return {
      customerName: e.customer?.name ?? null,
      customerPhone: e.customer?.phonePrimary ?? null,
      contractId: e.contract?.id ?? null,
      contractNo: e.contract?.contractNo ?? null,
      estimatorName: e.estimator?.name ?? null,
      estimatorPhone: e.estimator?.phone ?? null,
      leadStatus: (e.lead?.status as LeadStatus | undefined) ?? null,
      productName: e.product?.name ?? null,
      orgUnitName: e.orgUnit?.name ?? null,
      receivedDate: kst(e.lead?.createdAt),
      consultDate: day(e.lead?.visitDate),
      contractDate: kst(e.contract?.signedAt ?? e.contract?.createdAt),
      // 이사일은 접수에 잡힌 날을 우선하고, 없으면 실제 배정된 작업일을 쓴다
      workDate: day(e.lead?.moveDate) ?? day(e.lead?.workOrders[0]?.scheduledDate),
    };
  }

  async create(dto: CreateEstimateDto, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(dto.orgUnitId)) {
      throw new ForbiddenException('소속 조직으로만 견적을 만들 수 있습니다.');
    }
    try {
      const created = await this.prisma.estimate.create({
        data: {
          estimateNo: this.genNo(),
          leadId: dto.leadId,
          customerId: dto.customerId,
          orgUnitId: dto.orgUnitId,
          productId: dto.productId,
          estimatorEmpId: dto.estimatorEmpId,
          fromZipcode: dto.fromZipcode,
          fromAddr: dto.fromAddr,
          fromAddrDetail: dto.fromAddrDetail,
          fromSido: dto.fromSido,
          fromSigungu: dto.fromSigungu,
          fromLat: dto.fromLat,
          fromLng: dto.fromLng,
          fromPyeong: dto.fromPyeong,
          fromAccess: dto.fromAccess,
          fromAccessNote: dto.fromAccessNote,
          toZipcode: dto.toZipcode,
          toAddr: dto.toAddr,
          toAddrDetail: dto.toAddrDetail,
          toSido: dto.toSido,
          toSigungu: dto.toSigungu,
          toLat: dto.toLat,
          toLng: dto.toLng,
          toPyeong: dto.toPyeong,
          toAccess: dto.toAccess,
          toAccessNote: dto.toAccessNote,
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

  async addZone(estimateId: string, dto: CreateZoneDto, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
    return this.prisma.estimateZone.create({
      data: { estimateId, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async addLine(estimateId: string, dto: CreateLineDto, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
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

  async removeLine(estimateId: string, lineId: string, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
    await this.prisma.estimateLine.delete({ where: { id: lineId } });
    await this.recomputeTotalCbm(estimateId);
    return { deleted: true };
  }

  /** 견적 확정 → 리드 QUOTED 전이 + 이벤트 */
  async quote(estimateId: string, principal?: AuthPrincipal) {
    const estimate = await this.findOne(estimateId, principal);
    // 견적 확정과 리드 전이는 한 트랜잭션 — 전이가 막히면 견적 상태만 바뀌는 일이 없도록
    const { updated, transition } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.estimate.update({
        where: { id: estimateId },
        data: { status: 'QUOTED' },
      });
      const t = await this.leadService.transitionInTx(tx, estimate.leadId, 'QUOTED');
      return { updated: row, transition: t };
    });
    await this.leadService.emitTransition(transition, 'QUOTED');
    await this.eventBus.record({
      aggregateType: 'estimate',
      aggregateId: estimateId,
      eventType: 'estimate.quoted',
      payload: { estimateNo: estimate.estimateNo, totalCbm: Number(estimate.totalCbm) },
    });
    return updated;
  }

  // ── EST-03: 재료비 라인 ↔ 자재·재고 연동 (설계노트 F-4) ──

  /** 재료비 라인 추가 (DRAFT). 자재 마스터 참조 + 단가 → 합계 자동계산. */
  async addCostLine(estimateId: string, dto: CreateCostLineDto, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
    const material = await this.prisma.material.findUnique({ where: { id: dto.materialId } });
    if (!material) throw new BadRequestException('존재하지 않는 자재(materialId)입니다.');

    const unitPrice = dto.unitPrice ?? 0;
    const totalPrice = Math.round(unitPrice * dto.qty * 100) / 100;
    return this.prisma.estimateCostLine.create({
      data: {
        estimateId,
        materialId: dto.materialId,
        qty: dto.qty,
        unitPrice,
        totalPrice,
        memo: dto.memo,
      },
    });
  }

  /** 재료비 라인 삭제 (이미 차감된 라인은 전표 무결성 위해 불가). */
  async removeCostLine(estimateId: string, costLineId: string, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
    const line = await this.prisma.estimateCostLine.findUnique({ where: { id: costLineId } });
    if (!line || line.estimateId !== estimateId) {
      throw new NotFoundException(`재료비 라인을 찾을 수 없습니다: ${costLineId}`);
    }
    if (line.status === 'DEDUCTED') {
      throw new BadRequestException('이미 재고 차감된 라인은 삭제할 수 없습니다.');
    }
    await this.prisma.estimateCostLine.delete({ where: { id: costLineId } });
    return { deleted: true };
  }

  /**
   * 재료비 라인의 자재를 재고에서 일괄 차감(전표 OUT). 트랜잭션: 전부 성공 또는 전부 롤백.
   * 재고 부족 시 차감 없이 실패(전표 무결성). 차감된 라인은 DEDUCTED.
   */
  async deductMaterials(estimateId: string, principal?: AuthPrincipal) {
    const estimate = await this.findOne(estimateId, principal);
    const draftLines = await this.prisma.estimateCostLine.findMany({
      where: { estimateId, status: 'DRAFT' },
      include: { material: true },
    });
    if (draftLines.length === 0) {
      throw new BadRequestException('차감할 DRAFT 재료비 라인이 없습니다.');
    }

    // 자재별 소요량 합산 → 재고 충분한지 사전 검증(부분 차감 방지)
    const required = new Map<string, number>();
    for (const l of draftLines)
      required.set(l.materialId, (required.get(l.materialId) ?? 0) + l.qty);
    for (const [materialId, need] of required) {
      const agg = await this.prisma.stockMovement.aggregate({
        where: { materialId },
        _sum: { qtyDelta: true },
      });
      const stock = agg._sum.qtyDelta ?? 0;
      if (stock < need) {
        const name =
          draftLines.find((l) => l.materialId === materialId)?.material.name ?? materialId;
        throw new BadRequestException(`재고 부족: ${name} — 현재고 ${stock}, 필요 ${need}`);
      }
    }

    const deductedAt = new Date();
    const movementsForEvent = await this.prisma.$transaction(async (tx) => {
      const result: { materialId: string; qtyDelta: number }[] = [];
      for (const l of draftLines) {
        const movement = await tx.stockMovement.create({
          data: {
            materialId: l.materialId,
            type: 'OUT',
            qtyDelta: -l.qty,
            reason: `견적 ${estimate.estimateNo} 재료 차감`,
            refType: 'ESTIMATE',
            refId: estimateId,
          },
        });
        await tx.estimateCostLine.update({
          where: { id: l.id },
          data: { status: 'DEDUCTED', deductedAt, stockMovementId: movement.id },
        });
        result.push({ materialId: l.materialId, qtyDelta: -l.qty });
      }
      return result;
    });

    // 전표 커밋 후 이벤트 발행(요약 + 자재별 stock.moved)
    await this.eventBus.record({
      aggregateType: 'estimate',
      aggregateId: estimateId,
      eventType: 'estimate.materials_deducted',
      payload: { estimateNo: estimate.estimateNo, lineCount: draftLines.length },
    });
    for (const m of movementsForEvent) {
      await this.eventBus.record({
        aggregateType: 'material',
        aggregateId: m.materialId,
        eventType: 'stock.moved',
        payload: { type: 'OUT', qtyDelta: m.qtyDelta, refType: 'ESTIMATE', refId: estimateId },
      });
    }
    return { deducted: movementsForEvent.length };
  }

  // ── EST: 견적 옵션(부가서비스) + 금액 확정 ──

  /**
   * 견적에 옵션 담기. 단가를 안 주면 상품별 단가(ProductAddon.priceOverride) →
   * 옵션 기본가(AddonService.price) 순으로 채운다. 이름·단가는 스냅샷으로 남겨
   * 나중에 카탈로그가 바뀌어도 발송한 견적 금액이 흔들리지 않게 한다.
   */
  async addAddon(estimateId: string, dto: CreateAddonDto, principal?: AuthPrincipal) {
    const estimate = await this.findOne(estimateId, principal);

    let name = dto.name?.trim();
    let unitPrice = dto.unitPrice;

    if (dto.addonServiceId) {
      const addon = await this.prisma.addonService.findUnique({
        where: { id: dto.addonServiceId },
        include: { products: { where: { productId: estimate.productId } } },
      });
      if (!addon) throw new BadRequestException('존재하지 않는 옵션(addonServiceId)입니다.');
      name ??= addon.name;
      unitPrice ??= Number(addon.products[0]?.priceOverride ?? addon.price ?? 0);
    }
    if (!name) {
      throw new BadRequestException('옵션명(name) 또는 addonServiceId 중 하나는 필요합니다.');
    }

    const qty = dto.qty ?? 1;
    const price = unitPrice ?? 0;
    const created = await this.prisma.estimateAddon.create({
      data: {
        estimateId,
        addonServiceId: dto.addonServiceId,
        name,
        qty,
        unitPrice: price,
        amount: Math.round(qty * price * 100) / 100,
        memo: dto.memo,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.recomputeAmounts(estimateId);
    return created;
  }

  /** 견적 옵션 삭제. */
  async removeAddon(estimateId: string, addonId: string, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
    const addon = await this.prisma.estimateAddon.findUnique({ where: { id: addonId } });
    if (!addon || addon.estimateId !== estimateId) {
      throw new NotFoundException(`견적 옵션을 찾을 수 없습니다: ${addonId}`);
    }
    await this.prisma.estimateAddon.delete({ where: { id: addonId } });
    await this.recomputeAmounts(estimateId);
    return { deleted: true };
  }

  /** 작업조건(전/후 평수·작업방식) 수정. 기타가 아니면 남아 있던 메모를 지운다. */
  async updateConditions(estimateId: string, dto: UpdateConditionsDto, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
    const note = (access: string | undefined, text: string | undefined) =>
      access === undefined ? text : access === 'ETC' ? (text?.trim() ?? null) : null;
    return this.prisma.estimate.update({
      where: { id: estimateId },
      data: {
        fromPyeong: dto.fromPyeong,
        fromAccess: dto.fromAccess,
        fromAccessNote: note(dto.fromAccess, dto.fromAccessNote),
        toPyeong: dto.toPyeong,
        toAccess: dto.toAccess,
        toAccessNote: note(dto.toAccess, dto.toAccessNote),
      },
    });
  }

  /** 이사비용·부가세·계약금·잔금 확정. 총액은 항상 서버가 다시 계산한다. */
  async updateAmounts(estimateId: string, dto: UpdateAmountsDto, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
    await this.prisma.estimate.update({
      where: { id: estimateId },
      data: {
        moveAmount: dto.moveAmount,
        vatMode: dto.vatMode,
        // 불포함으로 되돌리면 남아 있던 부가세 금액이 총액에 섞이지 않도록 지운다
        vatAmount: dto.vatMode === 'EXCLUDED' ? null : dto.vatAmount,
        depositAmount: dto.depositAmount,
        balanceAmount: dto.balanceAmount,
      },
    });
    return this.recomputeAmounts(estimateId);
  }

  /**
   * 총액 재계산 = 이사비용 + 옵션합계 (+ 부가세는 '포함' 표기일 때만 더한다).
   * 부가세 불포함은 "총액에 세금이 안 들어간다"는 뜻이라 총액을 건드리지 않는다.
   */
  private async recomputeAmounts(estimateId: string) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      select: { moveAmount: true, vatMode: true, vatAmount: true },
    });
    if (!estimate) return null;
    const agg = await this.prisma.estimateAddon.aggregate({
      where: { estimateId },
      _sum: { amount: true },
    });
    const addonTotal = Number(agg._sum.amount ?? 0);
    const move = Number(estimate.moveAmount ?? 0);
    const vat = estimate.vatMode === 'INCLUDED' ? Number(estimate.vatAmount ?? 0) : 0;
    return this.prisma.estimate.update({
      where: { id: estimateId },
      data: {
        baseAmount: move + addonTotal,
        totalAmount: move + addonTotal + vat,
      },
    });
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
  async document(id: string, principal?: AuthPrincipal): Promise<string> {
    await this.findOne(id, principal); // 조직 스코프 검증
    const e = await this.prisma.estimate.findUnique({
      where: { id },
      include: {
        zones: { orderBy: { sortOrder: 'asc' } },
        lines: true,
        addons: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!e) throw new NotFoundException(`견적을 찾을 수 없습니다: ${id}`);
    const m = await this.buildMeta(id);

    const esc = (v: unknown) =>
      String(v ?? '').replace(/[&<>"]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
      );
    const dash = (v: unknown) => (v == null || v === '' ? '-' : esc(v));
    const won = (v: unknown) =>
      v == null || v === '' ? '-' : `${Number(v).toLocaleString('ko-KR')}원`;
    const handling: Record<string, string> = HANDLING_LABEL;
    const access = (a: string, note: string | null) =>
      `${esc(ACCESS_LABEL[a as AccessMethod] ?? a)}${a === 'ETC' && note ? `(${esc(note)})` : ''}`;
    const addr = (a: string | null, d: string | null) => (a ? `${esc(a)} ${esc(d ?? '')}` : '-');

    // 물량 요약 — 처리구분별(운반/경유/방치/폐기). 방치는 있을 때만 보인다.
    const cbmOf = (h: string) =>
      e.lines.filter((l) => l.handling === h).reduce((sum, l) => sum + Number(l.cbm), 0);
    const r1 = (n: number) => Math.round(n * 100) / 100;
    const volume = [
      ['전체물량', r1(e.lines.reduce((sum, l) => sum + Number(l.cbm), 0))],
      ['운반물량', r1(cbmOf('CARRY'))],
      ['경유물량', r1(cbmOf('VIA'))],
      ...(cbmOf('LEAVE') ? [['방치물량', r1(cbmOf('LEAVE'))]] : []),
      ['폐기물량', r1(cbmOf('DISPOSE'))],
    ] as [string, number][];

    // 방별 품목 — 구역 순서대로, 구역 없는 품목은 맨 끝 "기타"로
    const groups = [
      ...e.zones.map((z) => ({ name: z.name, lines: e.lines.filter((l) => l.zoneId === z.id) })),
      { name: '기타', lines: e.lines.filter((l) => !l.zoneId) },
    ].filter((g) => g.lines.length);
    const itemRows = groups
      .map((g) =>
        g.lines
          .map(
            (l, i) =>
              `<tr>${i === 0 ? `<td rowspan="${g.lines.length}">${esc(g.name)}</td>` : ''}<td>${esc(
                l.itemName,
              )}</td><td class="r">${esc(Number(l.qty))}</td><td class="r">${esc(
                Number(l.cbm),
              )}</td><td>${esc(handling[l.handling] ?? l.handling)}</td><td>${dash(l.memo)}</td></tr>`,
          )
          .join(''),
      )
      .join('');

    const addonRows = e.addons
      .map(
        (a) =>
          `<tr><td>${esc(a.name)}${a.memo ? ` <span class="muted">· ${esc(a.memo)}</span>` : ''}</td><td class="r">${won(
            a.unitPrice,
          )}</td><td class="r">${esc(Number(a.qty))}</td><td class="r">${won(a.amount)}</td></tr>`,
      )
      .join('');
    const addonTotal = e.addons.reduce((sum, a) => sum + Number(a.amount), 0);
    const vatIncluded = e.vatMode === 'INCLUDED';

    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>견적서 ${esc(
      e.estimateNo,
    )}</title><style>
body{font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111827;max-width:820px;margin:24px auto;padding:0 24px;font-size:13px}
h1{font-size:24px;letter-spacing:.3em;text-align:center;border-bottom:2px solid #111827;padding-bottom:10px;margin-bottom:6px}
h2{font-size:15px;margin:22px 0 8px;padding-left:8px;border-left:3px solid #111827}
.top{display:flex;justify-content:space-between;color:#4b5563;margin-bottom:14px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #e5e7eb;padding:6px 9px;text-align:left;vertical-align:top}
th{background:#f9fafb;font-weight:600;white-space:nowrap}
.kv th{width:13%}
td.r,th.r{text-align:right}
.muted{color:#6b7280}
.vol td{text-align:center;font-weight:600}
.total td{font-weight:700;font-size:15px;background:#f9fafb}
@media print{body{margin:0}}
</style></head><body>
<h1>견 적 서</h1>
<div class="top"><b>통인익스프레스</b><span>견적번호 ${esc(e.estimateNo)}</span></div>

<h2>견적 정보</h2>
<table class="kv">
<tr><th>고객명</th><td>${dash(m.customerName)}</td><th>고객연락처</th><td>${dash(m.customerPhone)}</td></tr>
<tr><th>계약번호</th><td>${dash(m.contractNo)}</td><th>진행상태</th><td>${m.leadStatus ? esc(LEAD_STATUS_LABEL[m.leadStatus]) : '-'}</td></tr>
<tr><th>담당자</th><td>${dash(m.estimatorName)}</td><th>담당자연락처</th><td>${dash(m.estimatorPhone)}</td></tr>
<tr><th>이사종류</th><td>${dash(m.productName)}</td><th>지점명</th><td>${dash(m.orgUnitName)}</td></tr>
<tr><th>전주소</th><td colspan="3">${addr(e.fromAddr, e.fromAddrDetail)}</td></tr>
<tr><th>후주소</th><td colspan="3">${addr(e.toAddr, e.toAddrDetail)}</td></tr>
<tr><th>접수일</th><td>${dash(m.receivedDate)}</td><th>상담일</th><td>${dash(m.consultDate)}</td></tr>
<tr><th>계약일</th><td>${dash(m.contractDate)}</td><th>작업일(이사일)</th><td>${dash(m.workDate)}</td></tr>
</table>

<h2>물품 정보</h2>
<table class="vol"><tr>${volume.map(([k]) => `<th>${k}</th>`).join('')}</tr>
<tr>${volume.map(([, v]) => `<td>${v} CBM</td>`).join('')}</tr></table>
<table style="margin-top:8px"><thead><tr><th>방</th><th>품목</th><th class="r">수량</th><th class="r">CBM</th><th>처리방법</th><th>메모</th></tr></thead>
<tbody>${itemRows || '<tr><td colspan="6" class="muted">품목 없음</td></tr>'}</tbody></table>

<h2>작업 조건 · 옵션</h2>
<table class="kv">
<tr><th>전 작업조건</th><td>${e.fromPyeong != null ? `${esc(e.fromPyeong)}평 · ` : ''}${access(e.fromAccess, e.fromAccessNote)}</td>
<th>후 작업조건</th><td>${e.toPyeong != null ? `${esc(e.toPyeong)}평 · ` : ''}${access(e.toAccess, e.toAccessNote)}</td></tr>
</table>
<table style="margin-top:8px"><thead><tr><th>옵션상품</th><th class="r">단가</th><th class="r">수량</th><th class="r">금액</th></tr></thead>
<tbody>${addonRows || '<tr><td colspan="4" class="muted">선택한 옵션 없음</td></tr>'}</tbody></table>

<h2>견적 금액</h2>
<table>
<tr><th>이사비용</th><td class="r">${won(e.moveAmount)}</td></tr>
${e.addons.map((a) => `<tr><th>${esc(a.name)}</th><td class="r">${won(a.amount)}</td></tr>`).join('')}
<tr><th>부가세</th><td class="r">${vatIncluded ? won(e.vatAmount) : '불포함(별도)'}</td></tr>
<tr class="total"><td>총비용${vatIncluded ? ' (부가세 포함)' : ''}</td><td class="r">${won(
      e.totalAmount ?? Number(e.moveAmount ?? 0) + addonTotal,
    )}</td></tr>
<tr><th>계약금</th><td class="r">${won(e.depositAmount)}</td></tr>
<tr><th>잔금</th><td class="r">${won(e.balanceAmount)}</td></tr>
</table>
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
