import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STATS_METRICS,
  STATS_METRIC_LABEL,
  type StatsByUnit,
  type StatsMetric,
} from '@tongin/shared';
import { PageCard, SegmentedControl, Select } from '../ui';
import { KOREA_MAP, loadMuniMap, normalizeSido, projectLatLng, type MuniMap } from './koreaMap';
import { ColumnChart } from './ColumnChart';
import styles from './dashboard.module.css';

/** 막대는 상위 몇 지점까지 */
const TOP_N = 5;
/** 가장 큰 점의 반지름(화면 기준, 지도 전체일 때의 지도 좌표) — 점의 '넓이'가 값에 비례하도록 반지름은 제곱근 */
const MAX_R = 26;
const MIN_R = 4;
/** 시·도 확대 애니메이션 길이(ms) */
const ZOOM_MS = 450;

const won = (n: number) => `${n.toLocaleString()}원`;
/** 막대·지도 위 짧은 표기 — 1,103만 / 2.4억 */
const short = (n: number, metric: StatsMetric) => {
  if (metric !== 'revenue') return `${n.toLocaleString()}건`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return n.toLocaleString();
};

const regionCenter = new Map(KOREA_MAP.regions.map((r) => [r.sido, [r.cx, r.cy] as const]));
const regionName = new Map(KOREA_MAP.regions.map((r) => [r.sido, r.name]));

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

/** SVG viewBox */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const FULL: Box = { x: 0, y: 0, w: KOREA_MAP.width, h: KOREA_MAP.height };

/** 경계 상자 → 여백을 두고 지도 비율(340:440)에 맞춘 viewBox. 그림 칸 크기가 그대로 유지된다 */
function fitBox([x0, y0, x1, y1]: [number, number, number, number]): Box {
  const pad = 0.08;
  let w = (x1 - x0) * (1 + pad * 2);
  let h = (y1 - y0) * (1 + pad * 2);
  const aspect = FULL.w / FULL.h;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

/** 시·도 경로(d)의 경계 상자 — 시군구 파일을 못 받았을 때 대신 쓴다 */
function pathBounds(d: string): [number, number, number, number] {
  const n = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]);
    x1 = Math.max(x1, n[i]);
    y0 = Math.min(y0, n[i + 1]);
    y1 = Math.max(y1, n[i + 1]);
  }
  return [x0, y0, x1, y1];
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * viewBox를 부드럽게 옮긴다. 움직임 줄이기 설정이면 바로 옮긴다.
 * box: 지금 그리는 viewBox, rest: 멈춘 뒤의 viewBox(이름표 배치 기준), moving: 움직이는 중.
 */
function useAnimatedBox() {
  const [box, setBox] = useState<Box>(FULL);
  const [rest, setRest] = useState<Box>(FULL);
  const [moving, setMoving] = useState(false);
  const cur = useRef<Box>(FULL);
  const raf = useRef<number | null>(null);

  useEffect(() => () => void (raf.current != null && cancelAnimationFrame(raf.current)), []);

  const animateTo = useCallback((to: Box) => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    setRest(to);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      cur.current = to;
      setBox(to);
      setMoving(false);
      return;
    }
    const from = cur.current;
    const start = performance.now();
    setMoving(true);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ZOOM_MS);
      const e = ease(t);
      const next = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        w: from.w + (to.w - from.w) * e,
        h: from.h + (to.h - from.h) * e,
      };
      cur.current = next;
      setBox(next);
      if (t < 1) raf.current = requestAnimationFrame(step);
      else {
        raf.current = null;
        setMoving(false);
      }
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  return { box, rest, moving, animateTo };
}

/**
 * 지점 실적 — 지표(접수·계약·작업·매출)를 골라 전국 지도의 점(크기 = 값) 또는 상위 지점 세로 막대로 본다.
 * 한 번에 한 지표만 그린다(단일 계열 — 범례 대신 제목이 무엇을 그렸는지 말한다).
 * 지점 위치는 조직관리에서 넣은 주소 좌표. 좌표가 없으면 그 시·도 한가운데에 찍는다.
 * 시·도를 누르면 그 시·도로 확대해 시군구 경계와 그 안의 지점만 보여 준다(← 전국 / Esc 로 돌아감).
 */
