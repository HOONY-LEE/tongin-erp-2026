import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  LEAD_STATUS,
  LEAD_STATUS_LABEL,
  type AuthPrincipal,
  type LeadStatus,
} from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { StubNotificationProvider } from '../notifications/notification.provider';
import { BranchAnomalyService } from '../modules/stats/branch-anomaly.service';
import { ToolError, type AiTool } from './ai-tool.types';

/**
 * AI 전용 업무 도구 — API 카탈로그(라우트 그대로)로는 한 번에 못 하는 일을 묶었다.
 * - search_leads: 상태·기간·계약 여부로 접수를 걸러 고객 연락처까지 한 번에
 * - search_customers: 이름·전화번호 일부로 고객 찾기
 * - send_sms: 고객에게 문자 발송(승인 필요). 번호는 AI가 적지 않고 고객 id로 DB에서 꺼낸다 —
 *   잘못 지어낸 번호나 다른 지점 고객에게 나가는 일을 막는다.
 * - find_suspicious_branches: 견적은 냈는데 미계약으로 남겨 수수료를 피하는 의심 지점 찾기
 */

const CONTRACTED_FROM = LEAD_STATUS.indexOf('CONTRACTED');
/** 계약 전 단계(접수~견적완료) — "미계약" */
const BEFORE_CONTRACT = LEAD_STATUS.slice(0, CONTRACTED_FROM) as LeadStatus[];
/** 계약 이후 단계(계약~완료, 취소 제외) */
const AFTER_CONTRACT = LEAD_STATUS.slice(CONTRACTED_FROM).filter((s) => s !== 'CANCELED');

const SMS_MAX_RECIPIENTS = 300;
const NAME_TOKEN = '{고객명}';

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
/** 'YYYY-MM-DD'를 한국 시간 하루의 시작·끝으로 */
const kstStart = (s: string) => new Date(`${s}T00:00:00+09:00`);
const kstEnd = (s: string) => new Date(`${s}T23:59:59.999+09:00`);
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

