import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CS_ORG } from './cs-org';

/** 상담 콘솔이 이 시간 안에 확인했으면 '켜져 있는' 상담원 */
const SEEN_MS = 30_000;
const TICK_MS = 15_000;

type Mode = 'softphone' | 'webhook' | 'agent';

/**
 * 직원 응대 시간(한국 시간) — CTI_STAFF_HOURS="09:00-18:00"(기본). 이 밖은 AI 상담원이 받는다
 * (KAT_AFTER_HOURS_AGENT_ID가 있을 때만). 매일 같은 시간을 쓴다.
 */
export function isStaffHours(now = new Date()) {
  const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(
    (process.env.CTI_STAFF_HOURS || '09:00-18:00').trim(),
  );
  const [from, to] = m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : [540, 1080];
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const min = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return min >= from && min < to;
}

/** 영업시간 외 AI 상담원 — 설정돼 있고 지금이 직원 응대 시간이 아니면 그 에이전트 ID */
export function afterHoursAgentId(now = new Date()) {
  const id = (process.env.KAT_AFTER_HOURS_AGENT_ID ?? '').trim();
  return id && !isStaffHours(now) ? id : null;
}

/**
 * 대표번호 수신 방식 자동 전환.
 * 소프트폰(동시 울림) 방식은 등록된 PC가 하나도 없으면 한국AI통신이 바로 끊는다(softphone_not_registered) —
 * 고객은 한 번 울리고 끊긴다. 그래서
 *  - 받을 상담원(상담 가능 · PC 전화 켜짐 · 콘솔 열림)이 한 명이라도 있으면 → softphone(동시 울림)
 *  - 아무도 없으면 → webhook: 안내 멘트("곧 다시 전화드리겠습니다") 후 아웃콜 대기로
 *  - 직원 응대 시간(CTI_STAFF_HOURS, 기본 09:00-18:00) 밖이면 → agent: AI 상담원이 받아 문의를 받아 둔다
 * 상담원 상태가 바뀔 때와 15초마다 맞춘다.
 *
 * 운영 서버(Render)에서만 켠다 — 로컬 개발 서버가 운영 번호를 바꾸지 않게. KAT_AUTO_ROUTING=on/off로 강제.
 */
@Injectable()
export class CtiRoutingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('CtiRouting');
  private timer: ReturnType<typeof setInterval> | null = null;
  private mode: Mode | null = null;
  /** 번호에 걸려 있던 웹훅 주소 — AI 방식으로 바꿨다 되돌릴 때 쓴다 */
  private webhookUrl: string | null = null;
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  private get enabled() {
    const flag = process.env.KAT_AUTO_ROUTING;
    if (flag === 'off') return false;
    return (
      (flag === 'on' || process.env.RENDER === 'true') &&
      !!process.env.KAT_ACCOUNT_ID &&
      !!process.env.KAT_API_KEY &&
      !!process.env.KAT_SIP_CREDENTIAL_ID
    );
  }

  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => this.sync(), TICK_MS);
    this.sync();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 지금 받을 수 있는 상담원 수 */
  async ringableCount() {
    const now = new Date();
    // 고객관리부 상담원만(다른 부서가 예전에 켜 둔 상태는 세지 않는다)
    const team = await this.prisma.employee.findMany({
      where: { isActive: true, orgUnit: CS_ORG },
      select: { id: true },
    });
    return this.prisma.csAgent.count({
      where: {
        employeeId: { in: team.map((e) => e.id) },
        available: true,
        sipUri: { not: null },
        sipUntil: { gt: now },
        seenAt: { gt: new Date(now.getTime() - SEEN_MS) },
      },
    });
  }

  /** 상태가 바뀌면 부른다 — 겹쳐 불려도 차례로 한 번씩 */
  sync() {
    if (!this.enabled) return;
    this.running = this.running.then(() => this.apply()).catch(() => undefined);
  }

  private async apply() {
    const agentId = afterHoursAgentId();
    const want: Mode = agentId
      ? 'agent'
      : (await this.ringableCount()) > 0
        ? 'softphone'
        : 'webhook';
    if (want === this.mode) return;
    const base = process.env.KAT_API_BASE || 'https://api.koreaaitel.com';
    const acct = `${base}/v1/accounts/${encodeURIComponent(process.env.KAT_ACCOUNT_ID!)}`;
    const headers = {
      Authorization: `Bearer ${process.env.KAT_API_KEY}`,
      'content-type': 'application/json',
    };
    const number = process.env.KAT_NUMBER || (await this.findNumber(acct, headers));
    if (!number) return;
    const url = `${acct}/numbers/${encodeURIComponent(number)}`;
    const cur = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: unknown }>) : null))
      .catch(() => null);
    const n = (cur?.data ?? cur) as Record<string, unknown> | null;
    if (!n) return;
    if (n.routingType === want) {
      this.mode = want;
      return;
    }
    // 다른 방식(착신 전환 등)으로 바꿔 둔 번호는 건드리지 않는다
    if (!['softphone', 'webhook', 'agent'].includes(String(n.routingType))) return;
    if (typeof n.webhookUrl === 'string' && n.webhookUrl) this.webhookUrl = n.webhookUrl;
    const webhookUrl = this.webhookUrl ?? process.env.KAT_WEBHOOK_URL ?? null;
    if (!webhookUrl) return; // 안내 멘트로 돌릴 웹훅이 없으면 그대로
    const body = {
      routingType: want,
      ...(want === 'softphone' && { sipCredentialId: process.env.KAT_SIP_CREDENTIAL_ID }),
      ...(want === 'agent' && { agentId }),
      webhookUrl,
      webhookMethod: n.webhookMethod ?? 'POST',
      statusCallback: n.statusCallback,
      statusCallbackEvents: n.statusCallbackEvents,
      recordingEnabled: n.recordingEnabled,
    };
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) {
      this.log.warn(`수신 방식 전환 실패 → ${want} (${res?.status ?? 'network'})`);
      return;
    }
    this.mode = want;
    const label = {
      softphone: '소프트폰(동시 울림)',
      webhook: '안내 멘트(받을 상담원 없음)',
      agent: 'AI 상담원(영업시간 외)',
    }[want];
    this.log.log(`수신 방식 → ${label}`);
  }

  private async findNumber(acct: string, headers: Record<string, string>) {
    const r = await fetch(`${acct}/numbers`, { headers, signal: AbortSignal.timeout(10_000) })
      .then((x) => (x.ok ? (x.json() as Promise<{ data?: unknown }>) : null))
      .catch(() => null);
    const rows = (r?.data ?? []) as {
      number: string;
      routingType: string;
      sipCredentialId?: string;
    }[];
    return (
      rows.find((x) => x.sipCredentialId === process.env.KAT_SIP_CREDENTIAL_ID)?.number ??
      rows.find((x) => ['webhook', 'softphone', 'agent'].includes(x.routingType))?.number ??
      null
    );
  }
}
