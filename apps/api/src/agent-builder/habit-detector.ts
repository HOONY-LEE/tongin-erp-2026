/**
 * 반복 행동 탐지 — 한 사람이 화면에서 손으로 되풀이하는 일을 찾아 "에이전트로 만들까요?" 제안을 만든다.
 * DB를 모르는 순수 함수(입력: 감사 로그·업무 이벤트 행) — 서비스가 행을 읽어 넘긴다.
 *
 *   - 정해진 시간(routine): 같은 일을 여러 날 비슷한 시각(±1시간)에 한다 → 예약(cron) 에이전트
 *   - 이벤트 뒤 대응(reaction): 업무 이벤트가 생기면 그 건에 같은 일을 한다 → 이벤트 에이전트
 *   - 이어서 하는 일(sequence): A를 하고 나면 곧이어 B를 한다 → 수동 실행 에이전트
 */
import { TRIGGER_EVENTS, TRIGGER_EVENT_LABEL, type TriggerEvent } from '@tongin/shared';

export interface ActionRow {
  method: string;
  path: string;
  entityId: string | null;
  after: unknown;
  createdAt: Date;
}
export interface EventRow {
  eventType: string;
  aggregateId: string;
  payload: unknown;
  occurredAt: Date;
}

export type HabitKind = 'routine' | 'reaction' | 'sequence';

export interface HabitSuggestion {
  /** 같은 습관이면 늘 같은 값 — 숨기기 기억용 */
  id: string;
  kind: HabitKind;
  title: string;
  /** 왜 제안하는지 — "최근 30일 중 6일, 평일 오전 9시 무렵" */
  reason: string;
  count: number;
  days: number;
  lastAt: string;
  trigger:
    | { kind: 'schedule'; cron: string; label: string }
    | { kind: 'event'; event: TriggerEvent; label: string }
    | { kind: 'manual'; label: string };
  /** 에이전트 만들기 대화에 그대로 넣는 첫 요청 */
  prompt: string;
  /** 무슨 일을 대신하나(행동 이름) */
  actions: string[];
}

/** 업무 행동으로 볼 리소스 — 여기 없는 것(대시보드·AI·메뉴·권한 등 설정성 요청)은 무시 */
const RESOURCE: Record<string, string> = {
  leads: '접수',
  customers: '고객',
  estimates: '견적',
  contracts: '계약',
  payments: '입금',
  'payment-confirmations': '입금 확인',
  'work-orders': '작업 지시',
  'service-orders': '리빙케어 주문',
  'support-tickets': 'CS 티켓',
  campaigns: '문자 캠페인',
  notifications: '문자',
  calendar: '일정',
  tasks: '팀 업무',
  notices: '공지',
  settlements: '정산',
  billing: '청구',
  'material-orders': '자재 발주',
  materials: '자재',
  approvals: '결재',
  assets: '계약·자산',
  'branch-cases': '지점 관리 기록',
  partners: '거래처',
};

/** 하위 동작 이름(경로 끝) */
const SUB: Record<string, string> = {
  send: '보내기',
  transition: '단계 변경',
  cancel: '취소',
  confirm: '확인',
  approve: '승인',
  reject: '반려',
  assign: '담당 지정',
  assignments: '배정',
  start: '시작',
  complete: '완료',
  ship: '출고',
  sign: '서명',
  quote: '금액 확정',
  issue: '발행',
  receipts: '수금 기록',
  invoices: '청구서',
  payments: '결제 요청',
  items: '품목 수정',
  lines: '항목 추가',
  'deduct-materials': '자재 차감',
};

