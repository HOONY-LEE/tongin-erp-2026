import { Injectable } from '@nestjs/common';
import { LEAD_STATUS_LABEL, type LeadStatus } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 이력 한 줄 — 화면은 kind로 아이콘·색을, link로 이동할 화면을 정한다 */
export interface HistoryItem {
  at: string;
  kind:
    | 'sms'
    | 'customer'
    | 'call'
    | 'lead'
    | 'owner'
    | 'estimate'
    | 'contract'
    | 'payment'
    | 'work'
    | 'service'
    | 'support';
  title: string;
  detail?: string | null;
  actor?: string | null;
  link?: string | null;
}

const won = (n: unknown) => (n == null ? null : `${Number(n).toLocaleString('ko-KR')}원`);
const dur = (s: number | null) =>
  s == null ? null : s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
const statusLabel = (s: unknown) => LEAD_STATUS_LABEL[s as LeadStatus] ?? String(s ?? '');
/** 접수 경로 — 웹 leadCodes.RECEIPT_SOURCES와 같은 표기 */
const SOURCE: Record<string, string> = {
  SYSTEM: '시스템',
  HOMEPAGE: '홈페이지',
  AIBOT: 'AI상담봇',
  PHONE: '전화상담',
  NAVER: '네이버',
  INSTAGRAM: '인스타그램',
  PARTNER: '제휴사',
  WALK_IN: '방문접수',
  ETC: '기타',
};
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/**
 * 고객 이력(CRM) — 처음 들어온 날부터 통화·접수·담당자 변경·견적·계약·입금·작업·AS까지 한 줄로.
 * 따로 쌓는 표 없이 이미 남는 기록(콜·접수·견적·계약…과 도메인 이벤트)을 모아 시간순으로 만든다.
 */
