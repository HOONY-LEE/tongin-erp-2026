import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CRM_PIPELINES,
  crmCode,
  PERMISSION_WILDCARD,
  type AuthPrincipal,
  type CrmActivityKind,
  type CrmActivityView,
  type CrmInterest,
  type CrmLeadView,
  type CrmPipelineKey,
  type CrmStats,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface CrmLeadInput {
  companyName?: string;
  contactName?: string | null;
  contactTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  region?: string | null;
  source?: string;
  stage?: string;
  interest?: CrmInterest;
  ownerEmpId?: string | null;
  amount?: number | null;
  expectedAt?: string | null;
  nextActionAt?: string | null;
  nextAction?: string | null;
  memo?: string | null;
  lostReason?: string | null;
  fields?: Record<string, unknown>;
  linkId?: string | null;
}

export interface CrmListQuery {
  stage?: string;
  ownerEmpId?: string;
  source?: string;
  q?: string;
  from?: string;
  to?: string;
}

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string | null | undefined) =>
  s === undefined ? undefined : s ? new Date(`${s}T00:00:00Z`) : null;
const text = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : v.trim() || null;
const kstStart = (s: string) => new Date(`${s}T00:00:00+09:00`);
const kstEnd = (s: string) => new Date(Date.parse(`${s}T00:00:00+09:00`) + 86_400_000);

const include = {
  owner: { select: { name: true } },
  branch: { select: { name: true } },
  partner: { select: { name: true } },
  activities: { select: { at: true }, orderBy: { at: 'desc' as const }, take: 1 },
};

/**
 * 영업 CRM(공통) — 파이프라인(가맹 영업 · 기업영업 …)마다 단계·유입 경로·추가 항목만 shared CRM_PIPELINES로 다르다.
 * 권한은 파이프라인 설정의 perm(예: FRANCHISE, B2B_CRM) + .READ/.CREATE/.UPDATE/.DELETE
 */
