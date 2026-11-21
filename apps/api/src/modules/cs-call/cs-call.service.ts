import {
  Logger,
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
import { EMPLOYEE_BRIEF_SELECT } from '../../common/employee-brief';
import { afterHoursAgentId, CtiRoutingService } from './cti-routing.service';

/** 영업시간 외 AI 상담원이 받은 전화의 채널 이름 */
const AI_CHANNEL = 'AI 접수(영업시간 외)';
import { CS_ORG } from './cs-org';

/** 상담원이 들고 있는(통화 중) 콜 상태 */
const ACTIVE = ['ASSIGNED', 'CALLBACK'];
/** 배분 순서가 겹치지 않게 — 두 콜이 동시에 들어와도 한 상담원에게 둘이 가지 않는다 */
const DISPATCH_LOCK = 7_202_611;
const digits = (s: string) => s.replace(/\D/g, '');
/** 처음 쓰는 상담원에게 만들어 주는 대본 메모 — 상담원이 고쳐 쓴다 */
const DEFAULT_SCRIPTS = [
  {
    title: '공지사항',
    body: '[이번 주 공지] — 상담 전에 한 번 확인해 주세요. (내용은 바뀔 때마다 고쳐 주세요)\n\n■ 예약 마감·혼잡일\n· 월말(25일~말일)·손 없는 날·주말은 예약이 빨리 찹니다 → 희망일이 이 날짜면 “일정이 빨리 마감되는 날”이라고 먼저 안내\n· 마감된 날짜는 대안 날짜 2개를 바로 제시\n\n■ 진행 중인 제휴·프로모션\n· (예) ○○카드 제휴 — 이사 비용 ○% 할인, ○월 ○일까지\n· (예) 전속 고객사 ○○ — 본사 배정만 가능\n\n■ 응대 원칙\n· 금액은 전화로 확정하지 않습니다 — “방문(또는 사진) 견적 후 정확히 안내”\n· 파손·분실·AS 문의는 접수 번호를 받아 담당 지점으로 연결\n· 고객 요청사항은 ‘고객 요청사항’ 칸에, 상담 내용은 ‘상담 메모’ 칸에 나눠 적기',
  },
  {
    title: '첫 인사',
    body: '안녕하세요, 통인익스프레스 ○○○입니다. 무엇을 도와드릴까요?\n\n(이사 문의일 때) 네, 이사 상담 도와드리겠습니다. 몇 가지만 여쭤볼게요.\n1. 고객님 성함이 어떻게 되실까요?\n2. 이사 예정일이 정해지셨을까요? (미정이면 희망 시기)\n3. 지금 계신 곳(출발지)과 이사 가실 곳(도착지)은 어디세요?\n4. 집 구조는 어떻게 되세요? (원룸·투룸·쓰리룸 / 평수 / 층수, 엘리베이터 유무)\n\n(기존 고객이 화면에 뜨면) ○○○ 고객님, 다시 연락 주셔서 감사합니다. 지난번 ○○ 건 관련이실까요?',
  },
  {
    title: '견적 안내',
    body: '정확한 견적을 위해 담당자가 방문(또는 영상·사진)으로 짐 양을 확인한 뒤 안내해 드리고 있습니다.\n\n· 방문 견적은 무료이고 20~30분 정도 걸립니다.\n· 방문 가능한 날짜와 시간대를 말씀해 주시면 담당 지점에서 일정 잡아 연락드립니다.\n· 견적 받으실 때 함께 확인하면 좋은 것\n  - 대형 가구·가전(장롱, 냉장고, 피아노, 안마의자 등)\n  - 에어컨 이전 설치, 붙박이장·시스템 행거 해체\n  - 사다리차 필요 여부(층수, 엘리베이터 사용 가능 시간)\n  - 폐기물 처리, 입주 청소 필요 여부\n\n(금액을 물으시면) 짐 양과 작업 조건에 따라 달라서, 방문 견적 후 정확한 금액을 서면으로 안내드리겠습니다.',
  },
  {
    title: '제휴·전속 확인',
    body: '혹시 다니시는 회사나 이용 중인 카드·기관에서 받으신 이사 제휴 혜택이 있으실까요?\n\n· 있다고 하시면 → 제휴사 이름을 여쭤보고 ‘상품 종류’에서 제휴/전속을 골라 해당 업체 선택\n  - 화면에 나오는 혜택 내용을 그대로 안내 (할인율·기간 등)\n  - 증빙(사원증·제휴 코드·쿠폰 번호)이 필요한 곳이면 견적 때 준비해 달라고 안내\n· 전속 고객사 → 본사에서만 진행합니다(담당 지점을 본사로).\n· 제휴 고객사 → 가까운 지점·가맹점까지 배정할 수 있습니다.\n· 목록에 없는 곳이면 → 일반으로 접수하고 상담 메모에 업체명을 적어 두기',
  },
  {
    title: '마무리',
    body: '말씀하신 내용으로 접수해 드렸습니다. 접수 번호는 ○○○○입니다.\n\n· 담당 지점에서 오늘(늦어도 내일) 중 연락드려 방문 견적 일정을 잡아 드립니다.\n· 접수 안내 문자도 곧 보내 드릴게요.\n· 일정이나 주소가 바뀌면 이 번호로 다시 연락 주시면 바로 반영해 드리겠습니다.\n\n더 궁금하신 점 있으실까요? 통인익스프레스를 찾아 주셔서 감사합니다. 좋은 하루 보내세요.',
  },
];

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
/** 상담 화면 초안으로 남기는 칸 */
const DRAFT_KEYS = [
  'customerName',
  'serviceLine',
  'orgUnitId',
  'moveKind',
  'partnerId',
  'moveDate',
  'request',
  'memo',
  ...(['from', 'to'] as const).flatMap((p) =>
    ['Zipcode', 'Addr', 'AddrDetail', 'Sido', 'Sigungu', 'Lat', 'Lng'].map((f) => `${p}${f}`),
  ),
];

@Injectable()
export class CsCallService {
  private readonly log = new Logger('CsCall');
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: CtiRoutingService,
  ) {}

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
      // 배정되면 그 상담원은 '상담 중'(상담 가능 해제) — 통화가 끝나도 후처리 후 직접 [상담 가능]을 눌러야 다시 받는다
      if (agent) await this.holdAgent(tx, agent.id);
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
      if (agent) await this.holdAgent(tx, agent.id);
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

  /** 상담원을 '상담 가능'에서 내린다(배정·콜백 시) */
  private async holdAgent(tx: Prisma.TransactionClient | PrismaService, employeeId: string) {
    const r = await tx.csAgent.updateMany({ where: { employeeId }, data: { available: false } });
    // 트랜잭션 안이면 커밋 뒤에 반영되도록 조금 늦게 맞춘다
    setTimeout(() => this.routing.sync(), 500);
    return r;
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

  /**
   * 소프트폰(동시 울림) — 상담원이 [받기]를 누르면 브라우저가 부른다. 그 상담원에게 콜을 만들고 '상담 중'으로.
   * CallSid는 통화가 끝날 때 오는 상태 알림이 같은 번호로 찾아 잇는다.
   */
  async answer(p: AuthPrincipal, input: { phone: string; katCallSid?: string }) {
    const me = this.me(p);
    const d = digits(input.phone);
    if (d.length < 8 || d.length > 12)
      throw new BadRequestException('전화번호가 올바르지 않습니다.');
    const customer = await this.customerByPhone(d);
    // 콜 만들기 · 상담 가능 해제 · 이전 접수를 한 번에(왕복을 줄여 상담 화면이 빨리 뜨게)
    const [call, , recentLeads] = await Promise.all([
      this.prisma.csCall.create({
        data: {
          phone: d,
          status: 'ASSIGNED',
          agentEmpId: me,
          assignedAt: new Date(),
          channel: '대표번호',
          customerId: customer?.id ?? null,
          katCallSid: input.katCallSid?.slice(0, 100) || null,
        },
      }),
      this.holdAgent(this.prisma, me),
      customer
        ? this.prisma.lead.findMany({
            where: { customerId: customer.id },
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
        : Promise.resolve([]),
    ]);
    // 상담 콘솔의 내 콜과 같은 모양으로 돌려준다 — 화면이 콘솔을 다시 읽지 않고 바로 연다
    return {
      call: {
        id: call.id,
        callNo: call.callNo,
        phone: call.phone,
        status: call.status,
        channel: call.channel,
        attempts: call.attempts,
        memo: call.memo,
        request: call.request,
        leadId: null,
        leadNo: null,
        customerId: call.customerId,
        customerName: customer?.name ?? null,
        agentEmpId: call.agentEmpId,
        receivedAt: call.receivedAt.toISOString(),
        assignedAt: call.assignedAt?.toISOString() ?? null,
      },
      recentLeads: recentLeads.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
        moveDate: l.moveDate?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  /** 울리는 전화의 고객 — 수신 창에 신규/기존 고객 표시용 */
  async callerInfo(phone: string) {
    const d = digits(phone);
    if (d.length < 8) return { existing: false, name: null, leads: 0 };
    const customer = await this.customerByPhone(d);
    if (!customer) return { existing: false, name: null, leads: 0 };
    const leads = await this.prisma.lead.count({ where: { customerId: customer.id } });
    return { existing: true, name: customer.name, leads };
  }

  /**
   * PC 전화가 울려도 되는지 — 상담 가능이면 울린다.
   * 상담 화면(후처리)이 열려 있어도 상관없다. 통화 중인 PC는 브라우저가 스스로 등록을 내린다.
   */
  async agentState(p: AuthPrincipal) {
    const me = this.me(p);
    // 콘솔이 열려 있다는 표시(5초마다) — 받을 상담원이 있는지 판단에 쓴다
    const seen = await this.prisma.csAgent.updateMany({
      where: { employeeId: me },
      data: { seenAt: new Date() },
    });
    const [agent, open] = await Promise.all([
      this.prisma.csAgent.findUnique({ where: { employeeId: me }, select: { available: true } }),
      this.prisma.csCall.count({ where: { agentEmpId: me, status: { in: ACTIVE } } }),
    ]);
    if (seen.count && agent?.available) this.routing.sync();
    return { available: !!agent?.available, busy: open > 0, ringable: !!agent?.available };
  }

  /** 고객관리부(하위 조직 포함) 상담원인가 — PC 전화·상담 가능은 상담원 전용 */
  private async isCsAgent(employeeId: string) {
    const n = await this.prisma.employee.count({
      where: { id: employeeId, isActive: true, orgUnit: CS_ORG },
    });
    return n > 0;
  }
  private async assertCsAgent(p: AuthPrincipal) {
    const id = this.me(p);
    if (!(await this.isCsAgent(id)))
      throw new ForbiddenException('PC 전화·상담 가능은 고객관리부 상담원만 쓸 수 있습니다.');
    return id;
  }

  /** 상담 가능 / 후처리 — 마무리하지 않은 상담이 있어도 바꿀 수 있다(상담원 전용 — 끄기는 누구나) */
  async setAvailable(p: AuthPrincipal, available: boolean) {
    const id = available ? await this.assertCsAgent(p) : this.me(p);
    await this.prisma.csAgent.upsert({
      where: { employeeId: id },
      create: { employeeId: id, available, lastFreeAt: new Date() },
      update: { available, ...(available && { lastFreeAt: new Date() }), seenAt: new Date() },
    });
    this.routing.sync();
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
    const id = await this.assertCsAgent(p);
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
      update: { sipUri: `sip:${tok.sip_uri}`, sipUntil, seenAt: new Date() },
    });
    this.routing.sync();
    return { token: tok.token, iceServers: ice.ice_servers ?? [], expiresAt: tok.expires_at };
  }

  /** PC 전화 끄기 — 이 브라우저로는 더 이상 울리지 않는다(착신 번호가 있으면 그쪽으로) */
  async phoneOff(p: AuthPrincipal) {
    const id = this.me(p);
    await this.prisma.csAgent.updateMany({
      where: { employeeId: id },
      data: { sipUri: null, sipUntil: null },
    });
    this.routing.sync();
    return { ok: true };
  }

  /** 아웃콜을 눌러 콜백 — 다른 상담원이 먼저 잡았으면 409 */
  async callback(p: AuthPrincipal, id: string) {
    const me = this.me(p);
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
    await this.holdAgent(this.prisma, me);
    return this.prisma.csCall.findUniqueOrThrow({ where: { id } });
  }

  /**
   * 끝난 상담에서 그 고객에게 다시 걸기 — 새 콜(콜백)을 만들어 상담 화면을 연다.
   * 지난 콜 기록(통화 시간·녹취)은 그대로 두고, 이번 통화는 새 콜에 남는다.
   */
  async recall(p: AuthPrincipal, id: string) {
    const me = this.me(p);
    const prev = await this.prisma.csCall.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('콜을 찾을 수 없습니다.');
    const call = await this.prisma.csCall.create({
      data: {
        phone: prev.phone,
        status: 'CALLBACK',
        channel: '다시 걸기',
        customerId: prev.customerId,
        agentEmpId: me,
        assignedAt: new Date(),
        attempts: 1,
      },
    });
    await this.holdAgent(this.prisma, me);
    return call;
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
    const sid = (body.CallSid || body.CallId)?.slice(0, 100);
    const status = body.CallStatus ?? '';
    const headerId = body['SipHeader_X-Call-Id'] ?? body['SipHeader_X-Call-ID'];
    const UUID = /^[0-9a-f-]{36}$/i;
    let call = sid ? await this.prisma.csCall.findUnique({ where: { katCallSid: sid } }) : null;
    if (!call && headerId && UUID.test(headerId))
      call = await this.prisma.csCall.findUnique({ where: { id: headerId } });
    const ended = ['completed', 'busy', 'no-answer', 'failed', 'canceled', 'rejected'].includes(
      status,
    );
    const inbound = (body.Direction ?? 'inbound').toLowerCase().startsWith('in');
    const from = digits(body.From ?? '');
    // 소프트폰(동시 울림) 방식 — 받은 상담원이 [받기]로 만든 콜은 아직 CallSid가 없다 → 같은 번호의 최근 콜에 잇는다
    if (!call && inbound && from.length >= 8)
      call = await this.prisma.csCall.findFirst({
        where: {
          phone: from,
          katCallSid: null,
          receivedAt: { gte: new Date(Date.now() - 3 * 3600_000) },
        },
        orderBy: { receivedAt: 'desc' },
      });
    if (!call)
      this.log.warn(
        `통화 상태 알림 — 콜을 찾지 못함 (status=${status}, direction=${body.Direction ?? '-'}, keys=${Object.keys(body).join(',')})`,
      );
    if (!call) {
      // 아무도 받지 않은 전화(모두 통화 중·자리 비움·안 받음) — 아웃콜 대기로 올려 콜백하게 한다
      if (inbound && ended && from.length >= 8 && from.length <= 12) {
        const customer = await this.customerByPhone(from);
        await this.prisma.csCall
          .create({
            data: {
              phone: from,
              status: 'OUTCALL',
              // 영업시간 외에는 AI 상담원이 받는다 — 요약은 통화 요약 알림(aiSummary)이 붙인다
              channel: afterHoursAgentId() ? AI_CHANNEL : '대표번호(부재중)',
              customerId: customer?.id ?? null,
              katCallSid: sid || null,
              endedAt: new Date(),
              durationSec: 0,
            },
          })
          .catch(() => undefined); // 같은 CallSid로 두 번 오면(재전송) 무시
      }
      return { ok: true };
    }
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
   * 통화 받아쓰기 알림(한국AI통신 webhooks: transcript.completed).
   * 받아쓰기 파일(서명 URL, 7일 뒤 만료)을 바로 받아 콜에 저장한다 — 상담 기록에서 본다.
   * 콜은 통화 ID(CallId)로, 못 찾으면 같은 번호의 최근 콜(3시간 안, 받아쓰기 없는 것)로 잇는다.
   */
  async transcriptEvent(body: Record<string, string>) {
    const sid = (body.CallId || body.CallSid)?.slice(0, 100);
    const url = body.TranscriptUrl;
    if (!sid || body.Event !== 'transcript.completed' || !url?.startsWith('https://'))
      return { ok: true };
    let call = await this.prisma.csCall.findUnique({ where: { katCallSid: sid } });
    const from = digits(body.From ?? '');
    if (!call && from.length >= 8)
      call = await this.prisma.csCall.findFirst({
        where: {
          phone: from,
          transcriptAt: null,
          receivedAt: { gte: new Date(Date.now() - 3 * 3600_000) },
        },
        orderBy: { receivedAt: 'desc' },
      });
    if (!call) {
      this.log.warn(`받아쓰기 알림 — 콜을 찾지 못함 (CallId=${sid})`);
      return { ok: true };
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`받아쓰기 파일 ${res.status}`);
    const raw = (await res.json()) as unknown;
    const segments = (Array.isArray(raw) ? raw : [])
      .map((x: Record<string, unknown>) => ({
        speaker: String(x.speaker ?? '').slice(0, 30),
        start: Number(x.start) || 0,
        end: Number(x.end) || 0,
        text: String(x.text ?? '').slice(0, 2000),
      }))
      .filter((x) => x.text.trim())
      .slice(0, 3000);
    await this.prisma.csCall.update({
      where: { id: call.id },
      data: {
        transcript: segments,
        transcriptAt: new Date(),
        ...(!call.katCallSid && { katCallSid: sid }),
      },
    });
    return { ok: true };
  }

  /** 콜의 받아쓰기 원문 */
  /** 상담 화면에 적던 내용 저장(입력할 때마다 잠깐 모아서) */
  async saveDraft(id: string, raw: Record<string, unknown>) {
    const draft: Record<string, string> = {};
    for (const k of DRAFT_KEYS) {
      const v = raw[k];
      if (typeof v === 'string') draft[k] = v.slice(0, 2000);
    }
    await this.prisma.csCall.updateMany({
      where: { id },
      data: { draft, draftAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * 상담 화면 초안 — 이 콜에 적던 게 있으면 그것, 없으면(새 콜) 같은 번호로 24시간 안에 적던
   * 가장 최근 콜의 내용을 이어받는다. own=true면 이 콜 것만(끝난 콜 읽기 화면).
   */
  async draft(id: string, own = false) {
    const row = await this.prisma.csCall.findUnique({
      where: { id },
      select: { phone: true, draft: true },
    });
    if (!row) throw new NotFoundException('콜을 찾을 수 없습니다.');
    if (row.draft || own) return { draft: row.draft ?? null, fromCallNo: null };
    const prev = await this.prisma.csCall.findFirst({
      where: {
        phone: row.phone,
        id: { not: id },
        draftAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
      orderBy: { draftAt: 'desc' },
      select: { callNo: true, draft: true },
    });
    return { draft: prev?.draft ?? null, fromCallNo: prev?.callNo ?? null };
  }

  async transcript(id: string) {
    const row = await this.prisma.csCall.findUnique({
      where: { id },
      select: { transcript: true, transcriptAt: true },
    });
    if (!row) throw new NotFoundException('콜을 찾을 수 없습니다.');
    return {
      segments: (row.transcript ?? []) as {
        speaker: string;
        start: number;
        end: number;
        text: string;
      }[],
      at: row.transcriptAt?.toISOString() ?? null,
    };
  }

  /**
   * AI 상담원 통화 요약 알림(한국AI통신 webhooks: summary.completed).
   * 같은 통화(CallId)의 콜 메모에 'AI 요약'을 남긴다 — 상담원이 다음 날 콜백하며 본다.
   * 콜이 아직 없으면(상태 알림보다 먼저 오면) 아웃콜 대기로 만든다. 같은 알림이 두 번 와도 한 번만 붙인다.
   */
  async aiSummary(body: Record<string, string>) {
    const sid = (body.CallId || body.CallSid)?.slice(0, 100);
    if (!sid || body.Event !== 'summary.completed') return { ok: true };
    let s: { coreSummary?: string; decisions?: string[]; followUps?: string[] } = {};
    try {
      s = JSON.parse(body.SummaryJson ?? '{}') as typeof s;
    } catch {
      return { ok: true };
    }
    const lines = [
      s.coreSummary?.trim(),
      ...(s.decisions ?? []).map((d) => `· ${d}`),
      ...(s.followUps ?? []).map((f) => `→ ${f}`),
    ].filter(Boolean);
    if (!lines.length) return { ok: true };
    const text = `[AI 요약]\n${lines.join('\n')}`.slice(0, 1000);
    const call = await this.prisma.csCall.findUnique({ where: { katCallSid: sid } });
    if (call) {
      if (call.memo?.includes('[AI 요약]')) return { ok: true };
      await this.prisma.csCall.update({
        where: { id: call.id },
        data: { memo: call.memo ? `${call.memo}\n${text}`.slice(0, 1000) : text },
      });
      return { ok: true };
    }
    const from = digits(body.From ?? '');
    if (from.length < 8 || from.length > 12) return { ok: true };
    const customer = await this.customerByPhone(from);
    await this.prisma.csCall
      .create({
        data: {
          phone: from,
          status: 'OUTCALL',
          channel: AI_CHANNEL,
          customerId: customer?.id ?? null,
          katCallSid: sid,
          memo: text,
          endedAt: new Date(),
        },
      })
      .catch(() => undefined);
    return { ok: true };
  }

  /**
   * 콜 목록 — 검색(전화번호·고객명) + 내 전화/전체 전화. 최근 순, 50개씩.
   */
  async list(
    p: AuthPrincipal,
    opts: {
      scope: 'mine' | 'all';
      q?: string;
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
    },
  ) {
    const me = p.employeeId ?? null;
    const q = opts.q?.trim() ?? '';
    const d = digits(q);
    const where: Prisma.CsCallWhereInput = {
      ...(opts.scope === 'mine' && { agentEmpId: me ?? '00000000-0000-0000-0000-000000000000' }),
      // 날짜 범위(한국 시간 하루 단위)
      ...((opts.from || opts.to) && {
        receivedAt: {
          ...(opts.from && { gte: new Date(`${opts.from}T00:00:00+09:00`) }),
          ...(opts.to && { lt: new Date(+new Date(`${opts.to}T00:00:00+09:00`) + 86400_000) }),
        },
      }),
      ...(q && {
        OR: [
          ...(d.length >= 3 ? [{ phone: { contains: d } }] : []),
          ...(await this.customerIdsByName(q)).map((id) => ({ customerId: id })),
        ],
      }),
    };
    if (q && Array.isArray(where.OR) && where.OR.length === 0) return { total: 0, rows: [] };
    // 콘솔 표는 최근 콜을 한 번에 받아 표 안에서 찾고 넘긴다(최대 500)
    const PAGE = Math.min(500, Math.max(1, opts.limit ?? 50));
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
    // 통화 ID가 비어 있는 최근 콜 몇 개는 뒤에서 한국AI통신 기록에 잇는다(다음에 읽을 때 녹취가 보인다)
    for (const c of calls
      .filter((c) => !c.katCallSid && c.assignedAt && +c.assignedAt > Date.now() - 7 * 86400_000)
      .slice(0, 5))
      void this.resolveKat(c.id).catch(() => undefined);
    return { total, rows: await this.rowsOf(calls) };
  }

  /** 콜 목록·상세 한 줄 — 고객명·상담원·접수 번호·녹취 여부를 붙인다 */
  private async rowsOf(calls: Prisma.CsCallGetPayload<object>[]) {
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
            select: EMPLOYEE_BRIEF_SELECT,
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
    return calls.map((c) => ({
      id: c.id,
      callNo: c.callNo,
      phone: c.phone,
      status: c.status,
      channel: c.channel,
      customerId: c.customerId,
      customerName: nameOf(customers, c.customerId, 'name'),
      agentEmpId: c.agentEmpId,
      agentName: nameOf(emps, c.agentEmpId, 'name'),
      // 상담원 칩(접수의 담당자 칩과 같은 모양)
      agent: emps.find((e) => e.id === c.agentEmpId) ?? null,
      leadId: c.leadId,
      leadNo: nameOf(leads, c.leadId, 'leadNo'),
      receivedAt: c.receivedAt.toISOString(),
      endedAt: c.endedAt?.toISOString() ?? null,
      durationSec: c.durationSec,
      hasRecording: !!c.katCallSid && (c.durationSec ?? 0) > 0,
      hasTranscript: !!c.transcriptAt,
      memo: c.memo,
      request: c.request,
      transferTo: c.transferTo,
      transferredAt: c.transferredAt?.toISOString() ?? null,
    }));
  }

  /** 콜 상세 — 상담 콜 목록에서 눌러 여는 상담 화면. 고객의 최근 접수도 함께 */
  async detail(id: string) {
    const call = await this.resolveKat(id);
    if (!call) throw new NotFoundException('콜을 찾을 수 없습니다.');
    const [[row], recentLeads, lead] = await Promise.all([
      this.rowsOf([call]),
      call.customerId ? this.recentLeadsOf(call.customerId) : Promise.resolve([]),
      // 이 콜로 등록한 접수 — 읽기 화면을 접수 입력 그대로 채운다(지점 범위와 상관없이 이 콜의 접수만)
      call.leadId
        ? this.prisma.lead.findUnique({
            where: { id: call.leadId },
            select: {
              serviceLine: true,
              partnerId: true,
              partner: { select: { type: true } },
              orgUnitId: true,
              moveDate: true,
              customerRequest: true,
              fromZipcode: true,
              fromAddr: true,
              fromAddrDetail: true,
              toZipcode: true,
              toAddr: true,
              toAddrDetail: true,
            },
          })
        : Promise.resolve(null),
    ]);
    return {
      call: { ...row, attempts: call.attempts, assignedAt: call.assignedAt?.toISOString() ?? null },
      recentLeads,
      lead: lead
        ? {
            ...lead,
            moveKind:
              lead.partner?.type === 'AFFILIATE'
                ? 'AFFILIATE'
                : lead.partner?.type === 'EXCLUSIVE'
                  ? 'EXCLUSIVE'
                  : 'GENERAL',
            moveDate: lead.moveDate?.toISOString().slice(0, 10) ?? null,
          }
        : null,
    };
  }

  private async recentLeadsOf(customerId: string) {
    const rows = await this.prisma.lead.findMany({
      where: { customerId },
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
    });
    return rows.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      moveDate: l.moveDate?.toISOString().slice(0, 10) ?? null,
    }));
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
    input: { leadId?: string; memo?: string | null; request?: string | null },
  ) {
    const call = await this.prisma.csCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('콜을 찾을 수 없습니다.');
    if (call.agentEmpId !== p.employeeId && !p.permissions.includes('*'))
      throw new ForbiddenException('내가 상담한 콜만 고칠 수 있습니다.');
    const clean = (v: string | null | undefined, max: number) =>
      v === undefined ? undefined : v?.trim() ? v.trim().slice(0, max) : null;
    // 상담 중에 등록한 접수를 잇는다 — 새 번호면 접수가 만든 고객도 콜에 잇는다
    const lead = input.leadId
      ? await this.prisma.lead.findUnique({
          where: { id: input.leadId },
          select: { id: true, customerId: true },
        })
      : null;
    if (input.leadId && !lead) throw new NotFoundException('접수를 찾을 수 없습니다.');
    return this.prisma.csCall.update({
      where: { id },
      data: {
        memo: clean(input.memo, 1000),
        request: clean(input.request, 2000),
        ...(lead && { leadId: lead.id }),
        ...(lead?.customerId && !call.customerId && { customerId: lead.customerId }),
      },
    });
  }

  /** 녹음 파일(WAV) — 한국AI통신에서 받아 그대로 넘긴다(API 키는 서버에만). 보관 90일 */
  /**
   * 한국AI통신 통화 ID가 아직 없는 콜(통화 상태 알림이 콜에 잇히지 못한 경우)을
   * 같은 번호·비슷한 시각의 통화로 찾아 잇는다 — 녹취 듣기·통화 시간이 그때부터 보인다.
   * 녹음 파일은 우리 서버에 두지 않고 한국AI통신(90일 보관)에서 들을 때마다 받아 온다.
   */
  async resolveKat(callId: string) {
    const call = await this.prisma.csCall.findUnique({ where: { id: callId } });
    if (!call || call.katCallSid || !call.assignedAt) return call;
    const base = process.env.KAT_API_BASE || 'https://api.koreaaitel.com';
    const account = process.env.KAT_ACCOUNT_ID;
    const key = process.env.KAT_API_KEY;
    if (!account || !key) return call;
    const list = async (q: string) => {
      const r = await fetch(
        `${base}/v1/accounts/${encodeURIComponent(account)}/calls?${q}&limit=20`,
        { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) },
      ).catch(() => null);
      if (!r?.ok) return [];
      const j = (await r.json().catch(() => null)) as {
        data?: {
          callId: string;
          status: string;
          duration: number;
          dateCreated: string;
          dateUpdated?: string;
        }[];
      } | null;
      return j?.data ?? [];
    };
    const [inb, outb] = await Promise.all([
      list(`from=${encodeURIComponent(call.phone)}`),
      list(`to=${encodeURIComponent(call.phone)}`),
    ]);
    const at = +call.assignedAt;
    const used = new Set(
      (
        await this.prisma.csCall.findMany({
          where: { katCallSid: { in: [...inb, ...outb].map((c) => c.callId) } },
          select: { katCallSid: true },
        })
      ).map((c) => c.katCallSid),
    );
    const best = [...inb, ...outb]
      .filter((c) => c.status === 'completed' && c.duration > 0 && !used.has(c.callId))
      .map((c) => ({ c, gap: Math.abs(+new Date(c.dateCreated) - at) }))
      .filter((x) => x.gap < 15 * 60_000)
      .sort((a, b) => a.gap - b.gap)[0]?.c;
    if (!best) return call;
    return this.prisma.csCall
      .update({
        where: { id: call.id },
        data: {
          katCallSid: best.callId,
          durationSec: best.duration,
          ...(!call.endedAt && best.dateUpdated && { endedAt: new Date(best.dateUpdated) }),
        },
      })
      .catch(() => call);
  }

  async recording(id: string) {
    const call = await this.resolveKat(id);
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

  // ── 상담 메모(대본) — 공유(모든 상담 직원) + 개인(본인만) ──
  /** 공유 메모 + 내 개인 메모. 처음이면 기본 대본을 공유 메모로 한 번 만든다 */
  async scripts(p: AuthPrincipal) {
    const id = this.me(p);
    const find = () =>
      this.prisma.csScript.findMany({
        where: { OR: [{ shared: true }, { employeeId: id }] },
        orderBy: [{ shared: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    const rows = await find();
    if (rows.length) return rows;
    await this.prisma.csScript.createMany({
      data: DEFAULT_SCRIPTS.map((x, i) => ({ employeeId: id, ...x, shared: true, sortOrder: i })),
    });
    return find();
  }

  async createScript(p: AuthPrincipal, input: { title: string; body?: string; shared?: boolean }) {
    const id = this.me(p);
    const shared = !!input.shared;
    const last = await this.prisma.csScript.findFirst({
      where: shared ? { shared: true } : { employeeId: id, shared: false },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.csScript.create({
      data: {
        employeeId: id,
        shared,
        title: input.title.trim().slice(0, 40) || '새 메모',
        body: (input.body ?? '').slice(0, 5000),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  /** 고칠 수 있는 메모 — 공유는 상담 직원 누구나, 개인은 본인만 */
  private async editableScript(p: AuthPrincipal, scriptId: string) {
    const id = this.me(p);
    const row = await this.prisma.csScript.findUnique({ where: { id: scriptId } });
    if (!row || (!row.shared && row.employeeId !== id))
      throw new NotFoundException('메모를 찾을 수 없습니다.');
    return row;
  }

  async updateScript(
    p: AuthPrincipal,
    scriptId: string,
    input: { title?: string; body?: string; shared?: boolean },
  ) {
    const row = await this.editableScript(p, scriptId);
    // 공유 메모를 개인으로 돌리는 것은 만든 사람만(다른 직원 화면에서 사라지므로)
    if (input.shared === false && row.shared && row.employeeId !== this.me(p))
      throw new ForbiddenException(
        '공유 메모를 개인 메모로 바꾸는 것은 만든 사람만 할 수 있습니다.',
      );
    return this.prisma.csScript.update({
      where: { id: scriptId },
      data: {
        ...(input.title !== undefined && { title: input.title.trim().slice(0, 40) || '새 메모' }),
        ...(input.body !== undefined && { body: input.body.slice(0, 5000) }),
        ...(input.shared !== undefined && { shared: input.shared }),
      },
    });
  }

  async deleteScript(p: AuthPrincipal, scriptId: string) {
    await this.editableScript(p, scriptId);
    await this.prisma.csScript.delete({ where: { id: scriptId } });
    return { ok: true };
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
          orgUnit: CS_ORG,
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
    // 상담원 현황은 고객관리부만(다른 부서 직원은 PC 전화·상담 가능을 쓸 수 없다)
    const people = csTeam;
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
      transferTo: c.transferTo,
      leadId: c.leadId,
      customerId: c.customerId,
      customerName: c.customerId ? (custName.get(c.customerId) ?? null) : null,
      agentEmpId: c.agentEmpId,
      receivedAt: c.receivedAt.toISOString(),
      assignedAt: c.assignedAt?.toISOString() ?? null,
    });

    // 상담원별 오늘 숫자 — 받은 콜·콜백·접수·통화 시간
    const perAgent = await this.prisma.$queryRaw<
      { agent: string; received: bigint; callbacks: bigint; leads: bigint; talk: bigint | null }[]
    >`
      SELECT agent_emp_id AS agent,
        count(*) FILTER (WHERE attempts = 0) AS received,
        count(*) FILTER (WHERE attempts > 0) AS callbacks,
        count(lead_id) AS leads,
        sum(duration_sec) AS talk
      FROM cs_call
      WHERE agent_emp_id IS NOT NULL AND coalesce(assigned_at, received_at) >= ${today}
      GROUP BY agent_emp_id`;
    const todayOf = (id: string) => {
      const r = perAgent.find((x) => x.agent === id);
      return {
        received: Number(r?.received ?? 0),
        callbacks: Number(r?.callbacks ?? 0),
        leads: Number(r?.leads ?? 0),
        talkSec: Number(r?.talk ?? 0),
      };
    };
    const agents = people
      .map((e) => {
        const a = agentRows.find((x) => x.employeeId === e.id);
        const call = active.find((c) => c.agentEmpId === e.id);
        return {
          employeeId: e.id,
          name: e.name,
          position: e.position?.name ?? null,
          // 상담 가능을 켰으면 마무리하지 않은 상담이 있어도 '상담 가능'
          state: a?.available ? 'READY' : call ? 'BUSY' : 'OFF',
          call: call ? view(call) : null,
          lastFreeAt: a?.lastFreeAt.toISOString() ?? null,
          forwarding: !!a?.ringTo,
          pcPhone: !!a?.sipUri && !!a.sipUntil && a.sipUntil > new Date(),
          today: todayOf(e.id),
        };
      })
      .sort(
        (a, b) =>
          ['BUSY', 'READY', 'OFF'].indexOf(a.state) - ['BUSY', 'READY', 'OFF'].indexOf(b.state) ||
          a.name.localeCompare(b.name),
      );

    // 마무리하지 않은 내 상담이 여럿이면 가장 최근 것
    const mine = me
      ? active
          .filter((c) => c.agentEmpId === me)
          .sort((x, y) => +(y.assignedAt ?? y.receivedAt) - +(x.assignedAt ?? x.receivedAt))[0]
      : undefined;
    const recentLeads = mine?.customerId ? await this.recentLeadsOf(mine.customerId) : [];
    const count = (s: string) => todayCounts.find((x) => x.status === s)?._count ?? 0;
    return {
      me: me
        ? {
            employeeId: me,
            /** 고객관리부 상담원 — PC 전화·상담 가능을 쓸 수 있다 */
            isAgent: csTeam.some((e) => e.id === me),
            available: agentRows.find((a) => a.employeeId === me)?.available ?? false,
            ringTo: agentRows.find((a) => a.employeeId === me)?.ringTo ?? null,
            call: mine
              ? {
                  ...view(mine),
                  // 상담 중에 등록한 접수 번호(접수 등록 후에도 상담 화면에 남아 있을 때 보여 준다)
                  leadNo: mine.leadId
                    ? ((
                        await this.prisma.lead.findUnique({
                          where: { id: mine.leadId },
                          select: { leadNo: true },
                        })
                      )?.leadNo ?? null)
                    : null,
                }
              : null,
            recentLeads,
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
