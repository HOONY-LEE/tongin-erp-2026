import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optionLabel,
  summarizeVolume,
  type AuthPrincipal,
  type EstimateMeta,
  type LeadStatus,
  type BundleRole,
  type EstimateOptionGroup,
  type OptionVariant,
  type VolumeUnit,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { LeadService } from '../lead/lead.service';
import { MoveCatalogService } from '../move-catalog/move-catalog.service';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import {
  CreateAddonDto,
  CreateLineDto,
  CreateZoneDto,
  UpdateAmountsDto,
  UpdateConditionsDto,
} from './dto/estimate-child.dto';
import { CreateCostLineDto } from './dto/cost-line.dto';
import { SaveBasicDto, SaveItemsDto, SaveOptionsDto } from './dto/estimate-tabs.dto';
import { renderEstimateDocument } from './estimate-document';
import { GeoService } from '../geo/geo.service';

@Injectable()
export class EstimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
    private readonly leadService: LeadService,
    private readonly moveCatalog: MoveCatalogService,
    private readonly geo: GeoService,
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
    let estimate = await this.findOne(id, principal);
    // 예전 견적(거리 계산 전) — 처음 열 때 한 번 잰다
    if (!estimate.distanceSource && estimate.fromAddr && estimate.toAddr) {
      await this.refreshDistance(id);
      estimate = await this.findOne(id, principal);
    }
    // 기본정보 탭에서 고치는 원본 값(접수의 상담일·이사일)과 상품 서비스라인 — 메타는 표시용 파생값이라 따로 준다
    const [lead, product] = await Promise.all([
      this.prisma.lead.findUnique({
        where: { id: estimate.leadId },
        select: { id: true, leadNo: true, visitDate: true, moveDate: true },
      }),
      this.prisma.product.findUnique({
        where: { id: estimate.productId },
        select: { serviceLine: true },
      }),
    ]);
    const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    return {
      ...estimate,
      lead: lead && { ...lead, visitDate: day(lead.visitDate), moveDate: day(lead.moveDate) },
      serviceLine: product?.serviceLine ?? null,
      meta: await this.buildMeta(id),
      distanceRule: await this.distanceRule(),
      optionCatalog: await this.optionCatalog(id, estimate.productId),
      moveCatalog: await this.moveCatalog.forEstimate([
        ...new Set(estimate.lines.map((l) => l.handling)),
      ]),
    };
  }

  /**
   * 3단계 상품 목록 — 상품관리 '상품' 탭의 카탈로그 + 이 견적의 상품 구성(가정이사 등)에서의 역할.
   * 구성에 있는 상품은 역할(필수·기본선택·선택)과 구성 단가를, 구성 밖 상품은 role=null('추가 상품')로 준다.
   * '사용 안 함' 상품은 빼되, 이 견적에 이미 담긴 상품은 남겨 둔다(저장된 견적이 깨지지 않게).
   */
  private async optionCatalog(estimateId: string, productId: string) {
    const [rows, bundle] = await Promise.all([
      this.prisma.addonService.findMany({
        where: {
          OR: [{ isActive: true }, { estimateAddons: { some: { estimateId } } }],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.productAddon.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const inBundle = new Map(bundle.map((b, i) => [b.addonServiceId, { ...b, order: i }]));
    return rows
      .map((r) => {
        const b = inBundle.get(r.id);
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          groupCode: r.groupCode as EstimateOptionGroup,
          variants: (r.variants as OptionVariant[] | null) ?? null,
          hasDate: r.hasDate,
          hasNote: r.hasNote,
          price: r.price,
          isActive: r.isActive,
          kind: r.kind as 'VOLUME' | 'SERVICE',
          role: (b?.role as BundleRole | undefined) ?? null,
          bundlePrice: b?.priceOverride ?? r.price,
          order: b ? b.order : 1000 + r.sortOrder,
        };
      })
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...r }) => r);
  }

  private async buildMeta(id: string): Promise<EstimateMeta> {
    const e = await this.prisma.estimate.findUnique({
      where: { id },
      select: {
        customer: { select: { name: true, phonePrimary: true } },
        product: { select: { name: true } },
        orgUnit: { select: { name: true } },
        estimator: { select: { name: true, phone: true } },
        contract: {
          select: {
            id: true,
            contractNo: true,
            signedAt: true,
            createdAt: true,
            sentAt: true,
            workOrder: { select: { id: true } },
            payments: {
              where: { kind: 'DEPOSIT', status: { in: ['PAID', 'PENDING'] } },
              select: { status: true, paidAt: true, virtualAccount: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
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
      // 계약은 견적서를 보낼 때 미리 만들어 두므로, 계약일은 고객이 서명한 날이다
      contractDate: kst(e.contract?.signedAt),
      // 이사일은 접수에 잡힌 날을 우선하고, 없으면 실제 배정된 작업일을 쓴다
      workDate: day(e.lead?.moveDate) ?? day(e.lead?.workOrders[0]?.scheduledDate),
      sentAt: e.contract?.sentAt?.toISOString() ?? null,
      signedAt: e.contract?.signedAt?.toISOString() ?? null,
      depositPaidAt:
        e.contract?.payments.find((p) => p.status === 'PAID')?.paidAt?.toISOString() ?? null,
      depositAccount:
        (e.contract?.payments.find((p) => p.status === 'PAID') ?? e.contract?.payments[0])
          ?.virtualAccount ?? null,
      workOrderId: e.contract?.workOrder?.id ?? null,
    };
  }

  /**
   * 접수 상세 = 견적서 화면. 접수를 열면 그 접수의 최근 견적을 돌려주고, 없으면 바로 만든다
   * (고객·지점·담당자·주소는 접수에서 그대로, 상품은 같은 서비스라인의 첫 상품 — 기본정보에서 바꾼다).
   */
  async forLead(leadId: string, principal?: AuthPrincipal) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException(`접수를 찾을 수 없습니다: ${leadId}`);
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(lead.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 접수만 볼 수 있습니다.');
    }
    const existing = await this.prisma.estimate.findFirst({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) return { estimateId: existing.id, created: false };
    if (!lead.customerId) {
      throw new BadRequestException(
        '고객이 연결되지 않은 접수입니다 — 접수에 고객 연락처를 먼저 넣어 주세요.',
      );
    }
    const product =
      (await this.prisma.product.findFirst({
        where: { isActive: true, ...(lead.serviceLine ? { serviceLine: lead.serviceLine } : {}) },
        orderBy: [{ createdAt: 'asc' }],
      })) ??
      (await this.prisma.product.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }));
    if (!product)
      throw new BadRequestException(
        '사용 중인 상품이 없습니다 — 상품관리에서 상품을 먼저 등록하세요.',
      );
    const created = await this.create(
      {
        leadId,
        customerId: lead.customerId,
        orgUnitId: lead.orgUnitId,
        productId: product.id,
        estimatorEmpId: lead.ownerEmpId ?? undefined,
        fromZipcode: lead.fromZipcode ?? undefined,
        fromAddr: lead.fromAddr ?? undefined,
        fromAddrDetail: lead.fromAddrDetail ?? undefined,
        fromSido: lead.fromSido ?? undefined,
        fromSigungu: lead.fromSigungu ?? undefined,
        fromLat: lead.fromLat ?? undefined,
        fromLng: lead.fromLng ?? undefined,
        toZipcode: lead.toZipcode ?? undefined,
        toAddr: lead.toAddr ?? undefined,
        toAddrDetail: lead.toAddrDetail ?? undefined,
        toSido: lead.toSido ?? undefined,
        toSigungu: lead.toSigungu ?? undefined,
        toLat: lead.toLat ?? undefined,
        toLng: lead.toLng ?? undefined,
      } as CreateEstimateDto,
      principal,
    );
    return { estimateId: created.id, created: true };
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
      const t = await this.leadService.advanceInTx(tx, estimate.leadId, 'QUOTED');
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

  // ── 견적 상세 4단계 탭 저장 (기본정보 / 물품정보 / 옵션선택) ──

  /**
   * 1. 기본정보 저장. 주소·상담일·이사일은 접수(lead)에도 같이 쓴다 —
   * 현장 작업지시서는 접수의 주소를 읽으므로, 견적에서만 고치면 현장에 옛 주소가 간다.
   */
  async saveBasic(estimateId: string, dto: SaveBasicDto, principal?: AuthPrincipal) {
    const estimate = await this.findOne(estimateId, principal);
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
      if (!product) throw new BadRequestException('존재하지 않는 상품(productId)입니다.');
    }
    const address = {
      fromZipcode: dto.fromZipcode,
      fromAddr: dto.fromAddr,
      fromAddrDetail: dto.fromAddrDetail,
      fromSido: dto.fromSido,
      fromSigungu: dto.fromSigungu,
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toZipcode: dto.toZipcode,
      toAddr: dto.toAddr,
      toAddrDetail: dto.toAddrDetail,
      toSido: dto.toSido,
      toSigungu: dto.toSigungu,
      toLat: dto.toLat,
      toLng: dto.toLng,
    };
    // 날짜 전용 컬럼은 UTC 자정으로 넣어야 하루씩 밀리지 않는다('YYYY-MM-DD' → UTC 00:00)
    const dateOnly = (v?: string) =>
      v === undefined ? undefined : v ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null;
    await this.prisma.$transaction([
      this.prisma.estimate.update({
        where: { id: estimateId },
        data: { productId: dto.productId, ...address },
      }),
      this.prisma.lead.update({
        where: { id: estimate.leadId },
        data: { ...address, visitDate: dateOnly(dto.visitDate), moveDate: dateOnly(dto.moveDate) },
      }),
    ]);
    // 주소가 바뀌었을 수 있으니 거리를 다시 잰다
    await this.refreshDistance(estimateId);
    return this.detail(estimateId, principal);
  }

  /**
   * 출발지 → 도착지 거리를 재서 견적에 남긴다(거리 할증 근거).
   * 좌표가 없으면 주소로 찾고, 끝내 못 찾으면 NONE으로 표시해 매번 다시 시도하지 않는다.
   */
  async refreshDistance(estimateId: string) {
    const e = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      select: {
        fromAddr: true,
        fromLat: true,
        fromLng: true,
        toAddr: true,
        toLat: true,
        toLng: true,
      },
    });
    if (!e) return;
    if (!e.fromAddr || !e.toAddr) {
      await this.prisma.estimate.update({
        where: { id: estimateId },
        data: { distanceKm: null, durationMin: null, distanceSource: null },
      });
      return;
    }
    const r = await this.geo.route(
      { lat: e.fromLat, lng: e.fromLng, addr: e.fromAddr },
      { lat: e.toLat, lng: e.toLng, addr: e.toAddr },
    );
    await this.prisma.estimate.update({
      where: { id: estimateId },
      data: r
        ? {
            distanceKm: r.distanceKm,
            durationMin: r.durationMin,
            distanceSource: r.source,
          }
        : { distanceKm: null, durationMin: null, distanceSource: 'NONE' },
    });
  }

  /** 지도에 그릴 경로(출발·도착 좌표와 도로 경로) */
  async route(estimateId: string, principal?: AuthPrincipal) {
    const e = await this.findOne(estimateId, principal);
    const r = await this.geo.route(
      { lat: e.fromLat, lng: e.fromLng, addr: e.fromAddr },
      { lat: e.toLat, lng: e.toLng, addr: e.toAddr },
    );
    if (!r) throw new BadRequestException('출발지·도착지 주소를 먼저 입력하세요.');
    return {
      ...r,
      fromAddr: [e.fromAddr, e.fromAddrDetail].filter(Boolean).join(' '),
      toAddr: [e.toAddr, e.toAddrDetail].filter(Boolean).join(' '),
    };
  }

  /** 거리 할증 기준 — 공통코드 DISTANCE_SURCHARGE(FREE_KM·PER_KM). 없으면 30km 무료·km당 3,000원 */
  async distanceRule() {
    const rows = await this.prisma.commonCode.findMany({
      where: { codeGroup: 'DISTANCE_SURCHARGE', isActive: true },
    });
    const num = (code: string, def: number) => {
      const v = Number(rows.find((r) => r.code === code)?.name);
      return Number.isFinite(v) && v >= 0 ? v : def;
    };
    return { freeKm: num('FREE_KM', 30), perKm: num('PER_KM', 3000) };
  }

  async saveDistanceRule(rule: { freeKm: number; perKm: number }) {
    for (const [code, value, sortOrder] of [
      ['FREE_KM', rule.freeKm, 10],
      ['PER_KM', rule.perKm, 20],
    ] as const) {
      await this.prisma.commonCode.upsert({
        where: { codeGroup_code: { codeGroup: 'DISTANCE_SURCHARGE', code } },
        update: { name: String(value), isActive: true },
        create: { codeGroup: 'DISTANCE_SURCHARGE', code, name: String(value), sortOrder },
      });
    }
    return this.distanceRule();
  }

  /**
   * 2. 물품정보 저장 — 방·물품을 통째로 바꾼다. 값이 있는 물품(부피 > 0 또는 메모)만 남기고,
   * 기본 틀의 빈 행은 저장하지 않는다. 직접 만든 방은 비어 있어도 남긴다(나중에 채우도록).
   */
  async saveItems(estimateId: string, dto: SaveItemsDto, principal?: AuthPrincipal) {
    const current = await this.findOne(estimateId, principal);
    const unit = dto.volumeUnit ?? (current.volumeUnit as VolumeUnit);
    // 화면은 체크한 물품만 보낸다 — 기본 부피가 없는 물품도 '넣었다'는 사실은 남긴다
    const rooms = dto.rooms
      .map((r, i) => ({ ...r, sortOrder: r.sortOrder ?? i }))
      .filter((r) => r.lines.length || !r.roomKey);
    const allLines = rooms.flatMap((r) => r.lines);

    // 처리방법·물품은 카탈로그에 있는 값만(지어낸 코드로 물량이 새지 않게)
    const buckets = await this.moveCatalog.bucketMap();
    const badHandling = allLines.find((l) => !buckets[l.handling]);
    if (badHandling) throw new BadRequestException(`없는 처리방법입니다: ${badHandling.handling}`);
    const itemIds = [...new Set(allLines.map((l) => l.cbmItemId).filter(Boolean))] as string[];
    if (itemIds.length) {
      const found = await this.prisma.cbmItem.count({ where: { id: { in: itemIds } } });
      if (found !== itemIds.length) throw new BadRequestException('없는 이사물품이 섞여 있습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.estimateLine.deleteMany({ where: { estimateId } });
      await tx.estimateZone.deleteMany({ where: { estimateId } });
      for (const r of rooms) {
        const zone = await tx.estimateZone.create({
          data: { estimateId, name: r.name.trim(), roomKey: r.roomKey, sortOrder: r.sortOrder },
        });
        if (!r.lines.length) continue;
        await tx.estimateLine.createMany({
          data: r.lines.map((l) => ({
            estimateId,
            zoneId: zone.id,
            cbmItemId: l.cbmItemId ?? null,
            itemName: l.itemName.trim(),
            itemNameEng: l.itemNameEng?.trim() || null,
            qty: 1,
            cbm: l.cbm ?? 0,
            ton: l.ton ?? null,
            handling: l.handling,
            memo: l.memo?.trim() || null,
          })),
        });
      }
      await tx.estimate.update({
        where: { id: estimateId },
        data: {
          volumeUnit: unit,
          totalCbm: summarizeVolume(allLines, { buckets, unit: 'CBM' }).total,
          totalTon: summarizeVolume(allLines, { buckets, unit: 'TON' }).total,
        },
      });
    });
    return this.detail(estimateId, principal);
  }

  /**
   * 3. 옵션선택 저장 — 작업조건과 고른 옵션 전체를 바꾼다.
   * 옵션 이름은 정의에서 만들어 스냅샷으로 남긴다(정의가 바뀌어도 발송한 견적서는 그대로).
   */
  async saveOptions(estimateId: string, dto: SaveOptionsDto, principal?: AuthPrincipal) {
    await this.findOne(estimateId, principal);
    const defs = await this.prisma.addonService.findMany({
      where: { id: { in: dto.options.map((o) => o.addonServiceId) } },
    });
    const byId = new Map(defs.map((d) => [d.id, d]));
    // 상품 구성(가정이사 등) — 필수 상품은 빠질 수 없고, 구성 밖 상품은 '추가 상품'으로 표시한다.
    // 이사물량(VOLUME)은 2단계 물품정보·4단계 이사비용으로 견적하므로 이 목록에 담지 않는다.
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      select: { productId: true },
    });
    const bundle = await this.prisma.productAddon.findMany({
      where: { productId: estimate!.productId },
      include: { addon: { select: { name: true, kind: true } } },
    });
    const bundleIds = new Set(bundle.map((b) => b.addonServiceId));
    const chosen = new Set(dto.options.map((o) => o.addonServiceId));
    const missing = bundle.filter(
      (b) => b.role === 'REQUIRED' && b.addon.kind !== 'VOLUME' && !chosen.has(b.addonServiceId),
    );
    if (missing.length) {
      throw new BadRequestException(
        `필수 상품이 빠졌습니다: ${missing.map((m) => m.addon.name).join(', ')}`,
      );
    }
    for (const o of dto.options) {
      const def = byId.get(o.addonServiceId);
      if (!def) throw new BadRequestException(`알 수 없는 상품입니다: ${o.addonServiceId}`);
      if (def.kind === 'VOLUME') {
        throw new BadRequestException('이사물량은 물품정보·이사비용으로 견적합니다.');
      }
      const variants = (def.variants as OptionVariant[] | null) ?? null;
      if (o.variant && !variants?.some((v) => v.value === o.variant)) {
        throw new BadRequestException(`${def.name}의 종류가 올바르지 않습니다: ${o.variant}`);
      }
    }
    const note = (access: string | undefined, text: string | undefined) =>
      access === undefined ? text : access === 'ETC' ? (text?.trim() ?? null) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.estimate.update({
        where: { id: estimateId },
        data: {
          fromPyeong: dto.fromPyeong,
          fromAccess: dto.fromAccess,
          fromAccessNote: note(dto.fromAccess, dto.fromAccessNote),
          toPyeong: dto.toPyeong,
          toAccess: dto.toAccess,
          toAccessNote: note(dto.toAccess, dto.toAccessNote),
          optionsSavedAt: new Date(),
        },
      });
      await tx.estimateAddon.deleteMany({ where: { estimateId } });
      if (dto.options.length) {
        await tx.estimateAddon.createMany({
          data: dto.options.map((o, i) => {
            const def = byId.get(o.addonServiceId)!;
            return {
              estimateId,
              addonServiceId: def.id,
              code: def.code,
              variant: o.variant ?? null,
              serviceDate: o.serviceDate
                ? new Date(`${o.serviceDate.slice(0, 10)}T00:00:00Z`)
                : null,
              name: optionLabel(
                { ...def, variants: def.variants as OptionVariant[] | null },
                o.variant,
              ),
              qty: 1,
              unitPrice: o.amount,
              amount: o.amount,
              memo: o.memo?.trim() || null,
              isExtra: !bundleIds.has(def.id),
              sortOrder: i,
            };
          }),
        });
      }
    });
    await this.recomputeAmounts(estimateId);
    return this.detail(estimateId, principal);
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

  /** 견적 전체물량 = 처리방법의 물량 칸(이사·경유·폐기) 합. '물량 제외' 처리방법은 뺀다. */
  private async recomputeTotalCbm(estimateId: string) {
    const [lines, buckets] = await Promise.all([
      this.prisma.estimateLine.findMany({
        where: { estimateId },
        select: { cbm: true, ton: true, handling: true },
      }),
      this.moveCatalog.bucketMap(),
    ]);
    await this.prisma.estimate.update({
      where: { id: estimateId },
      data: {
        totalCbm: summarizeVolume(lines, { buckets, unit: 'CBM' }).total,
        totalTon: summarizeVolume(lines, { buckets, unit: 'TON' }).total,
      },
    });
  }

  /** 견적서 문서를 데이터에서 즉석 HTML로 생성(무저장, 설계노트 E-0). 브라우저에서 인쇄→PDF. */
  /** 계약서·견적서(A4 2쪽, 종이 양식 그대로) — 렌더는 estimate-document.ts */
  async document(id: string, principal?: AuthPrincipal): Promise<string> {
    await this.findOne(id, principal); // 조직 스코프 검증
    const e = await this.prisma.estimate.findUnique({
      where: { id },
      include: {
        zones: { orderBy: { sortOrder: 'asc' } },
        lines: true,
        addons: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        contract: {
          select: { contractNo: true, signedAt: true, signatureImage: true, signerName: true },
        },
      },
    });
    if (!e) throw new NotFoundException(`견적을 찾을 수 없습니다: ${id}`);
    const [meta, catalog, rooms, handlings] = await Promise.all([
      this.buildMeta(id),
      this.prisma.addonService.findMany({
        where: {
          OR: [{ isActive: true }, { id: { in: e.addons.flatMap((a) => a.addonServiceId ?? []) } }],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, groupCode: true, kind: true, variants: true },
      }),
      this.prisma.roomTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            select: { cbmItem: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.handlingMethod.findMany({ select: { code: true, name: true, bucket: true } }),
    ]);
    return renderEstimateDocument({
      ...e,
      contractNo: e.contract?.contractNo ?? null,
      signedAt: e.contract?.signedAt ?? null,
      signatureImage: e.contract?.signatureImage ?? null,
      signerName: e.contract?.signerName ?? null,
      meta,
      catalog: catalog.map((c) => ({
        ...c,
        variants: (c.variants as { value: string; label: string }[] | null) ?? null,
      })),
      rooms: rooms.map((r) => ({
        code: r.code,
        name: r.name,
        extraSlots: r.extraSlots,
        items: r.items.map((i) => i.cbmItem),
      })),
      handlings,
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