@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  def(pipeline: CrmPipelineKey) {
    return CRM_PIPELINES[pipeline];
  }

  assert(
    p: AuthPrincipal,
    pipeline: CrmPipelineKey,
    action: 'READ' | 'CREATE' | 'UPDATE' | 'DELETE',
  ) {
    const code = `${this.def(pipeline).perm}.${action}`;
    if (!p.permissions.includes(PERMISSION_WILDCARD) && !p.permissions.includes(code))
      throw new ForbiddenException(`${this.def(pipeline).label} 권한(${code})이 없습니다.`);
  }

  private view(l: Prisma.CrmLeadGetPayload<{ include: typeof include }>): CrmLeadView {
    const pipeline = l.pipeline as CrmPipelineKey;
    const link = this.def(pipeline).link;
    return {
      id: l.id,
      code: crmCode(this.def(pipeline), l.seq),
      pipeline,
      companyName: l.companyName,
      contactName: l.contactName,
      contactTitle: l.contactTitle,
      phone: l.phone,
      email: l.email,
      region: l.region,
      source: l.source,
      stage: l.stage,
      interest: l.interest as CrmInterest,
      ownerEmpId: l.ownerEmpId,
      ownerName: l.owner?.name ?? null,
      amount: l.amount === null ? null : Number(l.amount),
      expectedAt: ymd(l.expectedAt),
      nextActionAt: ymd(l.nextActionAt),
      nextAction: l.nextAction,
      memo: l.memo,
      lostReason: l.lostReason,
      fields: (l.fields && typeof l.fields === 'object' && !Array.isArray(l.fields)
        ? l.fields
        : {}) as Record<string, string | number | null>,
      linkId: link === 'BRANCH' ? l.branchId : link === 'PARTNER' ? l.partnerId : null,
      linkName:
        link === 'BRANCH'
          ? (l.branch?.name ?? null)
          : link === 'PARTNER'
            ? (l.partner?.name ?? null)
            : null,
      lastActivityAt: l.activities[0]?.at.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    };
  }

  private where(pipeline: CrmPipelineKey, q: CrmListQuery = {}): Prisma.CrmLeadWhereInput {
    const term = q.q?.trim();
    const digits = term?.replace(/\D/g, '') ?? '';
    return {
      pipeline,
      ...(q.stage && { stage: q.stage }),
      ...(q.ownerEmpId && { ownerEmpId: q.ownerEmpId }),
      ...(q.source && { source: q.source }),
      ...((q.from || q.to) && {
        createdAt: { ...(q.from && { gte: kstStart(q.from) }), ...(q.to && { lt: kstEnd(q.to) }) },
      }),
      ...(term && {
        OR: [
          { companyName: { contains: term, mode: 'insensitive' } },
          { contactName: { contains: term, mode: 'insensitive' } },
          { region: { contains: term, mode: 'insensitive' } },
          { memo: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      }),
    };
  }

  async list(p: AuthPrincipal, pipeline: CrmPipelineKey, q: CrmListQuery = {}) {
    this.assert(p, pipeline, 'READ');
    const rows = await this.prisma.crmLead.findMany({
      where: this.where(pipeline, q),
      include,
      orderBy: [{ nextActionAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 2000,
    });
    return rows.map((l) => this.view(l));
  }

  async one(p: AuthPrincipal, pipeline: CrmPipelineKey, id: string) {
    this.assert(p, pipeline, 'READ');
    const l = await this.prisma.crmLead.findFirst({ where: { id, pipeline }, include });
    if (!l) throw new NotFoundException('영업 대상을 찾을 수 없습니다.');
    const acts = await this.prisma.crmActivity.findMany({
      where: { leadId: id },
      orderBy: { at: 'desc' },
      take: 300,
    });
    return {
      lead: this.view(l),
      activities: acts.map(
        (a): CrmActivityView => ({
          id: a.id,
          kind: a.kind as CrmActivityKind,
          content: a.content,
          fromStage: a.fromStage,
          toStage: a.toStage,
          actorName: a.actorName,
          at: a.at.toISOString(),
        }),
      ),
    };
  }

  private async check(pipeline: CrmPipelineKey, input: CrmLeadInput) {
    const def = this.def(pipeline);
    if (input.stage && !def.stages.some((s) => s.key === input.stage))
      throw new BadRequestException('단계가 올바르지 않습니다.');
    if (input.source && !def.sources.some((s) => s.key === input.source))
      throw new BadRequestException('유입 경로가 올바르지 않습니다.');
    if (input.ownerEmpId) {
      const e = await this.prisma.employee.findUnique({ where: { id: input.ownerEmpId } });
      if (!e) throw new BadRequestException('담당자를 찾을 수 없습니다.');
    }
    if (input.linkId) {
      if (def.link === 'BRANCH') {
        const b = await this.prisma.orgUnit.findUnique({ where: { id: input.linkId } });
        if (!b || b.type !== 'BRANCH')
          throw new BadRequestException('연결할 지점을 찾을 수 없습니다.');
      } else if (def.link === 'PARTNER') {
        const b = await this.prisma.partner.findUnique({ where: { id: input.linkId } });
        if (!b) throw new BadRequestException('연결할 거래처를 찾을 수 없습니다.');
      }
    }
  }

  /** 파이프라인 설정에 있는 추가 항목만 남긴다(숫자 칸은 숫자로) */
  private cleanFields(pipeline: CrmPipelineKey, raw: Record<string, unknown> | undefined) {
    if (!raw) return undefined;
    const out: Record<string, string | number> = {};
    for (const f of this.def(pipeline).fields) {
      const v = raw[f.key];
      if (v === undefined || v === null || v === '') continue;
      if (f.type === 'number') {
        const n = Number(String(v).replace(/,/g, ''));
        if (Number.isFinite(n)) out[f.key] = n;
      } else out[f.key] = String(v).slice(0, 500);
    }
    return out as Prisma.InputJsonValue;
  }

  private data(pipeline: CrmPipelineKey, input: CrmLeadInput) {
    const link = this.def(pipeline).link;
    const linkVal = input.linkId === undefined ? undefined : input.linkId || null;
    return {
      ...(input.companyName !== undefined && { companyName: input.companyName.trim() }),
      contactName: text(input.contactName),
      contactTitle: text(input.contactTitle),
      phone: text(input.phone),
      email: text(input.email),
      region: text(input.region),
      source: input.source,
      stage: input.stage,
      interest: input.interest,
      ownerEmpId: input.ownerEmpId === undefined ? undefined : input.ownerEmpId || null,
      amount: input.amount,
      expectedAt: day(input.expectedAt),
      nextActionAt: day(input.nextActionAt),
      nextAction: text(input.nextAction),
      memo: text(input.memo),
      lostReason: text(input.lostReason),
      fields: this.cleanFields(pipeline, input.fields),
      ...(link === 'BRANCH' && { branchId: linkVal }),
      ...(link === 'PARTNER' && { partnerId: linkVal }),
    };
  }

  private actor(p: AuthPrincipal) {
    return { actorUserId: p.userId, actorName: p.employeeName ?? p.loginId };
  }

  async create(p: AuthPrincipal, pipeline: CrmPipelineKey, input: CrmLeadInput) {
    this.assert(p, pipeline, 'CREATE');
    const def = this.def(pipeline);
    if (!input.companyName?.trim())
      throw new BadRequestException(`${def.companyLabel}을(를) 넣어 주세요.`);
    await this.check(pipeline, input);
    const l = await this.prisma.crmLead.create({
      data: {
        ...this.data(pipeline, input),
        pipeline,
        companyName: input.companyName.trim(),
        source: input.source ?? def.sources[0].key,
        stage: input.stage ?? def.stages[0].key,
        ownerEmpId: input.ownerEmpId || p.employeeId || null,
        createdByUserId: p.userId,
      },
    });
    await this.prisma.crmActivity.create({
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
  async update(p: AuthPrincipal, pipeline: CrmPipelineKey, id: string, input: CrmLeadInput) {
    this.assert(p, pipeline, 'UPDATE');
    const cur = await this.prisma.crmLead.findFirst({ where: { id, pipeline } });
    if (!cur) throw new NotFoundException('영업 대상을 찾을 수 없습니다.');
    if (input.companyName !== undefined && !input.companyName.trim())
      throw new BadRequestException(`${this.def(pipeline).companyLabel}을(를) 넣어 주세요.`);
    await this.check(pipeline, input);
    await this.prisma.crmLead.update({ where: { id }, data: this.data(pipeline, input) });
    if (input.stage && input.stage !== cur.stage)
      await this.prisma.crmActivity.create({
        data: {
          leadId: id,
          kind: 'STAGE',
          fromStage: cur.stage,
          toStage: input.stage,
          content: this.def(pipeline).stages.find((s) => s.key === input.stage)?.lost
            ? (text(input.lostReason) ?? null)
            : null,
          ...this.actor(p),
        },
      });
    return { ok: true };
  }

  async remove(p: AuthPrincipal, pipeline: CrmPipelineKey, id: string) {
    this.assert(p, pipeline, 'DELETE');
    const cur = await this.prisma.crmLead.findFirst({ where: { id, pipeline } });
    if (!cur) throw new NotFoundException('영업 대상을 찾을 수 없습니다.');
    await this.prisma.crmLead.delete({ where: { id } });
    return { ok: true };
  }

  /** 상담 기록 남기기 — 다음 연락일을 같이 정할 수 있다. 첫 단계였으면 두 번째 단계(첫 연락)로 */
  async addActivity(
    p: AuthPrincipal,
    pipeline: CrmPipelineKey,
    id: string,
    input: {
      kind: CrmActivityKind;
      content: string;
      at?: string | null;
      nextActionAt?: string | null;
      nextAction?: string | null;
    },
  ) {
    this.assert(p, pipeline, 'UPDATE');
    const cur = await this.prisma.crmLead.findFirst({ where: { id, pipeline } });
    if (!cur) throw new NotFoundException('영업 대상을 찾을 수 없습니다.');
    if (input.kind === 'STAGE')
      throw new BadRequestException('단계 변경은 단계를 바꾸면 남습니다.');
    if (!input.content.trim()) throw new BadRequestException('내용을 넣어 주세요.');
    const stages = this.def(pipeline).stages;
    const firstToSecond = cur.stage === stages[0].key ? stages[1].key : null;
    await this.prisma.$transaction([
      this.prisma.crmActivity.create({
        data: {
          leadId: id,
          kind: input.kind,
          content: input.content.trim(),
          at: input.at ? new Date(input.at) : new Date(),
          ...this.actor(p),
        },
      }),
      ...(firstToSecond || input.nextActionAt !== undefined
        ? [
            this.prisma.crmLead.update({
              where: { id },
              data: {
                ...(firstToSecond && { stage: firstToSecond }),
                ...(input.nextActionAt !== undefined && {
                  nextActionAt: day(input.nextActionAt),
                  nextAction: text(input.nextAction),
                }),
              },
            }),
          ]
        : []),
      ...(firstToSecond
        ? [
            this.prisma.crmActivity.create({
              data: {
                leadId: id,
                kind: 'STAGE',
                fromStage: cur.stage,
                toStage: firstToSecond,
                ...this.actor(p),
              },
            }),
          ]
        : []),
    ]);
    return { ok: true };
  }

  /**
   * 파이프라인 통계 — 기간(from~to, 한국 날짜)에 등록된 영업 대상 기준. 담당자·유입 경로로 거를 수 있다.
   * 수주는 그 기간에 수주 단계로 옮긴 것(등록 기간과 상관없이)
   */
  async stats(
    p: AuthPrincipal,
    pipeline: CrmPipelineKey,
    q: { from?: string; to?: string; ownerEmpId?: string; source?: string },
  ): Promise<CrmStats> {
    this.assert(p, pipeline, 'READ');
    const def = this.def(pipeline);
    const wonKeys = def.stages.filter((s) => s.won).map((s) => s.key);
    const lostKeys = def.stages.filter((s) => s.lost).map((s) => s.key);
    const openKeys = def.stages.filter((s) => s.open).map((s) => s.key);
    const leads = await this.prisma.crmLead.findMany({
      where: this.where(pipeline, q),
      select: {
        stage: true,
        source: true,
        amount: true,
        ownerEmpId: true,
        owner: { select: { name: true } },
      },
    });
    const amt = (x: { amount: Prisma.Decimal | null }) =>
      x.amount === null ? 0 : Number(x.amount);
    const wonRows = leads.filter((l) => wonKeys.includes(l.stage));
    const lostCount = leads.filter((l) => lostKeys.includes(l.stage)).length;
    const byOwner = new Map<string, CrmStats['byOwner'][number]>();
    for (const l of leads) {
      const k = l.ownerEmpId ?? '-';
      const v = byOwner.get(k) ?? {
        empId: l.ownerEmpId,
        name: l.owner?.name ?? '담당 없음',
        count: 0,
        won: 0,
        wonAmount: 0,
      };
      v.count += 1;
      if (wonKeys.includes(l.stage)) {
        v.won += 1;
        v.wonAmount += amt(l);
      }
      byOwner.set(k, v);
    }
    return {
      pipeline,
      from: q.from ?? null,
      to: q.to ?? null,
      total: leads.length,
      open: leads.filter((l) => openKeys.includes(l.stage)).length,
      won: wonRows.length,
      wonAmount: wonRows.reduce((s, l) => s + amt(l), 0),
      lost: lostCount,
      winRate: wonRows.length + lostCount ? wonRows.length / (wonRows.length + lostCount) : null,
      pipelineAmount: leads
        .filter((l) => openKeys.includes(l.stage))
        .reduce((s, l) => s + amt(l), 0),
      byStage: def.stages.map((s) => {
        const rows = leads.filter((l) => l.stage === s.key);
        return {
          key: s.key,
          label: s.label,
          count: rows.length,
          amount: rows.reduce((t, l) => t + amt(l), 0),
        };
      }),
      bySource: def.sources.map((s) => {
        const rows = leads.filter((l) => l.source === s.key);
        return {
          key: s.key,
          label: s.label,
          count: rows.length,
          won: rows.filter((l) => wonKeys.includes(l.stage)).length,
        };
      }),
      byOwner: [...byOwner.values()].sort((a, b) => b.wonAmount - a.wonAmount || b.count - a.count),
    };
  }
}
