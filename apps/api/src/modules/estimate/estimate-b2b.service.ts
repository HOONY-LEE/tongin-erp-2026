import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal, B2bCostBreakdown, B2bDocumentKind } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { UpsertCostBuildupDto } from './dto/cost-buildup.dto';

const num = (v: unknown): number => Number(v ?? 0);
const won = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );

/**
 * EST-04: 기업이전(B2B) 원가 적상식 산정 + 3종 문서 (설계노트 F-2/F-3).
 * 합계 = 재료비(EST-03 costLines) + 차량비 + 노무비 + 기타
 * 총용역원가 = 합계 + 공과잡비 + 일반관리비 + 이윤 (각 비율은 합계 기준) → 견적가
 */
@Injectable()
export class EstimateB2bService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  /** 소속 조직의 견적인지 검증(견적 본체와 동일 규칙). */
  private async assertScope(orgUnitId: string, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(orgUnitId)) {
      throw new ForbiddenException('소속 조직의 견적만 조회할 수 있습니다.');
    }
  }

  async upsertBuildup(
    estimateId: string,
    dto: UpsertCostBuildupDto,
    principal?: AuthPrincipal,
  ): Promise<B2bCostBreakdown> {
    const estimate = await this.prisma.estimate.findUnique({ where: { id: estimateId } });
    if (!estimate) throw new NotFoundException(`견적을 찾을 수 없습니다: ${estimateId}`);
    await this.assertScope(estimate.orgUnitId, principal);

    await this.prisma.estimateCostBuildup.upsert({
      where: { estimateId },
      update: { ...dto },
      create: { estimateId, ...dto },
    });
    await this.eventBus.record({
      aggregateType: 'estimate',
      aggregateId: estimateId,
      eventType: 'estimate.cost_buildup_set',
      payload: { estimateNo: estimate.estimateNo },
    });
    return this.getBreakdown(estimateId, principal);
  }

  /** 적상식 산출(저장값에서 즉석 계산 — stale 방지). */
  async getBreakdown(estimateId: string, principal?: AuthPrincipal): Promise<B2bCostBreakdown> {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      include: { costLines: true, costBuildup: true },
    });
    if (!estimate) throw new NotFoundException(`견적을 찾을 수 없습니다: ${estimateId}`);
    await this.assertScope(estimate.orgUnitId, principal);

    const materialCost = estimate.costLines.reduce((s, l) => s + num(l.totalPrice), 0);
    const b = estimate.costBuildup;
    const vehicleCost = num(b?.vehicleCost);
    const laborCost = num(b?.laborCost);
    const etcCost = num(b?.etcCost);
    const overheadRate = num(b?.overheadRate);
    const adminRate = num(b?.adminRate);
    const profitRate = num(b?.profitRate);

    const subtotal = materialCost + vehicleCost + laborCost + etcCost;
    const overhead = Math.round(subtotal * overheadRate);
    const admin = Math.round(subtotal * adminRate);
    const profit = Math.round(subtotal * profitRate);
    const totalServiceCost = subtotal + overhead + admin + profit;

    return {
      materialCost,
      vehicleCost,
      laborCost,
      etcCost,
      subtotal,
      overheadRate,
      overhead,
      adminRate,
      admin,
      profitRate,
      profit,
      totalServiceCost,
      quotedAmount: Math.round(totalServiceCost),
    };
  }

  /** 3종 문서(견적서/물품내역서/산출내역서)를 데이터에서 즉석 HTML 생성(무저장, E-0). */
  async document(
    estimateId: string,
    kind: B2bDocumentKind,
    principal?: AuthPrincipal,
  ): Promise<string> {
    const e = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        customer: true,
        product: true,
        orgUnit: true,
        zones: { orderBy: { sortOrder: 'asc' } },
        lines: true,
        costLines: { include: { material: true } },
        costBuildup: true,
      },
    });
    if (!e) throw new NotFoundException(`견적을 찾을 수 없습니다: ${estimateId}`);
    await this.assertScope(e.orgUnitId, principal);
    const breakdown = await this.getBreakdown(estimateId, principal);

    const title = kind === 'quote' ? '견 적 서' : kind === 'items' ? '물품내역서' : '산출내역서';
    let body: string;
    if (kind === 'quote') body = this.quoteBody(e, breakdown);
    else if (kind === 'items') body = this.itemsBody(e);
    else if (kind === 'cost') body = this.costBody(breakdown);
    else throw new BadRequestException(`알 수 없는 문서종류: ${kind}`);

    return this.shell(title, e.estimateNo, body);
  }

  private shell(title: string, estimateNo: string, body: string): string {
    const seal = process.env.COMPANY_SEAL_URL
      ? `<img class="seal" src="${esc(process.env.COMPANY_SEAL_URL)}" alt="직인" />`
      : '<span class="seal-ph">(직인)</span>';
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(
      title,
    )} ${esc(estimateNo)}</title><style>
