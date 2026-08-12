import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';

/** 현장 목록 한 줄 — 폰에서 한눈에 봐야 하는 것만. */
export interface FieldWorkOrderSummary {
  id: string;
  workNo: string;
  status: string;
  scheduledDate: string | null;
  customerName: string;
  customerPhone: string | null;
  fromAddr: string | null;
  toAddr: string | null;
  crewCount: number;
}

/** 작업지시서 — 현장에서 필요한 전부. */
export interface FieldWorkOrderDetail extends FieldWorkOrderSummary {
  contractNo: string;
  fromZipcode: string | null;
  fromAddrDetail: string | null;
  fromLat: number | null;
  fromLng: number | null;
  fromPyeong: string | null;
  fromElevator: boolean | null;
  toZipcode: string | null;
  toAddrDetail: string | null;
  toLat: number | null;
  toLng: number | null;
  toPyeong: string | null;
  toElevator: boolean | null;
  /** 견적에 적힌 작업지시 메모 — 작업토스 시 재입력 없이 그대로 전달(설계노트 E-2) */
  workInstructions: string | null;
  totalCbm: string;
  zones: { id: string; name: string; lines: FieldLine[] }[];
  /** 구역이 지정되지 않은 품목 */
  looseLines: FieldLine[];
  assignments: { id: string; name: string; resourceType: string; scheduledAt: string | null }[];
}

interface FieldLine {
  id: string;
  itemName: string;
  qty: string;
  handling: string;
  memo: string | null;
}

const ymd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class FieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * 로그인 주체가 볼 작업의 범위.
   * - 전속업체 사용자: 본인 소속(partnerId) 작업만
   * - 직원 계정: 본인이 배정된 작업만 (배정이 곧 "내 작업")
   * - 그 외(관리자 등): 조직 스코프 범위 전체
   */
  private async whereFor(principal: AuthPrincipal): Promise<Prisma.WorkOrderWhereInput> {
    if (principal.partnerId) return { partnerId: principal.partnerId };
    if (principal.employeeId) {
      return { assignments: { some: { employeeId: principal.employeeId } } };
    }
    const ids = await this.scope.orgScopeIds(principal);
    return ids === null ? {} : { orgUnitId: { in: ids } };
  }

  /** 전속업체엔 원가를 노출하지 않는다(OPS-04) — 현장 응답에는 애초에 금액을 넣지 않는다. */
  async list(principal: AuthPrincipal, from?: string, to?: string) {
    const where = await this.whereFor(principal);
    const rows = await this.prisma.workOrder.findMany({
      where: {
        ...where,
        status: { not: 'CANCELED' },
        ...(from || to
          ? {
              scheduledDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        contract: { include: { customer: true } },
        lead: true,
        assignments: true,
      },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return rows.map(
      (w): FieldWorkOrderSummary => ({
        id: w.id,
        workNo: w.workNo,
        status: w.status,
        scheduledDate: ymd(w.scheduledDate),
        customerName: w.contract.customer.name,
        customerPhone: w.contract.customer.phonePrimary,
        fromAddr: w.lead.fromAddr,
        toAddr: w.lead.toAddr,
        crewCount: w.assignments.filter((a) => a.resourceType === 'CREW').length,
      }),
    );
  }

  async detail(id: string, principal: AuthPrincipal): Promise<FieldWorkOrderDetail> {
    const where = await this.whereFor(principal);
    const w = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        contract: { include: { customer: true } },
        lead: true,
        assignments: { include: { employee: true } },
      },
    });
    if (!w) throw new NotFoundException(`작업오더를 찾을 수 없습니다: ${id}`);

    // 목록과 같은 범위 규칙을 상세에도 적용 — id를 알아도 남의 작업은 못 연다
    const allowed = await this.prisma.workOrder.count({ where: { AND: [{ id }, where] } });
    if (allowed === 0) throw new ForbiddenException('접근 권한이 없는 작업오더입니다.');

    const estimate = await this.prisma.estimate.findUnique({
      where: { id: w.contract.estimateId },
      include: {
        zones: { orderBy: { sortOrder: 'asc' }, include: { lines: true } },
        lines: true,
      },
    });

    const toLine = (l: {
      id: string;
      itemName: string;
      qty: Prisma.Decimal;
      handling: string;
      memo: string | null;
    }): FieldLine => ({
      id: l.id,
      itemName: l.itemName,
      qty: String(l.qty),
      handling: l.handling,
      memo: l.memo,
    });

    return {
      id: w.id,
      workNo: w.workNo,
      status: w.status,
      scheduledDate: ymd(w.scheduledDate),
      contractNo: w.contract.contractNo,
      customerName: w.contract.customer.name,
      customerPhone: w.contract.customer.phonePrimary,
      fromAddr: w.lead.fromAddr,
      fromZipcode: w.lead.fromZipcode,
      fromAddrDetail: w.lead.fromAddrDetail,
      fromLat: w.lead.fromLat,
      fromLng: w.lead.fromLng,
      fromPyeong: estimate?.fromPyeong == null ? null : String(estimate.fromPyeong),
      fromElevator: estimate?.fromElevator ?? null,
      toAddr: w.lead.toAddr,
      toZipcode: w.lead.toZipcode,
      toAddrDetail: w.lead.toAddrDetail,
      toLat: w.lead.toLat,
      toLng: w.lead.toLng,
      toPyeong: estimate?.toPyeong == null ? null : String(estimate.toPyeong),
      toElevator: estimate?.toElevator ?? null,
      workInstructions: estimate?.workInstructions ?? null,
      totalCbm: String(estimate?.totalCbm ?? 0),
      zones: (estimate?.zones ?? []).map((z) => ({
        id: z.id,
        name: z.name,
        lines: z.lines.map(toLine),
      })),
      looseLines: (estimate?.lines ?? []).filter((l) => !l.zoneId).map(toLine),
      crewCount: w.assignments.filter((a) => a.resourceType === 'CREW').length,
      assignments: w.assignments.map((a) => ({
        id: a.id,
        name: a.employee?.name ?? a.resourceRef ?? '-',
        resourceType: a.resourceType,
        scheduledAt: a.scheduledAt ? a.scheduledAt.toISOString() : null,
      })),
    };
  }
}
