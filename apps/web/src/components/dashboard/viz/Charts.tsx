import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { DashData, DashFormat, DashItem, DashViz } from '@tongin/shared';
import { KOREA_MAP, normalizeSido, projectLatLng } from '../koreaMap';
import styles from './viz.module.css';

// ── 숫자 표기 ──
export function fmt(v: number, f: DashFormat | 'date' | 'text' | undefined): string {
  if (!Number.isFinite(v)) return '-';
  if (f === 'percent') return `${(v * 100).toFixed(1)}%`;
  if (f === 'won') {
    const a = Math.abs(v);
    if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e10 ? 0 : 1)}억`;
    if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
    return v.toLocaleString();
  }
  return v.toLocaleString();
}
/** 툴팁·표에 쓰는 정확한 값 */
export function fmtExact(v: number, f: DashFormat | 'date' | 'text' | undefined): string {
  if (f === 'percent') return `${(v * 100).toFixed(1)}%`;
  if (f === 'won') return `${Math.round(v).toLocaleString()}원`;
  return `${v.toLocaleString()}${f === 'count' ? '건' : ''}`;
}
const fmtDate = (s: unknown) => {
  if (!s) return '-';
  const d = new Date(String(s));
  return Number.isNaN(d.getTime())
    ? String(s)
    : d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
};

/** 축 눈금 — 1·2·5 단위로 보기 좋은 최댓값 */
function niceMax(max: number, ticks = 4): { top: number; step: number } {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { top: step * ticks, step };
}

/** 범주 색 — 항목 이름 순서로 고정(값 순위가 바뀌어도 같은 항목은 같은 색). 9번째부터·'기타'는 회색 */
function colorMap(keys: string[]): Map<string, string> {
  const sorted = [...keys].filter((k) => k !== 'OTHER').sort();
  const m = new Map<string, string>();
  sorted.forEach((k, i) => m.set(k, i < 8 ? `var(--series-${i + 1})` : 'var(--series-other)'));
  m.set('OTHER', 'var(--series-other)');
  return m;
}

// ── 크기 재기 ──
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) =>
        Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1
          ? s
          : { width: Math.floor(width), height: Math.floor(height) },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

// ── 툴팁 ──
interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const node = tip ? (
    <div className={styles.tip} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.content}
    </div>
  ) : null;
  return { tip: node, show: setTip, hide: () => setTip(null) };
}

const Empty = ({ children = '표시할 데이터가 없습니다' }: { children?: ReactNode }) => (
  <div className={styles.empty}>{children}</div>
);

// ═══════════ 숫자 카드 ═══════════
function CardViz({ d }: { d: Extract<DashData, { shape: 'value' }> }) {
  const prev = d.previous;
  const diff = prev != null && prev !== 0 ? (d.value - prev) / prev : null;
  const Icon =
    diff == null ? null : diff > 0.0005 ? ArrowUpRight : diff < -0.0005 ? ArrowDownRight : Minus;
  return (
    <div className={styles.card}>
      <div className={styles.hero} title={fmtExact(d.value, d.format)}>
        {fmt(d.value, d.format)}
        {d.format === 'won' && <span style={{ fontSize: '0.5em', marginLeft: 2 }}>원</span>}
      </div>
      {Icon && diff != null ? (
        <span className={styles.delta}>
          <span className={diff > 0 ? styles.deltaUp : diff < 0 ? styles.deltaDown : undefined}>
            <Icon size={13} aria-hidden style={{ verticalAlign: -2 }} /> {diff > 0 ? '+' : ''}
            {(diff * 100).toFixed(1)}%
          </span>
          앞 기간 {fmt(prev!, d.format)}
        </span>
      ) : prev === 0 ? (
        <span className={styles.delta}>앞 기간 0</span>
      ) : null}
      {d.hint && <span className={styles.hint}>{d.hint}</span>}
    </div>
  );
}

// ═══════════ 게이지 ═══════════
function GaugeViz({ d }: { d: Extract<DashData, { shape: 'value' }> }) {
  const ratio = Math.max(0, Math.min(1, d.value / (d.max ?? 1)));
  const r = 80;
  const arc = (t: number) => {
    const a = Math.PI * (1 - t);
    return [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
  };
  const [sx, sy] = arc(0);
  const [ex, ey] = arc(1);
  const [vx, vy] = arc(ratio);
  return (
    <div className={styles.card} style={{ alignItems: 'center', gap: 2 }}>
      <svg viewBox="0 0 200 112" className={styles.svg} style={{ maxHeight: 'calc(100% - 22px)' }}>
        <path
          d={`M${sx},${sy} A${r},${r} 0 0 1 ${ex},${ey}`}
          fill="none"
          stroke="var(--grid)"
          strokeWidth={16}
          strokeLinecap="round"
        />
        {ratio > 0 && (
          <path
            d={`M${sx},${sy} A${r},${r} 0 0 1 ${vx},${vy}`}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={16}
            strokeLinecap="round"
          />
        )}
        <text
          x={100}
          y={92}
          textAnchor="middle"
          style={{ fill: 'var(--ink)', fontSize: 30, fontWeight: 700 }}
        >
          {fmt(d.value, d.format)}
        </text>
      </svg>
      {d.hint && <span className={styles.hint}>{d.hint}</span>}
    </div>
  );
}

// ═══════════ 세로 막대(범주·시간) ═══════════
function ColumnViz({
  items,
  format,
}: {
  items: { key: string; label: string; value: number }[];
  format: DashFormat;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  if (!items.length) return <Empty />;
  const m = { l: 44, r: 8, t: 18, b: 22 };
  const w = Math.max(0, width - m.l - m.r);
  const h = Math.max(0, height - m.t - m.b);
  const { top, step } = niceMax(Math.max(...items.map((i) => i.value)));
  const band = w / items.length;
  const bw = Math.max(2, Math.min(48, band - 2));
  const maxIdx = items.reduce((mi, it, i) => (it.value > items[mi].value ? i : mi), 0);
  const every = Math.max(1, Math.ceil(items.length / Math.max(1, Math.floor(w / 46))));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return (
    <div ref={ref} className={styles.vizRoot}>
      {width > 0 && (
        <svg className={styles.svg} width={width} height={height} onMouseLeave={hide}>
          <g transform={`translate(${m.l},${m.t})`}>
            {ticks.map((t) => {
              const y = h - (t / top) * h;
              return (
                <g key={t}>
                  {t > 0 && <line x1={0} x2={w} y1={y} y2={y} className={styles.gridLine} />}
                  <text x={-6} y={y} dy="0.32em" textAnchor="end" className={styles.axisText}>
                    {fmt(t, format)}
                  </text>
                </g>
              );
            })}
            {items.map((it, i) => {
              const bh = (it.value / top) * h;
              const x = i * band + (band - bw) / 2;
              const y = h - bh;
              const rr = Math.min(4, bw / 2, bh);
              return (
                <g key={it.key}>
                  <path
                    d={`M${x},${h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${h} Z`}
                    fill="var(--series-1)"
                  />
                  {i === maxIdx && it.value > 0 && (
                    <text x={x + bw / 2} y={y - 5} textAnchor="middle" className={styles.valueText}>
                      {fmt(it.value, format)}
                    </text>
                  )}
                  {i % every === 0 && (
                    <text x={x + bw / 2} y={h + 15} textAnchor="middle" className={styles.axisText}>
                      {it.label}
                    </text>
                  )}
                  <rect
                    x={i * band}
                    y={0}
                    width={band}
                    height={h}
                    fill="transparent"
                    onMouseMove={() =>
                      show({
                        x: m.l + x + bw / 2,
                        y: m.t + y,
                        content: (
                          <>
                            {it.label} · <b>{fmtExact(it.value, format)}</b>
                          </>
                        ),
                      })
                    }
                  />
                </g>
              );
            })}
            <line x1={0} x2={w} y1={h} y2={h} className={styles.baseline} />
          </g>
        </svg>
      )}
      {tip}
    </div>
  );
}

// ═══════════ 가로 막대 ═══════════
function HBarViz({
  items,
  format,
}: {
  items: { key: string; label: string; value: number }[];
  format: DashFormat;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  if (!items.length) return <Empty />;
  const labelW = Math.min(110, Math.max(60, width * 0.28));
  const valueW = 58;
  const rowH = Math.max(18, Math.min(30, height / items.length));
  const barH = Math.max(8, rowH - 8);
  const w = Math.max(0, width - labelW - valueW);
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div ref={ref} className={styles.vizRoot} style={{ overflowY: 'auto' }}>
      {width > 0 && (
        <svg
          className={styles.svg}
          width={width}
          height={rowH * items.length}
          onMouseLeave={hide}
          style={{ height: rowH * items.length }}
        >
          {items.map((it, i) => {
            const y = i * rowH + (rowH - barH) / 2;
            const bw = Math.max(it.value > 0 ? 2 : 0, (it.value / max) * w);
            const rr = Math.min(4, barH / 2, bw);
            return (
              <g
                key={it.key}
                onMouseMove={() =>
                  show({
                    x: labelW + bw / 2,
                    y,
                    content: (
                      <>
                        {it.label} · <b>{fmtExact(it.value, format)}</b>
                      </>
                    ),
                  })
                }
              >
                <rect x={0} y={i * rowH} width={width} height={rowH} fill="transparent" />
                <text
                  x={labelW - 8}
                  y={y + barH / 2}
                  dy="0.32em"
                  textAnchor="end"
                  className={styles.labelText}
                >
                  {it.label.length > 9 ? `${it.label.slice(0, 8)}…` : it.label}
                </text>
                <path
                  d={`M${labelW},${y} H${labelW + bw - rr} Q${labelW + bw},${y} ${labelW + bw},${y + rr} V${y + barH - rr} Q${labelW + bw},${y + barH} ${labelW + bw - rr},${y + barH} H${labelW} Z`}
                  fill={it.key === 'OTHER' ? 'var(--series-other)' : 'var(--series-1)'}
                />
                <text x={labelW + bw + 6} y={y + barH / 2} dy="0.32em" className={styles.valueText}>
                  {fmt(it.value, format)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {tip}
    </div>
  );
}

// ═══════════ 선·영역 ═══════════
function LineViz({
  points,
  format,
  area,
}: {
  points: { x: string; label: string; value: number }[];
  format: DashFormat;
  area?: boolean;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <Empty />;
  const m = { l: 44, r: 14, t: 18, b: 22 };
  const w = Math.max(0, width - m.l - m.r);
  const h = Math.max(0, height - m.t - m.b);
  const { top, step } = niceMax(Math.max(...points.map((p) => p.value)));
  const xs = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const ys = (v: number) => h - (v / top) * h;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(p.value)}`).join(' ');
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(w / 50))));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const last = points.length - 1;
  const hp = hover != null ? points[hover] : null;
  return (
    <div ref={ref} className={styles.vizRoot}>
      {width > 0 && (
        <svg
          className={styles.svg}
          width={width}
          height={height}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - rect.left - m.l;
            const i = Math.round((px / Math.max(1, w)) * (points.length - 1));
            setHover(Math.max(0, Math.min(last, i)));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <g transform={`translate(${m.l},${m.t})`}>
            {ticks.map((t) => (
              <g key={t}>
                {t > 0 && <line x1={0} x2={w} y1={ys(t)} y2={ys(t)} className={styles.gridLine} />}
                <text x={-6} y={ys(t)} dy="0.32em" textAnchor="end" className={styles.axisText}>
                  {fmt(t, format)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % every === 0 || i === last ? (
                <text
                  key={p.x}
                  x={xs(i)}
                  y={h + 15}
                  textAnchor="middle"
                  className={styles.axisText}
                >
                  {i % every === 0 || i === last ? p.label : ''}
                </text>
              ) : null,
            )}
            {area && (
              <path
                d={`${line} L${xs(last)},${h} L${xs(0)},${h} Z`}
                fill="var(--series-1)"
                fillOpacity={0.14}
              />
            )}
            <path
              d={line}
              fill="none"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <line x1={0} x2={w} y1={h} y2={h} className={styles.baseline} />
            {/* 마지막 값은 바로 읽히게 */}
            <circle
              cx={xs(last)}
              cy={ys(points[last].value)}
              r={4}
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
            <text
              x={xs(last)}
              y={ys(points[last].value) - 9}
              textAnchor="end"
              className={styles.valueText}
            >
              {fmt(points[last].value, format)}
            </text>
            {hp && hover != null && (
              <g>
                <line
                  x1={xs(hover)}
                  x2={xs(hover)}
                  y1={0}
                  y2={h}
                  stroke="var(--axis)"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={xs(hover)}
                  cy={ys(hp.value)}
                  r={5}
                  fill="var(--series-1)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              </g>
            )}
          </g>
        </svg>
      )}
      {hp && hover != null && (
        <div
          className={styles.tip}
          style={{ left: m.l + xs(hover), top: m.t + ys(hp.value) }}
          role="tooltip"
        >
          {hp.label} · <b>{fmtExact(hp.value, format)}</b>
        </div>
      )}
    </div>
  );
}

// ═══════════ 원·도넛 ═══════════
function PieViz({
  items,
  format,
  donut,
}: {
  items: { key: string; label: string; value: number }[];
  format: DashFormat;
  donut?: boolean;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const colors = useMemo(() => colorMap(items.map((i) => i.key)), [items]);
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return <Empty />;
  const narrow = width < 300;
  const size = Math.max(
    40,
    Math.min(narrow ? width : width * 0.56, narrow ? height - 70 : height) - 8,
  );
  const r = size / 2;
  const ir = donut ? r * 0.6 : 0;
  let a0 = -Math.PI / 2;
  const arcs = items.map((it) => {
    const a1 = a0 + (it.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => [r + rad * Math.cos(a), r + rad * Math.sin(a)];
    const [x0, y0] = p(r, a0);
    const [x1, y1] = p(r, a1);
    const full = it.value === total;
    let d: string;
    if (full) {
      d = donut
        ? `M${r},0 A${r},${r} 0 1 1 ${r - 0.01},0 Z M${r},${r - ir} A${ir},${ir} 0 1 0 ${r + 0.01},${r - ir} Z`
        : `M${r},0 A${r},${r} 0 1 1 ${r - 0.01},0 Z`;
    } else if (donut) {
      const [ix1, iy1] = p(ir, a1);
      const [ix0, iy0] = p(ir, a0);
      d = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${ix1},${iy1} A${ir},${ir} 0 ${large} 0 ${ix0},${iy0} Z`;
    } else {
      d = `M${r},${r} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
    }
    const mid = (a0 + a1) / 2;
    a0 = a1;
    return { it, d, mid };
  });
  return (
    <div
      ref={ref}
      className={`${styles.vizRoot} ${styles.pieWrap} ${narrow ? styles.pieWrapNarrow : ''}`}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 0,
          height: '100%',
        }}
      >
        {width > 0 && (
          <svg width={size} height={size} style={{ overflow: 'visible' }} onMouseLeave={hide}>
            {arcs.map(({ it, d, mid }) => (
              <path
                key={it.key}
                d={d}
                fill={colors.get(it.key)}
                stroke="var(--surface)"
                strokeWidth={2}
                fillRule="evenodd"
                onMouseMove={() =>
                  show({
                    x:
                      (narrow ? width / 2 - r : (width * 0.56 - size) / 2) +
                      r +
                      Math.cos(mid) * r * 0.7,
                    y: r + Math.sin(mid) * r * 0.7,
                    content: (
                      <>
                        {it.label} · <b>{fmtExact(it.value, format)}</b> (
                        {((it.value / total) * 100).toFixed(1)}%)
                      </>
                    ),
                  })
                }
              />
            ))}
            {donut && (
              <>
                <text x={r} y={r - 4} textAnchor="middle" className={styles.axisText}>
                  합계
                </text>
                <text
                  x={r}
                  y={r + 14}
                  textAnchor="middle"
                  style={{ fill: 'var(--ink)', fontSize: Math.max(13, r / 4), fontWeight: 700 }}
                >
                  {fmt(total, format)}
                </text>
              </>
            )}
          </svg>
        )}
      </div>
      <div className={styles.legend}>
        {items.map((it) => (
          <div key={it.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: colors.get(it.key) }} />
            <span title={it.label}>{it.label}</span>
            <b>
              {fmt(it.value, format)}{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                {((it.value / total) * 100).toFixed(0)}%
              </span>
            </b>
          </div>
        ))}
      </div>
      {tip}
    </div>
  );
}

// ═══════════ 퍼널 ═══════════
function FunnelViz({
  items,
  format,
}: {
  items: { key: string; label: string; value: number }[];
  format: DashFormat;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  if (!items.length || !items[0].value) return <Empty />;
  const labelW = Math.min(90, width * 0.25);
  const sideW = 92;
  const w = Math.max(0, width - labelW - sideW);
  const rowH = Math.max(20, Math.min(36, height / items.length));
  const barH = rowH - 6;
  const first = items[0].value;
  return (
    <div ref={ref} className={styles.vizRoot} style={{ overflowY: 'auto' }}>
      {width > 0 && (
        <svg
          width={width}
          height={rowH * items.length}
          className={styles.svg}
          style={{ height: rowH * items.length }}
          onMouseLeave={hide}
        >
          {items.map((it, i) => {
            const bw = Math.max(2, (it.value / first) * w);
            const x = labelW + (w - bw) / 2;
            const y = i * rowH + 3;
            const prev = i ? items[i - 1].value : null;
            return (
              <g
                key={it.key}
                onMouseMove={() =>
                  show({
                    x: labelW + w / 2,
                    y,
                    content: (
                      <>
                        {it.label} · <b>{fmtExact(it.value, format)}</b>
                        {prev ? ` · 앞 단계의 ${((it.value / prev) * 100).toFixed(0)}%` : ''}
                      </>
                    ),
                  })
                }
              >
                <rect x={0} y={i * rowH} width={width} height={rowH} fill="transparent" />
                <text
                  x={labelW - 8}
                  y={y + barH / 2}
                  dy="0.32em"
                  textAnchor="end"
                  className={styles.labelText}
                >
                  {it.label}
                </text>
                <rect
                  x={x}
                  y={y}
                  width={bw}
                  height={barH}
                  rx={4}
                  fill="var(--series-1)"
                  fillOpacity={1 - i * 0.07}
                />
                <text x={labelW + w + 8} y={y + barH / 2} dy="0.32em" className={styles.valueText}>
                  {fmt(it.value, format)}
                  <tspan className={styles.axisText} dx={4}>
                    {((it.value / first) * 100).toFixed(0)}%
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {tip}
    </div>
  );
}

// ═══════════ 히트맵 ═══════════
function HeatmapViz({ d }: { d: Extract<DashData, { shape: 'matrix' }> }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const max = Math.max(0, ...d.cells.flat());
  if (!d.rows.length) return <Empty />;
  const labelW = Math.min(76, Math.max(28, Math.max(...d.rows.map((r) => r.length)) * 11 + 8));
  const topH = 18;
  const cw = Math.max(4, (width - labelW) / d.cols.length);
  const ch = Math.max(8, Math.min(34, (height - topH - 18) / d.rows.length));
  const every = Math.max(
    1,
    Math.ceil(d.cols.length / Math.max(1, Math.floor((width - labelW) / 34))),
  );
  const step = (v: number) => (v <= 0 || !max ? 0 : Math.min(7, Math.ceil((v / max) * 7)));
  return (
    <div ref={ref} className={styles.vizRoot}>
      {width > 0 && (
        <svg className={styles.svg} width={width} height={height} onMouseLeave={hide}>
          {d.cols.map((c, ci) =>
            ci % every === 0 ? (
              <text
                key={c + ci}
                x={labelW + ci * cw + cw / 2}
                y={12}
                textAnchor="middle"
                className={styles.axisText}
              >
                {c}
              </text>
            ) : null,
          )}
          {d.rows.map((r, ri) => (
            <g key={r + ri}>
              <text
                x={labelW - 6}
                y={topH + ri * ch + ch / 2}
                dy="0.32em"
                textAnchor="end"
                className={styles.labelText}
              >
                {r.length > 6 ? `${r.slice(0, 5)}…` : r}
              </text>
              {d.cols.map((c, ci) => {
                const v = d.cells[ri]?.[ci] ?? 0;
                return (
                  <rect
                    key={ci}
                    x={labelW + ci * cw + 1}
                    y={topH + ri * ch + 1}
                    width={Math.max(1, cw - 2)}
                    height={Math.max(1, ch - 2)}
                    rx={3}
                    fill={`var(--seq-${step(v)})`}
                    onMouseMove={() =>
                      show({
                        x: labelW + ci * cw + cw / 2,
                        y: topH + ri * ch,
                        content: (
                          <>
                            {r} · {c} · <b>{fmtExact(v, d.format)}</b>
                          </>
                        ),
                      })
                    }
                  />
                );
              })}
            </g>
          ))}
          {/* 범례: 0 → 최대 */}
          <g transform={`translate(${labelW},${topH + d.rows.length * ch + 6})`}>
            <text x={0} y={8} className={styles.axisText}>
              0
            </text>
            {Array.from({ length: 7 }, (_, i) => (
              <rect
                key={i}
                x={14 + i * 14}
                y={2}
                width={12}
                height={8}
                rx={2}
                fill={`var(--seq-${i + 1})`}
              />
            ))}
            <text x={14 + 7 * 14 + 4} y={8} className={styles.axisText}>
              {fmt(max, d.format)}
            </text>
          </g>
        </svg>
      )}
      {tip}
    </div>
  );
}

// ═══════════ 지도(시도 단계 구분도 · 지점 점) ═══════════
function MapViz({ d }: { d: Extract<DashData, { shape: 'category' | 'points' }> }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const bySido = useMemo(() => {
    const m = new Map<string, number>();
    if (d.shape === 'category') {
      for (const it of d.items) {
        const s = normalizeSido(it.key);
        if (s) m.set(s, (m.get(s) ?? 0) + it.value);
      }
    }
    return m;
  }, [d]);
  const max =
    d.shape === 'category'
      ? Math.max(0, ...bySido.values())
      : Math.max(0, ...d.points.map((p) => p.value));
  const step = (v: number) => (v <= 0 || !max ? 0 : Math.min(7, Math.ceil((v / max) * 7)));
  const vb = `0 0 ${KOREA_MAP.width} ${KOREA_MAP.height}`;
  const scale =
    Math.min(width / KOREA_MAP.width, Math.max(10, height - 18) / KOREA_MAP.height) || 1;
  const toScreen = (x: number, y: number) => {
    const ox = (width - KOREA_MAP.width * scale) / 2;
    return { x: ox + x * scale, y: y * scale };
  };
  return (
    <div ref={ref} className={`${styles.vizRoot} ${styles.mapWrap}`}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <svg
          viewBox={vb}
          className={styles.svg}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={hide}
        >
          {KOREA_MAP.regions.map((r) => {
            const v = bySido.get(r.sido) ?? 0;
            return (
              <path
                key={r.sido}
                d={r.d}
                className={styles.region}
                fill={
                  d.shape === 'category'
                    ? v
                      ? `var(--seq-${step(v)})`
                      : 'var(--map-empty)'
                    : 'var(--map-empty)'
                }
                onMouseMove={
                  d.shape === 'category'
                    ? () => {
                        const p = toScreen(r.cx, r.cy);
                        show({
                          x: p.x,
                          y: p.y,
                          content: (
                            <>
                              {r.name} · <b>{fmtExact(v, d.format)}</b>
                            </>
                          ),
                        });
                      }
                    : undefined
                }
              />
            );
          })}
          {d.shape === 'points' &&
            [...d.points]
              .sort((a, b) => b.value - a.value)
              .map((p) => {
                const [x, y] = projectLatLng(p.lat, p.lng);
                const rad = max ? 3 + Math.sqrt(p.value / max) * 13 : 4;
                return (
                  <circle
                    key={p.key}
                    cx={x}
                    cy={y}
                    r={rad}
                    className={styles.dot}
                    onMouseMove={() => {
                      const s = toScreen(x, y);
                      show({
                        x: s.x,
                        y: s.y - rad * scale,
                        content: (
                          <>
                            {p.label} · <b>{fmtExact(p.value, d.format)}</b>
                          </>
                        ),
                      });
                    }}
                  />
                );
              })}
        </svg>
        {tip}
      </div>
      <div className={styles.mapScale}>
        {d.shape === 'category' ? (
          <>
            적음
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ background: `var(--seq-${i + 1})` }} />
            ))}
            많음 · 최대 {fmt(max, d.format)}
          </>
        ) : (
          <>원 크기 = 값 · 최대 {fmt(max, d.format)}</>
        )}
      </div>
    </div>
  );
}

// ═══════════ 표 ═══════════
function TableViz({ d }: { d: DashData }) {
  const navigate = useNavigate();
  let head: { label: string; num?: boolean }[] = [];
  let body: (string | number)[][] = [];
  let links: (string | null)[] = [];
  if (d.shape === 'value') {
    head = [{ label: '값', num: true }];
    body = [[fmtExact(d.value, d.format)]];
  } else if (d.shape === 'category') {
    const total = d.items.reduce((s, i) => s + i.value, 0);
    head = [{ label: '항목' }, { label: '값', num: true }, { label: '비중', num: true }];
    body = d.items.map((i) => [
      i.label,
      fmtExact(i.value, d.format),
      total ? `${((i.value / total) * 100).toFixed(1)}%` : '-',
    ]);
  } else if (d.shape === 'series') {
    head = [{ label: '기간' }, { label: '값', num: true }];
    body = [...d.points].reverse().map((p) => [p.label, fmtExact(p.value, d.format)]);
  } else if (d.shape === 'matrix') {
    head = [{ label: '' }, ...d.cols.map((c) => ({ label: c, num: true }))];
    body = d.rows.map((r, ri) => [
      r,
      ...d.cols.map((_, ci) => (d.cells[ri]?.[ci] ?? 0).toLocaleString()),
    ]);
  } else if (d.shape === 'points') {
    head = [{ label: '지점' }, { label: '값', num: true }];
    body = [...d.points]
      .sort((a, b) => b.value - a.value)
      .map((p) => [p.label, fmtExact(p.value, d.format)]);
  } else if (d.shape === 'rows') {
    head = d.columns.map((c) => ({
      label: c.label,
      num: c.format === 'won' || c.format === 'count',
    }));
    body = d.rows.map((r) =>
      d.columns.map((c) => {
        const v = r[c.key];
        if (c.format === 'date') return fmtDate(v);
        if (c.format === 'won' || c.format === 'count' || c.format === 'percent')
          return fmtExact(Number(v ?? 0), c.format);
        return v == null ? '-' : String(v);
      }),
    );
    links = d.rows.map((r) => rowHref(d, r));
  }
  if (!body.length) return <Empty />;
  return (
    <div className={`${styles.vizRoot} ${styles.tableWrap}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={h.num ? styles.num : undefined}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr
              key={ri}
              className={links[ri] ? styles.rowLink : undefined}
              onClick={links[ri] ? () => navigate(links[ri]!) : undefined}
            >
              {row.map((c, ci) => (
                <td key={ci} className={head[ci]?.num ? styles.num : undefined} title={String(c)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 행을 누르면 갈 주소 — 행에 href가 있으면 그것, 없으면 위젯 link 틀의 {id} */
const rowHref = (
  d: Extract<DashData, { shape: 'rows' }>,
  r: Record<string, string | number | null>,
): string | null =>
  typeof r.href === 'string' && r.href
    ? r.href
    : d.link && r.id
      ? d.link.replace('{id}', String(r.id))
      : null;

// ═══════════ 목록 ═══════════
function ListViz({ d }: { d: Extract<DashData, { shape: 'rows' }> }) {
  const navigate = useNavigate();
  if (!d.rows.length) return <Empty>해당하는 항목이 없습니다</Empty>;
  const dateCol = d.columns.find((c) => c.format === 'date');
  const numCol = [...d.columns].reverse().find((c) => c.format === 'won' || c.format === 'count');
  // 첫 칸은 제목(title)과 같은 값이라 빼고, 날짜·숫자는 오른쪽에 따로 보인다
  const subCols = d.columns.filter((c) => c !== dateCol && c !== numCol);
  return (
    <div className={`${styles.vizRoot} ${styles.list}`}>
      {d.rows.map((r, i) => {
        const href = rowHref(d, r);
        const strong = Number(r.unread) === 1;
        const side = numCol
          ? fmtExact(Number(r[numCol.key] ?? 0), numCol.format as DashFormat)
          : dateCol
            ? fmtDate(r[dateCol.key])
            : '';
        const sub = subCols
          .map((c) => r[c.key])
          .filter((v) => v != null && v !== '' && v !== '-' && v !== r.title)
          .join(' · ');
        const inner = (
          <>
            <span className={styles.listMain}>
              <span className={styles.listTitle}>{String(r.title ?? '-')}</span>
              {sub && <span className={styles.listSub}>{sub}</span>}
            </span>
            <span className={styles.listSide}>{side}</span>
          </>
        );
        const cls = `${styles.listItem} ${strong ? styles.listUnread : ''}`;
        return href ? (
          <button key={i} type="button" className={cls} onClick={() => navigate(href)}>
            {inner}
          </button>
        ) : (
          <div key={i} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** 위젯 본문 — 데이터 모양과 고른 시각화에 맞는 그림 */
export function VizBody({
  viz,
  data,
  item,
}: {
  viz: DashViz;
  data: DashData | null;
  item: DashItem;
}) {
  if (viz === 'text') {
    return (
      <div className={`${styles.vizRoot} ${styles.text}`}>
        {item.text?.trim() || (
          <span style={{ color: 'var(--muted)' }}>내용을 입력하세요(편집에서 위젯을 누르세요)</span>
        )}
      </div>
    );
  }
  if (!data) return <Empty />;
  if (viz === 'table') return <TableViz d={data} />;
  switch (data.shape) {
    case 'value':
      return viz === 'gauge' ? (
        <div className={styles.vizRoot}>
          <GaugeViz d={data} />
        </div>
      ) : (
        <div className={styles.vizRoot}>
          <CardViz d={data} />
        </div>
      );
    case 'category':
      if (viz === 'hbar') return <HBarViz items={data.items} format={data.format} />;
      if (viz === 'bar') return <ColumnViz items={data.items} format={data.format} />;
      if (viz === 'pie' || viz === 'donut')
        return <PieViz items={data.items} format={data.format} donut={viz === 'donut'} />;
      if (viz === 'funnel') return <FunnelViz items={data.items} format={data.format} />;
      if (viz === 'map') return <MapViz d={data} />;
      return <HBarViz items={data.items} format={data.format} />;
    case 'series':
      if (viz === 'bar')
        return (
          <ColumnViz
            items={data.points.map((p) => ({ key: p.x, label: p.label, value: p.value }))}
            format={data.format}
          />
        );
      return <LineViz points={data.points} format={data.format} area={viz === 'area'} />;
    case 'matrix':
      return <HeatmapViz d={data} />;
    case 'rows':
      return <ListViz d={data} />;
    case 'points':
      return <MapViz d={data} />;
  }
  return <Empty />;
}
