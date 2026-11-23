import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  APPROVAL_DOC_TYPE_LABEL,
  APPROVAL_STATUS_LABEL,
  ASSET_AMOUNT_UNIT_LABEL,
  ASSET_KIND_LABEL,
  ATTENDANCE_STATUS_LABEL,
  BRANCH_CASE_KIND_LABEL,
  BRANCH_CASE_STATUS_LABEL,
  CAMPAIGN_CHANNEL_LABEL,
  CRM_ACTIVITY_LABEL,
  CRM_INTEREST_LABEL,
  CRM_PIPELINES,
  CRM_PIPELINE_KEYS,
  EMPLOYMENT_TYPE_LABEL,
  FRANCHISE_STATUS_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  LEAVE_STATUS_LABEL,
  ORG_UNIT_TYPE_LABEL,
  PERMISSION_WILDCARD,
  SERVICE_LINE_LABEL,
  STUDIO_DATASET_MAP,
  TASK_STATUS_LABEL,
  crmPhaseOf,
  normalizeStudioSpec,
  studioCanSee,
  type AuthPrincipal,
  type DashData,
  type DashPeriod,
  type StudioGrain,
  type StudioParams,
  type StudioResult,
  type StudioSpec,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';

/**
 * 위젯 스튜디오 공통 실행기 — 설계서(StudioSpec)를 SQL 하나로 바꿔 대시보드 데이터 모양(DashData)으로 돌려준다.
 * SQL 조각은 아래 표에 있는 것만 쓴다(설계서의 글자는 표의 key를 고르는 데만 쓰이고 SQL에 들어가지 않는다).
 * 값(기간·필터 값·지점 범위·본인 id)은 모두 바인딩 변수. 지점 범위는 화면 조회와 같은 ScopeService.
 */

type Expr = string;
interface DimSql {
  expr: Expr;
  /** time: 날짜 칸(timestamptz는 한국 시간으로 바꾼 식), 그 외: 값 */
  time?: boolean;
  /** 값 → 이름: 코드표 · 'org'(조직 이름) · 'emp'(직원 이름) · 공통코드 */
  labels?: Record<string, string> | 'org' | 'emp' | 'code:AS_CATEGORY' | 'code:CUSTOMER_GRADE';
}
/** 늘 거는 조건을 만들 때 받는 것 — 값은 bind로만 넣는다 */
interface ScopeCtx {
  bind: (v: unknown) => string;
  p: AuthPrincipal;
  /** 지점 범위(null = 전체) */
  ids: string[] | null;
}
interface DatasetSql {
  from: Expr;
  /** 지점 범위를 거는 조직 칸 — 없으면 화면처럼 지점 범위 없이(필요하면 always로 본인 것만) */
  org?: Expr;
  /** 상태를 따로 고르지 않았을 때 거는 기본 조건(예: 계약은 서명된 것만) */
  base?: Expr;
  /** 늘 거는 조건(볼 수 있는 파이프라인·남의 개인 일정 빼기 등) — 상태를 골라도 빠지지 않는다 */
  always?: (c: ScopeCtx) => Expr | null;
  dims: Record<string, DimSql>;
  measures: Record<string, Expr>;
  /** 건별 숫자 칸(분포용) — 값이 없는 건(NULL)은 빼고 센다 */
  fields?: Record<string, Expr>;
}

const KST = (col: string) => `(${col} AT TIME ZONE 'Asia/Seoul')`;
/** 한국 날짜로 오늘 */
const TODAY = `(now() AT TIME ZONE 'Asia/Seoul')::date`;
/** 소수 한 자리 */
const R1 = (x: string) => `ROUND((${x})::numeric, 1)::float8`;
/** 조건이 맞는 건수 */
const CNT = (cond: string) => `COALESCE(SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END), 0)::float8`;
/** 조건이 맞는 비율(0~1) */
const RATE = (cond: string) => `COALESCE(AVG(CASE WHEN ${cond} THEN 1 ELSE 0 END), 0)::float8`;
/** 요일(월=1 … 일=7) · 시간대('09') */
const WEEKDAY = (col: string) => `EXTRACT(ISODOW FROM ${col})::int::text`;
const HOUR = (col: string) => `to_char(${col}, 'HH24')`;
const CONTRACTED = `('CONTRACTED','WORK_TOSS','IN_PROGRESS','DONE')`;

const WEEKDAY_LABEL: Record<string, string> = {
  '1': '월',
  '2': '화',
  '3': '수',
  '4': '목',
  '5': '금',
  '6': '토',
  '7': '일',
};
const HOUR_LABEL: Record<string, string> = Object.fromEntries(
  Array.from({ length: 24 }, (_, h) => [String(h).padStart(2, '0'), `${h}시`]),
);
const YES_NO = (y: string, n: string) => ({ Y: y, N: n });
const YN = (cond: string) => `CASE WHEN ${cond} THEN 'Y' ELSE 'N' END`;

const CONTRACT_STATUS: Record<string, string> = {
  DRAFT: '작성중',
  SIGNED: '서명완료',
  CANCELED: '취소',
};
const WORK_STATUS: Record<string, string> = {
  ASSIGNED: '배정',
  IN_PROGRESS: '작업중',
  DONE: '완료',
  CANCELED: '취소',
};
const SUPPORT_STATUS: Record<string, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '처리 중',
  RESOLVED: '해결',
  CLOSED: '종료',
  CANCELED: '취소',
};
const PAYMENT_KIND: Record<string, string> = { DEPOSIT: '계약금', BALANCE: '잔금' };
const PAYMENT_STATUS: Record<string, string> = {
  PENDING: '대기',
  PAID: '입금완료',
  CANCELED: '취소',
};
const PRIORITY: Record<string, string> = { HIGH: '높음', NORMAL: '보통', LOW: '낮음' };
const CHANNEL: Record<string, string> = {
  PHONE: '전화',
  EMAIL: '이메일',
  KAKAO: '카카오톡',
  VISIT: '방문',
};
const KIND: Record<string, string> = { AS: 'A/S', CS: 'CS' };
const ESTIMATE_STATUS: Record<string, string> = { DRAFT: '작성 중', QUOTED: '견적 완료' };
const SERVICE_ORDER_STATUS: Record<string, string> = {
  REQUESTED: '요청',
  SCHEDULED: '일정 확정',
  DONE: '완료',
  CANCELED: '취소',
};
const MATERIAL_ORDER_STATUS: Record<string, string> = {
  REQUESTED: '요청',
  APPROVED: '승인',
  SHIPPED: '출고',
  CANCELED: '취소',
};
const STOCK_TYPE: Record<string, string> = { IN: '입고', OUT: '출고', ADJUST: '조정' };
const CALL_STATUS: Record<string, string> = {
  ASSIGNED: '상담 중',
  OUTCALL: '콜백 대기',
  CALLBACK: '콜백 중',
  DONE: '완료',
  CANCELED: '취소',
};
const RECIPIENT_STATUS: Record<string, string> = { PENDING: '대기', SENT: '성공', FAILED: '실패' };
const INVOICE_STATUS: Record<string, string> = {
  DRAFT: '작성 중',
  ISSUED: '발행',
  COLLECTED: '수금 완료',
  CANCELED: '취소',
};
const ATTENDANCE_SOURCE: Record<string, string> = {
  WEB: '출퇴근 버튼',
  IMPORT: '엑셀 업로드',
  FIX: '정정·관리자 수정',
};
const TASK_PRIORITY: Record<string, string> = { A: '긴급', B: '보통', C: '낮음' };
const SPACE_KIND: Record<string, string> = { MEETING: '회의실(사내)', RENTAL: '외부 대여' };
const SPACE_STATUS: Record<string, string> = { CONFIRMED: '확정', CANCELLED: '취소' };
const ASSET_EXPIRY: Record<string, string> = {
  EXPIRED: '만료',
  SOON: '90일 안 만료',
  OK: '유효',
  NONE: '기한 없음',
};

