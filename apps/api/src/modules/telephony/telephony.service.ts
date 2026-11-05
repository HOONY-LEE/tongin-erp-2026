import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { normalizeCaller, type ParsedCallEvent } from './call-event';
import { TelephonyHub } from './telephony-hub.service';

/** 울린 뒤 이만큼 아무도 응대하지 않고 끝 알림도 없으면 부재중으로 본다 */
const RING_TIMEOUT_MS = 3 * 60_000;
/** 통화 ID가 없는 연동(안드로이드 앱 등) — 같은 번호의 이 시간 안 통화를 같은 통화로 잇는다 */
const SAME_CALL_MS = 30 * 60_000;
/** 끝 알림을 안 보내는 연동 — 응대한 뒤 이만큼 지나면 끝난 통화로 본다 */
const ANSWERED_TIMEOUT_MS = 60 * 60_000;

const newToken = () => randomBytes(24).toString('hex');

@Injectable()
export class TelephonyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly hub: TelephonyHub,
  ) {}

  // ── 수신 알림(웹훅) ──

  /** 토큰이 맞는 회선의 수신 알림 — 없는 토큰이면 null(주소가 틀렸거나 새로 만든 뒤 예전 주소) */
  async handleHook(token: string, ev: ParsedCallEvent) {
    const line = await this.prisma.telephonyLine.findUnique({ where: { token } });
    if (!line?.isActive) return null;
    return this.handleEvent(line.id, ev);
  }

  async handleEvent(
    lineId: string | null,
    ev: Omit<ParsedCallEvent, 'provider'> & { provider: string },
  ) {
    const open = await this.findOpen(lineId, ev);
    if (ev.event === 'ringing') {
      if (open) return open; // 같은 통화의 울림 알림이 여러 번 와도 한 건
      const customerId = ev.from ? await this.firstCustomerId(ev.from) : null;
      const call = await this.prisma.callLog.create({
        data: {
          lineId,
          provider: ev.provider,
          externalId: ev.externalId,
          fromNumber: ev.from,
          toNumber: ev.to,
          extension: ev.extension,
          customerId,
        },
      });
      this.hub.emit({ type: 'ringing', callId: call.id });
      return call;
    }
    // 울림 알림 없이 응대·종료만 온 경우도 한 건으로 남긴다
    const call =
      open ??
      (await this.prisma.callLog.create({
        data: {
          lineId,
          provider: ev.provider,
          externalId: ev.externalId,
          fromNumber: ev.from,
          toNumber: ev.to,
          extension: ev.extension,
          customerId: ev.from ? await this.firstCustomerId(ev.from) : null,
        },
      }));
    const now = new Date();
    let data: Prisma.CallLogUpdateInput;
    if (ev.event === 'answered') data = { status: 'ANSWERED', answeredAt: call.answeredAt ?? now };
    else {
      const answered = call.status === 'ANSWERED' || !!call.answeredByUserId;
      data = {
        status: ev.event === 'missed' || !answered ? 'MISSED' : 'ENDED',
        endedAt: now,
      };
    }
    const updated = await this.prisma.callLog.update({ where: { id: call.id }, data });
    this.hub.emit({ type: ev.event === 'answered' ? 'updated' : 'ended', callId: call.id });
    return updated;
  }

  private findOpen(
    lineId: string | null,
    ev: { provider: string; externalId: string | null; from: string },
  ) {
    if (ev.externalId)
      return this.prisma.callLog.findFirst({
        where: { provider: ev.provider, externalId: ev.externalId },
      });
    return this.prisma.callLog.findFirst({
      where: {
        lineId,
        fromNumber: ev.from,
        endedAt: null,
        status: { in: ['RINGING', 'ANSWERED'] },
        startedAt: { gte: new Date(Date.now() - SAME_CALL_MS) },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** 번호가 같은 고객 — 하이픈이 섞여 저장된 예전 데이터도 맞춘다. 먼저 등록된 순 */
  private async customerIds(digits: string, limit: number) {
    if (digits.length < 9) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer
      WHERE regexp_replace(coalesce(phone_primary, ''), '[^0-9]', '', 'g') = ${digits}
      ORDER BY created_at ASC
      LIMIT ${limit}`;
    return rows.map((r) => r.id);
  }

  private async firstCustomerId(digits: string) {
    return (await this.customerIds(digits, 1))[0] ?? null;
  }

  /** 끝 알림이 없는 통화 정리 — 오래 울리기만 했으면 부재중, 응대하고 오래 지났으면 끝남 */
  private async sweep() {
    const now = Date.now();
    await this.prisma.callLog.updateMany({
      where: {
        status: 'RINGING',
        answeredByUserId: null,
        startedAt: { lt: new Date(now - RING_TIMEOUT_MS) },
      },
      data: { status: 'MISSED' },
    });
    await this.prisma.callLog.updateMany({
      where: {
        status: 'ANSWERED',
        endedAt: null,
        startedAt: { lt: new Date(now - ANSWERED_TIMEOUT_MS) },
      },
      data: { status: 'ENDED' },
    });
  }

  // ── 화면 ──

  private async userNames(ids: (string | null)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map<string, string>();
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: uniq } },
      select: { id: true, loginId: true, employee: { select: { name: true } } },
    });
    return new Map(users.map((u) => [u.id, u.employee?.name ?? u.loginId]));
  }

  /** 고객 데이터 범위 — 고객관리 화면과 같은 규칙(담당 지점 미정 고객은 누구나) */
  private async customerScope(p: AuthPrincipal): Promise<Prisma.CustomerWhereInput> {
    const ids = await this.scope.orgScopeIds(p);
    return ids === null ? {} : { OR: [{ ownerOrgId: { in: ids } }, { ownerOrgId: null }] };
  }

  async list(p: AuthPrincipal, q: { status?: string; days?: number; phone?: string }) {
    await this.sweep();
    const days = Math.min(Math.max(q.days ?? 30, 1), 366);
    const phone = normalizeCaller(q.phone ?? '');
    const rows = await this.prisma.callLog.findMany({
      where: {
        startedAt: { gte: new Date(Date.now() - days * 86400_000) },
        ...(q.status ? { status: q.status } : {}),
        ...(phone ? { fromNumber: { contains: phone } } : {}),
      },
      include: { line: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
      take: 500,
    });
    const scoped = await this.customerScope(p);
    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: [...new Set(rows.flatMap((r) => (r.customerId ? [r.customerId] : [])))] },
        ...scoped,
      },
      select: { id: true, name: true },
    });
    const custName = new Map(customers.map((c) => [c.id, c.name]));
    const names = await this.userNames(rows.map((r) => r.answeredByUserId));
    return rows.map((r) => ({
      id: r.id,
      lineName: r.line?.name ?? null,
      provider: r.provider,
      fromNumber: r.fromNumber,
      status: r.status,
      startedAt: r.startedAt,
      answeredAt: r.answeredAt,
      endedAt: r.endedAt,
      memo: r.memo,
      leadId: r.leadId,
      customerId: r.customerId && custName.has(r.customerId) ? r.customerId : null,
      // 범위 밖 고객은 이름을 숨긴다(기존 고객이라는 것만)
      customerName: r.customerId ? (custName.get(r.customerId) ?? '다른 지점 고객') : null,
      answeredBy: r.answeredByUserId ? (names.get(r.answeredByUserId) ?? null) : null,
    }));
  }

  /** 콜팝업 내용 — 통화 + 번호로 찾은 고객(범위 안만) + 최근 접수·A/S + 이 번호의 지난 통화 */
  async context(id: string, p: AuthPrincipal) {
    await this.sweep();
    const call = await this.prisma.callLog.findUnique({
      where: { id },
      include: { line: { select: { name: true } } },
    });
    if (!call) throw new NotFoundException('통화를 찾을 수 없습니다.');
    const scopeIds = await this.scope.orgScopeIds(p);
    const matchIds = call.fromNumber ? await this.customerIds(call.fromNumber, 5) : [];
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: matchIds }, ...(await this.customerScope(p)) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        phonePrimary: true,
        grade: true,
        zipcode: true,
        addr: true,
        addrDetail: true,
        createdAt: true,
        ownerOrg: { select: { name: true } },
        leads: {
          where: scopeIds === null ? {} : { orgUnitId: { in: scopeIds } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            leadNo: true,
            status: true,
            serviceLine: true,
            moveDate: true,
            createdAt: true,
            orgUnit: { select: { name: true } },
          },
        },
        _count: { select: { leads: true, contracts: true } },
      },
    });
    const custIds = customers.map((c) => c.id);
    const [tickets, grades, prev] = await Promise.all([
      custIds.length
        ? this.prisma.supportTicket.findMany({
            where: {
              customerId: { in: custIds },
              ...(scopeIds === null ? {} : { orgUnitId: { in: scopeIds } }),
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              ticketNo: true,
              kind: true,
              subject: true,
              status: true,
              createdAt: true,
              customerId: true,
            },
          })
        : [],
      this.prisma.commonCode.findMany({
        where: { codeGroup: 'CUSTOMER_GRADE' },
        select: { code: true, name: true },
      }),
      call.fromNumber
        ? this.prisma.callLog.findMany({
            where: { fromNumber: call.fromNumber, id: { not: call.id } },
            orderBy: { startedAt: 'desc' },
            take: 5,
            select: { id: true, status: true, startedAt: true, memo: true },
          })
        : [],
    ]);
    const gradeName = new Map(grades.map((g) => [g.code, g.name]));
    const names = await this.userNames([call.answeredByUserId]);
    return {
      call: {
        id: call.id,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        lineName: call.line?.name ?? null,
        provider: call.provider,
        status: call.status,
        startedAt: call.startedAt,
        answeredAt: call.answeredAt,
        endedAt: call.endedAt,
        answeredByUserId: call.answeredByUserId,
        answeredBy: call.answeredByUserId ? (names.get(call.answeredByUserId) ?? null) : null,
        memo: call.memo,
        leadId: call.leadId,
      },
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phonePrimary,
        grade: c.grade,
        gradeName: c.grade ? (gradeName.get(c.grade) ?? c.grade) : null,
        zipcode: c.zipcode,
        addr: c.addr,
        addrDetail: c.addrDetail,
        ownerOrgName: c.ownerOrg?.name ?? null,
        createdAt: c.createdAt,
        leadCount: c._count.leads,
        contractCount: c._count.contracts,
        recentLeads: c.leads.map((l) => ({
          id: l.id,
          leadNo: l.leadNo,
          status: l.status,
          serviceLine: l.serviceLine,
          moveDate: l.moveDate,
          createdAt: l.createdAt,
          orgUnitName: l.orgUnit.name,
        })),
        tickets: tickets.filter((t) => t.customerId === c.id),
      })),
      /** 번호는 같은데 내 범위 밖이라 안 보여 주는 고객 수 */
      hiddenMatches: matchIds.length - customers.length,
      previousCalls: prev,
    };
  }

  /** 응대 시작 — 먼저 누른 사람이 맡는다(다른 사람 팝업은 '응대 중'으로 바뀐다) */
  async answer(id: string, p: AuthPrincipal) {
    const call = await this.prisma.callLog.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('통화를 찾을 수 없습니다.');
    if (call.answeredByUserId && call.answeredByUserId !== p.userId) {
      const names = await this.userNames([call.answeredByUserId]);
      throw new BadRequestException(
        `${names.get(call.answeredByUserId) ?? '다른 직원'}님이 이미 응대 중입니다.`,
      );
    }
    await this.prisma.callLog.update({
      where: { id },
      data: {
        answeredByUserId: p.userId,
        answeredAt: call.answeredAt ?? new Date(),
        ...(call.status === 'RINGING' || call.status === 'MISSED' ? { status: 'ANSWERED' } : {}),
      },
    });
    this.hub.emit({ type: 'updated', callId: id });
    return this.context(id, p);
  }

  async update(id: string, input: { memo?: string | null; leadId?: string | null }) {
    const call = await this.prisma.callLog.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('통화를 찾을 수 없습니다.');
    const lead = input.leadId
      ? await this.prisma.lead.findUnique({ where: { id: input.leadId } })
      : null;
    if (input.leadId && !lead) throw new BadRequestException('접수를 찾을 수 없습니다.');
    const updated = await this.prisma.callLog.update({
      where: { id },
      data: {
        ...(input.memo !== undefined ? { memo: input.memo?.trim() || null } : {}),
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
        // 신규 번호로 접수하면 그때 생긴 고객을 통화에 잇는다
        ...(lead?.customerId && !call.customerId ? { customerId: lead.customerId } : {}),
        // 접수까지 만든 전화는 부재중이 아니다
        ...(input.leadId && call.status === 'MISSED' ? { status: 'ENDED' } : {}),
      },
    });
    this.hub.emit({ type: 'updated', callId: id });
    return updated;
  }

  // ── 회선(CALL.MANAGE) ──

  async lines() {
    const lines = await this.prisma.telephonyLine.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { calls: true } } },
    });
    const last = await this.prisma.callLog.groupBy({
      by: ['lineId'],
      _max: { startedAt: true },
    });
    const lastAt = new Map(last.map((l) => [l.lineId, l._max.startedAt]));
    return lines.map((l) => ({
      id: l.id,
      name: l.name,
      number: l.number,
      token: l.token,
      isActive: l.isActive,
      createdAt: l.createdAt,
      callCount: l._count.calls,
      lastCallAt: lastAt.get(l.id) ?? null,
    }));
  }

  createLine(input: { name: string; number?: string | null }) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('회선 이름을 적어 주세요.');
    return this.prisma.telephonyLine.create({
      data: { name, number: normalizeCaller(input.number ?? '') || null, token: newToken() },
    });
  }

  async updateLine(
    id: string,
    input: { name?: string; number?: string | null; isActive?: boolean; rotate?: boolean },
  ) {
    await this.prisma.telephonyLine.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('회선을 찾을 수 없습니다.');
    });
    return this.prisma.telephonyLine.update({
      where: { id },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.number !== undefined
          ? { number: normalizeCaller(input.number ?? '') || null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.rotate ? { token: newToken() } : {}),
      },
    });
  }

  async deleteLine(id: string) {
    await this.prisma.telephonyLine.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('회선을 찾을 수 없습니다.');
    });
    return { ok: true };
  }

  /** 가상 수신 — 전화 없이 콜팝업 시험(CALL.MANAGE) */
  async test(input: { from: string; event?: string; callId?: string; lineId?: string }) {
    const from = normalizeCaller(input.from);
    if (!from) throw new BadRequestException('건 사람 번호를 적어 주세요.');
    const event = (['ringing', 'answered', 'ended', 'missed'] as const).find(
      (e) => e === input.event,
    );
    return this.handleEvent(input.lineId ?? null, {
      provider: 'TEST',
      externalId: input.callId ?? `test-${Date.now()}-${randomBytes(3).toString('hex')}`,
      from,
      to: null,
      extension: null,
      event: event ?? 'ringing',
    });
  }
}