const VERB: Record<string, string> = {
  POST: '등록',
  PATCH: '수정',
  PUT: '수정',
  DELETE: '삭제',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KST = 9 * 3_600_000;

interface Action {
  key: string;
  label: string;
  at: Date;
  ids: Set<string>;
}

/** 요청 한 줄 → 업무 행동(key·이름). 업무 행동이 아니면 null */
export function toAction(r: ActionRow): Action | null {
  const parts = r.path.split('/').filter(Boolean); // ['api', resource, ...]
  const resource = parts[1];
  const name = resource && RESOURCE[resource];
  if (!name) return null;
  const rest = parts.slice(2).filter((p) => !UUID.test(p) && !/^\d+$/.test(p));
  const sub = rest[rest.length - 1];
  // 조회성 POST(검색·미리보기·대상 계산)는 사람이 '한 일'이 아니다
  if (sub && /^(search|preview|audience|data|count|query|export|validate)$/.test(sub)) return null;
  const subLabel = sub ? (SUB[sub] ?? null) : null;
  if (sub && !subLabel) return null;
  const label = subLabel ? `${name} ${subLabel}` : `${name} ${VERB[r.method] ?? r.method}`;
  const key = `${resource}:${sub ?? r.method}`;

  const ids = new Set<string>();
  if (r.entityId && UUID.test(r.entityId)) ids.add(r.entityId);
  for (const p of parts) if (UUID.test(p)) ids.add(p);
  if (r.after && typeof r.after === 'object') {
    for (const [k, v] of Object.entries(r.after as Record<string, unknown>)) {
      if (/Id$/.test(k) && typeof v === 'string' && UUID.test(v)) ids.add(v);
    }
  }
  return { key, label, at: r.createdAt, ids };
}

const kstDate = (d: Date) => new Date(d.getTime() + KST);
const dayKey = (d: Date) => kstDate(d).toISOString().slice(0, 10);
const kstHour = (d: Date) => kstDate(d).getUTCHours();
const kstWeekday = (d: Date) => kstDate(d).getUTCDay(); // 0=일

/** 한글 받침 유무로 조사(을/를) */
const eul = (word: string) => {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return '을(를)';
  return (c - 0xac00) % 28 ? '을' : '를';
};

const hourLabel = (h: number) =>
  h === 0 ? '자정' : h < 12 ? `오전 ${h}시` : h === 12 ? '정오' : `오후 ${h - 12}시`;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 정해진 시간에 되풀이하는 일 */
function routines(actions: Action[], windowDays: number): HabitSuggestion[] {
  const byKey = new Map<string, Action[]>();
  for (const a of actions) byKey.set(a.key, [...(byKey.get(a.key) ?? []), a]);
  const out: HabitSuggestion[] = [];
  for (const [key, list] of byKey) {
    // 하루에 몇 번 했든 '그날 처음 한 시각'으로 본다
    const firstOfDay = new Map<string, Action>();
    for (const a of list) {
      const d = dayKey(a.at);
      const cur = firstOfDay.get(d);
      if (!cur || a.at < cur.at) firstOfDay.set(d, a);
    }
    const days = [...firstOfDay.values()];
    if (days.length < 4) continue;
    // 가장 많이 몰린 시각(±1시간 창)
    let best = { hour: 0, hits: [] as Action[] };
    for (let h = 0; h < 24; h++) {
      const hits = days.filter((a) => Math.abs(kstHour(a.at) - h) <= 1);
      if (hits.length > best.hits.length) best = { hour: h, hits };
    }
    if (best.hits.length < 4 || best.hits.length / days.length < 0.6) continue;
    // 실행 시각 = 몰린 창에서 실제로 가장 많이 한 '시'
    const hourCount = new Map<number, number>();
    for (const a of best.hits)
      hourCount.set(kstHour(a.at), (hourCount.get(kstHour(a.at)) ?? 0) + 1);
    best.hour = [...hourCount].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0];

    const weekdays = new Set(best.hits.map((a) => kstWeekday(a.at)));
    const label = list[0].label;
    let cron: string;
    let when: string;
    if (weekdays.size === 1) {
      const wd = [...weekdays][0];
      cron = `0 ${best.hour} * * ${wd}`;
      when = `매주 ${WEEKDAY[wd]}요일 ${hourLabel(best.hour)}`;
    } else if ([...weekdays].every((w) => w >= 1 && w <= 5)) {
      cron = `0 ${best.hour} * * 1-5`;
      when = `평일 ${hourLabel(best.hour)}`;
    } else {
      cron = `0 ${best.hour} * * *`;
      when = `매일 ${hourLabel(best.hour)}`;
    }
    const last = list.reduce((m, a) => (a.at > m ? a.at : m), list[0].at);
    out.push({
      id: `routine:${key}:${cron}`,
      kind: 'routine',
      title: `${when}마다 하는 '${label}'`,
      reason: `최근 ${windowDays}일 중 ${best.hits.length}일, ${when} 무렵에 직접 했어요.`,
      count: list.length,
      days: best.hits.length,
      lastAt: last.toISOString(),
      trigger: { kind: 'schedule', cron, label: when },
      actions: [label],
      prompt:
        `${when}에 자동으로 실행되는 에이전트를 만들어 줘. ` +
        `지금 내가 그 시간마다 손으로 하는 '${label}' 일을 대신 준비해 줘 — ` +
        `대상이 되는 건을 찾아 정리하고, 실제로 ${label}${eul(label)} 하기 전에는 꼭 내 승인을 받아.`,
    });
  }
  return out;
}