// ── 영업 CRM — 파이프라인마다 단계·유입 경로 이름이 조금씩 달라 같은 코드는 이름을 합친다 ──
const mergeLabels = (lists: { key: string; label: string }[][]) => {
  const out: Record<string, string> = {};
  for (const list of lists)
    for (const x of list)
      out[x.key] =
        out[x.key] && !out[x.key].split(' / ').includes(x.label)
          ? `${out[x.key]} / ${x.label}`
          : x.label;
  return out;
};
const CRM_DEFS = CRM_PIPELINE_KEYS.map((k) => CRM_PIPELINES[k]);
const CRM_STAGE_LABEL = mergeLabels(CRM_DEFS.map((d) => d.stages));
const CRM_SOURCE_LABEL = mergeLabels(CRM_DEFS.map((d) => d.sources));
const CRM_PIPELINE_LABEL: Record<string, string> = { FRANCHISE: '가맹 영업', B2B: '기업영업' };
const CRM_PHASE_LABEL: Record<string, string> = {
  lead: '리드',
  deal: '진행',
  won: '계약·수주',
  closed: '보류·실패',
};
/** 단계 → 진행 구분 — 코드표의 상수로만 만든 CASE(사용자 값 없음) */
const CRM_PHASE_SQL = (pipe: string, stage: string) =>
  `CASE ${CRM_DEFS.flatMap((d) =>
    d.stages.map(
      (s) => `WHEN ${pipe} = '${d.key}' AND ${stage} = '${s.key}' THEN '${crmPhaseOf(d, s.key)}'`,
    ),
  ).join(' ')} ELSE 'closed' END`;
/** 볼 수 있는 파이프라인만(가맹 영업 = FRANCHISE.READ · 기업영업 = B2B_CRM.READ) */
const crmPipelines =
  (col: string) =>
  ({ bind, p }: ScopeCtx): Expr | null => {
    if (p.permissions.includes(PERMISSION_WILDCARD)) return null;
    const ok = CRM_DEFS.filter((d) => p.permissions.includes(`${d.perm}.READ`)).map((d) => d.key);
    return `${col} = ANY(${bind(ok)}::text[])`;
  };

// ── 근태 — 근무시간 설정(공통코드 HR_SETTING)과 그날 승인된 휴가(반차·반반차)로 지각·조퇴를 판정 ──
const WORK_SETTINGS = `(SELECT COALESCE(MAX(name) FILTER (WHERE code = 'WORK_START'), '09:00')::time AS ws, COALESCE(MAX(name) FILTER (WHERE code = 'WORK_END'), '18:00')::time AS we, COALESCE(NULLIF(MAX(name) FILTER (WHERE code = 'LATE_GRACE_MIN'), ''), '0')::int AS grace FROM common_code WHERE code_group = 'HR_SETTING') s`;
const DAY_LEAVE = `LEFT JOIN LATERAL (SELECT string_agg(COALESCE(lr.slot, 'FULL'), ',') AS slots FROM leave_request lr WHERE lr.employee_id = t.employee_id AND lr.status = 'APPROVED' AND t.work_date BETWEEN lr.start_date AND lr.end_date) lv ON true`;
// 오전 반차(AM)·첫 반반차(Q1)·종일 휴가 날은 지각에서, 오후 반차(PM)·끝 반반차(Q4)·종일 휴가 날은 조퇴에서 뺀다
const LATE = `(t.clock_in IS NOT NULL AND COALESCE(lv.slots, '') !~ '(FULL|AM|Q1)' AND (${KST('t.clock_in')})::time > s.ws + make_interval(mins => s.grace))`;
const EARLY = `(t.clock_out IS NOT NULL AND COALESCE(lv.slots, '') !~ '(FULL|PM|Q4)' AND (${KST('t.clock_out')})::time < s.we)`;
const WORK_HOURS = `EXTRACT(EPOCH FROM (t.clock_out - t.clock_in)) / 3600`;

// ── 그 밖의 계산 식 ──
const CALL_MISSED = `(t.attempts > 0 OR t.status IN ('OUTCALL','CALLBACK'))`;
const EMP_ACTIVE = `(t.is_active AND (t.resign_date IS NULL OR t.resign_date > ${TODAY}))`;
const APPROVAL_DONE = `t.status IN ('APPROVED','REJECTED')`;
const APPROVAL_DAYS = `EXTRACT(EPOCH FROM (t.completed_at - t.submitted_at)) / 86400`;
const TASK_DAYS = `(${KST('t.done_at')}::date - ${KST('t.created_at')}::date)`;
const CAL_DAYS = `(COALESCE(t.end_date, t.date) - t.date + 1)`;
const SPACE_HOURS = `EXTRACT(EPOCH FROM (t.end_at - t.start_at)) / 3600`;
const SOON = (col: string) => `(${col} BETWEEN ${TODAY} AND ${TODAY} + 90)`;

