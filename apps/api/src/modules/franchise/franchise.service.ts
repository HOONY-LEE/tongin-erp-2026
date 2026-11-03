import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FRANCHISE_LEAD_STAGES,
  FRANCHISE_RENEWAL_DAYS,
  type AuthPrincipal,
  type FranchiseActivityKind,
  type FranchiseActivityView,
  type FranchiseBranchRow,
  type FranchiseInterest,
  type FranchiseLeadSource,
  type FranchiseLeadStage,
  type FranchiseLeadView,
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

export interface FranchiseLeadInput {
  companyName?: string;
  contactName?: string | null;
  phone?: string | null;
  region?: string | null;
  source?: FranchiseLeadSource;
  stage?: FranchiseLeadStage;
  interest?: FranchiseInterest;
  ownerEmpId?: string | null;
  nextActionAt?: string | null;
  nextAction?: string | null;
  currentBiz?: string | null;
  memo?: string | null;
  lostReason?: string | null;
  branchId?: string | null;
}

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string | null | undefined) =>
  s === undefined ? undefined : s ? new Date(`${s}T00:00:00Z`) : null;
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));
const text = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : v.trim() || null;
/** 오늘(한국 날짜) */
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

const leadInclude = {
  owner: { select: { name: true } },
  branch: { select: { name: true } },
  activities: { select: { at: true }, orderBy: { at: 'desc' as const }, take: 1 },
};

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
      this.prisma.franchiseLead.count({ where: { stage: { notIn: ['WON', 'LOST', 'HOLD'] } } }),
      this.prisma.franchiseLeadActivity.count({
        where: {
          kind: 'STAGE',
          toStage: 'WON',
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

  // ── 가맹 영업 ──

  private view(
    l: Prisma.FranchiseLeadGetPayload<{ include: typeof leadInclude }>,
  ): FranchiseLeadView {
    return {
      id: l.id,
      companyName: l.companyName,
      contactName: l.contactName,
      phone: l.phone,
      region: l.region,
      source: l.source as FranchiseLeadSource,
      stage: l.stage as FranchiseLeadStage,
      interest: l.interest as FranchiseInterest,
      ownerEmpId: l.ownerEmpId,
      ownerName: l.owner?.name ?? null,
      nextActionAt: ymd(l.nextActionAt),
      nextAction: l.nextAction,
      currentBiz: l.currentBiz,
      memo: l.memo,
      lostReason: l.lostReason,
      branchId: l.branchId,
      branchName: l.branch?.name ?? null,
      lastActivityAt: l.activities[0]?.at.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    };
  }

  async leads() {
    const rows = await this.prisma.franchiseLead.findMany({
      include: leadInclude,
      orderBy: [{ nextActionAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 2000,
    });
    return rows.map((l) => this.view(l));
  }

  async lead(id: string) {
    const l = await this.prisma.franchiseLead.findUnique({ where: { id }, include: leadInclude });
    if (!l) throw new NotFoundException('영업 대상을 찾을 수 없습니다.');
    const acts = await this.prisma.franchiseLeadActivity.findMany({
      where: { leadId: id },
      orderBy: { at: 'desc' },
      take: 300,
    });
    return {
      lead: this.view(l),
      activities: acts.map(
        (a): FranchiseActivityView => ({
          id: a.id,
          kind: a.kind as FranchiseActivityKind,
          content: a.content,
          fromStage: a.fromStage as FranchiseLeadStage | null,
          toStage: a.toStage as FranchiseLeadStage | null,
          actorName: a.actorName,
          at: a.at.toISOString(),
        }),
      ),
    };
  }

  private async check(input: FranchiseLeadInput) {
    if (input.stage && !(FRANCHISE_LEAD_STAGES as readonly string[]).includes(input.stage))
      throw new BadRequestException('단계가 올바르지 않습니다.');
    if (input.ownerEmpId) {
      const e = await this.prisma.employee.findUnique({ where: { id: input.ownerEmpId } });
      if (!e) throw new BadRequestException('담당자를 찾을 수 없습니다.');
    }
    if (input.branchId) {
      const b = await this.prisma.orgUnit.findUnique({ where: { id: input.branchId } });
      if (!b || b.type !== 'BRANCH')
        throw new BadRequestException('연결할 지점을 찾을 수 없습니다.');
    }
  }

  private data(input: FranchiseLeadInput) {
    return {
      ...(input.companyName !== undefined && { companyName: input.companyName.trim() }),
      contactName: text(input.contactName),
      phone: text(input.phone),
      region: text(input.region),
      source: input.source,
      stage: input.stage,
      interest: input.interest,
      ownerEmpId: input.ownerEmpId === undefined ? undefined : input.ownerEmpId || null,
      nextActionAt: day(input.nextActionAt),
      nextAction: text(input.nextAction),
      currentBiz: text(input.currentBiz),
      memo: text(input.memo),
      lostReason: text(input.lostReason),
      branchId: input.branchId === undefined ? undefined : input.branchId || null,
    };
  }

  private actor(p: AuthPrincipal) {
    return { actorUserId: p.userId, actorName: p.employeeName ?? p.loginId };
  }

  async create(p: AuthPrincipal, input: FranchiseLeadInput) {
    if (!input.companyName?.trim()) throw new BadRequestException('상호(이름)를 넣어 주세요.');
    await this.check(input);
    const l = await this.prisma.franchiseLead.create({
      data: {
        ...this.data(input),
        companyName: input.companyName.trim(),
        ownerEmpId: input.ownerEmpId || p.employeeId || null,
        createdByUserId: p.userId,
      },
    });
    await this.prisma.franchiseLeadActivity.create({
      data: {
        leadId: l.id,
        kind: 'STAGE',
        toStage: l.stage,
        content: '영업 대상으로 등록',
        ...this.actor(p),
      },
    });
    return { id: l.id };
  }

  /** 고치기 — 단계가 바뀌면 상담 기록에 '단계 변경'이 남는다 */
  async update(p: AuthPrincipal, id: string, input: FranchiseLeadInput) {
    const cur = await this.prisma.franchiseLead.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('영업 대상을 찾을 수 없습니다.');
    if (input.companyName !== undefined && !input.companyName.trim())
      throw new BadRequestException('상호(이름)를 넣어 주세요.');
    await this.check(input);
    await this.prisma.franchiseLead.update({ where: { id }, data: this.data(input) });
    if (input.stage && input.stage !== cur.stage)
      await this.prisma.franchiseLeadActivity.create({
        data: {
          leadId: id,
          kind: 'STAGE',
          fromStage: cur.stage,
          toStage: input.stage,
          content: input.stage === 'LOST' ? (text(input.lostReason) ?? null) : null,
          ...this.actor(p),
        },
      });
    return { ok: true };
  }

  async remove(id: string) {
    const cur = await this.prisma.franchiseLead.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('영업 대상을 찾을 수 없습니다.');
    await this.prisma.franchiseLead.delete({ where: { id } });
    return { ok: true };
  }

  /** 상담 기록 남기기 — 다음 연락일을 같이 정할 수 있다 */
  async addActivity(
    p: AuthPrincipal,
    id: string,
    input: {
      kind: FranchiseActivityKind;
      content: string;
      at?: string | null;
      nextActionAt?: string | null;
      nextAction?: string | null;
    },
  ) {
    const cur = await this.prisma.franchiseLead.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('영업 대상을 찾을 수 없습니다.');
    if (input.kind === 'STAGE')
      throw new BadRequestException('단계 변경은 단계를 바꾸면 남습니다.');
    if (!input.content.trim()) throw new BadRequestException('내용을 넣어 주세요.');
    await this.prisma.$transaction([
      this.prisma.franchiseLeadActivity.create({
        data: {
          leadId: id,
          kind: input.kind,
          content: input.content.trim(),
          at: input.at ? new Date(input.at) : new Date(),
          ...this.actor(p),
        },
      }),
      // 첫 연락 전이었으면 상담을 남기는 순간 '첫 연락'으로
      ...(cur.stage === 'NEW' || input.nextActionAt !== undefined
        ? [
            this.prisma.franchiseLead.update({
              where: { id },
              data: {
                ...(cur.stage === 'NEW' && { stage: 'CONTACTED' }),
                ...(input.nextActionAt !== undefined && {
                  nextActionAt: day(input.nextActionAt),
                  nextAction: text(input.nextAction),
                }),
              },
            }),
          ]
        : []),
      ...(cur.stage === 'NEW'
        ? [
            this.prisma.franchiseLeadActivity.create({
              data: {
                leadId: id,
                kind: 'STAGE',
                fromStage: 'NEW',
                toStage: 'CONTACTED',
                ...this.actor(p),
              },
            }),
          ]
        : []),
    ]);
    return { ok: true };
  }
}
