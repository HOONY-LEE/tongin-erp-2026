import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LEAD_STATUS_LABEL,
  type AnomalyLevel,
  type AuthPrincipal,
  type BranchAnomaly,
  type BranchAnomalyEvidence,
  type BranchAnomalyMetrics,
  type BranchAnomalyReport,
  type LeadStatus,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';

/**
 * CRM-01b: 이상 지점 탐지 — "견적은 받아놓고 전산 밖에서 계약해 본사 수수료를 피하는" 지점을 찾는다.
 *
 * 방법(지점마다 기간 내 접수 기준):
 *  1) 지표: 견적→계약 전환율, 14일 넘게 계약 전 단계에 멈춘 건 비율, 이사일이 지났는데 아직 미계약인 건 비율,
 *     접수당 매출. 접수가 minLeads 미만인 지점은 표본이 작아 빼고(오탐 방지) 비교 기준에서도 뺀다.
 *  2) 비교: 분석 대상 지점들의 중앙값·MAD(중앙절대편차)로 강건 z-점수를 낸다. 평균·표준편차는 이상치
 *     지점 자신에게 끌려가서 쓰지 않는다. MAD가 0에 가까우면(대부분 지점이 0건 등) 지표별 최소 척도를 쓴다.
 *  3) 점수: 나쁜 방향의 z만(0~6으로 자름) 가중합해 0~100. 가중치 — 이사일 지난 미계약 35(가장 강한 신호:
 *     고객은 이미 이사했는데 계약이 없다), 전환율 25, 멈춘 건 20, 접수당 매출 20. 60↑ 의심, 35↑ 주의.
 *  4) 누락 추정 매출 = 이사일 지난 미계약 건의 최신 견적 합(상한 추정). 미납 수수료 = 그 × 지점 수수료율
 *     (정산의 수수료 규칙, 없으면 기본 10%).
 * 통계적 신호일 뿐 부정의 증거는 아니다 — 근거 접수번호를 보고 현장 확인이 필요하다.
 */

const OPEN_STATUSES = ['RECEIVED', 'CONSULT_ASSIGNED', 'CONSULT_TOSS', 'QUOTED'];
const CONTRACT_STAGE = ['CONTRACTED', 'WORK_TOSS', 'IN_PROGRESS', 'DONE'];
const STALL_DAYS = 14;
const DEFAULT_PERIOD_DAYS = 180;
const DEFAULT_MIN_LEADS = 5;
const DEFAULT_COMMISSION_RATE = 0.1;
const WEIGHTS = { pastMove: 35, conversion: 25, stalled: 20, revenue: 20 } as const;
/** 비교 지점이 이보다 적으면 본사 기준값과 비교한다 */
const MIN_PEERS = 3;
const DEFAULT_BASELINE = { conversionRate: 0.6, stalledRate: 0, pastMoveOpenRate: 0 } as const;

const DAY = 86_400_000;
/** 한국 시간 오늘(UTC 자정 Date) — DATE 컬럼(이사일)과 바로 비교한다 */
const kstToday = () =>
  new Date(`${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}`);
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const man = (v: number) =>
  v >= 1e8 ? `${(v / 1e8).toFixed(1)}억원` : `${Math.round(v / 1e4).toLocaleString()}만원`;

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** 중앙값·척도(1.4826×MAD, 최소 floor) */
function robust(xs: number[], floor: (med: number) => number) {
  const med = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - med)));
  return { med, scale: Math.max(1.4826 * mad, floor(med), 1e-9) };
}
/** z를 0~Z_CAP으로 잘라 둔다 — 그 이상은 '충분히 이상함'으로 본다 */
const Z_CAP = 6;
const clampZ = (z: number) => Math.max(0, Math.min(Z_CAP, z));

interface Options {
  from?: string;
  to?: string;
  minLeads?: number;
}