const SQL: Record<string, DatasetSql> = {
  // ── 영업 ──
  lead: {
    from: `lead t LEFT JOIN LATERAL (SELECT e.product_id FROM estimate e WHERE e.lead_id = t.id ORDER BY e.created_at DESC LIMIT 1) le ON true LEFT JOIN product lp ON lp.id = le.product_id`,
    org: 't.org_unit_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      moveDate: { expr: 't.move_date', time: true },
      status: { expr: 't.status', labels: LEAD_STATUS_LABEL },
      source: { expr: 't.source', labels: LEAD_SOURCE_LABEL },
      serviceLine: { expr: 't.service_line', labels: SERVICE_LINE_LABEL },
      product: { expr: 'lp.name' },
      fromSido: { expr: 't.from_sido' },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
      contracted: {
        expr: `CASE WHEN t.status IN ${CONTRACTED} THEN 'Y' ELSE 'N' END`,
        labels: YES_NO('계약', '미계약'),
      },
    },
    measures: {
      count: 'COUNT(*)::float8',
      expectedAmount: 'COALESCE(SUM(t.expected_amount), 0)::float8',
      conversion: `COALESCE(AVG(CASE WHEN t.status IN ${CONTRACTED} THEN 1 ELSE 0 END), 0)::float8`,
    },
    fields: {
      expectedAmount: 't.expected_amount::float8',
      leadDays: `(t.move_date - ${KST('t.created_at')}::date)::float8`,
    },
  },
  estimate: {
    from: 'estimate t LEFT JOIN product pr ON pr.id = t.product_id LEFT JOIN contract c ON c.estimate_id = t.id',
    org: 't.org_unit_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      status: { expr: 't.status', labels: ESTIMATE_STATUS },
      product: { expr: 'pr.name' },
      serviceLine: { expr: 'pr.service_line', labels: SERVICE_LINE_LABEL },
      fromSido: { expr: 't.from_sido' },
      toSido: { expr: 't.to_sido' },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
      contracted: { expr: YN(`c.status = 'SIGNED'`), labels: YES_NO('계약', '미계약') },
    },
    measures: {
      count: 'COUNT(*)::float8',
      amount: 'COALESCE(SUM(t.total_amount), 0)::float8',
      avgAmount: 'COALESCE(AVG(t.total_amount), 0)::float8',
      avgCbm: R1('COALESCE(AVG(t.total_cbm), 0)'),
      conversion: RATE(`c.status = 'SIGNED'`),
    },
    fields: {
      totalAmount: 't.total_amount::float8',
      totalCbm: 't.total_cbm::float8',
      distanceKm: 't.distance_km::float8',
    },
  },
  contract: {
    from: 'contract t LEFT JOIN lead l ON l.id = t.lead_id LEFT JOIN estimate ce ON ce.id = t.estimate_id LEFT JOIN product cp ON cp.id = ce.product_id',
    org: 't.org_unit_id',
    base: "t.status = 'SIGNED'",
    dims: {
      signedAt: { expr: KST('t.signed_at'), time: true },
      contractDate: { expr: 't.contract_date', time: true },
      status: { expr: 't.status', labels: CONTRACT_STATUS },
      serviceLine: { expr: 'l.service_line', labels: SERVICE_LINE_LABEL },
      product: { expr: 'cp.name' },
      source: { expr: 'l.source', labels: LEAD_SOURCE_LABEL },
      fromSido: { expr: 'l.from_sido' },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: {
      revenue: 'COALESCE(SUM(t.total_amount), 0)::float8',
      count: 'COUNT(*)::float8',
      avgAmount: 'COALESCE(AVG(t.total_amount), 0)::float8',
      deposit: 'COALESCE(SUM(t.deposit_amount), 0)::float8',
    },
    fields: {
      totalAmount: 't.total_amount::float8',
      depositAmount: 't.deposit_amount::float8',
      signDays: `(${KST('t.signed_at')}::date - ${KST('l.created_at')}::date)::float8`,
    },
  },
  crm_lead: {
    from: `crm_lead t LEFT JOIN LATERAL (SELECT COUNT(*) AS n FROM crm_activity a WHERE a.lead_id = t.id AND a.kind <> 'STAGE') act ON true`,
    always: crmPipelines('t.pipeline'),
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      expectedAt: { expr: 't.expected_at', time: true },
      pipeline: { expr: 't.pipeline', labels: CRM_PIPELINE_LABEL },
      stage: { expr: 't.stage', labels: CRM_STAGE_LABEL },
      phase: { expr: CRM_PHASE_SQL('t.pipeline', 't.stage'), labels: CRM_PHASE_LABEL },
      source: { expr: 't.source', labels: CRM_SOURCE_LABEL },
      interest: { expr: 't.interest', labels: CRM_INTEREST_LABEL },
      owner: { expr: 't.owner_emp_id::text', labels: 'emp' },
      region: { expr: 't.region' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      amount: 'COALESCE(SUM(t.amount), 0)::float8',
      wonRate: RATE(`t.stage = 'WON'`),
      activities: 'COALESCE(SUM(act.n), 0)::float8',
    },
    fields: { amount: 't.amount::float8' },
  },
  crm_activity: {
    from: 'crm_activity t JOIN crm_lead l ON l.id = t.lead_id',
    always: crmPipelines('l.pipeline'),
    dims: {
      at: { expr: KST('t.at'), time: true },
      kind: { expr: 't.kind', labels: CRM_ACTIVITY_LABEL },
      pipeline: { expr: 'l.pipeline', labels: CRM_PIPELINE_LABEL },
      toStage: { expr: 't.to_stage', labels: CRM_STAGE_LABEL },
      actor: { expr: 't.actor_name' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      leads: 'COUNT(DISTINCT t.lead_id)::float8',
    },
  },
  // ── 운영 ──
  work: {
    from: 'work_order t',
    org: 't.org_unit_id',
    base: "t.status <> 'CANCELED'",
    dims: {
      scheduledDate: { expr: 't.scheduled_date', time: true },
      status: { expr: 't.status', labels: WORK_STATUS },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: { count: 'COUNT(*)::float8' },
  },
  service_order: {
    from: 'service_order t LEFT JOIN product pr ON pr.id = t.product_id',
    org: 't.org_unit_id',
    base: "t.status <> 'CANCELED'",
    dims: {
      scheduledDate: { expr: 't.scheduled_date', time: true },
      createdAt: { expr: KST('t.created_at'), time: true },
      status: { expr: 't.status', labels: SERVICE_ORDER_STATUS },
      serviceLine: { expr: 't.service_line', labels: SERVICE_LINE_LABEL },
      product: { expr: 'pr.name' },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      amount: 'COALESCE(SUM(t.amount), 0)::float8',
      avgAmount: 'COALESCE(AVG(t.amount), 0)::float8',
    },
    fields: { amount: 't.amount::float8' },
  },
  material_order: {
    from: `material_order t LEFT JOIN LATERAL (SELECT COALESCE(SUM(ml.qty), 0) AS qty FROM material_order_line ml WHERE ml.order_id = t.id) ol ON true`,
    org: 't.org_unit_id',
    base: "t.status <> 'CANCELED'",
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      shippedAt: { expr: KST('t.shipped_at'), time: true },
      status: { expr: 't.status', labels: MATERIAL_ORDER_STATUS },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      qty: 'COALESCE(SUM(ol.qty), 0)::float8',
    },
    fields: { qty: 'ol.qty::float8' },
  },
  // 자재 화면은 지점 범위 없이 본다 — 창고·지점은 묶는 기준으로만
  stock: {
    from: 'stock_movement t JOIN material m ON m.id = t.material_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      type: { expr: 't.type', labels: STOCK_TYPE },
      material: { expr: 'm.name' },
      category: { expr: 'm.category' },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      inQty: 'COALESCE(SUM(CASE WHEN t.qty_delta > 0 THEN t.qty_delta ELSE 0 END), 0)::float8',
      outQty: 'COALESCE(SUM(CASE WHEN t.qty_delta < 0 THEN -t.qty_delta ELSE 0 END), 0)::float8',
      netQty: 'COALESCE(SUM(t.qty_delta), 0)::float8',
    },
  },
  // ── 고객·상담 ──
  customer: {
    from: 'customer t',
    org: 't.owner_org_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      grade: { expr: 't.grade', labels: 'code:CUSTOMER_GRADE' },
      org: { expr: 't.owner_org_id::text', labels: 'org' },
    },
    measures: { count: 'COUNT(*)::float8' },
  },
  support: {
    from: 'support_ticket t',
    org: 't.org_unit_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      status: { expr: 't.status', labels: SUPPORT_STATUS },
      kind: { expr: 't.kind', labels: KIND },
      category: { expr: 't.category', labels: 'code:AS_CATEGORY' },
      priority: { expr: 't.priority', labels: PRIORITY },
      channel: { expr: 't.channel', labels: CHANNEL },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: { count: 'COUNT(*)::float8' },
  },
  // 상담원 소속으로 지점 범위를 건다(아직 아무도 받지 않은 콜은 전체 범위에서만)
  cs_call: {
    from: 'cs_call t LEFT JOIN employee e ON e.id = t.agent_emp_id',
    org: 'e.org_unit_id',
    base: "t.status <> 'CANCELED'",
    dims: {
      receivedAt: { expr: KST('t.received_at'), time: true },
      status: { expr: 't.status', labels: CALL_STATUS },
      hour: { expr: HOUR(KST('t.received_at')), labels: HOUR_LABEL },
      weekday: { expr: WEEKDAY(KST('t.received_at')), labels: WEEKDAY_LABEL },
      missed: { expr: YN(CALL_MISSED), labels: YES_NO('콜백 전환', '바로 연결') },
      agent: { expr: 't.agent_emp_id::text', labels: 'emp' },
      org: { expr: 'e.org_unit_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      missedRate: RATE(CALL_MISSED),
      avgMinutes: R1('COALESCE(AVG(t.duration_sec), 0) / 60.0'),
      totalMinutes: R1('COALESCE(SUM(t.duration_sec), 0) / 60.0'),
      leadRate: RATE('t.lead_id IS NOT NULL'),
    },
    fields: { minutes: R1('t.duration_sec / 60.0') },
  },
  cs_sms: {
    from: 'cs_sms t LEFT JOIN employee e ON e.id = t.employee_id',
    org: 'e.org_unit_id',
    dims: {
      at: { expr: KST('t.at'), time: true },
      result: { expr: YN('t.ok'), labels: YES_NO('성공', '실패') },
      sender: { expr: 't.employee_id::text', labels: 'emp' },
      org: { expr: 'e.org_unit_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      successRate: RATE('t.ok'),
    },
  },
  // 캠페인에는 지점이 없다 — 화면처럼 지점·본인 범위면 내가 만든 캠페인만
  campaign: {
    from: 'campaign_recipient t JOIN campaign c ON c.id = t.campaign_id',
    always: ({ bind, p, ids }) => (ids === null ? null : `c.created_by = ${bind(p.userId)}::uuid`),
    dims: {
      sentAt: {
        expr: KST('COALESCE(t.sent_at, c.sent_at, c.scheduled_at, c.created_at)'),
        time: true,
      },
      status: { expr: 't.status', labels: RECIPIENT_STATUS },
      channel: { expr: 'c.channel', labels: CAMPAIGN_CHANNEL_LABEL },
      campaign: { expr: 'c.name' },
      ad: { expr: YN('c.is_ad'), labels: YES_NO('광고', '정보성') },
    },
    measures: {
      count: 'COUNT(*)::float8',
      sent: CNT(`t.status = 'SENT'`),
      failRate: `COALESCE(SUM(CASE WHEN t.status = 'FAILED' THEN 1 ELSE 0 END)::float8 / NULLIF(SUM(CASE WHEN t.status IN ('SENT','FAILED') THEN 1 ELSE 0 END), 0), 0)::float8`,
      campaigns: 'COUNT(DISTINCT c.id)::float8',
    },
  },
  // ── 입금·청구 ──
  payment: {
    from: 'payment t JOIN contract c ON c.id = t.contract_id',
    org: 'c.org_unit_id',
    base: "t.status = 'PAID'",
    dims: {
      paidAt: { expr: KST('t.paid_at'), time: true },
      kind: { expr: 't.kind', labels: PAYMENT_KIND },
      method: { expr: 't.method' },
      status: { expr: 't.status', labels: PAYMENT_STATUS },
      org: { expr: 'c.org_unit_id::text', labels: 'org' },
    },
    measures: {
      amount: 'COALESCE(SUM(t.amount), 0)::float8',
      count: 'COUNT(*)::float8',
    },
    fields: { amount: 't.amount::float8' },
  },
  invoice: {
    from: `invoice t LEFT JOIN partner pt ON pt.id = t.partner_id LEFT JOIN LATERAL (SELECT COALESCE(SUM(r.amount), 0) AS received FROM invoice_receipt r WHERE r.invoice_id = t.id) rc ON true`,
    org: 't.org_unit_id',
    base: "t.status IN ('ISSUED','COLLECTED')",
    dims: {
      issuedAt: { expr: KST('t.issued_at'), time: true },
      dueDate: { expr: 't.due_date', time: true },
      status: { expr: 't.status', labels: INVOICE_STATUS },
      overdue: {
        expr: YN(`t.status = 'ISSUED' AND t.due_date < ${TODAY}`),
        labels: YES_NO('연체', '정상'),
      },
      partner: { expr: 'pt.name' },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: {
      amount: 'COALESCE(SUM(t.amount), 0)::float8',
      count: 'COUNT(*)::float8',
      received: 'COALESCE(SUM(rc.received), 0)::float8',
      outstanding: `COALESCE(SUM(CASE WHEN t.status = 'ISSUED' THEN GREATEST(t.amount - rc.received, 0) ELSE 0 END), 0)::float8`,
      collectionRate: 'COALESCE(SUM(rc.received) / NULLIF(SUM(t.amount), 0), 0)::float8',
    },
    fields: { amount: 't.amount::float8' },
  },
  // ── 인사 ── (생년월일·주소·연락처 같은 개인 항목은 쓰지 않는다)
  employee: {
    from: 'employee t LEFT JOIN position ps ON ps.id = t.position_id',
    org: 't.org_unit_id',
    dims: {
      hireDate: { expr: 't.hire_date', time: true },
      resignDate: { expr: 't.resign_date', time: true },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
      position: { expr: 'ps.name' },
      employmentType: { expr: 't.employment_type', labels: EMPLOYMENT_TYPE_LABEL },
      status: {
        expr: `CASE WHEN ${EMP_ACTIVE} THEN 'ACTIVE' ELSE 'RESIGNED' END`,
        labels: { ACTIVE: '재직', RESIGNED: '퇴사' },
      },
    },
    measures: {
      headcount: CNT(EMP_ACTIVE),
      hires: 'COUNT(*)::float8',
      resigned: CNT(`NOT ${EMP_ACTIVE}`),
      avgTenure: R1(
        `COALESCE(AVG(CASE WHEN ${EMP_ACTIVE} THEN (${TODAY} - t.hire_date) / 365.25 END), 0)`,
      ),
    },
    fields: { tenureYears: R1(`(COALESCE(t.resign_date, ${TODAY}) - t.hire_date) / 365.25`) },
  },
  attendance: {
    from: `attendance_record t JOIN employee e ON e.id = t.employee_id CROSS JOIN ${WORK_SETTINGS} ${DAY_LEAVE}`,
    org: 'e.org_unit_id',
    dims: {
      workDate: { expr: 't.work_date', time: true },
      status: {
        expr: `CASE WHEN t.clock_in IS NULL THEN 'NO_IN' WHEN COALESCE(lv.slots, '') ~ 'FULL' THEN 'LEAVE' WHEN ${LATE} AND ${EARLY} THEN 'LATE_EARLY' WHEN ${LATE} THEN 'LATE' WHEN ${EARLY} THEN 'EARLY' WHEN t.clock_out IS NULL AND t.work_date < ${TODAY} THEN 'NO_OUT' WHEN t.clock_out IS NULL THEN 'WORKING' ELSE 'NORMAL' END`,
        labels: { ...ATTENDANCE_STATUS_LABEL, NO_IN: '출근 기록 없음' },
      },
      clockInHour: { expr: HOUR(KST('t.clock_in')), labels: HOUR_LABEL },
      weekday: { expr: WEEKDAY('t.work_date'), labels: WEEKDAY_LABEL },
      source: { expr: 't.source', labels: ATTENDANCE_SOURCE },
      org: { expr: 'e.org_unit_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(t.clock_in)::float8',
      lateCount: CNT(LATE),
      lateRate: `COALESCE(SUM(CASE WHEN ${LATE} THEN 1 ELSE 0 END)::float8 / NULLIF(COUNT(t.clock_in), 0), 0)::float8`,
      earlyCount: CNT(EARLY),
      avgHours: R1(`COALESCE(AVG(${WORK_HOURS}), 0)`),
    },
    fields: { workHours: R1(WORK_HOURS) },
  },
  leave: {
    from: 'leave_request t JOIN employee e ON e.id = t.employee_id JOIN leave_type lt ON lt.id = t.leave_type_id',
    org: 'e.org_unit_id',
    base: "t.status = 'APPROVED'",
    dims: {
      startDate: { expr: 't.start_date', time: true },
      leaveType: { expr: 'lt.name' },
      status: { expr: 't.status', labels: LEAVE_STATUS_LABEL },
      paid: { expr: YN('lt.paid'), labels: YES_NO('유급', '무급') },
      weekday: { expr: WEEKDAY('t.start_date'), labels: WEEKDAY_LABEL },
      org: { expr: 'e.org_unit_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      days: 'COALESCE(SUM(t.days), 0)::float8',
      avgDays: R1('COALESCE(AVG(t.days), 0)'),
    },
    fields: { days: 't.days::float8' },
  },
  approval: {
    from: 'approval_doc t',
    org: 't.org_unit_id',
    base: "t.status <> 'CANCELED'",
    dims: {
      submittedAt: { expr: KST('t.submitted_at'), time: true },
      completedAt: { expr: KST('t.completed_at'), time: true },
      docType: { expr: 't.doc_type', labels: APPROVAL_DOC_TYPE_LABEL },
      status: { expr: 't.status', labels: APPROVAL_STATUS_LABEL },
      org: { expr: 't.org_unit_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      pending: CNT(`t.status = 'PENDING'`),
      approvalRate: `COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN 1 ELSE 0 END)::float8 / NULLIF(SUM(CASE WHEN ${APPROVAL_DONE} THEN 1 ELSE 0 END), 0), 0)::float8`,
      avgDays: R1(`COALESCE(AVG(CASE WHEN ${APPROVAL_DONE} THEN ${APPROVAL_DAYS} END), 0)`),
    },
    fields: { days: `CASE WHEN ${APPROVAL_DONE} THEN ${R1(APPROVAL_DAYS)} END` },
  },
  // ── 업무·총무 ──
  task: {
    from: 'team_task t',
    org: 't.team_org_id',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      dueDate: { expr: 't.due_date', time: true },
      doneAt: { expr: KST('t.done_at'), time: true },
      status: { expr: 't.status', labels: TASK_STATUS_LABEL },
      priority: { expr: 't.priority', labels: TASK_PRIORITY },
      project: { expr: 't.project' },
      assignee: { expr: 't.assignee_emp_id::text', labels: 'emp' },
      org: { expr: 't.team_org_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      doneRate: RATE(`t.status = 'DONE'`),
      overdue: CNT(`t.due_date < ${TODAY} AND t.status <> 'DONE'`),
      avgDays: R1(`COALESCE(AVG(${TASK_DAYS}), 0)`),
    },
    fields: { leadDays: `${TASK_DAYS}::float8` },
  },
  // 남의 개인 일정은 세지 않는다(관리자도) — 조직 공유 일정 + 내 일정
  calendar: {
    from: 'calendar_event t LEFT JOIN app_user u ON u.id = t.owner_user_id LEFT JOIN employee e ON e.id = u.employee_id',
    org: 'COALESCE(t.org_unit_id, e.org_unit_id)',
    always: ({ bind, p }) => `(t.visibility = 'ORG' OR t.owner_user_id = ${bind(p.userId)}::uuid)`,
    dims: {
      date: { expr: 't.date', time: true },
      visibility: { expr: 't.visibility', labels: { PRIVATE: '개인', ORG: '조직 공유' } },
      allDay: { expr: YN('t.start_time IS NULL'), labels: YES_NO('종일', '시간 지정') },
      source: { expr: 't.source', labels: { LOCAL: '직접 등록', GOOGLE: '구글 캘린더' } },
      weekday: { expr: WEEKDAY('t.date'), labels: WEEKDAY_LABEL },
      org: { expr: 'COALESCE(t.org_unit_id, e.org_unit_id)::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      avgDays: R1(`COALESCE(AVG(${CAL_DAYS}), 0)`),
    },
    fields: { days: `${CAL_DAYS}::float8` },
  },
  // 공간 예약은 지점 구분이 없다(사내 공간)
  space: {
    from: 'space_reservation t JOIN space s ON s.id = t.space_id',
    base: "t.status <> 'CANCELLED'",
    dims: {
      startAt: { expr: KST('t.start_at'), time: true },
      space: { expr: 's.name' },
      kind: { expr: 's.kind', labels: SPACE_KIND },
      status: { expr: 't.status', labels: SPACE_STATUS },
      hour: { expr: HOUR(KST('t.start_at')), labels: HOUR_LABEL },
      weekday: { expr: WEEKDAY(KST('t.start_at')), labels: WEEKDAY_LABEL },
    },
    measures: {
      count: 'COUNT(*)::float8',
      hours: R1(`COALESCE(SUM(${SPACE_HOURS}), 0)`),
      fee: 'COALESCE(SUM(t.fee), 0)::float8',
    },
    fields: { hours: R1(SPACE_HOURS) },
  },
  asset: {
    from: 'corp_asset t',
    dims: {
      startDate: { expr: 't.start_date', time: true },
      endDate: { expr: 't.end_date', time: true },
      kind: { expr: 't.kind', labels: ASSET_KIND_LABEL },
      amountUnit: { expr: 't.amount_unit', labels: ASSET_AMOUNT_UNIT_LABEL },
      expiry: {
        expr: `CASE WHEN t.end_date IS NULL THEN 'NONE' WHEN t.end_date < ${TODAY} THEN 'EXPIRED' WHEN ${SOON('t.end_date')} THEN 'SOON' ELSE 'OK' END`,
        labels: ASSET_EXPIRY,
      },
    },
    measures: {
      count: 'COUNT(*)::float8',
      monthlyCost: `COALESCE(SUM(CASE t.amount_unit WHEN 'MONTH' THEN t.amount WHEN 'YEAR' THEN t.amount / 12 ELSE 0 END), 0)::float8`,
      expiringSoon: CNT(SOON('t.end_date')),
    },
    fields: { amount: 't.amount::float8' },
  },
  // ── 지점·가맹 ── (가맹비·보증금 같은 금액은 가맹 권한 화면에만 — 여기선 상태·날짜만)
  branch: {
    from: 'org_unit t LEFT JOIN franchise_info fi ON fi.org_unit_id = t.id',
    org: 't.id',
    base: 't.is_active',
    dims: {
      createdAt: { expr: KST('t.created_at'), time: true },
      contractStart: { expr: 'fi.contract_start', time: true },
      contractEnd: { expr: 'fi.contract_end', time: true },
      type: { expr: 't.type', labels: ORG_UNIT_TYPE_LABEL },
      sido: { expr: 't.sido' },
      parent: { expr: 't.parent_id::text', labels: 'org' },
      franchiseStatus: { expr: 'fi.status', labels: FRANCHISE_STATUS_LABEL },
      status: { expr: YN('t.is_active'), labels: YES_NO('운영', '비활성') },
    },
    measures: {
      branches: CNT(`t.type = 'BRANCH'`),
      count: 'COUNT(*)::float8',
      renewalDue: CNT(SOON('fi.contract_end')),
    },
  },
  branch_case: {
    from: 'branch_case t',
    org: 't.branch_id',
    dims: {
      occurredAt: { expr: 't.occurred_at', time: true },
      kind: { expr: 't.kind', labels: BRANCH_CASE_KIND_LABEL },
      status: { expr: 't.status', labels: BRANCH_CASE_STATUS_LABEL },
      assignee: { expr: 't.assignee_emp_id::text', labels: 'emp' },
      org: { expr: 't.branch_id::text', labels: 'org' },
    },
    measures: {
      count: 'COUNT(*)::float8',
      open: CNT(`t.status <> 'CLOSED'`),
      amount: 'COALESCE(SUM(t.amount), 0)::float8',
    },
    fields: { amount: 't.amount::float8' },
  },
};

/** 범위 조건 — 지점 범위(조직 칸이 있으면) + 늘 거는 조건 */
function scopeConds(q: DatasetSql, ctx: ScopeCtx): string[] {
  const w: string[] = [];
  if (ctx.ids !== null && q.org) w.push(`${q.org} = ANY(${ctx.bind(ctx.ids)}::uuid[])`);
  const a = q.always?.(ctx);
  if (a) w.push(a);
  return w;
}

const DAY = 86_400_000;
const PERIOD_DAYS: Record<Exclude<DashPeriod, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
};
const p2 = (n: number) => String(n).padStart(2, '0');
/** 한국 날짜 'YYYY-MM-DD' (offset일 전) */
const kstDay = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3600_000 - offsetDays * DAY).toISOString().slice(0, 10);

/** 시간 칸 → 단위의 첫날('YYYY-MM-DD') */
const bucketExpr = (expr: string, g: StudioGrain) =>
  `to_char(date_trunc('${g}', (${expr})::timestamp), 'YYYY-MM-DD')`;

/** 단위 첫날 → 보이는 이름 */
function bucketLabel(key: string, g: StudioGrain): string {
  const [y, m, d] = key.split('-').map(Number);
  if (g === 'year') return `${y}`;
  if (g === 'quarter') return `${String(y).slice(2)}년 ${Math.floor((m - 1) / 3) + 1}분기`;
  if (g === 'month') return `${String(y).slice(2)}.${m}`;
  return `${m}/${d}`;
}

/** 기간 안의 단위 첫날들(빈 칸도 0으로 채우려고) */
function buckets(from: string, to: string, g: StudioGrain): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  // 시작을 단위 첫날로
  if (g === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (g === 'month' || g === 'quarter' || g === 'year') d.setUTCDate(1);
  if (g === 'quarter') d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3);
  if (g === 'year') d.setUTCMonth(0);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(`${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`);
    if (g === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (g === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else if (g === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (g === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return out;
}

@Injectable()
export class StudioQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** 이 사람이 이 설계서의 데이터를 볼 수 있나 */
  canSee(spec: StudioSpec, p: AuthPrincipal): boolean {
    return !!SQL[spec.dataset] && studioCanSee(STUDIO_DATASET_MAP.get(spec.dataset), p.permissions);
  }

  async run(rawSpec: unknown, params: StudioParams, p: AuthPrincipal): Promise<StudioResult> {
    const { spec } = normalizeStudioSpec(rawSpec);
    if (!this.canSee(spec, p)) throw new ForbiddenException('이 데이터를 볼 권한이 없습니다.');
    const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
    const q = SQL[spec.dataset];
    const ids = await this.scope.orgScopeIds(p);
    // 지점 범위가 없는 데이터(자재·캠페인…)는 모든 지점 값이 보인다
    const multiOrg = ids === null || ids.length > 1 || !q.org;

    // 조작 값 반영(카탈로그에 있는 것만)
    const has = (k?: string | null) => !!k && !!q.dims[k];
    const measure = params.measure && q.measures[params.measure] ? params.measure : spec.measure;
    let dimension =
      params.dimension !== undefined
        ? has(params.dimension)
          ? params.dimension!
          : null
        : (spec.dimension ?? null);
    // 한 지점만 보는 사람에게 '지점별'은 의미가 없다 — 그 칸이면 기준 없이(또는 다음 기준으로)
    if (dimension === 'org' && !multiOrg) dimension = null;
    const grain = params.grain ?? spec.grain ?? 'month';
    const period = params.period ?? spec.period;
    const split = has(spec.split) && spec.split !== dimension ? spec.split! : null;
    const timeField = has(spec.periodField) ? spec.periodField! : ds.defaultTime;

    const filters = new Map<string, string[]>();
    for (const f of spec.filters ?? []) if (has(f.dim)) filters.set(f.dim, f.values);
    for (const [k, v] of Object.entries(params.filters ?? {}))
      if (has(k) && Array.isArray(v) && v.length) filters.set(k, v.map(String).slice(0, 50));

    const values: unknown[] = [];
    const bind = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    };
    const where = (from?: string, to?: string) => {
      const w: string[] = [];
      w.push(...scopeConds(q, { bind, p, ids }));
      // 날짜로 묶을 때 날짜가 빈 건(이사일 미정·미완료 등)은 놓을 칸이 없다
      for (const k of [dimension, split])
        if (k && q.dims[k].time) w.push(`(${q.dims[k].expr}) IS NOT NULL`);
      const usesStatus =
        dimension === 'status' ||
        split === 'status' ||
        filters.has('status') ||
        (spec.controls ?? []).some((c) => c.kind === 'filter' && c.dim === 'status');
      if (q.base && !usesStatus) w.push(q.base);
      const tf = q.dims[timeField];
      if (from) w.push(`(${tf.expr})::date >= ${bind(from)}::date`);
      if (to) w.push(`(${tf.expr})::date <= ${bind(to)}::date`);
      for (const [k, v] of filters) w.push(`(${q.dims[k].expr}) = ANY(${bind(v)}::text[])`);
      return w.length ? `WHERE ${w.join(' AND ')}` : '';
    };
    const range = (back = 0): { from?: string; to?: string } => {
      if (period === 'all') return {};
      const n = PERIOD_DAYS[period];
      return { from: kstDay(n * (back + 1) - 1), to: kstDay(n * back) };
    };
    const keyExpr = (k: string) => {
      const d = q.dims[k];
      return d.time ? bucketExpr(d.expr, grain) : `COALESCE((${d.expr})::text, '')`;
    };
    const m = q.measures[measure];
    const fmt = ds.measures.find((x) => x.key === measure)?.format ?? 'count';

    const options = await this.filterOptions(spec, q, ids, p);
    const applied = { measure, dimension, grain, period };
    const viz = params.viz ?? spec.viz;

    // ── 분포: 히스토그램(건별 숫자를 구간으로) · 박스플롯(기준별 사분위) ──
    const fieldKey = params.field && q.fields?.[params.field] ? params.field : (spec.field ?? '');
    const fieldSql = q.fields?.[fieldKey];
    const fieldDef = ds.fields.find((f) => f.key === fieldKey);
    if ((viz === 'histogram' || viz === 'box') && fieldSql && fieldDef) {
      const cur = range();
      values.length = 0;
      const w = where(cur.from, cur.to);
      const notNull = `${w ? `${w} AND` : 'WHERE'} (${fieldSql}) IS NOT NULL`;
      const fFmt = fieldDef.format;
      if (viz === 'histogram') {
        const [mm] = await this.prisma.$queryRawUnsafe<{ lo: number | null; hi: number | null }[]>(
          `SELECT MIN(${fieldSql}) AS lo, MAX(${fieldSql}) AS hi FROM ${q.from} ${notNull}`,
          ...values,
        );
        const lo = Number(mm?.lo ?? 0);
        const hi = Number(mm?.hi ?? 0);
        if (mm?.lo == null)
          return {
            data: { shape: 'category', format: 'count', items: [] },
            options,
            multiOrg,
            applied,
          };
        // 보기 좋은 구간 폭(1·2·5 단위)으로 12개 안팎
        const raw = Math.max((hi - lo) / 12, fFmt === 'won' ? 10000 : 1);
        const mag = 10 ** Math.floor(Math.log10(raw));
        const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) ?? 10 * mag;
        const start = Math.floor(lo / step) * step;
        const rows = await this.prisma.$queryRawUnsafe<{ b: number; n: number }[]>(
          `SELECT FLOOR(((${fieldSql}) - ${bind(start)}::float8) / ${bind(step)}::float8)::int AS b, COUNT(*)::int AS n FROM ${q.from} ${notNull} GROUP BY 1 ORDER BY 1`,
          ...values,
        );
        const byBin = new Map(rows.map((r) => [Number(r.b), Number(r.n)]));
        const last = Math.max(0, ...rows.map((r) => Number(r.b)));
        const lab = (v: number) =>
          fFmt === 'won'
            ? v >= 1e8
              ? `${+(v / 1e8).toFixed(1)}억`
              : v >= 1e4
                ? `${Math.round(v / 1e4).toLocaleString()}만`
                : v.toLocaleString()
            : `${v.toLocaleString()}${fieldDef.unit ?? ''}`;
        return {
          data: {
            shape: 'category',
            format: 'count',
            items: Array.from({ length: last + 1 }, (_, i) => ({
              key: String(i),
              label: lab(start + i * step),
              value: byBin.get(i) ?? 0,
            })),
          },
          options,
          multiOrg,
          applied,
        };
      }
      // 박스플롯 — 기준이 있으면 기준별(건수 많은 12개), 없으면 하나
      const k1 = dimension ? keyExpr(dimension) : `''`;
      const rows = await this.prisma.$queryRawUnsafe<{ k1: string; p: number[]; n: number }[]>(
        `SELECT ${k1} AS k1, percentile_cont(ARRAY[0, 0.25, 0.5, 0.75, 1]) WITHIN GROUP (ORDER BY ${fieldSql}) AS p, COUNT(*)::int AS n FROM ${q.from} ${notNull} GROUP BY 1 ORDER BY 3 DESC LIMIT 12`,
        ...values,
      );
      const label = dimension
        ? await this.labeler(
            q,
            [dimension],
            rows.map((r) => ({ k1: r.k1, k2: '' })),
          )
        : null;
      const items = rows.map((r) => {
        const [min, q1, median, q3, max] = (r.p ?? []).map(Number);
        const isTime = dimension ? !!q.dims[dimension].time : false;
        return {
          key: r.k1 || 'ALL',
          label: !dimension
            ? fieldDef.label
            : isTime
              ? bucketLabel(r.k1, grain)
              : (label!(dimension, r.k1) ?? (r.k1 || '미지정')),
          min,
          q1,
          median,
          q3,
          max,
          n: Number(r.n),
        };
      });
      if (dimension && q.dims[dimension].time) items.sort((a, b) => a.key.localeCompare(b.key));
      return { data: { shape: 'box', format: fFmt, items }, options, multiOrg, applied };
    }

    // ── 관계: 산점도(기준별로 두 숫자) ──
    const m2key = spec.measure2 && q.measures[spec.measure2] ? spec.measure2 : null;
    if (viz === 'scatter' && m2key && dimension) {
      const cur = range();
      values.length = 0;
      const k1 = keyExpr(dimension);
      const rows = await this.prisma.$queryRawUnsafe<{ k1: string; x: number; y: number }[]>(
        `SELECT ${k1} AS k1, ${q.measures[measure]} AS x, ${q.measures[m2key]} AS y FROM ${q.from} ${where(cur.from, cur.to)} GROUP BY 1`,
        ...values,
      );
      const label = await this.labeler(
        q,
        [dimension],
        rows.map((r) => ({ k1: r.k1, k2: '' })),
      );
      const isTime = !!q.dims[dimension].time;
      const mDef = (k: string) => ds.measures.find((x) => x.key === k)!;
      return {
        data: {
          shape: 'scatter',
          xLabel: mDef(measure).label,
          yLabel: mDef(m2key).label,
          xFormat: mDef(measure).format,
          yFormat: mDef(m2key).format,
          points: rows.map((r) => ({
            key: r.k1 || 'NONE',
            label: isTime
              ? bucketLabel(r.k1, grain)
              : (label(dimension, r.k1) ?? (r.k1 || '미지정')),
            x: Number(r.x),
            y: Number(r.y),
          })),
        },
        options,
        multiOrg,
        applied,
      };
    }

    // ── 숫자 하나 ──
    if (!dimension) {
      const cur = range();
      values.length = 0;
      const sqlCur = `SELECT ${m} AS v FROM ${q.from} ${where(cur.from, cur.to)}`;
      const curVals = [...values];
      const [{ v }] = await this.prisma.$queryRawUnsafe<{ v: number }[]>(sqlCur, ...curVals);
      let previous: number | null = null;
      if (period !== 'all') {
        values.length = 0;
        const prev = range(1);
        const sqlPrev = `SELECT ${m} AS v FROM ${q.from} ${where(prev.from, prev.to)}`;
        const [r] = await this.prisma.$queryRawUnsafe<{ v: number }[]>(sqlPrev, ...values);
        previous = Number(r?.v ?? 0);
      }
      const value = Number(v ?? 0);
      return {
        data: {
          shape: 'value',
          format: fmt,
          value,
          previous,
          ...(fmt === 'percent' ? { max: 1 } : { max: Math.max(value, previous ?? 0) * 1.25 || 1 }),
        },
        options,
        multiOrg,
        applied,
      };
    }

    const cur = range();
    values.length = 0;
    const k1 = keyExpr(dimension);
    const k2 = split ? keyExpr(split) : `''`;
    const sql = `SELECT ${k1} AS k1, ${k2} AS k2, ${m} AS v FROM ${q.from} ${where(cur.from, cur.to)} GROUP BY 1, 2`;
    const rows = await this.prisma.$queryRawUnsafe<{ k1: string; k2: string; v: number }[]>(
      sql,
      ...values,
    );
    const label = await this.labeler(q, [dimension, ...(split ? [split] : [])], rows);
    const isTime = !!q.dims[dimension].time;
    const name = (dim: string, k: string) =>
      q.dims[dim].time ? bucketLabel(k, grain) : k ? (label(dim, k) ?? k) : '미지정';

    // 1차 기준 값 순서 — 시간은 기간 전체(빈 칸 0), 항목은 많은 것부터
    const total = new Map<string, number>();
    for (const r of rows) total.set(r.k1, (total.get(r.k1) ?? 0) + Number(r.v));
    let keys1: string[];
    if (isTime) {
      const from = cur.from ?? [...total.keys()].sort()[0] ?? kstDay();
      keys1 = [...new Set([...buckets(from, cur.to ?? kstDay(), grain), ...total.keys()])].sort();
    } else {
      keys1 = [...total.keys()].sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0));
      if (spec.limit) keys1 = keys1.slice(0, spec.limit);
      else keys1 = keys1.slice(0, 30);
    }

    if (!split) {
      const data: DashData = isTime
        ? {
            shape: 'series',
            format: fmt,
            unit: grain === 'day' ? 'day' : grain === 'week' ? 'week' : 'month',
            points: keys1.map((k) => ({
              x: k,
              label: bucketLabel(k, grain),
              value: total.get(k) ?? 0,
            })),
          }
        : {
            shape: 'category',
            format: fmt,
            items: keys1.map((k) => ({
              key: k || 'NONE',
              label: name(dimension, k),
              value: total.get(k) ?? 0,
            })),
          };
      return { data, options, multiOrg, applied };
    }

    // 두 기준 — 행(나눔) × 열(1차 기준)
    const t2 = new Map<string, number>();
    for (const r of rows) t2.set(r.k2, (t2.get(r.k2) ?? 0) + Number(r.v));
    const keys2 = [...t2.keys()].sort((a, b) => (t2.get(b) ?? 0) - (t2.get(a) ?? 0)).slice(0, 12);
    const cell = new Map(rows.map((r) => [`${r.k2}\u0000${r.k1}`, Number(r.v)]));
    return {
      data: {
        shape: 'matrix',
        format: fmt,
        rows: keys2.map((k) => name(split, k)),
        cols: keys1.map((k) => name(dimension, k)),
        cells: keys2.map((r) => keys1.map((c) => cell.get(`${r}\u0000${c}`) ?? 0)),
      },
      options,
      multiOrg,
      applied,
    };
  }

  /** 키 → 이름(코드표·지점 이름·공통코드) */
  private async labeler(q: DatasetSql, dims: string[], rows: { k1: string; k2: string }[]) {
    const maps = new Map<string, Record<string, string>>();
    for (const [i, dim] of dims.entries()) {
      const l = q.dims[dim].labels;
      if (!l) continue;
      if (typeof l === 'object') maps.set(dim, l);
      else {
        const keys = [...new Set(rows.map((r) => (i === 0 ? r.k1 : r.k2)).filter(Boolean))];
        maps.set(dim, await this.lookup(l, keys));
      }
    }
    return (dim: string, k: string) => maps.get(dim)?.[k];
  }

  private async lookup(kind: string, keys: string[]): Promise<Record<string, string>> {
    if (kind === 'emp') {
      const ids = keys.filter((k) => /^[0-9a-f-]{36}$/i.test(k));
      if (!ids.length) return {};
      const rows = await this.prisma.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return Object.fromEntries(rows.map((r) => [r.id, r.name]));
    }
    if (kind === 'org') {
      const ids = keys.filter((k) => /^[0-9a-f-]{36}$/i.test(k));
      if (!ids.length) return {};
      const rows = await this.prisma.orgUnit.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return Object.fromEntries(rows.map((r) => [r.id, r.name]));
    }
    const group = kind.slice('code:'.length);
    const rows = await this.prisma.commonCode.findMany({
      where: { codeGroup: group },
      select: { code: true, name: true },
    });
    return Object.fromEntries(rows.map((r) => [r.code, r.name]));
  }

  /** 필터 조작 요소가 고를 값 — 내 범위 안에서 실제로 있는 값 */
  private async filterOptions(
    spec: StudioSpec,
    q: DatasetSql,
    ids: string[] | null,
    p: AuthPrincipal,
  ) {
    const out: StudioResult['options'] = {};
    for (const c of spec.controls ?? []) {
      if (c.kind !== 'filter' || !q.dims[c.dim] || q.dims[c.dim].time) continue;
      const d = q.dims[c.dim];
      const args: unknown[] = [];
      const conds = scopeConds(q, {
        bind: (v) => {
          args.push(v);
          return `$${args.length}`;
        },
        p,
        ids,
      });
      const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const rows = await this.prisma.$queryRawUnsafe<{ k: string | null }[]>(
        `SELECT DISTINCT (${d.expr})::text AS k FROM ${q.from} ${w} LIMIT 60`,
        ...args,
      );
      const keys = rows.map((r) => r.k).filter((k): k is string => !!k);
      const lab =
        typeof d.labels === 'object' ? d.labels : d.labels ? await this.lookup(d.labels, keys) : {};
      out[c.dim] = keys
        .map((k) => ({ value: k, label: lab[k] ?? k }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    }
    return out;
  }
}
