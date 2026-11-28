/**
 * 시·군·구 경계(통계청 2018, southkorea/southkorea-maps kostat topo-simple) — /geo/sigungu-2018.topo.json.
 * 시도 짧은 이름과 '수원시 장안구'처럼 띄어 쓴 이름으로 키를 바꿔 두었다(키 = '시도|시군구').
 * TopoJSON을 직접 풀어(외부 라이브러리 없음) Leaflet이 바로 그릴 수 있는 [위도, 경도] 다각형으로 돌려준다.
 */
export interface SigunguRegion {
  key: string;
  sido: string;
  name: string;
  /** Leaflet 다각형 — 조각마다 [바깥 고리, 구멍…] */
  polygons: [number, number][][][];
  /** 대략의 가운데(자동 배정 거리 계산용) */
  center: [number, number];
}

interface Topology {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: {
    sigungu: {
      geometries: {
        type: 'Polygon' | 'MultiPolygon';
        arcs: number[][] | number[][][];
        properties: { k: string };
      }[];
    };
  };
}

let cache: Promise<SigunguRegion[]> | null = null;

/** 경계 한 번만 받아 푼다(화면 여러 곳에서 써도 한 번) */
export function loadSigungu(): Promise<SigunguRegion[]> {
  if (!cache)
    cache = fetch('/geo/sigungu-2018.topo.json')
      .then((r) => {
        if (!r.ok) throw new Error(`경계 파일을 못 받았습니다(${r.status})`);
        return r.json() as Promise<Topology>;
      })
      .then(decode)
      .catch((e: unknown) => {
        cache = null;
        throw e;
      });
  return cache;
}

function decode(topo: Topology): SigunguRegion[] {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  // 선(arc)은 앞 점과의 차이로 저장돼 있다 — 더해 가며 실제 경도·위도로
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [y * sy + ty, x * sx + tx] as [number, number];
    });
  });
  const ring = (ids: number[]) => {
    const out: [number, number][] = [];
    for (const id of ids) {
      const pts = id < 0 ? [...arcs[~id]].reverse() : arcs[id];
      // 이어지는 선의 첫 점은 앞 선의 끝 점과 같다
      out.push(...(out.length ? pts.slice(1) : pts));
    }
    return out;
  };
  return topo.objects.sigungu.geometries.map((g) => {
    const polys =
      g.type === 'Polygon'
        ? [(g.arcs as number[][]).map(ring)]
        : (g.arcs as number[][][]).map((p) => p.map(ring));
    // 가운데 — 가장 큰 조각 바깥 고리의 점 평균
    const main = polys.reduce((a, b) => (b[0].length > a[0].length ? b : a))[0];
    const center: [number, number] = [
      main.reduce((s, p) => s + p[0], 0) / main.length,
      main.reduce((s, p) => s + p[1], 0) / main.length,
    ];
    const [sido, name] = g.properties.k.split('|');
    return { key: g.properties.k, sido, name, polygons: polys, center };
  });
}

/**
 * 자동 배정 — 빈 구역만 채운다.
 * ① 지점 이름이 구역 이름으로 시작하면 그 구역(예: '분당서현점' → 성남시 분당구, '대구달서점' → 대구 달서구)
 * ② 남은 구역은 가장 가까운(가운데끼리) 배정된 구역의 지점
 */
export function autoAssign(
  regions: SigunguRegion[],
  branches: { id: string; name: string }[],
  current: Map<string, string>,
): Map<string, string> {
  const next = new Map(current);
  const bases = (r: SigunguRegion) =>
    r.name
      .split(' ')
      .map((x) => x.replace(/(특별자치시|특별자치도|시|군|구)$/, ''))
      .filter(Boolean);
  // 이름만으로 찾아도 되는 낱말 — 두 글자 이상이고 한 시도 안에만 있는 것.
  // 여러 시도에 있으면('강서' = 서울·부산) 수도권(서울 → 경기 → 인천) 쪽만 — 지점 대부분이 수도권이다
  const sidosOf = new Map<string, Set<string>>();
  for (const r of regions)
    for (const b of bases(r)) sidosOf.set(b, (sidosOf.get(b) ?? new Set()).add(r.sido));
  const plainOk = (b: string, sido: string) => {
    const s = sidosOf.get(b)!;
    if (b.length < 2) return false;
    if (s.size === 1) return true;
    return ['서울', '경기', '인천'].find((x) => s.has(x)) === sido;
  };
  // 지점 이름 → 찾을 낱말들('개포/도곡/대치점' → 개포·도곡·대치)
  const tokens = branches.map((b) => ({
    id: b.id,
    words: b.name
      .replace(/점$/, '')
      .split(/[/,\s]+/)
      .map((w) => w.replace(/점$/, ''))
      .filter(Boolean),
  }));
  for (const r of regions) {
    if (next.has(r.key)) continue;
    const bs = bases(r);
    let best: { id: string; len: number } | null = null;
    for (const t of tokens)
      for (const w of t.words)
        for (const b of bs)
          for (const cand of plainOk(b, r.sido) ? [b, `${r.sido}${b}`] : [`${r.sido}${b}`])
            if (w.startsWith(cand) && (!best || cand.length > best.len))
              best = { id: t.id, len: cand.length };
    if (best) next.set(r.key, best.id);
  }
  const assigned = regions.filter((r) => next.has(r.key));
  if (!assigned.length) return next;
  for (const r of regions) {
    if (next.has(r.key)) continue;
    let near = assigned[0];
    let dist = Infinity;
    for (const a of assigned) {
      const d = (a.center[0] - r.center[0]) ** 2 + (a.center[1] - r.center[1]) ** 2;
      if (d < dist) {
        dist = d;
        near = a;
      }
    }
    next.set(r.key, next.get(near.key)!);
  }
  return next;
}

/** 지점 색 — 이웃 지점끼리 헷갈리지 않게 열두 색을 돌려 쓴다(이름 순서 기준) */
const PALETTE = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#ca8a04',
  '#db2777',
  '#4f46e5',
  '#65a30d',
  '#0d9488',
  '#b45309',
];
export const branchColor = (index: number) => PALETTE[index % PALETTE.length];