@Injectable()
export class DomainTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly provider: StubNotificationProvider,
  ) {
    // AiModule을 건드리지 않으려고 직접 만든다(같은 Prisma·Scope 서비스를 쓴다)
    this.anomaly = new BranchAnomalyService(prisma, scope);
  }

  private readonly anomaly: BranchAnomalyService;

  list(): AiTool[] {
    return [
      this.searchLeads(),
      this.searchCustomers(),
      this.sendSms(),
      this.findSuspiciousBranches(),
    ];
  }

  private findSuspiciousBranches(): AiTool {
    return {
      name: 'find_suspicious_branches',
      description:
        '이상 지점 탐지(수수료 누락·매출 누락·계약 은폐 의심). 견적은 냈는데 전산에는 미계약·상담토스·견적완료로 남겨 두고 ' +
        '본사 수수료를 안 내는 가맹점을 찾는다 — 미계약·토스 건은 많은데 계약 매출은 낮은 지점. ' +
        '지점별로 견적→계약 전환율, 14일 넘게 멈춘 건, 이사일이 이미 지났는데 미계약인 건(가장 강한 신호), 접수당 매출을 ' +
        '다른 지점 중앙값과 비교해 의심 점수(0~100)·등급(정상/주의/의심)·사유·누락 추정 매출·추정 미납 수수료·근거 접수번호를 준다. ' +
        '"수수료 안 내려고 계약 숨기는 지점", "미계약이 이상하게 많은 지점", "매출 누락 의심 가맹점" 같은 질문에 쓴다. ' +
        '기간은 접수일 기준 from~to(YYYY-MM-DD, 기본 최근 180일).',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date', description: '접수일 시작(기본 180일 전)' },
          to: { type: 'string', format: 'date', description: '접수일 끝(기본 오늘)' },
          minLeads: {
            type: 'integer',
            minimum: 1,
            maximum: 200,
            description: '이보다 접수가 적은 지점은 표본이 작아 제외(기본 5)',
          },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: '상위 몇 곳(기본 5)' },
        },
      },
      mode: 'READ',
      permissions: ['STATS.READ'],
      deferred: false,
      run: async (input, ctx) => {
        for (const k of ['from', 'to'] as const) {
          if (input[k] !== undefined && !isYmd(input[k])) {
            throw new ToolError(`${k}는 YYYY-MM-DD 형식이어야 합니다.`);
          }
        }
        const r = await this.anomaly.analyze(
          {
            from: input.from as string | undefined,
            to: input.to as string | undefined,
            minLeads: input.minLeads === undefined ? undefined : Number(input.minLeads) || 5,
          },
          ctx.principal,
        );
        const limit = Math.min(Math.max(Number(input.limit ?? 5) || 5, 1), 50);
        const won = (v: number) => Math.round(v).toLocaleString();
        return {
          period: `${r.from} ~ ${r.to}`,
          analyzedBranches: r.baseline.branchCount,
          baselineSource:
            r.baselineSource === 'PEERS' ? '비교 지점 중앙값' : '본사 기준값(비교 지점 부족)',
          excludedSmallBranches: r.excludedSmallBranches,
          baseline: {
            견적계약전환율: `${Math.round(r.baseline.conversionRate * 100)}%`,
            이사일지난미계약비율: `${Math.round(r.baseline.pastMoveOpenRate * 100)}%`,
            멈춘건비율: `${Math.round(r.baseline.stalledRate * 100)}%`,
            접수당매출: won(r.baseline.revenuePerLead),
          },
          flagged: r.branches.filter((b) => b.level !== 'NORMAL').length,
          top: r.branches.slice(0, limit).map((b) => ({
            branch: b.orgUnitName,
            orgUnitId: b.orgUnitId,
            score: b.score,
            level: { NORMAL: '정상', WATCH: '주의', SUSPECT: '의심' }[b.level],
            reasons: b.reasons,
            metrics: {
              접수: b.metrics.leadCount,
              견적: b.metrics.quotedCount,
              계약: b.metrics.contractCount,
              전환율: `${Math.round(b.metrics.conversionRate * 100)}%`,
              멈춘건: b.metrics.stalledCount,
              이사일지난미계약: b.metrics.pastMoveOpenCount,
              견적합: won(b.metrics.quotedAmount),
              계약매출: won(b.metrics.revenue),
              누락추정매출: won(b.metrics.missingRevenue),
              추정미납수수료: won(b.metrics.commissionAtRisk),
            },
            evidence: b.evidence.map(
              (e) =>
                `${e.leadNo} ${e.customerName ?? ''} ${BranchAnomalyService.statusLabel(e.status)} ` +
                `이사일 ${e.moveDate ?? '-'} 견적 ${won(e.estimateAmount)}`,
            ),
          })),
          commissionNote: r.commissionNote,
          method: r.method,
        };
      },
    };
  }

  private searchLeads(): AiTool {
    return {
      name: 'search_leads',
      description:
        '접수(리드)를 조건으로 걸러 고객 이름·연락처·진행상태·최근 견적까지 한 번에 돌려준다. ' +
        '"이번 주 미계약 고객", "견적만 받고 계약 안 한 고객", "다음 주 이사 예정" 같은 대상 고르기에 쓴다. ' +
        'contracted=false는 접수~견적완료(계약 전, 취소 제외), true는 계약 이후 단계다. ' +
        '기간은 dateField(접수일 createdAt·상담일 visitDate·이사일 moveDate) 기준 from~to(YYYY-MM-DD, 양 끝 포함, 한국 시간).',
      inputSchema: {
        type: 'object',
        properties: {
          contracted: { type: 'boolean', description: 'false=미계약(계약 전), true=계약 이후' },
          statuses: {
            type: 'array',
            items: { type: 'string', enum: [...LEAD_STATUS] },
            description: `특정 상태만. ${LEAD_STATUS.map((s) => `${s}=${LEAD_STATUS_LABEL[s]}`).join(', ')}`,
          },
          dateField: { type: 'string', enum: ['createdAt', 'visitDate', 'moveDate'] },
          from: { type: 'string', format: 'date' },
          to: { type: 'string', format: 'date' },
          orgUnitId: { type: 'string', description: '지점 id(선택)' },
          ownerEmpId: { type: 'string', description: '담당 직원 id(선택)' },
          keyword: { type: 'string', description: '고객명·전화번호·접수번호 일부' },
          limit: { type: 'integer', minimum: 1, maximum: 200, description: '기본 50' },
        },
      },
      mode: 'READ',
      permissions: ['LEAD.READ'],
      deferred: false,
      run: async (input, ctx) => {
        const where = await this.leadWhere(input, ctx.principal);
        const take = Math.min(Number(input.limit ?? 50) || 50, 200);
        const [total, rows] = await Promise.all([
          this.prisma.lead.count({ where }),
          this.prisma.lead.findMany({
            where,
            take,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              leadNo: true,
              status: true,
              createdAt: true,
              visitDate: true,
              moveDate: true,
              fromAddr: true,
              toAddr: true,
              customer: { select: { id: true, name: true, phonePrimary: true } },
              orgUnit: { select: { name: true } },
              ownerEmp: { select: { name: true } },
              estimates: {
                select: { estimateNo: true, status: true, totalAmount: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          }),
        ]);
        return {
          total,
          returned: rows.length,
          rows: rows.map((l) => ({
            leadId: l.id,
            leadNo: l.leadNo,
            status: `${l.status}(${LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status})`,
            customerId: l.customer?.id ?? null,
            customerName: l.customer?.name ?? null,
            phone: l.customer?.phonePrimary ?? null,
            orgUnit: l.orgUnit.name,
            owner: l.ownerEmp?.name ?? null,
            receivedAt: l.createdAt.toISOString(),
            visitDate: ymd(l.visitDate),
            moveDate: ymd(l.moveDate),
            from: l.fromAddr,
            to: l.toAddr,
            latestEstimate: l.estimates[0]
              ? {
                  no: l.estimates[0].estimateNo,
                  status: l.estimates[0].status,
                  totalAmount: Number(l.estimates[0].totalAmount ?? 0),
                }
              : null,
          })),
        };
      },
    };
  }

  private async leadWhere(input: Record<string, unknown>, principal: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    const and: Prisma.LeadWhereInput[] = [];
    if (ids !== null) and.push({ orgUnitId: { in: ids } });
    if (typeof input.orgUnitId === 'string') and.push({ orgUnitId: input.orgUnitId });
    if (typeof input.ownerEmpId === 'string') and.push({ ownerEmpId: input.ownerEmpId });
    if (Array.isArray(input.statuses) && input.statuses.length) {
      and.push({ status: { in: input.statuses as string[] } });
    }
    if (input.contracted === false) and.push({ status: { in: BEFORE_CONTRACT } });
    if (input.contracted === true) and.push({ status: { in: AFTER_CONTRACT } });

    const field = (input.dateField as string) ?? 'createdAt';
    if (!['createdAt', 'visitDate', 'moveDate'].includes(field)) {
      throw new ToolError('dateField는 createdAt·visitDate·moveDate 중 하나입니다.');
    }
    for (const k of ['from', 'to'] as const) {
      if (input[k] !== undefined && !isYmd(input[k])) {
        throw new ToolError(`${k}는 YYYY-MM-DD 형식이어야 합니다.`);
      }
    }
    if (isYmd(input.from) || isYmd(input.to)) {
      // 접수일은 시각까지 있는 값이라 한국 시간 하루 범위로, 상담일·이사일은 날짜 값 그대로
      const range =
        field === 'createdAt'
          ? {
              ...(isYmd(input.from) ? { gte: kstStart(input.from) } : {}),
              ...(isYmd(input.to) ? { lte: kstEnd(input.to) } : {}),
            }
          : {
              ...(isYmd(input.from) ? { gte: new Date(input.from) } : {}),
              ...(isYmd(input.to) ? { lte: new Date(input.to) } : {}),
            };
      and.push({ [field]: range });
    }

    const kw = typeof input.keyword === 'string' ? input.keyword.trim() : '';
    if (kw) {
      const digits = kw.replace(/\D/g, '');
      and.push({
        OR: [
          { leadNo: { contains: kw, mode: 'insensitive' } },
          { customer: { name: { contains: kw } } },
          ...(digits.length >= 3 ? [{ customer: { phonePrimary: { contains: digits } } }] : []),
          ...(digits.length >= 3 ? [{ customer: { phonePrimary: { contains: kw } } }] : []),
        ],
      });
    }
    return { AND: and } satisfies Prisma.LeadWhereInput;
  }

  private searchCustomers(): AiTool {
    return {
      name: 'search_customers',
      description:
        '고객 원장에서 이름·전화번호 일부·등급으로 고객을 찾는다. 고객 id·연락처·주소·접수 건수를 돌려준다.',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '이름 또는 전화번호 일부' },
          grade: { type: 'string', description: '고객 등급(선택)' },
          limit: { type: 'integer', minimum: 1, maximum: 200, description: '기본 30' },
        },
      },
      mode: 'READ',
      permissions: ['CUSTOMER.READ'],
      deferred: true,
      run: async (input, ctx) => {
        const where = await this.customerScope(ctx.principal);
        const and: Prisma.CustomerWhereInput[] = where ? [where] : [];
        const kw = typeof input.keyword === 'string' ? input.keyword.trim() : '';
        if (kw) {
          const digits = kw.replace(/\D/g, '');
          and.push({
            OR: [
              { name: { contains: kw } },
              ...(digits.length >= 3 ? [{ phonePrimary: { contains: digits } }] : []),
              ...(digits.length >= 3 ? [{ phonePrimary: { contains: kw } }] : []),
            ],
          });
        }
        if (typeof input.grade === 'string') and.push({ grade: input.grade });
        const rows = await this.prisma.customer.findMany({
          where: { AND: and },
          take: Math.min(Number(input.limit ?? 30) || 30, 200),
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            phonePrimary: true,
            grade: true,
            addr: true,
            ownerOrg: { select: { name: true } },
            _count: { select: { leads: true, contracts: true } },
          },
        });
        return rows.map((c) => ({
          customerId: c.id,
          name: c.name,
          phone: c.phonePrimary,
          grade: c.grade,
          addr: c.addr,
          orgUnit: c.ownerOrg?.name ?? null,
          leadCount: c._count.leads,
          contractCount: c._count.contracts,
        }));
      },
    };
  }

  /** 승인 카드에서 받는 사람을 더할 때 — 이름·번호 일부로 범위 안 고객(번호 있는 사람만) */
  async findCustomers(keyword: string, principal: AuthPrincipal) {
    const scope = await this.customerScope(principal);
    const kw = keyword.trim();
    if (!kw) return [];
    const digits = kw.replace(/\D/g, '');
    const rows = await this.prisma.customer.findMany({
      where: {
        AND: [
          ...(scope ? [scope] : []),
          { phonePrimary: { not: null } },
          {
            OR: [
              { name: { contains: kw } },
              ...(digits.length >= 3 ? [{ phonePrimary: { contains: digits } }] : []),
              ...(digits.length >= 3 ? [{ phonePrimary: { contains: kw } }] : []),
            ],
          },
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, phonePrimary: true },
    });
    return rows.map((c) => ({ customerId: c.id, name: c.name, phone: c.phonePrimary }));
  }

  /** 고객 접근 범위: 담당 지점이 내 조직이거나, 내 조직 접수에 걸린 고객 */
  private async customerScope(principal: AuthPrincipal): Promise<Prisma.CustomerWhereInput | null> {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids === null) return null;
    return {
      OR: [{ ownerOrgId: { in: ids } }, { leads: { some: { orgUnitId: { in: ids } } } }],
    };
  }

  /** 문자 대상 고객을 DB에서 꺼낸다 — 범위 밖·번호 없는 고객은 따로 알려 준다 */
  private async resolveRecipients(input: Record<string, unknown>, principal: AuthPrincipal) {
    const ids = Array.isArray(input.customerIds)
      ? [...new Set(input.customerIds.filter((v): v is string => typeof v === 'string'))]
      : [];
    if (!ids.length) throw new ToolError('customerIds가 비어 있습니다.');
    if (ids.length > SMS_MAX_RECIPIENTS) {
      throw new ToolError(`한 번에 ${SMS_MAX_RECIPIENTS}명까지 보낼 수 있습니다.`);
    }
    const scope = await this.customerScope(principal);
    const found = await this.prisma.customer.findMany({
      where: { AND: [{ id: { in: ids } }, ...(scope ? [scope] : [])] },
      select: { id: true, name: true, phonePrimary: true },
    });
    const sendable = found.filter((c) => c.phonePrimary);
    const foundIds = new Set(found.map((c) => c.id));
    return {
      sendable,
      noPhone: found.filter((c) => !c.phonePrimary).map((c) => c.name),
      notFound: ids.filter((id) => !foundIds.has(id)),
    };
  }

  private sendSms(): AiTool {
    return {
      name: 'send_sms',
      description:
        '고객에게 문자(SMS)를 보낸다. 받는 사람은 고객 id(customerIds)로만 지정하고, 번호는 시스템이 고객 원장에서 꺼낸다. ' +
        `본문의 ${NAME_TOKEN}는 고객마다 이름으로 바뀐다. 실행 전에 사용자 승인 화면이 뜬다. ` +
        `한 번에 최대 ${SMS_MAX_RECIPIENTS}명. 대상은 먼저 search_leads·search_customers로 고른다.`,
      inputSchema: {
        type: 'object',
        properties: {
          customerIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: SMS_MAX_RECIPIENTS,
          },
          message: {
            type: 'string',
            minLength: 1,
            maxLength: 1000,
            description: `문자 본문. 첫머리에 [통인익스프레스]. ${NAME_TOKEN} 사용 가능`,
          },
          purpose: { type: 'string', description: '발송 목적 한 줄(기록용)' },
        },
        required: ['customerIds', 'message'],
      },
      mode: 'WRITE',
      permissions: ['NOTIFICATION.SEND'],
      deferred: false,
      summarize: (input) =>
        `문자 ${Array.isArray(input.customerIds) ? input.customerIds.length : 0}명 발송`,
      preview: async (input, ctx) => {
        const r = await this.resolveRecipients(input, ctx.principal);
        return {
          message: String(input.message ?? ''),
          recipients: r.sendable.map((c) => ({
            customerId: c.id,
            name: c.name,
            phone: c.phonePrimary,
          })),
          skipped: [
            ...r.noPhone.map((n) => `${n}(번호 없음)`),
            ...(r.notFound.length ? [`조회 불가 ${r.notFound.length}명`] : []),
          ],
        };
      },
      run: async (input, ctx) => {
        const message = String(input.message ?? '').trim();
        if (!message) throw new ToolError('문자 본문이 비어 있습니다.');
        const r = await this.resolveRecipients(input, ctx.principal);
        if (!r.sendable.length) throw new ToolError('보낼 수 있는 고객(번호 보유)이 없습니다.');
        let sent = 0;
        const failures: { name: string; reason: string }[] = [];
        for (const c of r.sendable) {
          const text = message.split(NAME_TOKEN).join(c.name);
          const res = await this.provider.send('SMS', c.phonePrimary, text);
          await this.prisma.notification.create({
            data: {
              channel: 'SMS',
              eventType: 'ai.sms',
              recipient: c.phonePrimary,
              message: text,
              status: res.ok ? 'SENT' : 'FAILED',
              payload: {
                customerId: c.id,
                sentBy: ctx.principal.userId,
                purpose: typeof input.purpose === 'string' ? input.purpose : null,
                ...(res.reason ? { reason: res.reason } : {}),
              },
            },
          });
          if (res.ok) sent++;
          else failures.push({ name: c.name, reason: res.reason ?? '발송 실패' });
        }
        return {
          // 직원이 승인 화면에서 명단을 고칠 수 있어서, 실제로 보낸 사람을 이름으로 돌려준다
          sentTo: r.sendable
            .filter((c) => !failures.some((f) => f.name === c.name))
            .slice(0, 100)
            .map((c) => c.name),
          sent,
          failed: failures.length,
          failures,
          skippedNoPhone: r.noPhone,
          notFoundCount: r.notFound.length,
          note: this.provider.smsVendor
            ? `${this.provider.smsVendor}로 실제 발송함`
            : '문자 발송사 미연결 — 실제 전송 없이 기록만 남김',
        };
      },
    };
  }
}
