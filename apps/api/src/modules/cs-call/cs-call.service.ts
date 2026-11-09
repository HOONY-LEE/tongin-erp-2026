import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma, type CsCall } from '@prisma/client';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 상담원이 들고 있는(통화 중) 콜 상태 */
const ACTIVE = ['ASSIGNED', 'CALLBACK'];
/** 배분 순서가 겹치지 않게 — 두 콜이 동시에 들어와도 한 상담원에게 둘이 가지 않는다 */
const DISPATCH_LOCK = 7_202_611;
const digits = (s: string) => s.replace(/\D/g, '');
const startOfToday = () =>
  new Date(`${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}T00:00:00+09:00`);

/**
 * 고객관리부(콜센터) 상담 콘솔.
 * - 대표번호로 들어온 콜(inbound)은 상담 가능하고 통화 중이 아닌 상담원 중 가장 오래 쉰 사람에게 자동 배분한다.
 * - 모두 통화 중이면 아웃콜(콜백 대기)로 남는다. 상담을 마친 상담원이 아웃콜을 눌러 콜백하면
 *   그 번호가 들어간 새 접수 창이 뜨고, 접수를 등록하면 콜이 끝난다.
 * - 실제 전화 시스템(CTI)은 POST /cs-calls/inbound 웹훅으로 붙인다. 붙기 전에는 시험 전화로 확인한다.
 */
@Injectable()
export class CsCallService {
  constructor(private readonly prisma: PrismaService) {}

  private me(p: AuthPrincipal) {
    if (!p.employeeId) throw new ForbiddenException('직원과 연결된 계정만 상담할 수 있습니다.');
    return p.employeeId;
  }

  /**
   * 전화 연동 웹훅 키 — 환경변수 CTI_WEBHOOK_SECRET이 있으면 그것, 없으면 처음 한 번 만들어 DB(app_secret)에 둔다.
   * 그래서 서버 설정을 바꾸지 않고도 관리자가 상담 콘솔에서 웹훅 주소를 받아 전화 서비스에 넣을 수 있다.
   */
  async ctiSecret(): Promise<string> {
    if (process.env.CTI_WEBHOOK_SECRET) return process.env.CTI_WEBHOOK_SECRET;
    const key = 'CTI_WEBHOOK_SECRET';
    const found = await this.prisma.appSecret.findUnique({ where: { key } });
    if (found) return found.value;
    const value = randomBytes(24).toString('hex');
    await this.prisma.appSecret.createMany({ data: [{ key, value }], skipDuplicates: true });
    return (await this.prisma.appSecret.findUniqueOrThrow({ where: { key } })).value;
  }

  async checkSecret(given: string | undefined) {
    const want = Buffer.from(await this.ctiSecret());
    const got = Buffer.from(given ?? '');
    return got.length === want.length && timingSafeEqual(got, want);
  }

  /** 관리자에게 보여 줄 웹훅 주소(운영은 Render가 주는 공개 주소, 로컬은 경로만) */
  async integration() {
    const path = `/api/cs-calls/voice?key=${await this.ctiSecret()}`;
    const base = process.env.RENDER_EXTERNAL_URL ?? process.env.API_PUBLIC_URL ?? null;
    return { voiceWebhook: base ? `${base}${path}` : null, path };
  }