export function UnitPerformance({ byBranch }: { byBranch: StatsByUnit[] }) {
  const [metric, setMetric] = useState<StatsMetric>('revenue');
  const [view, setView] = useState<'map' | 'bar'>('map');
  const [tip, setTip] = useState<Tip | null>(null);
  /** 확대한 시·도(짧은 이름) — null이면 전국 */
  const [sel, setSel] = useState<string | null>(null);
  const [muni, setMuni] = useState<MuniMap | null>(null);
  const [hoverMuni, setHoverMuni] = useState<string | null>(null);
  const { box, rest, moving, animateTo } = useAnimatedBox();
  const req = useRef(0);

  /** 지금 보이는 배율 — 점·글자·선은 이 값으로 나눠 화면에서 같은 크기로 보이게 한다 */
  const k = FULL.w / box.w;
  const kRest = FULL.w / rest.w;

  const zoomTo = useCallback(
    (sido: string) => {
      const token = ++req.current;
      setSel(sido);
      setTip(null);
      setHoverMuni(null);
      setMuni(null);
      const region = KOREA_MAP.regions.find((r) => r.sido === sido);
      loadMuniMap(sido)
        .then((m) => {
          if (token !== req.current) return;
          setMuni(m);
          animateTo(fitBox(m.bbox));
        })
        .catch(() => {
          if (token !== req.current || !region) return;
          animateTo(fitBox(pathBounds(region.d)));
        });
    },
    [animateTo],
  );
  const back = useCallback(() => {
    req.current++;
    setSel(null);
    setMuni(null);
    setTip(null);
    setHoverMuni(null);
    animateTo(FULL);
  }, [animateTo]);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, back]);

  const sorted = useMemo(
    () =>
      [...byBranch]
        .filter((b) => !sel || normalizeSido(b.sido) === sel)
        .sort((a, b) => b[metric] - a[metric]),
    [byBranch, metric, sel],
  );
  const bars = sorted.slice(0, TOP_N);
  // 점 크기 기준은 전국 최댓값 — 확대해도 다른 시·도와 크기를 견줄 수 있게
  const maxV = Math.max(1, ...byBranch.map((b) => b[metric]));

  /** 지도 위 지점 점 — 큰 점을 먼저 그려 작은 점이 가려지지 않게. r은 화면 기준 반지름 */
  const dots = useMemo(
    () =>
      sorted
        .map((b) => {
          const sido = normalizeSido(b.sido);
          const pos =
            b.lat != null && b.lng != null
              ? projectLatLng(b.lat, b.lng)
              : sido
                ? regionCenter.get(sido)
                : undefined;
          if (!pos) return null;
          const v = b[metric];
          const r = v > 0 ? Math.max(MIN_R, Math.sqrt(v / maxV) * MAX_R) : 3;
          return { b, x: pos[0], y: pos[1], r, v, approx: b.lat == null };
        })
        .filter((d): d is NonNullable<typeof d> => !!d)
        .sort((a, b) => b.r - a.r),
    [sorted, metric, maxV],
  );

  /**
   * 이름표 자리 — 값이 큰 지점부터 점의 오른쪽·왼쪽·아래·위 순으로 빈 자리를 찾아 단다.
   * 앞서 단 이름표나 다른 점과 겹치면 다음 자리를 보고, 네 곳 다 막히면 달지 않는다
   * (전국 화면처럼 점이 몰린 곳은 큰 지점만 이름이 붙고, 나머지는 툴팁·시·도 확대로 본다).
   * 겹침은 화면 기준으로 따진다 — 멈춘 뒤의 viewBox(rest)로 화면 좌표를 구해 놓고 지도 좌표로 되돌린다.
   */
  const labels = useMemo(() => {
    const H = 24; // 두 줄(이름·값)
    const sx = (x: number) => (x - rest.x) * kRest;
    const sy = (y: number) => (y - rest.y) * kRest;
    type Rect = [number, number, number, number];
    const hit = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const dotRects: Rect[] = dots.map((d) => {
      const x = sx(d.x),
        y = sy(d.y),
        r = d.r * 0.85;
      return [x - r, y - r, x + r, y + r];
    });
    const placed: Rect[] = [];
    const out: {
      d: (typeof dots)[number];
      lx: number;
      ly: number;
      anchor: 'start' | 'middle' | 'end';
    }[] = [];
    const order = dots
      .map((d, i) => ({ d, i }))
      .filter((x) => x.d.v > 0)
      .sort((a, b) => b.d.v - a.d.v);
    for (const { d, i } of order) {
      const x = sx(d.x),
        y = sy(d.y),
        r = d.r;
      const w = Math.max(d.b.orgUnitName.length * 10.5, short(d.v, metric).length * 7) + 2;
      const cands: { lx: number; ly: number; anchor: 'start' | 'middle' | 'end'; rect: Rect }[] = [
        {
          lx: x + r + 4,
          ly: y - 5,
          anchor: 'start',
          rect: [x + r + 3, y - 11, x + r + 4 + w, y + 13],
        },
        {
          lx: x - r - 4,
          ly: y - 5,
          anchor: 'end',
          rect: [x - r - 4 - w, y - 11, x - r - 3, y + 13],
        },
        {
          lx: x,
          ly: y + r + 8,
          anchor: 'middle',
          rect: [x - w / 2, y + r + 2, x + w / 2, y + r + 2 + H],
        },
        {
          lx: x,
          ly: y - r - 20,
          anchor: 'middle',
          rect: [x - w / 2, y - r - 2 - H, x + w / 2, y - r - 2],
        },
      ];
      const ok = cands.find(
        (c) =>
          c.rect[0] >= 0 &&
          c.rect[2] <= FULL.w &&
          c.rect[1] >= 0 &&
          c.rect[3] <= FULL.h &&
          !placed.some((p) => hit(p, c.rect)) &&
          !dotRects.some((p, j) => j !== i && hit(p, c.rect)),
      );
      if (!ok) continue;
      placed.push(ok.rect);
      out.push({ d, lx: rest.x + ok.lx / kRest, ly: rest.y + ok.ly / kRest, anchor: ok.anchor });
    }
    return out;
  }, [dots, rest, kRest, metric]);

  const detail = (r: StatsByUnit) => [
    `접수 ${r.leadCount}건 · 계약 ${r.contractCount}건`,
    `작업 ${r.workCount}건 · 매출 ${won(r.revenue)}`,
  ];
  const showTip = (e: React.MouseEvent, title: string, lines: string[]) => {
    const el = e.currentTarget.closest(`.${styles.plot}`) as HTMLElement;
    const r = el.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title, lines });
  };

  const area = sel ? `${sel} ` : '';
  const title = `${area}지점별 ${STATS_METRIC_LABEL[metric]}${view === 'bar' ? ` (상위 ${TOP_N})` : ''}`;
  const hoveredLabel = hoverMuni
    ? muni?.labels.find((l) => hoverMuni === l.name || hoverMuni.startsWith(l.name))?.name
    : undefined;

  return (
    <PageCard
      title={
        sel ? (
          <span className={styles.titleRow}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={back}
              aria-label="전국 지도로 돌아가기"
              title="전국 지도로 (Esc)"
            >
              ← 전국
            </button>
            {title}
          </span>
        ) : (
          title
        )
      }
      actions={
        <div className={styles.controls}>
          <div style={{ width: 130 }}>
            <Select
              value={metric}
              onValueChange={(v) => setMetric(v as StatsMetric)}
              options={STATS_METRICS.map((m) => ({ value: m, label: STATS_METRIC_LABEL[m] }))}
              size="sm"
            />
          </div>
          <SegmentedControl
            value={view}
            onChange={(v) => {
              setView(v as 'map' | 'bar');
              setTip(null);
            }}
            options={[
              { value: 'map', label: '지도' },
              { value: 'bar', label: '막대' },
            ]}
            size="sm"
          />
        </div>
      }
    >
      {byBranch.length === 0 ? (
        <div className={styles.empty}>데이터가 없습니다</div>
      ) : view === 'bar' ? (
        <div className={styles.plotBox}>
          {bars.length === 0 ? (
            <div className={styles.empty}>{regionName.get(sel ?? '')}에 지점이 없습니다</div>
          ) : (
            <ColumnChart
              label={title}
              items={bars.map((b) => ({
                key: b.orgUnitId ?? b.orgUnitName,
                label: b.orgUnitName,
                value: b[metric],
                valueLabel: short(b[metric], metric),
                tip: detail(b),
              }))}
            />
          )}
        </div>
      ) : (
        <div className={[styles.plot, styles.plotBox].join(' ')} onMouseLeave={() => setTip(null)}>
          <svg
            viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
            className={styles.map}
            role="img"
            aria-label={`${title} 지도`}
          >
            {KOREA_MAP.regions.map((r) => {
              const isSel = r.sido === sel;
              return (
                <path
                  key={r.sido}
                  d={r.d}
                  className={[
                    styles.region,
                    isSel ? '' : styles.regionClickable,
                    sel && !isSel ? styles.regionDim : '',
                  ].join(' ')}
                  vectorEffect="non-scaling-stroke"
                  role={isSel ? undefined : 'button'}
                  tabIndex={isSel ? undefined : 0}
                  aria-label={isSel ? undefined : `${r.name} 확대`}
                  onClick={isSel ? undefined : () => zoomTo(r.sido)}
                  onKeyDown={
                    isSel
                      ? undefined
                      : (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            zoomTo(r.sido);
                          }
                        }
                  }
                >
                  <title>{r.name}</title>
                </path>
              );
            })}
            {muni && sel === muni.sido && (
              <g>
                {muni.areas.map((a) => (
                  <path
                    key={a.name}
                    d={a.d}
                    className={styles.muni}
                    vectorEffect="non-scaling-stroke"
                    onMouseEnter={() => setHoverMuni(a.name)}
                    onMouseLeave={() => setHoverMuni((h) => (h === a.name ? null : h))}
                  />
                ))}
                {muni.labels.map((l) => (
                  <text
                    key={l.name}
                    x={l.x}
                    y={l.y}
                    className={[
                      styles.muniLabel,
                      hoveredLabel === l.name ? styles.muniLabelOn : '',
                    ].join(' ')}
                    style={{ fontSize: 9 / k, opacity: moving ? 0 : undefined }}
                  >
                    {l.name}
                  </text>
                ))}
              </g>
            )}
            {dots.map((d) => (
              <g
                key={d.b.orgUnitId ?? d.b.orgUnitName}
                className={styles.dot}
                onMouseMove={(e) =>
                  showTip(e, d.b.orgUnitName, [
                    ...detail(d.b),
                    ...(d.approx ? ['위치 미등록 — 시·도 중심에 표시'] : []),
                  ])
                }
              >
                {/* 마우스를 올리기 쉽게 보이는 점보다 넓은 투명 영역 */}
                <circle cx={d.x} cy={d.y} r={Math.max(d.r, 10) / k} fill="transparent" />
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={d.r / k}
                  vectorEffect="non-scaling-stroke"
                  className={d.v > 0 ? styles.dotFill : styles.dotEmpty}
                />
              </g>
            ))}
            <g className={styles.labels} style={{ opacity: moving ? 0 : 1 }}>
              {labels.map(({ d, lx, ly, anchor }) => (
                <text
                  key={`t-${d.b.orgUnitId ?? d.b.orgUnitName}`}
                  x={lx}
                  y={ly}
                  textAnchor={anchor}
                  className={styles.dotLabel}
                  style={{ fontSize: 10 / k, strokeWidth: 2.5 / k }}
                >
                  <tspan x={lx}>{d.b.orgUnitName}</tspan>
                  <tspan x={lx} dy="1.1em" className={styles.mapValue}>
                    {short(d.v, metric)}
                  </tspan>
                </text>
              ))}
            </g>
          </svg>
          {!moving && (
            <div className={styles.mapNote}>
              {!sel
                ? '시·도를 누르면 확대합니다'
                : dots.length === 0
                  ? `${regionName.get(sel)}에 지점이 없습니다`
                  : null}
            </div>
          )}
          {tip && <TipBox tip={tip} />}
        </div>
      )}
    </PageCard>
  );
}

function TipBox({ tip }: { tip: Tip }) {
  return (
    <div className={styles.tip} style={{ left: tip.x + 12, top: tip.y + 12 }} role="tooltip">
      <div className={styles.tipTitle}>{tip.title}</div>
      {tip.lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}
