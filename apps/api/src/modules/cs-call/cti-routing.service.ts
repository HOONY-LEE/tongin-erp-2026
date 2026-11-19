import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CS_ORG } from './cs-org';

/** 상담 콘솔이 이 시간 안에 확인했으면 '켜져 있는' 상담원 */
const SEEN_MS = 30_000;
const TICK_MS = 15_000;

type Mode = 'softphone' | 'webhook';

/**
 * 대표번호 수신 방식 자동 전환.
 * 소프트폰(동시 울림) 방식은 등록된 PC가 하나도 없으면 한국AI통신이 바로 끊는다(softphone_not_registered) —
 * 고객은 한 번 울리고 끊긴다. 그래서
 *  - 받을 상담원(상담 가능 · PC 전화 켜짐 · 콘솔 열림)이 한 명이라도 있으면 → softphone(동시 울림)
 *  - 아무도 없으면 → webhook: 안내 멘트("곧 다시 전화드리겠습니다") 후 아웃콜 대기로
 * 상담원 상태가 바뀔 때와 15초마다 맞춘다.
 *
 * 운영 서버(Render)에서만 켠다 — 로컬 개발 서버가 운영 번호를 바꾸지 않게. KAT_AUTO_ROUTING=on/off로 강제.
 */
@Injectable()
export class CtiRoutingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('CtiRouting');
  private timer: ReturnType<typeof setInterval> | null = null;
  private mode: Mode | null = null;
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
    const want: Mode = (await this.ringableCount()) > 0 ? 'softphone' : 'webhook';
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
    if (n.routingType !== 'softphone' && n.routingType !== 'webhook') return;
    if (!n.webhookUrl) return; // 안내 멘트로 돌릴 웹훅이 없으면 그대로
    const body = {
      routingType: want,
      ...(want === 'softphone' && { sipCredentialId: process.env.KAT_SIP_CREDENTIAL_ID }),
      webhookUrl: n.webhookUrl,
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
    this.log.log(
      `수신 방식 → ${want === 'softphone' ? '소프트폰(동시 울림)' : '안내 멘트(받을 상담원 없음)'}`,
    );
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
      rows.find((x) => x.routingType === 'webhook' || x.routingType === 'softphone')?.number ??
      null
    );
  }
}
