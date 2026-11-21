/**
 * 목록 화면 서버 거르기 — 화면 공통 필터(FilterButton)의 값과 검색어를 Prisma where로 바꾼다.
 *
 * 화면은 `?f=<JSON>&q=<검색어>`로 보낸다(apps/web/src/lib/serverFilter.ts).
 *   f = { [조건 key]: { from, to, on } | string[] | string }
 * 서비스는 조건마다 규칙을 정해 둔다:
 *   const RULES: ListFilterRules = {
 *     period: { date: { createdAt: ['createdAt', 'ts'], moveDate: ['moveDate', 'date'] } },
 *     status: { in: 'status' },
 *     owner:  { one: { yes: { ownerEmpId: { not: null } }, no: { ownerEmpId: null } } },
 *   };
 *   where: { AND: [...scope, ...listWhere(RULES, f, q, ['docNo', 'customer.name'])] }
 * 화면에서 고른 값 중 규칙이 없는 key는 무시한다(멋대로 칸을 거를 수 없게).
 */
type Where = Record<string, unknown>;

/** 날짜 칸 종류 — ts: 시각(timestamptz, 한국 날짜로 끊는다), date: 날짜만(@db.Date) */
type DateKind = 'ts' | 'date';

export type ListFilterRule =
  /** 기간 — 고를 수 있는 날짜 칸(화면 options 값 → [칸 경로, 종류]), 첫 번째가 기본 */
  | { date: Record<string, [string, DateKind]> }
  /** 여러 개 고르기 — 칸 경로의 값이 고른 것 중 하나 */
  | { in: string }
  /** 하나 고르기 — 고른 값마다 조건 */
  | { one: Record<string, Where> }
  /** 직접 만든 조건(여러 개 고르기 → where) */
  | { custom: (v: string[] | string | DateRangeValue) => Where | null };

export type ListFilterRules = Record<string, ListFilterRule>;
type DateRangeValue = { from?: string; to?: string; on?: string };

/** 한 번에 보내는 목록 상한 — 화면은 이만큼 받으면 '조건을 좁혀 주세요'를 띄운다 */
export const LIST_LIMIT = 1000;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'customer.name' → { customer: { name: cond } } */
export const nest = (path: string, cond: unknown): Where =>
  path
    .split('.')
    .reverse()
    .reduce<unknown>((acc, k) => ({ [k]: acc }), cond) as Where;

export function parseFilter(raw?: string): Record<string, unknown> {
  if (!raw || raw.length > 4000) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];

export function dateWhere(path: string, kind: DateKind, from?: string, to?: string): Where | null {
  const f = from && DAY_RE.test(from) ? from : undefined;
  const t = to && DAY_RE.test(to) ? to : undefined;
  if (!f && !t) return null;
  if (kind === 'ts') {
    const lt = t ? new Date(new Date(`${t}T00:00:00+09:00`).getTime() + 86_400_000) : undefined;
    return nest(path, {
      ...(f ? { gte: new Date(`${f}T00:00:00+09:00`) } : {}),
      ...(lt ? { lt } : {}),
    });
  }
  return nest(path, {
    ...(f ? { gte: new Date(`${f}T00:00:00Z`) } : {}),
    ...(t ? { lte: new Date(`${t}T00:00:00Z`) } : {}),
  });
}

/** 검색어 → OR 조건. phonePaths는 하이픈 없이 친 번호(01012345678)도 찾는다 */
export function searchWhere(q: string | undefined, paths: string[], phonePaths: string[] = []) {
  const s = q?.trim().slice(0, 100);
  if (!s || !paths.length) return null;
  const or: Where[] = paths.map((p) => nest(p, { contains: s, mode: 'insensitive' }));
  const digits = s.replace(/\D/g, '');
  if (phonePaths.length && digits.length >= 4) {
    const dashed =
      /^\d+$/.test(s) && digits.length >= 9
        ? digits.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, '$1-$2-$3')
        : null;
    // 저장값이 숫자만이든 하이픈이 있든 — 숫자만·하이픈 붙인 꼴 둘 다로 찾는다
    for (const p of phonePaths) {
      or.push(nest(p, { contains: digits }));
      if (dashed) or.push(nest(p, { contains: dashed }));
    }
  }
  return { OR: or };
}

/** 필터 값(f)·검색어(q) → AND로 이어 붙일 조건 목록 */
export function listWhere(
  rules: ListFilterRules,
  raw: string | undefined,
  q?: string,
  searchPaths: string[] = [],
  phonePaths: string[] = [],
): Where[] {
  const f = parseFilter(raw);
  const out: Where[] = [];
  for (const [key, rule] of Object.entries(rules)) {
    const v = f[key];
    if (v === undefined || v === null || v === '') continue;
    if ('date' in rule) {
      const r = v as DateRangeValue;
      const keys = Object.keys(rule.date);
      const target = rule.date[r.on && rule.date[r.on] ? r.on : keys[0]];
      const w = target && dateWhere(target[0], target[1], r.from, r.to);
      if (w) out.push(w);
    } else if ('in' in rule) {
      const list = strList(v);
      if (list.length) out.push(nest(rule.in, { in: list }));
    } else if ('one' in rule) {
      const w = typeof v === 'string' ? rule.one[v] : undefined;
      if (w) out.push(w);
    } else {
      const w = rule.custom(v as string[] | string | DateRangeValue);
      if (w) out.push(w);
    }
  }
  const s = searchWhere(q, searchPaths, phonePaths);
  if (s) out.push(s);
  return out;
}
