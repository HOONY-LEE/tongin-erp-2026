import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
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
/** PC 전화 토큰 수명 — 화면이 만료 10분 전에 새로 받아 다시 등록한다 */
const PHONE_TOKEN_TTL_S = 3600;
/** 배분 결과 — 이 상담원을 어디로 울릴지. sipUri(PC 전화)가 착신 번호보다 먼저 */
export interface RingTarget {
  sipUri: string | null;
  ringTo: string | null;
}
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

  /** 콜 하나를 넣고 바로 배분한다. sipUri·ringTo — 배분된 상담원의 PC 전화·착신 번호(있으면 전화 시스템이 바로 울린다) */
  async inbound(
    phone: string,
    channel?: string,
    katCallSid?: string,
  ): Promise<CsCall & RingTarget> {
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
          katCallSid: katCallSid?.slice(0, 100) || null,
          ...(agent
            ? { status: 'ASSIGNED', agentEmpId: agent.id, assignedAt: new Date() }
            : { status: 'OUTCALL' }),
        },
      });
      return { ...call, sipUri: agent?.sipUri ?? null, ringTo: agent?.ringTo ?? null };
    });
  }

  /**
   * 착신 연결이 안 됐을 때(상담원이 안 받음·통화 중·연결 실패) — 그 상담원은 자리 비움으로 돌리고
   * 다음 빈 상담원에게 다시 배분한다. 없으면 아웃콜로 남긴다.
   */
  async ringFailed(callId: string): Promise<{ status: string } & RingTarget> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DISPATCH_LOCK})`;
      const call = await tx.csCall.findUnique({ where: { id: callId } });
      if (!call || call.status !== 'ASSIGNED')
        return { status: call?.status ?? 'NONE', sipUri: null, ringTo: null };
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
      return {
        status: agent ? 'ASSIGNED' : 'OUTCALL',
        sipUri: agent?.sipUri ?? null,
        ringTo: agent?.ringTo ?? null,
      };
    });
  }

  /**
   * 상담 가능 · 통화 중 아님 · 가장 오래 쉰 상담원.
   * 착신 번호가 거는 사람 번호와 같은 상담원은 뺀다(같은 폰으로 걸고 받을 수는 없다 — 시험할 때).
   */
  private async freeAgent(
    tx: Prisma.TransactionClient,
    callerDigits?: string,
  ): Promise<({ id: string } & RingTarget) | null> {
    const rows = await tx.$queryRaw<
      { employee_id: string; ring_to: string | null; sip_uri: string | null }[]
    >`
      SELECT a.employee_id, a.ring_to,
        CASE WHEN a.sip_until > now() THEN a.sip_uri END AS sip_uri
      FROM cs_agent a
      JOIN employee e ON e.id = a.employee_id AND e.is_active = true
      WHERE a.available = true
        AND (a.ring_to IS NULL OR regexp_replace(a.ring_to, '[^0-9]', '', 'g') <> ${callerDigits ?? ''})
        AND NOT EXISTS (
          SELECT 1 FROM cs_call c
          WHERE c.agent_emp_id = a.employee_id AND c.status IN ('ASSIGNED', 'CALLBACK')
        )
      ORDER BY a.last_free_at ASC
      LIMIT 1`;
    return rows[0]
      ? { id: rows[0].employee_id, sipUri: rows[0].sip_uri, ringTo: rows[0].ring_to }
      : null;
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

  /**
   * PC 전화 켜기 — 한국AI통신에서 이 상담원 브라우저용 단기 SIP 토큰과 ICE(STUN/TURN) 정보를 받아 넘긴다.
   * 브라우저는 토큰으로 SIP 등록하고, 받은 sip_uri를 저장해 두면 배분된 전화가 그 브라우저로 울린다.
   * API 키는 서버에만 둔다(KAT_API_KEY). 토큰은 1시간짜리라 화면이 만료 전에 다시 부른다.
   */
  async phoneToken(p: AuthPrincipal) {
    const id = this.me(p);
    const base = process.env.KAT_API_BASE || 'https://api.koreaaitel.com';
    const account = process.env.KAT_ACCOUNT_ID;
    const credential = process.env.KAT_SIP_CREDENTIAL_ID;
    const key = process.env.KAT_API_KEY;
    if (!account || !credential || !key)
      throw new ServiceUnavailableException(
        'PC 전화가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
      );
    const headers = { Authorization: `Bearer ${key}`, 'content-type': 'application/json' };
    const acct = `${base}/v1/accounts/${encodeURIComponent(account)}`;
    const [tokRes, iceRes] = await Promise.all([
      fetch(`${acct}/sip-credentials/${encodeURIComponent(credential)}/tokens`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ttl_seconds: PHONE_TOKEN_TTL_S, subject: `employee:${id}` }),
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(`${acct}/ice-servers`, { headers, signal: AbortSignal.timeout(10_000) }),
    ]).catch(() => {
      throw new BadGatewayException(
        '전화 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    });
    if (!tokRes.ok || !iceRes.ok)
      throw new BadGatewayException('전화 서비스에서 PC 전화 토큰을 받지 못했습니다.');
    const tok = (await tokRes.json()) as { token: string; expires_at: string; sip_uri: string };
    const ice = (await iceRes.json()) as { ice_servers?: unknown[] };
    const sipUntil = new Date(tok.expires_at);
    await this.prisma.csAgent.upsert({
      where: { employeeId: id },
      create: { employeeId: id, available: false, sipUri: `sip:${tok.sip_uri}`, sipUntil },
      update: { sipUri: `sip:${tok.sip_uri}`, sipUntil },
    });
    return { token: tok.token, iceServers: ice.ice_servers ?? [], expiresAt: tok.expires_at };
  }

  /** PC 전화 끄기 — 이 브라우저로는 더 이상 울리지 않는다(착신 번호가 있으면 그쪽으로) */
  async phoneOff(p: AuthPrincipal) {
    const id = this.me(p);
    await this.prisma.csAgent.updateMany({
      where: { employeeId: id },
      data: { sipUri: null, sipUntil: null },
    });
    return { ok: true };
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

  /** 아웃콜 정리 — 잘못 들어온 콜·시험 콜을 콜백 없이 목록에서 뺀다(취소로 남는다) */
  async cancelOutcall(id: string, memo?: string) {
    const r = await this.prisma.csCall.updateMany({
      where: { id, status: 'OUTCALL' },
      data: {
        status: 'CANCELED',
        doneAt: new Date(),
        ...(memo?.trim() && { memo: memo.trim().slice(0, 1000) }),
      },
    });
    if (!r.count) throw new ConflictException('이미 콜백했거나 끝난 콜입니다.');
    return { ok: true };
  }

  /**
   * 콜 끝내기 — result DONE(상담 끝, 접수를 등록했으면 leadId) | RETRY(부재·통화 실패 → 다시 아웃콜로).
   * 끝나면 상담원의 쉰 시각을 지금으로(다음 배분 순서 뒤로).
   */
  async finish(
    p: AuthPrincipal,
    id: string,
    input: { result: 'DONE' | 'RETRY'; leadId?: string; memo?: string; request?: string },
  ) {
    const me = this.me(p);
    const call = await this.prisma.csCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('콜을 찾을 수 없습니다.');
    if (call.agentEmpId !== me && !p.permissions.includes('*'))
      throw new ForbiddenException('내가 받은 콜만 끝낼 수 있습니다.');
    if (!ACTIVE.includes(call.status)) throw new ConflictException('이미 끝난 콜입니다.');
    const memo = input.memo?.trim() ? input.memo.trim().slice(0, 1000) : undefined;
    const request = input.request?.trim() ? input.request.trim().slice(0, 2000) : undefined;
    // 새 번호로 접수했으면 접수가 만든 고객을 콜에도 잇는다(다음 전화부터 이름이 자동으로 뜬다)
    const leadCustomer =
      input.leadId && !call.customerId
        ? ((
            await this.prisma.lead.findUnique({
              where: { id: input.leadId },
              select: { customerId: true },
            })
          )?.customerId ?? null)
        : null;
    const updated = await this.prisma.csCall.update({
      where: { id },
      data:
        input.result === 'RETRY'
          ? {
              status: 'OUTCALL',
              agentEmpId: null,
              ...(memo && { memo }),
              ...(request && { request }),
            }
          : {
              status: 'DONE',
              doneAt: new Date(),
              ...(input.leadId && { leadId: input.leadId }),
              ...(leadCustomer && { customerId: leadCustomer }),
              ...(memo && { memo }),
              ...(request && { request }),
            },
    });
    await this.prisma.csAgent.updateMany({
      where: { employeeId: call.agentEmpId ?? me },
      data: { lastFreeAt: new Date() },
    });
    return updated;
  }

  /**
   * 통화 상태 알림(한국AI통신 status callback) — 통화가 끝나면 통화 시간을 남긴다.
   * 받은 전화는 CallSid로, PC에서 건 전화(SIP 단말 발신)는 INVITE에 실은 X-Call-Id(=콜 id)로 찾는다.
   */
  async statusEvent(body: Record<string, string>) {
    const sid = body.CallSid?.slice(0, 100);
    const status = body.CallStatus ?? '';
    const headerId = body['SipHeader_X-Call-Id'] ?? body['SipHeader_X-Call-ID'];
    const UUID = /^[0-9a-f-]{36}$/i;
    let call = sid ? await this.prisma.csCall.findUnique({ where: { katCallSid: sid } }) : null;
    if (!call && headerId && UUID.test(headerId))
      call = await this.prisma.csCall.findUnique({ where: { id: headerId } });
    if (!call) return { ok: true };
    const ended = ['completed', 'busy', 'no-answer', 'failed', 'canceled', 'rejected'].includes(
      status,
    );
    const dur = Number.parseInt(body.Duration ?? '', 10);
    await this.prisma.csCall.update({
      where: { id: call.id },
      data: {
        ...(sid && !call.katCallSid && { katCallSid: sid }),
        ...(ended && {
          endedAt: new Date(),
          // 콜백을 여러 번 걸면 마지막으로 연결된 통화 시간을 남긴다(안 받은 시도는 0이라 덮어쓰지 않는다)
          ...(Number.isFinite(dur) &&
            (dur > 0 || call.durationSec == null) && { durationSec: dur }),
        }),
      },
    });
    return { ok: true };
  }

  /**
   * 콜 목록 — 검색(전화번호·고객명) + 내 전화/전체 전화. 최근 순, 50개씩.
   */
  async list(p: AuthPrincipal, opts: { scope: 'mine' | 'all'; q?: string; page?: number }) {
    const me = p.employeeId ?? null;
    const q = opts.q?.trim() ?? '';
    const d = digits(q);
    const where: Prisma.CsCallWhereInput = {
      ...(opts.scope === 'mine' && { agentEmpId: me ?? '00000000-0000-0000-0000-000000000000' }),
      ...(q && {
        OR: [
          ...(d.length >= 3 ? [{ phone: { contains: d } }] : []),
          ...(await this.customerIdsByName(q)).map((id) => ({ customerId: id })),
        ],
      }),
    };
    if (q && Array.isArray(where.OR) && where.OR.length === 0) return { total: 0, rows: [] };
    const PAGE = 50;
    const page = Math.max(0, opts.page ?? 0);
    const [total, calls] = await Promise.all([
      this.prisma.csCall.count({ where }),
      this.prisma.csCall.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: page * PAGE,
        take: PAGE,
      }),
    ]);
    const custIds = [...new Set(calls.map((c) => c.customerId).filter((x): x is string => !!x))];
    const empIds = [...new Set(calls.map((c) => c.agentEmpId).filter((x): x is string => !!x))];
    const leadIds = [...new Set(calls.map((c) => c.leadId).filter((x): x is string => !!x))];
    const [customers, emps, leads] = await Promise.all([
      custIds.length
        ? this.prisma.customer.findMany({
            where: { id: { in: custIds } },
            select: { id: true, name: true },
          })
        : [],
      empIds.length
        ? this.prisma.employee.findMany({
            where: { id: { in: empIds } },
            select: { id: true, name: true },
          })
        : [],
      leadIds.length
        ? this.prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, leadNo: true },
          })
        : [],
    ]);
    const nameOf = <T extends { id: string }>(xs: T[], id: string | null, k: keyof T) =>
      id ? ((xs.find((x) => x.id === id)?.[k] as string | undefined) ?? null) : null;
    return {
      total,
      rows: calls.map((c) => ({
        id: c.id,
        phone: c.phone,
        status: c.status,
        channel: c.channel,
        customerId: c.customerId,
        customerName: nameOf(customers, c.customerId, 'name'),
        agentEmpId: c.agentEmpId,
        agentName: nameOf(emps, c.agentEmpId, 'name'),
        leadId: c.leadId,
        leadNo: nameOf(leads, c.leadId, 'leadNo'),
        receivedAt: c.receivedAt.toISOString(),
        endedAt: c.endedAt?.toISOString() ?? null,
        durationSec: c.durationSec,
        hasRecording: !!c.katCallSid && (c.durationSec ?? 0) > 0,
        memo: c.memo,
        request: c.request,
      })),
    };
  }

  private async customerIdsByName(q: string) {
    if (q.length < 1 || /^\d+$/.test(q.replace(/[-\s]/g, ''))) return [];
    const rows = await this.prisma.customer.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id: true },
      take: 200,
    });
    return rows.map((r) => r.id);
  }

  /** 콜 메모·고객 요청사항 고치기 — 상담한 본인 또는 시스템 관리자 */
  async update(
    p: AuthPrincipal,
    id: string,
    input: { memo?: string | null; request?: string | null },
  ) {
    const call = await this.prisma.csCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('콜을 찾을 수 없습니다.');
    if (call.agentEmpId !== p.employeeId && !p.permissions.includes('*'))
      throw new ForbiddenException('내가 상담한 콜만 고칠 수 있습니다.');
    const clean = (v: string | null | undefined, max: number) =>
      v === undefined ? undefined : v?.trim() ? v.trim().slice(0, max) : null;
    return this.prisma.csCall.update({
      where: { id },
      data: { memo: clean(input.memo, 1000), request: clean(input.request, 2000) },
    });
  }

  /** 녹음 파일(WAV) — 한국AI통신에서 받아 그대로 넘긴다(API 키는 서버에만). 보관 90일 */
  async recording(id: string) {
    const call = await this.prisma.csCall.findUnique({ where: { id } });
    if (!call?.katCallSid) throw new NotFoundException('이 콜에는 녹음이 없습니다.');
    const base = process.env.KAT_API_BASE || 'https://api.koreaaitel.com';
    const account = process.env.KAT_ACCOUNT_ID;
    const key = process.env.KAT_API_KEY;
    if (!account || !key)
      throw new ServiceUnavailableException('전화 서비스가 설정되지 않았습니다.');
    const res = await fetch(
      `${base}/v1/accounts/${encodeURIComponent(account)}/recordings/${encodeURIComponent(call.katCallSid)}`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) },
    ).catch(() => {
      throw new BadGatewayException('전화 서비스에 연결하지 못했습니다.');
    });
    if (res.status === 404)
      throw new NotFoundException(
        '녹음이 없습니다(통화가 연결되지 않았거나 보관 기간 90일이 지났습니다).',
      );
    if (!res.ok || !res.body) throw new BadGatewayException('녹음을 받아오지 못했습니다.');
    return {
      body: res.body,
      type: res.headers.get('content-type') ?? 'audio/wav',
      length: res.headers.get('content-length'),
    };
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
      request: c.request,
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
          pcPhone: !!a?.sipUri && !!a.sipUntil && a.sipUntil > new Date(),
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