  /** 콜 하나를 넣고 바로 배분한다. ringTo — 배분된 상담원의 착신 번호(있으면 전화 시스템이 바로 울린다) */
  async inbound(phone: string, channel?: string): Promise<CsCall & { ringTo: string | null }> {
    const d = digits(phone);
    if (d.length < 8 || d.length > 12)
      throw new BadRequestException('전화번호가 올바르지 않습니다.');
    const customer = await this.customerByPhone(d);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DISPATCH_LOCK})`;
      const agent = await this.freeAgent(tx, d);
      const call = await tx.csCall.create({
        data: {
          phone: d,
          channel: channel?.slice(0, 50) || '대표번호',
          customerId: customer?.id ?? null,
          ...(agent
            ? { status: 'ASSIGNED', agentEmpId: agent.id, assignedAt: new Date() }
            : { status: 'OUTCALL' }),
        },
      });
      return { ...call, ringTo: agent?.ringTo ?? null };
    });
  }

  /**
   * 착신 연결이 안 됐을 때(상담원이 안 받음·통화 중·연결 실패) — 그 상담원은 자리 비움으로 돌리고
   * 다음 빈 상담원에게 다시 배분한다. 없으면 아웃콜로 남긴다.
   */
  async ringFailed(callId: string): Promise<{ status: string; ringTo: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DISPATCH_LOCK})`;
      const call = await tx.csCall.findUnique({ where: { id: callId } });
      if (!call || call.status !== 'ASSIGNED') return { status: call?.status ?? 'NONE', ringTo: null };
      if (call.agentEmpId)
        await tx.csAgent.updateMany({
          where: { employeeId: call.agentEmpId },
          data: { available: false, lastFreeAt: new Date() },
        });
      const agent = await this.freeAgent(tx, call.phone);
      await tx.csCall.update({
        where: { id: callId },
        data: agent
          ? { agentEmpId: agent.id, assignedAt: new Date() }
          : { status: 'OUTCALL', agentEmpId: null, assignedAt: null },
      });
      return { status: agent ? 'ASSIGNED' : 'OUTCALL', ringTo: agent?.ringTo ?? null };
    });
  }

  /**
   * 상담 가능 · 통화 중 아님 · 가장 오래 쉰 상담원.
   * 착신 번호가 거는 사람 번호와 같은 상담원은 뺀다(같은 폰으로 걸고 받을 수는 없다 — 시험할 때).
   */
  private async freeAgent(
    tx: Prisma.TransactionClient,
    callerDigits?: string,
  ): Promise<{ id: string; ringTo: string | null } | null> {
    const rows = await tx.$queryRaw<{ employee_id: string; ring_to: string | null }[]>`
      SELECT a.employee_id, a.ring_to FROM cs_agent a
      JOIN employee e ON e.id = a.employee_id AND e.is_active = true
      WHERE a.available = true
        AND (a.ring_to IS NULL OR regexp_replace(a.ring_to, '[^0-9]', '', 'g') <> ${callerDigits ?? ''})
        AND NOT EXISTS (
          SELECT 1 FROM cs_call c
          WHERE c.agent_emp_id = a.employee_id AND c.status IN ('ASSIGNED', 'CALLBACK')
        )
      ORDER BY a.last_free_at ASC
      LIMIT 1`;
    return rows[0] ? { id: rows[0].employee_id, ringTo: rows[0].ring_to } : null;
  }

  private async customerByPhone(d: string) {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM customer
      WHERE regexp_replace(coalesce(phone_primary, ''), '[^0-9]', '', 'g') = ${d}
      ORDER BY created_at ASC LIMIT 1`;
    return rows[0] ?? null;
  }

  /** 시험 전화 — 실제 전화 시스템이 붙기 전 배분·아웃콜 흐름 확인용 */
  async simulate(count: number, phone?: string) {
    const n = Math.max(1, Math.min(20, Math.floor(count) || 1));
    const out = [];
    for (let i = 0; i < n; i++) {
      const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
      out.push(await this.inbound(phone?.trim() ? phone : `010${tail}`, '시험 전화'));
    }
    return {
      created: out.length,
      assigned: out.filter((c) => c.status === 'ASSIGNED').length,
      outcall: out.filter((c) => c.status === 'OUTCALL').length,
    };
  }

  /** 상담 가능 / 자리 비움 */
  async setAvailable(p: AuthPrincipal, available: boolean) {
    const id = this.me(p);
    await this.prisma.csAgent.upsert({
      where: { employeeId: id },
      create: { employeeId: id, available, lastFreeAt: new Date() },
      update: { available, ...(available && { lastFreeAt: new Date() }) },
    });
    return { available };
  }

  /** 착신 번호(내 휴대폰·자리 전화 직통번호) — 비우면 착신 연결 없이 콘솔에서 콜백 */
  async setRingTo(p: AuthPrincipal, ringTo: string | null | undefined) {
    const id = this.me(p);
    const d = ringTo ? digits(ringTo) : '';
    if (d && (d.length < 8 || d.length > 12))
      throw new BadRequestException('받을 전화번호가 올바르지 않습니다.');
    await this.prisma.csAgent.upsert({
      where: { employeeId: id },
      create: { employeeId: id, available: false, ringTo: d || null },
      update: { ringTo: d || null },
    });
    return { ringTo: d || null };
  }

  /** 아웃콜을 눌러 콜백 — 내가 통화 중이 아닐 때만. 다른 상담원이 먼저 잡았으면 409 */
  async callback(p: AuthPrincipal, id: string) {
    const me = this.me(p);
    const busy = await this.prisma.csCall.count({
      where: { agentEmpId: me, status: { in: ACTIVE } },
    });
    if (busy) throw new ConflictException('지금 상담 중인 콜을 먼저 끝내 주세요.');
    const r = await this.prisma.csCall.updateMany({
      where: { id, status: 'OUTCALL' },
      data: {
        status: 'CALLBACK',
        agentEmpId: me,
        assignedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (!r.count) throw new ConflictException('다른 상담원이 이미 콜백했거나 끝난 콜입니다.');
    return this.prisma.csCall.findUniqueOrThrow({ where: { id } });
  }

  /**
   * 콜 끝내기 — result DONE(상담 끝, 접수를 등록했으면 leadId) | RETRY(부재·통화 실패 → 다시 아웃콜로).
   * 끝나면 상담원의 쉰 시각을 지금으로(다음 배분 순서 뒤로).
   */
  async finish(
    p: AuthPrincipal,
    id: string,
    input: { result: 'DONE' | 'RETRY'; leadId?: string; memo?: string },
  ) {
    const me = this.me(p);
    const call = await this.prisma.csCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('콜을 찾을 수 없습니다.');
    if (call.agentEmpId !== me && !p.permissions.includes('*'))
      throw new ForbiddenException('내가 받은 콜만 끝낼 수 있습니다.');
    if (!ACTIVE.includes(call.status)) throw new ConflictException('이미 끝난 콜입니다.');
    const memo = input.memo?.trim() ? input.memo.trim().slice(0, 1000) : undefined;
    const updated = await this.prisma.csCall.update({
      where: { id },
      data:
        input.result === 'RETRY'
          ? { status: 'OUTCALL', agentEmpId: null, ...(memo && { memo }) }
          : {
              status: 'DONE',
              doneAt: new Date(),
              ...(input.leadId && { leadId: input.leadId }),
              ...(memo && { memo }),
            },
    });
    await this.prisma.csAgent.updateMany({
      where: { employeeId: call.agentEmpId ?? me },
      data: { lastFreeAt: new Date() },
    });
    return updated;
  }

  /** 상담 콘솔 한 화면 — 내 상태·내 콜(고객·최근 접수), 상담원 현황, 아웃콜 대기, 오늘 숫자 */
  async console(p: AuthPrincipal) {
    const me = p.employeeId ?? null;
    const today = startOfToday();
    const [agentRows, csTeam, active, outcalls, todayCounts] = await Promise.all([
      this.prisma.csAgent.findMany(),
      // 고객관리부(하위 조직 포함) 직원은 늘 상담원 목록에 — 상태를 켠 적 없으면 '꺼짐'
      this.prisma.employee.findMany({
        where: {
          isActive: true,
          orgUnit: { OR: [{ code: 'DEPT-CS' }, { parent: { code: 'DEPT-CS' } }] },
        },
        select: { id: true, name: true, position: { select: { name: true } } },
      }),
      this.prisma.csCall.findMany({ where: { status: { in: ACTIVE } } }),
      this.prisma.csCall.findMany({
        where: { status: 'OUTCALL' },
        orderBy: { receivedAt: 'asc' },
        take: 200,
      }),
      this.prisma.csCall.groupBy({
        by: ['status'],
        where: { receivedAt: { gte: today } },
        _count: true,
      }),
    ]);
    const extraIds = agentRows
      .map((a) => a.employeeId)
      .filter((id) => !csTeam.some((e) => e.id === id));
    const extra = extraIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: extraIds } },
          select: { id: true, name: true, position: { select: { name: true } } },
        })
      : [];
    const people = [...csTeam, ...extra];
    const custIds = [
      ...new Set([...active, ...outcalls].map((c) => c.customerId).filter((x): x is string => !!x)),
    ];
    const customers = custIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: custIds } },
          select: { id: true, name: true },
        })
      : [];
    const custName = new Map(customers.map((c) => [c.id, c.name]));
    const view = (c: (typeof active)[number]) => ({
      id: c.id,
      phone: c.phone,
      status: c.status,
      channel: c.channel,
      attempts: c.attempts,
      memo: c.memo,
      customerId: c.customerId,
      customerName: c.customerId ? (custName.get(c.customerId) ?? null) : null,
      agentEmpId: c.agentEmpId,
      receivedAt: c.receivedAt.toISOString(),
      assignedAt: c.assignedAt?.toISOString() ?? null,
    });

    const agents = people
      .map((e) => {
        const a = agentRows.find((x) => x.employeeId === e.id);
        const call = active.find((c) => c.agentEmpId === e.id);
        return {
          employeeId: e.id,
          name: e.name,
          position: e.position?.name ?? null,
          state: call ? 'BUSY' : a?.available ? 'READY' : 'OFF',
          call: call ? view(call) : null,
          lastFreeAt: a?.lastFreeAt.toISOString() ?? null,
          forwarding: !!a?.ringTo,
        };
      })
      .sort(
        (a, b) =>
          ['BUSY', 'READY', 'OFF'].indexOf(a.state) - ['BUSY', 'READY', 'OFF'].indexOf(b.state) ||
          a.name.localeCompare(b.name),
      );

    const mine = me ? active.find((c) => c.agentEmpId === me) : undefined;
    const recentLeads = mine?.customerId
      ? await this.prisma.lead.findMany({
          where: { customerId: mine.customerId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            leadNo: true,
            status: true,
            createdAt: true,
            moveDate: true,
            orgUnit: { select: { name: true } },
          },
        })
      : [];
    const count = (s: string) => todayCounts.find((x) => x.status === s)?._count ?? 0;
    return {
      me: me
        ? {
            employeeId: me,
            available: agentRows.find((a) => a.employeeId === me)?.available ?? false,
            ringTo: agentRows.find((a) => a.employeeId === me)?.ringTo ?? null,
            call: mine ? view(mine) : null,
            recentLeads: recentLeads.map((l) => ({
              ...l,
              createdAt: l.createdAt.toISOString(),
              moveDate: l.moveDate?.toISOString().slice(0, 10) ?? null,
            })),
          }
        : null,
      agents,
      outcalls: outcalls.map(view),
      today: {
        received: todayCounts.reduce((n, x) => n + x._count, 0),
        active: count('ASSIGNED') + count('CALLBACK'),
        outcall: count('OUTCALL'),
        done: count('DONE'),
      },
    };
  }
}