@Injectable()
export class BranchAnomalyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async analyze(opts: Options = {}, principal?: AuthPrincipal): Promise<BranchAnomalyReport> {
    for (const k of ['from', 'to'] as const) {
      if (opts[k] !== undefined && !isYmd(opts[k])) {
        throw new BadRequestException(`${k}는 YYYY-MM-DD 형식이어야 합니다.`);
      }
    }
    const today = kstToday();
    const to = opts.to ?? ymd(today);
    const from = opts.from ?? ymd(new Date(today.getTime() - DEFAULT_PERIOD_DAYS * DAY));
    const minLeads = Math.max(1, Math.floor(opts.minLeads ?? DEFAULT_MIN_LEADS));

    const ids = await this.scope.orgScopeIds(principal);
    const org = ids === null ? {} : { orgUnitId: { in: ids } };
    const [leads, units, rules] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          ...org,
          orgUnit: { type: 'BRANCH' },
          createdAt: {
            gte: new Date(`${from}T00:00:00+09:00`),
            lte: new Date(`${to}T23:59:59.999+09:00`),
          },
        },
        select: {
          leadNo: true,
          status: true,
          orgUnitId: true,
          createdAt: true,
          visitDate: true,
          moveDate: true,
          customer: { select: { name: true } },
          estimates: {
            select: { totalAmount: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          contracts: { where: { status: 'SIGNED' }, select: { totalAmount: true } },
        },
      }),
      this.prisma.orgUnit.findMany({
        where: { type: 'BRANCH', ...(ids === null ? {} : { id: { in: ids } }) },
        select: { id: true, name: true, sido: true },
      }),
      this.prisma.commissionRule.findMany({
        where: { isActive: true, source: null },
        orderBy: { priority: 'desc' },
      }),
    ]);

    // ── 1) 지점별 지표 ──
    type Acc = {
      metrics: BranchAnomalyMetrics;
      pastMove: BranchAnomalyEvidence[];
      stalled: BranchAnomalyEvidence[];
    };
    const acc = new Map<string, Acc>();
    const stallBefore = today.getTime() - STALL_DAYS * DAY;
    for (const l of leads) {
      let a = acc.get(l.orgUnitId);
      if (!a) {
        a = { metrics: blankMetrics(), pastMove: [], stalled: [] };
        acc.set(l.orgUnitId, a);
      }
      const m = a.metrics;
      const estimate = Number(l.estimates[0]?.totalAmount ?? 0);
      const signed = l.contracts.length > 0;
      m.leadCount++;
      if (l.estimates.length) {
        m.quotedCount++;
        m.quotedAmount += estimate;
      }
      if (signed) {
        m.contractCount++;
        m.revenue += l.contracts.reduce((s, c) => s + Number(c.totalAmount), 0);
      }
      const ev: BranchAnomalyEvidence = {
        leadNo: l.leadNo,
        status: l.status as LeadStatus,
        customerName: l.customer?.name ?? null,
        moveDate: l.moveDate ? ymd(l.moveDate) : null,
        estimateAmount: estimate,
      };
      const open = OPEN_STATUSES.includes(l.status);
      const lastTouch = (l.visitDate ?? l.createdAt).getTime();
      // 계약 전 단계에 오래 멈춤 + 전산상 계약 단계인데 서명된 계약서가 없음
      if ((open && lastTouch < stallBefore) || (CONTRACT_STAGE.includes(l.status) && !signed)) {
        m.stalledCount++;
        a.stalled.push(ev);
      }
      if (open && l.moveDate && l.moveDate.getTime() < today.getTime()) {
        m.pastMoveOpenCount++;
        m.missingRevenue += estimate;
        a.pastMove.push(ev);
      }
    }

    const unitById = new Map(units.map((u) => [u.id, u]));
    const all = [...acc.entries()].filter(([id]) => unitById.has(id));
    for (const [id, a] of all) {
      const m = a.metrics;
      m.conversionRate = m.quotedCount ? m.contractCount / m.quotedCount : 0;
      m.stalledRate = m.stalledCount / m.leadCount;
      m.pastMoveOpenRate = m.pastMoveOpenCount / m.leadCount;
      m.revenuePerLead = Math.round(m.revenue / m.leadCount);
      const rule = rules.find(
        (r) =>
          (r.orgUnitId == null || r.orgUnitId === id) &&
          (r.serviceLine == null || r.serviceLine === 'MOVING'),
      );
      if (rule?.calcType === 'FIXED') {
        m.commissionRate = m.missingRevenue
          ? (Number(rule.fixedAmount ?? 0) * m.pastMoveOpenCount) / m.missingRevenue
          : 0;
        m.commissionAtRisk = Number(rule.fixedAmount ?? 0) * m.pastMoveOpenCount;
      } else {
        m.commissionRate = rule ? Number(rule.rate ?? 0) : DEFAULT_COMMISSION_RATE;
        m.commissionAtRisk = Math.round(m.missingRevenue * m.commissionRate);
      }
    }

    // ── 2) 비교 기준: 표본이 충분한 지점만 ──
    const eligible = all.filter(([, a]) => a.metrics.leadCount >= minLeads);
    const ms = eligible.map(([, a]) => a.metrics);
    // 범위 안 지점이 너무 적으면(지점장 본인 지점만 보는 경우 등) 자기 자신과 비교하게 되므로
    // 본사 경험치 기준(전환율 60%, 멈춘 건·이사일 지난 미계약 0%)과 비교하고 접수당 매출은 뺀다.
    const peers = eligible.length >= MIN_PEERS;
    const fixed = (med: number, scale: number) => ({ med, scale });
    const base = peers
      ? {
          conversion: robust(
            ms.filter((m) => m.quotedCount > 0).map((m) => m.conversionRate),
            () => 0.1,
          ),
          stalled: robust(
            ms.map((m) => m.stalledRate),
            () => 0.1,
          ),
          pastMove: robust(
            ms.map((m) => m.pastMoveOpenRate),
            () => 0.08,
          ),
          revenue: robust(
            ms.map((m) => m.revenuePerLead),
            (med) => med * 0.2,
          ),
        }
      : {
          conversion: fixed(DEFAULT_BASELINE.conversionRate, 0.1),
          stalled: fixed(DEFAULT_BASELINE.stalledRate, 0.1),
          pastMove: fixed(DEFAULT_BASELINE.pastMoveOpenRate, 0.08),
          revenue: fixed(0, 1),
        };

    // ── 3) 점수·사유 ──
    const ref = peers ? '비교 지점 중앙값' : '본사 기준';
    const branches: BranchAnomaly[] = eligible.map(([id, a]) => {
      const m = a.metrics;
      const parts: { pts: number; reason: string }[] = [];
      const add = (w: number, z: number, minZ: number, reason: string) => {
        const pts = (w * clampZ(z)) / Z_CAP;
        if (pts > 0) parts.push({ pts, reason: z >= minZ ? reason : '' });
      };
      if (m.pastMoveOpenCount >= 2) {
        add(
          WEIGHTS.pastMove,
          (m.pastMoveOpenRate - base.pastMove.med) / base.pastMove.scale,
          1,
          `이사일이 이미 지났는데 미계약인 건 ${m.pastMoveOpenCount}건(접수의 ${pct(m.pastMoveOpenRate)}, ` +
            `견적 ${man(m.missingRevenue)}) — ${ref} ${pct(base.pastMove.med)}`,
        );
      }
      if (m.quotedCount >= 3) {
        add(
          WEIGHTS.conversion,
          (base.conversion.med - m.conversionRate) / base.conversion.scale,
          1.5,
          `견적→계약 전환율 ${pct(m.conversionRate)}(견적 ${m.quotedCount}건 중 계약 ${m.contractCount}건) — ` +
            `${ref} ${pct(base.conversion.med)}`,
        );
      }
      add(
        WEIGHTS.stalled,
        (m.stalledRate - base.stalled.med) / base.stalled.scale,
        1.5,
        `상담토스·견적완료 등에서 ${STALL_DAYS}일 넘게 멈춘 건 ${m.stalledCount}건(${pct(m.stalledRate)}) — ` +
          `${ref} ${pct(base.stalled.med)}`,
      );
      if (peers) {
        add(
          WEIGHTS.revenue,
          (base.revenue.med - m.revenuePerLead) / base.revenue.scale,
          1.5,
          `접수당 계약 매출 ${man(m.revenuePerLead)} — 중앙값 ${man(base.revenue.med)}` +
            (m.quotedAmount
              ? ` (견적 합 ${man(m.quotedAmount)} 대비 계약 ${pct(m.revenue / m.quotedAmount)})`
              : ''),
        );
      }
      const score = Math.min(100, Math.round(parts.reduce((s, p) => s + p.pts, 0)));
      const level: AnomalyLevel = score >= 60 ? 'SUSPECT' : score >= 35 ? 'WATCH' : 'NORMAL';
      const reasons = parts
        .filter((p) => p.reason)
        .sort((x, y) => y.pts - x.pts)
        .map((p) => p.reason);
      if (level !== 'NORMAL' && m.commissionAtRisk > 0) {
        reasons.push(
          `추정 미납 수수료 ${man(m.commissionAtRisk)}(수수료율 ${pct(m.commissionRate)})`,
        );
      }
      const byAmount = (x: BranchAnomalyEvidence, y: BranchAnomalyEvidence) =>
        y.estimateAmount - x.estimateAmount;
      const evidence = [
        ...a.pastMove.sort(byAmount),
        ...a.stalled.filter((s) => !a.pastMove.includes(s)).sort(byAmount),
      ].slice(0, 6);
      const u = unitById.get(id)!;
      return {
        orgUnitId: id,
        orgUnitName: u.name,
        sido: u.sido ?? null,
        score,
        level,
        reasons,
        metrics: m,
        evidence: level === 'NORMAL' ? evidence.slice(0, 2) : evidence,
      };
    });
    branches.sort(
      (x, y) => y.score - x.score || y.metrics.commissionAtRisk - x.metrics.commissionAtRisk,
    );

    return {
      from,
      to,
      minLeads,
      baseline: {
        branchCount: eligible.length,
        conversionRate: base.conversion.med,
        stalledRate: base.stalled.med,
        pastMoveOpenRate: base.pastMove.med,
        revenuePerLead: Math.round(base.revenue.med),
      },
      baselineSource: peers ? 'PEERS' : 'DEFAULT',
      excludedSmallBranches: all.length - eligible.length,
      commissionNote: rules.length
        ? '정산 수수료 규칙(지점·이사 서비스 우선순위)으로 계산'
        : `등록된 수수료 규칙이 없어 기본 ${pct(DEFAULT_COMMISSION_RATE)}로 가정`,
      method:
        (peers
          ? `기간 내 접수 ${minLeads}건 이상 지점끼리 중앙값·MAD 강건 z-점수로 비교. `
          : `비교할 지점이 ${MIN_PEERS}곳 미만이라 본사 기준값(전환율 60%, 멈춘 건·이사일 지난 미계약 0%)과 비교(접수당 매출 제외). `) +
        `가중치: 이사일 지난 미계약 ${WEIGHTS.pastMove}, 견적→계약 전환율 ${WEIGHTS.conversion}, ` +
        `${STALL_DAYS}일 넘게 멈춘 건 ${WEIGHTS.stalled}, 접수당 매출 ${WEIGHTS.revenue}. ` +
        '60점 이상 의심, 35점 이상 주의. 누락 추정 매출은 이사일 지난 미계약 건의 견적 합(상한). ' +
        '통계 신호일 뿐이니 근거 접수번호로 고객 확인이 필요하다.',
      branches,
    };
  }

  /** AI 도구용 상태 라벨 */
  static statusLabel(s: string) {
    return LEAD_STATUS_LABEL[s as LeadStatus] ?? s;
  }
}

function blankMetrics(): BranchAnomalyMetrics {
  return {
    leadCount: 0,
    quotedCount: 0,
    contractCount: 0,
    conversionRate: 0,
    stalledCount: 0,
    stalledRate: 0,
    pastMoveOpenCount: 0,
    pastMoveOpenRate: 0,
    quotedAmount: 0,
    revenue: 0,
    revenuePerLead: 0,
    missingRevenue: 0,
    commissionRate: 0,
    commissionAtRisk: 0,
  };
}
