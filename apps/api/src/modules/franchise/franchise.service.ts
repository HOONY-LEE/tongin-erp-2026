import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FRANCHISE_RENEWAL_DAYS,
  type AuthPrincipal,
  type FranchiseBranchRow,
  type FranchiseStatus,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface FranchiseInfoInput {
  status?: FranchiseStatus;
  ownerName?: string | null;
  ownerPhone?: string | null;
  bizNo?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  franchiseFee?: number | null;
  feePaidAt?: string | null;
  deposit?: number | null;
  depositPaidAt?: string | null;
  royalty?: number | null;
  memo?: string | null;
}

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string | null | undefined) =>
  s === undefined ? undefined : s ? new Date(`${s}T00:00:00Z`) : null;
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));
const text = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : v.trim() || null;
/** 오늘(한국 날짜) */
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 가맹 — 가맹점 현황(지점별 계약·가맹비·보증금·재계약)과 가맹 영업 CRM(가맹점 모집 상담).
 * 권한: FRANCHISE.READ 보기, CREATE 영업 대상 등록, UPDATE 계약 정보·상담 기록·단계, DELETE 영업 대상 지우기
 */
@Injectable()
export class FranchiseService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 가맹점 현황 ──

  async branches(): Promise<{ rows: FranchiseBranchRow[]; summary: Record<string, number> }> {
    const units = await this.prisma.orgUnit.findMany({
      where: { type: 'BRANCH' },
      select: {
        id: true,
        name: true,
        addr: true,
        isActive: true,
        parent: { select: { name: true } },
        franchiseInfo: true,
        _count: { select: { employees: { where: { isActive: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    const t = today();
    const tMs = Date.parse(`${t}T00:00:00Z`);
    const rows: FranchiseBranchRow[] = units.map((u) => {
      const f = u.franchiseInfo;
      const status = (f?.status ?? (u.isActive ? 'OPERATING' : 'TERMINATED')) as FranchiseStatus;
      const end = ymd(f?.contractEnd);
      const daysLeft = end ? Math.round((Date.parse(`${end}T00:00:00Z`) - tMs) / 86_400_000) : null;
      const fee = num(f?.franchiseFee ?? null);
      const deposit = num(f?.deposit ?? null);
      return {
        orgUnitId: u.id,
        name: u.name,
        parentName: u.parent?.name ?? null,
        addr: u.addr,
        status,
        ownerName: f?.ownerName ?? null,
        ownerPhone: f?.ownerPhone ?? null,
        bizNo: f?.bizNo ?? null,
        contractStart: ymd(f?.contractStart),
        contractEnd: end,
        daysLeft,
        renewalDue:
          status !== 'TERMINATED' && daysLeft !== null && daysLeft <= FRANCHISE_RENEWAL_DAYS,
        franchiseFee: fee,
        feePaidAt: ymd(f?.feePaidAt),
        deposit,
        depositPaidAt: ymd(f?.depositPaidAt),
        royalty: num(f?.royalty ?? null),
        unpaid:
          status !== 'TERMINATED' && ((!!fee && !f?.feePaidAt) || (!!deposit && !f?.depositPaidAt)),
        memo: f?.memo ?? null,
        empty: !f,
        employeeCount: u._count.employees,
      };
    });
    const year = t.slice(0, 4);
    const live = rows.filter((r) => r.status !== 'TERMINATED');
    const [leadsOpen, wonThisYear] = await Promise.all([
      this.prisma.crmLead.count({
        where: { pipeline: 'FRANCHISE', stage: { notIn: ['WON', 'LOST', 'HOLD'] } },
      }),
      this.prisma.crmActivity.count({
        where: {
          kind: 'STAGE',
          toStage: 'WON',
          lead: { pipeline: 'FRANCHISE' },
          at: { gte: new Date(`${year}-01-01T00:00:00+09:00`) },
        },
      }),
    ]);
    return {
      rows,
      summary: {
        total: live.length,
        operating: rows.filter((r) => r.status === 'OPERATING').length,
        newThisYear: live.filter((r) => r.contractStart?.startsWith(year)).length,
        renewalDue: rows.filter((r) => r.renewalDue).length,
        unpaid: rows.filter((r) => r.unpaid).length,
        missing: rows.filter((r) => r.empty).length,
        leadsOpen,
        wonThisYear,
      },
    };
  }

  async saveInfo(p: AuthPrincipal, orgUnitId: string, input: FranchiseInfoInput) {
    const u = await this.prisma.orgUnit.findUnique({ where: { id: orgUnitId } });
    if (!u || u.type !== 'BRANCH') throw new NotFoundException('가맹점(지점)을 찾을 수 없습니다.');
    if (input.contractStart && input.contractEnd && input.contractEnd < input.contractStart)
      throw new BadRequestException('계약 만료일이 시작일보다 앞입니다.');
    const data = {
      status: input.status,
      ownerName: text(input.ownerName),
      ownerPhone: text(input.ownerPhone),
      bizNo: text(input.bizNo),
      contractStart: day(input.contractStart),
      contractEnd: day(input.contractEnd),
      franchiseFee: input.franchiseFee,
      feePaidAt: day(input.feePaidAt),
      deposit: input.deposit,
      depositPaidAt: day(input.depositPaidAt),
      royalty: input.royalty,
      memo: text(input.memo),
      updatedByUserId: p.userId,
    };
    await this.prisma.franchiseInfo.upsert({
      where: { orgUnitId },
      create: { orgUnitId, ...data },
      update: data,
    });
    return { ok: true };
  }
}