body{font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111827;max-width:820px;margin:24px auto;padding:0 24px}
h1{font-size:26px;text-align:center;letter-spacing:8px;border-bottom:3px double #111827;padding-bottom:10px}
.head{display:flex;justify-content:space-between;align-items:flex-start;margin:16px 0}
.from{position:relative}
.seal{width:64px;height:64px;object-fit:contain;position:absolute;right:-8px;top:-6px;opacity:.85}
.seal-ph{color:#9ca3af;border:1px dashed #d1d5db;border-radius:50%;width:56px;height:56px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;margin-left:8px}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:8px}
th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left}
th{background:#f9fafb}
td.r,th.r{text-align:right}
tr.total td{font-weight:700;background:#f3f4f6}
.info{font-size:14px;margin:4px 0}
@media print{body{margin:0}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="head">
<div><div class="info"><b>수신</b>: 귀하</div><div class="info">문서번호: ${esc(estimateNo)}</div>
<div class="info">작성일: ${new Date().toISOString().slice(0, 10)}</div></div>
<div class="from"><div class="info"><b>발신</b>: 통인익스프레스</div>${seal}</div>
</div>
${body}
</body></html>`;
  }

  private quoteBody(
    e: { customer: { name: string } | null; product: { name: string } | null },
    b: B2bCostBreakdown,
  ): string {
    const row = (label: string, v: number) =>
      `<tr><td>${esc(label)}</td><td class="r">${won(v)} 원</td></tr>`;
    return `<div class="info">고객: ${esc(e.customer?.name)}</div>
<div class="info">서비스(상품): ${esc(e.product?.name)} (기업이전)</div>
<table><thead><tr><th>항목</th><th class="r">금액</th></tr></thead><tbody>
${row('재료비', b.materialCost)}${row('차량비', b.vehicleCost)}${row('노무비', b.laborCost)}${row(
      '기타',
      b.etcCost,
    )}
<tr class="total"><td>합계</td><td class="r">${won(b.subtotal)} 원</td></tr>
${row(`공과잡비 (${(b.overheadRate * 100).toFixed(1)}%)`, b.overhead)}${row(
      `일반관리비 (${(b.adminRate * 100).toFixed(1)}%)`,
      b.admin,
    )}${row(`이윤 (${(b.profitRate * 100).toFixed(1)}%)`, b.profit)}
<tr class="total"><td>총 용역원가</td><td class="r">${won(b.totalServiceCost)} 원</td></tr>
<tr class="total"><td>견적가</td><td class="r">${won(b.quotedAmount)} 원</td></tr>
</tbody></table>`;
  }

  private itemsBody(e: {
    zones: { id: string; name: string }[];
    lines: {
      zoneId: string | null;
      itemName: string;
      qty: unknown;
      cbm: unknown;
      handling: string;
    }[];
    costLines: { material: { name: string }; qty: number; totalPrice: unknown }[];
  }): string {
    const handling: Record<string, string> = { CARRY: '운반', LEAVE: '방치', DISPOSE: '폐기' };
    const zoneName = (zid: string | null) => e.zones.find((z) => z.id === zid)?.name ?? '-';
    const itemRows =
      e.lines
        .map(
          (l) =>
            `<tr><td>${esc(zoneName(l.zoneId))}</td><td>${esc(l.itemName)}</td><td class="r">${esc(
              l.qty,
            )}</td><td class="r">${esc(l.cbm)}</td><td>${esc(handling[l.handling] ?? l.handling)}</td></tr>`,
        )
        .join('') || '<tr><td colspan="5">품목 없음</td></tr>';
    const matRows =
      e.costLines
        .map(
          (l) =>
            `<tr><td>${esc(l.material.name)}</td><td class="r">${esc(l.qty)}</td><td class="r">${won(
              num(l.totalPrice),
            )} 원</td></tr>`,
        )
        .join('') || '<tr><td colspan="3">재료 없음</td></tr>';
    return `<h3>이전 물품</h3>
<table><thead><tr><th>구역</th><th>품목</th><th class="r">수량</th><th class="r">CBM</th><th>처리</th></tr></thead>
<tbody>${itemRows}</tbody></table>
<h3 style="margin-top:20px">포장 재료</h3>
<table><thead><tr><th>자재</th><th class="r">수량</th><th class="r">금액</th></tr></thead>
<tbody>${matRows}</tbody></table>`;
  }

  private costBody(b: B2bCostBreakdown): string {
    const row = (no: string, label: string, v: number) =>
      `<tr><td class="r">${no}</td><td>${esc(label)}</td><td class="r">${won(v)} 원</td></tr>`;
    return `<table><thead><tr><th class="r">No</th><th>원가 항목</th><th class="r">금액</th></tr></thead><tbody>
${row('1', '재료비', b.materialCost)}${row('2', '차량비', b.vehicleCost)}${row(
      '3',
      '노무비',
      b.laborCost,
    )}${row('4', '기타', b.etcCost)}
<tr class="total"><td class="r">5</td><td>합계</td><td class="r">${won(b.subtotal)} 원</td></tr>
${row('6', `공과잡비 (${(b.overheadRate * 100).toFixed(1)}%)`, b.overhead)}${row(
      '7',
      `일반관리비 (${(b.adminRate * 100).toFixed(1)}%)`,
      b.admin,
    )}${row('8', `이윤 (${(b.profitRate * 100).toFixed(1)}%)`, b.profit)}
<tr class="total"><td class="r">9</td><td>총 용역원가</td><td class="r">${won(
      b.totalServiceCost,
    )} 원</td></tr>
<tr class="total"><td class="r">10</td><td>견적가</td><td class="r">${won(b.quotedAmount)} 원</td></tr>
</tbody></table>`;
  }
}