@Injectable()
export class CustomerHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async history(customerId: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const phone = digits(customer.phonePrimary);

    const smsLogs = await this.prisma.csSms.findMany({
      where: { OR: [{ customerId }, ...(phone.length >= 9 ? [{ phone }] : [])] },
      orderBy: { at: 'asc' },
      take: 300,
    });
    const [calls, leads, estimates, contracts, services, tickets] = await Promise.all([
      // 고객이 붙기 전(새 번호로 받은 첫 통화)도 같은 번호면 이 고객의 통화
      this.prisma.csCall.findMany({
        where: {
          OR: [{ customerId }, ...(phone.length >= 9 ? [{ phone }] : [])],
        },
        orderBy: { receivedAt: 'asc' },
        take: 300,
      }),
      this.prisma.lead.findMany({
        where: { customerId },
        include: {
          orgUnit: { select: { name: true } },
          ownerEmp: { select: { name: true } },
          partner: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.estimate.findMany({
        where: { customerId },
        select: { id: true, estimateNo: true, leadId: true, totalAmount: true, createdAt: true },
      }),
      this.prisma.contract.findMany({
        where: { customerId },
        select: {
          id: true,
          contractNo: true,
          leadId: true,
          totalAmount: true,
          createdAt: true,
          signedAt: true,
          status: true,
        },
      }),
      this.prisma.serviceOrder.findMany({ where: { customerId } }),
      this.prisma.supportTicket.findMany({ where: { customerId } }),
    ]);
    const contractIds = contracts.map((c) => c.id);
    const [payments, works] = contractIds.length
      ? await Promise.all([
          this.prisma.payment.findMany({ where: { contractId: { in: contractIds } } }),
          this.prisma.workOrder.findMany({
            where: { contractId: { in: contractIds } },
            include: { partner: { select: { name: true } }, orgUnit: { select: { name: true } } },
          }),
        ])
      : [[], []];

    const leadIds = leads.map((l) => l.id);
    const events = await this.prisma.domainEvent.findMany({
      where: {
        OR: [
          { aggregateType: 'customer', aggregateId: customerId },
          ...(leadIds.length ? [{ aggregateType: 'lead', aggregateId: { in: leadIds } }] : []),
          ...(estimates.length
            ? [{ aggregateType: 'estimate', aggregateId: { in: estimates.map((e) => e.id) } }]
            : []),
          ...(contractIds.length
            ? [{ aggregateType: 'contract', aggregateId: { in: contractIds } }]
            : []),
          ...(works.length
            ? [{ aggregateType: 'work_order', aggregateId: { in: works.map((w) => w.id) } }]
            : []),
        ],
      },
      orderBy: { occurredAt: 'asc' },
      take: 1000,
    });

    // 이름 찾기 — 직원·지점·거래처
    const empIds = new Set<string>();
    const orgIds = new Set<string>();
    const partnerIds = new Set<string>();
    for (const c of calls) if (c.agentEmpId) empIds.add(c.agentEmpId);
    for (const m of smsLogs) if (m.employeeId) empIds.add(m.employeeId);
    for (const s of services) if (s.assignedEmpId) empIds.add(s.assignedEmpId);
    for (const t of tickets) if (t.assigneeEmpId) empIds.add(t.assigneeEmpId);
    for (const e of events) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      for (const k of ['ownerEmpId', 'employeeId', 'by', 'fromOwnerEmpId'])
        if (typeof p[k] === 'string') empIds.add(p[k] as string);
      for (const k of ['orgUnitId', 'fromOrgUnitId'])
        if (typeof p[k] === 'string') orgIds.add(p[k] as string);
      if (typeof p.partnerId === 'string') partnerIds.add(p.partnerId);
    }
    const [emps, orgs, partners, sources] = await Promise.all([
      empIds.size
        ? this.prisma.employee.findMany({
            where: { id: { in: [...empIds] } },
            select: { id: true, name: true },
          })
        : [],
      orgIds.size
        ? this.prisma.orgUnit.findMany({
            where: { id: { in: [...orgIds] } },
            select: { id: true, name: true },
          })
        : [],
      partnerIds.size
        ? this.prisma.partner.findMany({
            where: { id: { in: [...partnerIds] } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.commonCode.findMany({
        where: { codeGroup: 'RECEIPT_PATH' },
        select: { code: true, name: true },
      }),
    ]);
    const emp = (id: unknown) =>
      typeof id === 'string' ? (emps.find((x) => x.id === id)?.name ?? null) : null;
    const org = (id: unknown) =>
      typeof id === 'string' ? (orgs.find((x) => x.id === id)?.name ?? null) : null;
    const partner = (id: unknown) =>
      typeof id === 'string' ? (partners.find((x) => x.id === id)?.name ?? null) : null;
    const sourceName = (s: string | null) =>
      s ? (sources.find((x) => x.code === s)?.name ?? SOURCE[s] ?? s) : null;
    const leadNo = new Map(leads.map((l) => [l.id, l.leadNo]));
    const estNo = new Map(estimates.map((e) => [e.id, e.estimateNo]));
    const conNo = new Map(contracts.map((c) => [c.id, c.contractNo]));
    const conLead = new Map(contracts.map((c) => [c.id, c.leadId]));

    const items: HistoryItem[] = [];
    const push = (at: Date | null | undefined, it: Omit<HistoryItem, 'at'>) => {
      if (at) items.push({ at: at.toISOString(), ...it });
    };

    push(customer.createdAt, {
      kind: 'customer',
      title: '고객 등록',
      detail: (() => {
        const ev = events.find((e) => e.eventType === 'customer.created');
        const via = (ev?.payload as { via?: string } | null)?.via;
        return via === 'lead'
          ? '접수 등록 때 자동으로 등록'
          : via === 'customer'
            ? '고객관리에서 직접 등록'
            : null;
      })(),
    });

    for (const c of calls) {
      const missed = c.channel?.includes('부재중');
      const outgoing = c.attempts > 0 || c.status === 'CALLBACK';
      push(c.receivedAt, {
        kind: 'call',
        title: missed ? '부재중 전화' : outgoing ? '전화 (콜백)' : '전화 받음',
        detail: [
          c.channel ?? '대표번호',
          dur(c.durationSec),
          c.request ?? c.memo,
          c.leadId && leadNo.get(c.leadId) ? `접수 ${leadNo.get(c.leadId)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        actor: emp(c.agentEmpId),
        link: `/callcenter/${c.id}`,
      });
    }

    for (const m of smsLogs)
      push(m.at, {
        kind: 'sms',
        title: m.ok ? '문자 보냄' : '문자 실패',
        detail: [m.title, m.body.replace(/\s+/g, ' ').slice(0, 80), m.ok ? null : m.reason]
          .filter(Boolean)
          .join(' · '),
        actor: emp(m.employeeId),
      });

    for (const l of leads) {
      push(l.createdAt, {
        kind: 'lead',
        title: `접수 ${l.leadNo}`,
        detail: [
          sourceName(l.source) && `유입 ${sourceName(l.source)}`,
          l.orgUnit?.name,
          l.partner?.name && `제휴 ${l.partner.name}`,
          l.moveDate && `이사 ${l.moveDate.toISOString().slice(0, 10)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        actor: emp(
          (
            events.find((e) => e.aggregateId === l.id && e.eventType === 'lead.created')
              ?.payload as { by?: string } | null
          )?.by,
        ),
        link: `/leads/${l.id}`,
      });
    }

    for (const e of events) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const by = emp(p.by);
      const at = e.occurredAt;
      switch (e.eventType) {
        case 'lead.assigned':
          push(at, {
            kind: 'owner',
            title: p.fromOwnerEmpId
              ? `담당자 변경 ${emp(p.fromOwnerEmpId) ?? '-'} → ${emp(p.ownerEmpId) ?? '-'}`
              : `담당자 배정 ${emp(p.ownerEmpId) ?? '-'}`,
            detail: [leadNo.get(e.aggregateId), org(p.orgUnitId)].filter(Boolean).join(' · '),
            actor: by,
            link: `/leads/${e.aggregateId}`,
          });
          break;
        case 'lead.org_changed':
          push(at, {
            kind: 'owner',
            title: `담당 지점 변경 ${org(p.fromOrgUnitId) ?? '-'} → ${org(p.orgUnitId) ?? '-'}`,
            detail: leadNo.get(e.aggregateId),
            actor: by,
            link: `/leads/${e.aggregateId}`,
          });
          break;
        case 'lead.rejected':
          push(at, {
            kind: 'owner',
            title: `지점 반려 ${org(p.fromOrgUnitId) ?? '-'} → 본사`,
            detail: [leadNo.get(e.aggregateId), p.kind, p.reason].filter(Boolean).join(' · '),
            actor: by,
            link: `/leads/${e.aggregateId}`,
          });
          break;
        case 'lead.canceled':
          push(at, {
            kind: 'lead',
            title: `접수 취소 (${String(p.kind ?? '')})`,
            detail: [leadNo.get(e.aggregateId), p.reason].filter(Boolean).join(' · '),
            actor: by,
            link: `/leads/${e.aggregateId}`,
          });
          break;
        case 'lead.status_changed':
          push(at, {
            kind: 'lead',
            title: `진행 ${statusLabel(p.from)} → ${statusLabel(p.to)}`,
            detail: leadNo.get(e.aggregateId),
            actor: by,
            link: `/leads/${e.aggregateId}`,
          });
          break;
        case 'estimate.created':
          push(at, {
            kind: 'estimate',
            title: `견적 작성 ${estNo.get(e.aggregateId) ?? ''}`.trim(),
            actor: by,
            link: `/estimates/${e.aggregateId}`,
          });
          break;
        case 'estimate.quoted':
          push(at, {
            kind: 'estimate',
            title: `견적 완료 ${estNo.get(e.aggregateId) ?? ''}`.trim(),
            detail: won(estimates.find((x) => x.id === e.aggregateId)?.totalAmount),
            actor: by,
            link: `/estimates/${e.aggregateId}`,
          });
          break;
        case 'estimate.sent':
          push(at, {
            kind: 'estimate',
            title: '견적서·계약서 보냄',
            detail: [estNo.get(e.aggregateId), p.ok === false ? '발송 실패' : null]
              .filter(Boolean)
              .join(' · '),
            actor: by,
            link: `/estimates/${e.aggregateId}`,
          });
          break;
        case 'contract.created':
          push(at, {
            kind: 'contract',
            title: `계약 생성 ${conNo.get(e.aggregateId) ?? ''}`.trim(),
            detail: won(p.total),
            actor: by,
            link: conLead.get(e.aggregateId) ? `/leads/${conLead.get(e.aggregateId)}` : null,
          });
          break;
        case 'contract.signed':
          push(at, {
            kind: 'contract',
            title: '계약 서명',
            detail: conNo.get(e.aggregateId),
            link: conLead.get(e.aggregateId) ? `/leads/${conLead.get(e.aggregateId)}` : null,
          });
          break;
        case 'work_order.created':
          push(at, {
            kind: 'work',
            title: `작업 지시 ${String(p.workNo ?? '')}`.trim(),
            detail: (() => {
              const w = works.find((x) => x.id === e.aggregateId);
              return [w?.orgUnit?.name, w?.scheduledDate?.toISOString().slice(0, 10)]
                .filter(Boolean)
                .join(' · ');
            })(),
            actor: by,
          });
          break;
        case 'work_order.assigned':
          push(at, {
            kind: 'work',
            title: `작업 배정 ${emp(p.employeeId) ?? partner(p.partnerId) ?? ''}`.trim(),
            detail: [p.workNo, p.scheduledDate].filter(Boolean).join(' · '),
            actor: by,
          });
          break;
      }
    }

    for (const p of payments) {
      const kind = p.kind === 'DEPOSIT' ? '계약금' : p.kind === 'BALANCE' ? '잔금' : p.kind;
      push(p.createdAt, {
        kind: 'payment',
        title: `${kind} 청구`,
        detail: won(p.amount),
      });
      if (p.paidAt)
        push(p.paidAt, { kind: 'payment', title: `${kind} 입금 확인`, detail: won(p.amount) });
    }
    for (const w of works) {
      if (w.status === 'DONE')
        push(w.scheduledDate ?? null, { kind: 'work', title: `작업 완료 ${w.workNo}` });
    }
    for (const s of services)
      push(s.createdAt, {
        kind: 'service',
        title: `부가 서비스 ${s.orderNo}`,
        detail: [s.note, won(s.amount)].filter(Boolean).join(' · '),
        actor: emp(s.assignedEmpId),
      });
    for (const t of tickets)
      push(t.createdAt, {
        kind: 'support',
        title: `${t.kind === 'AS' ? 'AS' : '문의'} ${t.ticketNo}`,
        detail: t.content,
        actor: emp(t.assigneeEmpId),
      });

    items.sort((a, b) => b.at.localeCompare(a.at));

    // 요약 — 처음 들어온 길·지금 담당자·건수
    const firstCall = calls[0];
    const firstLead = leads[0];
    const firstAt = [firstCall?.receivedAt, firstLead?.createdAt, customer.createdAt]
      .filter((x): x is Date => !!x)
      .sort((a, b) => +a - +b)[0];
    const lastLead = leads[leads.length - 1];
    return {
      summary: {
        firstAt: firstAt?.toISOString() ?? null,
        firstChannel:
          firstCall && (!firstLead || firstCall.receivedAt <= firstLead.createdAt)
            ? `전화 (${firstCall.channel ?? '대표번호'})`
            : (sourceName(firstLead?.source ?? null) ?? null),
        stage: lastLead ? statusLabel(lastLead.status) : null,
        owner: lastLead?.ownerEmp?.name ?? null,
        orgUnit: lastLead?.orgUnit?.name ?? null,
        calls: calls.length,
        leads: leads.length,
        estimates: estimates.length,
        contracts: contracts.filter((c) => c.status !== 'CANCELED').length,
        paid: payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount), 0),
      },
      items,
    };
  }
}
