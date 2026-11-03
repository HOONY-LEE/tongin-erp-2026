import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LEAD_SOURCE_LABEL,
  SALES_GROUP_BY,
  SERVICE_LINE_LABEL,
  type AuthPrincipal,
  type SalesGroupBy,
  type SalesStats,
  type SalesStatsRow,
  type ServiceLine,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';

export interface SalesQuery {
  from?: string;
  to?: string;
  serviceLine?: string;
  orgUnitId?: string;
  partnerId?: string;
  source?: string;
  groupBy?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000);
const kstDay = (d: Date) => kst(d).toISOString().slice(0, 10);
/** 그 주 월요일(한국 날짜) */
const weekOf = (d: Date) => {
  const k = kst(d);
  const dow = (k.getUTCDay() + 6) % 7;
  return new Date(k.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
};

/**
 * 매출 통계(필터) — 기간·상품 종류(예: 기업이전 B2B_MOVING)·지점·거래처·접수 경로로 거르고
 * 일·주·월·지점·거래처·상품 종류·접수 경로·시도별로 묶어 접수 건수·계약 건수·계약 매출을 낸다.
 * 접수는 접수일, 계약·매출은 서명일 기준. 데이터 범위(지점) 밖은 빠진다. AI 도구로도 쓴다.
 */
@Injectable()
export class SalesStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async sales(p: AuthPrincipal, q: SalesQuery): Promise<SalesStats> {
    for (const d of [q.from, q.to])
      if (d && !DATE.test(d)) throw new BadRequestException('기간은 YYYY-MM-DD로 넣어 주세요.');
    const groupBy = (q.groupBy || 'month') as SalesGroupBy;
    if (!(SALES_GROUP_BY as readonly string[]).includes(groupBy))
      throw new BadRequestException(`묶음(groupBy)은 ${SALES_GROUP_BY.join('·')} 중 하나입니다.`);
    const ids = await this.scope.orgScopeIds(p);
    const range =
      q.from || q.to
        ? {
            ...(q.from && { gte: new Date(`${q.from}T00:00:00+09:00`) }),
            ...(q.to && { lt: new Date(Date.parse(`${q.to}T00:00:00+09:00`) + 86_400_000) }),
          }
        : undefined;
    const orgFilter =
      q.orgUnitId || ids !== null
        ? {
            orgUnitId: q.orgUnitId
              ? ids === null || ids.includes(q.orgUnitId)
                ? q.orgUnitId
                : '00000000-0000-0000-0000-000000000000'
              : { in: ids! },
          }
        : {};
    const leadWhere: Prisma.LeadWhereInput = {
      ...orgFilter,
      ...(q.serviceLine && { serviceLine: q.serviceLine }),
      ...(q.partnerId && { partnerId: q.partnerId }),
      ...(q.source && { source: q.source }),
    };
    const [leads, contracts] = await Promise.all([
      this.prisma.lead.findMany({
        where: { ...leadWhere, ...(range && { createdAt: range }), status: { not: 'CANCELED' } },
        select: {
          createdAt: true,
          orgUnitId: true,
          partnerId: true,
          serviceLine: true,
          source: true,
          fromSido: true,
        },
      }),
      this.prisma.contract.findMany({
        where: {
          ...orgFilter,
          status: 'SIGNED',
          signedAt: range ?? { not: null },
          lead: {
            ...(q.serviceLine && { serviceLine: q.serviceLine }),
            ...(q.partnerId && { partnerId: q.partnerId }),
            ...(q.source && { source: q.source }),
          },
        },
        select: {
          signedAt: true,
          totalAmount: true,
          orgUnitId: true,
          lead: { select: { partnerId: true, serviceLine: true, source: true, fromSido: true } },
        },
      }),
    ]);

    type Item = {
      at: Date;
      orgUnitId: string;
      partnerId: string | null;
      serviceLine: string | null;
      source: string | null;
      sido: string | null;
    };
    const keyOf = (x: Item): string => {
      switch (groupBy) {
        case 'day':
          return kstDay(x.at);
        case 'week':
          return weekOf(x.at);
        case 'month':
          return kstDay(x.at).slice(0, 7);
        case 'branch':
          return x.orgUnitId;
        case 'partner':
          return x.partnerId ?? '-';
        case 'serviceLine':
          return x.serviceLine ?? '-';
        case 'source':
          return x.source ?? '-';
        case 'region':
          return x.sido ?? '-';
      }
    };
    const rows = new Map<string, SalesStatsRow>();
    const bump = (k: string) => {
      let r = rows.get(k);
      if (!r) rows.set(k, (r = { key: k, label: k, leads: 0, contracts: 0, revenue: 0 }));
      return r;
    };
    for (const l of leads)
      bump(
        keyOf({
          at: l.createdAt,
          orgUnitId: l.orgUnitId,
          partnerId: l.partnerId,
          serviceLine: l.serviceLine,
          source: l.source,
          sido: l.fromSido,
        }),
      ).leads += 1;
    let revenue = 0;
    for (const c of contracts) {
      const amt = Number(c.totalAmount);
      revenue += amt;
      const r = bump(
        keyOf({
          at: c.signedAt!,
          orgUnitId: c.orgUnitId,
          partnerId: c.lead.partnerId,
          serviceLine: c.lead.serviceLine,
          source: c.lead.source,
          sido: c.lead.fromSido,
        }),
      );
      r.contracts += 1;
      r.revenue += amt;
    }

    // 이름 붙이기
    const keys = [...rows.keys()].filter((k) => k !== '-');
    if (groupBy === 'branch' && keys.length) {
      const orgs = await this.prisma.orgUnit.findMany({
        where: { id: { in: keys } },
        select: { id: true, name: true },
      });
      for (const o of orgs) rows.get(o.id)!.label = o.name;
    } else if (groupBy === 'partner' && keys.length) {
      const ps = await this.prisma.partner.findMany({
        where: { id: { in: keys } },
        select: { id: true, name: true },
      });
      for (const o of ps) rows.get(o.id)!.label = o.name;
    } else if (groupBy === 'serviceLine') {
      for (const r of rows.values()) r.label = SERVICE_LINE_LABEL[r.key as ServiceLine] ?? r.key;
    } else if (groupBy === 'source') {
      for (const r of rows.values()) r.label = LEAD_SOURCE_LABEL[r.key] ?? r.key;
    }
    const dash = rows.get('-');
    if (dash)
      dash.label =
        groupBy === 'partner'
          ? '거래처 없음(개인 고객)'
          : groupBy === 'region'
            ? '지역 없음'
            : '없음';

    const timeline = groupBy === 'day' || groupBy === 'week' || groupBy === 'month';
    const list = [...rows.values()].sort((a, b) =>
      timeline ? a.key.localeCompare(b.key) : b.revenue - a.revenue || b.leads - a.leads,
    );
    return {
      filters: {
        from: q.from ?? null,
        to: q.to ?? null,
        serviceLine: q.serviceLine ?? null,
        orgUnitId: q.orgUnitId ?? null,
        partnerId: q.partnerId ?? null,
        source: q.source ?? null,
        groupBy,
      },
      total: {
        leads: leads.length,
        contracts: contracts.length,
        revenue,
        avgContract: contracts.length ? Math.round(revenue / contracts.length) : null,
        conversion: leads.length ? contracts.length / leads.length : null,
      },
      rows: list,
    };
  }
}