/** 이벤트가 생기면 그 건에 하는 일 — 이벤트 뒤 60분 안, 같은 건(id)에 한 행동 */
function reactions(actions: Action[], events: EventRow[], windowDays: number): HabitSuggestion[] {
  const triggers = new Set<string>(TRIGGER_EVENTS);
  const evs = events
    .filter((e) => triggers.has(e.eventType))
    .map((e) => {
      const ids = new Set<string>([e.aggregateId]);
      if (e.payload && typeof e.payload === 'object') {
        for (const v of Object.values(e.payload as Record<string, unknown>)) {
          if (typeof v === 'string' && UUID.test(v)) ids.add(v);
        }
      }
      return { type: e.eventType as TriggerEvent, at: e.occurredAt, ids };
    });
  const pairs = new Map<string, { event: TriggerEvent; action: Action; hits: Action[] }>();
  for (const a of actions) {
    if (!a.ids.size) continue;
    // 행동 바로 전(60분 안) 같은 건의 이벤트 중 가장 가까운 것
    let hit: (typeof evs)[number] | null = null;
    for (const e of evs) {
      const gap = a.at.getTime() - e.at.getTime();
      if (gap < 0 || gap > 3_600_000) continue;
      if (![...a.ids].some((id) => e.ids.has(id))) continue;
      if (!hit || e.at > hit.at) hit = e;
    }
    if (!hit) continue;
    const k = `${hit.type}>${a.key}`;
    const cur = pairs.get(k) ?? { event: hit.type, action: a, hits: [] };
    cur.hits.push(a);
    pairs.set(k, cur);
  }
  const out: HabitSuggestion[] = [];
  for (const [k, p] of pairs) {
    if (p.hits.length < 3) continue;
    const days = new Set(p.hits.map((a) => dayKey(a.at))).size;
    if (days < 2) continue;
    const when = TRIGGER_EVENT_LABEL[p.event];
    const label = p.action.label;
    const last = p.hits.reduce((m, a) => (a.at > m ? a.at : m), p.hits[0].at);
    out.push({
      id: `reaction:${k}`,
      kind: 'reaction',
      title: `${when} 하는 '${label}'`,
      reason: `최근 ${windowDays}일 동안 ${p.hits.length}번, 이벤트가 생기고 1시간 안에 그 건에 직접 했어요.`,
      count: p.hits.length,
      days,
      lastAt: last.toISOString(),
      trigger: { kind: 'event', event: p.event, label: when },
      actions: [label],
      prompt:
        `${when} 자동으로 시작되는 에이전트를 만들어 줘. ` +
        `그 건을 확인해서 지금 내가 매번 손으로 하는 '${label}'${eul(label)} 대신 준비해 줘. ` +
        `실제로 바꾸거나 보내기 전에는 꼭 내 승인을 받아.`,
    });
  }
  return out;
}

/** A를 하고 15분 안에 B를 하는 일이 여러 날 되풀이 */
function sequences(actions: Action[], windowDays: number): HabitSuggestion[] {
  const pairs = new Map<string, { a: string; b: string; hits: Date[] }>();
  for (let i = 1; i < actions.length; i++) {
    const prev = actions[i - 1];
    const cur = actions[i];
    if (prev.key === cur.key) continue;
    if (cur.at.getTime() - prev.at.getTime() > 15 * 60_000) continue;
    const k = `${prev.key}>${cur.key}`;
    const p = pairs.get(k) ?? { a: prev.label, b: cur.label, hits: [] };
    p.hits.push(cur.at);
    pairs.set(k, p);
  }
  const out: HabitSuggestion[] = [];
  for (const [k, p] of pairs) {
    const days = new Set(p.hits.map(dayKey)).size;
    if (p.hits.length < 3 || days < 3) continue;
    const last = p.hits.reduce((m, d) => (d > m ? d : m), p.hits[0]);
    out.push({
      id: `sequence:${k}`,
      kind: 'sequence',
      title: `'${p.a}' 다음에 늘 하는 '${p.b}'`,
      reason: `최근 ${windowDays}일 중 ${days}일, '${p.a}' 뒤 15분 안에 '${p.b}'${eul(p.b)} 이어서 했어요.`,
      count: p.hits.length,
      days,
      lastAt: last.toISOString(),
      trigger: { kind: 'manual', label: '필요할 때 실행' },
      actions: [p.a, p.b],
      prompt:
        `내가 '${p.a}'${eul(p.a)} 하고 나면 늘 이어서 '${p.b}'${eul(p.b)} 해. ` +
        `대상 건을 알려 주면 '${p.b}'에 필요한 내용을 채워 준비하는 에이전트를 만들어 줘. ` +
        `실제로 저장하거나 보내기 전에는 꼭 내 승인을 받아.`,
    });
  }
  return out;
}

const KIND_ORDER: Record<HabitKind, number> = { reaction: 0, routine: 1, sequence: 2 };

/** 최근 행동·이벤트로 제안 목록을 만든다(강한 신호 먼저, 최대 limit개) */
export function detectHabits(
  rows: ActionRow[],
  events: EventRow[],
  opts: { windowDays: number; limit?: number },
): HabitSuggestion[] {
  const actions = rows
    .map(toAction)
    .filter((a): a is Action => !!a)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const reacts = reactions(actions, events, opts.windowDays);
  const seqs = sequences(actions, opts.windowDays);
  // 이벤트 대응이나 '이어서 하는 일'로 이미 설명되는 행동은 시간 반복으로 또 제안하지 않는다
  const explained = new Set([
    ...reacts.flatMap((r) => r.actions),
    ...seqs.map((r) => r.actions[r.actions.length - 1]),
  ]);
  const all = [
    ...reacts,
    ...routines(actions, opts.windowDays).filter((r) => !explained.has(r.actions[0])),
    ...seqs,
  ];
  return all
    .sort((a, b) => b.days - a.days || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.count - a.count)
    .slice(0, opts.limit ?? 6);
}

export const HABIT_WINDOW_DAYS = 30;
