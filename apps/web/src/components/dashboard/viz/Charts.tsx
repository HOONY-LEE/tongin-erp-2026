import i18n from '../../../i18n';
import { useTranslation } from 'react-i18next';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { DashData, DashFormat, DashItem, DashViz } from '@tongin/shared';
import { KOREA_MAP, normalizeSido, projectLatLng } from '../koreaMap';
import styles from './viz.module.css';
import { fs } from '../../../lib/fontScale';

/**
 * 항목 하나 누르기(드릴다운) — 보기 화면에서 위젯이 그 항목만 걸러진 목록으로 갈 수 있으면 함수를 준다.
 * 편집 화면·갈 곳이 없는 위젯은 null(누를 수 없다).
 */
export const DrillCtx = createContext<((key: string) => void) | null>(null);
/** 누를 수 있는 표시 — 손가락 커서 */
const PICK = { cursor: 'pointer' } as const;
const usePick = () => {
  const pick = useContext(DrillCtx);
  return (key: string) =>
    pick && key !== 'OTHER' ? { onClick: () => pick(key), style: PICK } : {};
};

// ── 숫자 표기 ──
export function fmt(v: number, f: DashFormat | 'date' | 'text' | undefined): string {
  if (!Number.isFinite(v)) return '-';
  if (f === 'percent') return `${(v * 100).toFixed(1)}%`;
  if (f === 'won') {
    const a = Math.abs(v);
    if (a >= 1e8) return i18n.t('dash.eok', { v0: (v / 1e8).toFixed(a >= 1e10 ? 0 : 1) });
    if (a >= 1e4) return i18n.t('dash.man', { v0: Math.round(v / 1e4).toLocaleString() });
    return v.toLocaleString();
  }
  return v.toLocaleString();
}
/** 툴팁·표에 쓰는 정확한 값 */
export function fmtExact(v: number, f: DashFormat | 'date' | 'text' | undefined): string {
  if (f === 'percent') return `${(v * 100).toFixed(1)}%`;
  if (f === 'won') return i18n.t('dash.won', { v0: Math.round(v).toLocaleString() });
  return `${v.toLocaleString()}${f === 'count' ? i18n.t('dash.countWord') : ''}`;
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

const Empty = ({ children = i18n.t('dash.noDisplayData') }: { children?: ReactNode }) => (
  <div className={styles.empty}>{children}</div>
);

// ═══════════ 숫자 카드 ═══════════
function CardViz({ d }: { d: Extract<DashData, { shape: 'value' }> }) {
  const { t } = useTranslation();
  const prev = d.previous;
  const diff = prev != null && prev !== 0 ? (d.value - prev) / prev : null;
  const Icon =
    diff == null ? null : diff > 0.0005 ? ArrowUpRight : diff < -0.0005 ? ArrowDownRight : Minus;
  return (
    <div className={styles.card}>
      <div className={styles.hero} title={fmtExact(d.value, d.format)}>
        {fmt(d.value, d.format)}
        {d.format === 'won' && (
          <span style={{ fontSize: '0.5em', marginLeft: 2 }}>{t('dash.wonUnit')}</span>
        )}
      </div>
      {Icon && diff != null ? (
        <span className={styles.delta}>
          <span className={diff > 0 ? styles.deltaUp : diff < 0 ? styles.deltaDown : undefined}>
            <Icon size={13} aria-hidden style={{ verticalAlign: -2 }} /> {diff > 0 ? '+' : ''}
            {(diff * 100).toFixed(1)}%
          </span>
          {t('dash.prevPeriod')} {fmt(prev!, d.format)}
        </span>
      ) : prev === 0 ? (
        <span className={styles.delta}>{t('dash.prevPeriodZero')}</span>
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
          style={{ fill: 'var(--ink)', fontSize: fs(30), fontWeight: 700 }}
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
  gapless,
}: {
  items: { key: string; label: string; value: number }[];
  format: DashFormat;
  /** 히스토그램 — 막대를 붙여 그린다(구간이 이어진다는 뜻) */
  gapless?: boolean;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const pickOf = usePick();
  if (!items.length) return <Empty />;
  const m = { l: 44, r: 8, t: 18, b: 22 };
  const w = Math.max(0, width - m.l - m.r);
  const h = Math.max(0, height - m.t - m.b);
  const { top, step } = niceMax(Math.max(...items.map((i) => i.value)));
  const band = w / items.length;
  const bw = gapless ? Math.max(1, band - 1) : Math.max(2, Math.min(48, band - 2));
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
                    {...pickOf(it.key)}
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
  const pickOf = usePick();
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
                {...pickOf(it.key)}
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
  const { t } = useTranslation();
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const pickOf = usePick();
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
                {...pickOf(it.key)}
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
                  {t('dash.total')}
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
  const { t } = useTranslation();
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const pickOf = usePick();
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
                {...pickOf(it.key)}
                onMouseMove={() =>
                  show({
                    x: labelW + w / 2,
                    y,
                    content: (
                      <>
                        {it.label} · <b>{fmtExact(it.value, format)}</b>
                        {prev
                          ? t('dash.ofPrevStep', { v0: ((it.value / prev) * 100).toFixed(0) })
                          : ''}
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
  const { t } = useTranslation();
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const pickOf = usePick();
  const [bySido, keyOf] = useMemo(() => {
    const m = new Map<string, number>();
    /** 지도 칸 → 데이터의 원래 키(누르면 그 키로 거른다) */
    const k = new Map<string, string>();
    if (d.shape === 'category') {
      for (const it of d.items) {
        const s = normalizeSido(it.key);
        if (s) {
          m.set(s, (m.get(s) ?? 0) + it.value);
          if (!k.has(s)) k.set(s, it.key);
        }
      }
    }
    return [m, k] as const;
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
                {...(d.shape === 'category' && keyOf.has(r.sido) ? pickOf(keyOf.get(r.sido)!) : {})}
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
                    {...pickOf(p.key)}
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
            {t('dash.less')}
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ background: `var(--seq-${i + 1})` }} />
            ))}
            {t('dash.moreMax')} {fmt(max, d.format)}
          </>
        ) : (
          <>
            {t('dash.bubbleSize')} {fmt(max, d.format)}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════ 표 ═══════════
function TableViz({ d }: { d: DashData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  let head: { label: string; num?: boolean }[] = [];
  let body: (string | number)[][] = [];
  let links: (string | null)[] = [];
  if (d.shape === 'value') {
    head = [{ label: t('dash.value'), num: true }];
    body = [[fmtExact(d.value, d.format)]];
  } else if (d.shape === 'category') {
    const total = d.items.reduce((s, i) => s + i.value, 0);
    head = [
      { label: t('dash.item') },
      { label: t('dash.value'), num: true },
      { label: t('dash.share'), num: true },
    ];
    body = d.items.map((i) => [
      i.label,
      fmtExact(i.value, d.format),
      total ? `${((i.value / total) * 100).toFixed(1)}%` : '-',
    ]);
  } else if (d.shape === 'series') {
    head = [{ label: t('dash.period') }, { label: t('dash.value'), num: true }];
    body = [...d.points].reverse().map((p) => [p.label, fmtExact(p.value, d.format)]);
  } else if (d.shape === 'matrix') {
    head = [{ label: '' }, ...d.cols.map((c) => ({ label: c, num: true }))];
    body = d.rows.map((r, ri) => [
      r,
      ...d.cols.map((_, ci) => (d.cells[ri]?.[ci] ?? 0).toLocaleString()),
    ]);
  } else if (d.shape === 'box') {
    head = [
      { label: t('dash.item') },
      { label: 'n', num: true },
      { label: t('dash.boxMin'), num: true },
      { label: 'Q1', num: true },
      { label: t('dash.boxMedian'), num: true },
      { label: 'Q3', num: true },
      { label: t('dash.boxMax'), num: true },
    ];
    body = d.items.map((i) => [
      i.label,
      i.n.toLocaleString(),
      ...[i.min, i.q1, i.median, i.q3, i.max].map((v) => fmtExact(v, d.format)),
    ]);
  } else if (d.shape === 'scatter') {
    head = [
      { label: t('dash.item') },
      { label: d.xLabel, num: true },
      { label: d.yLabel, num: true },
    ];
    body = d.points.map((p) => [p.label, fmtExact(p.x, d.xFormat), fmtExact(p.y, d.yFormat)]);
  } else if (d.shape === 'points') {
    head = [{ label: t('dash.branch') }, { label: t('dash.value'), num: true }];
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!d.rows.length) return <Empty>{t('dash.noItems')}</Empty>;
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
// ═══════════ 누적 막대(두 기준) ═══════════
function StackedViz({ d }: { d: Extract<DashData, { shape: 'matrix' }> }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const keys = d.rows;
  const colors = useMemo(() => colorMap(keys), [keys]);
  if (!d.cols.length || !d.rows.length) return <Empty />;
  const legendH = 22;
  const m = { l: 44, r: 8, t: 10, b: 22 };
  const w = Math.max(0, width - m.l - m.r);
  const h = Math.max(0, height - m.t - m.b - legendH);
  const totals = d.cols.map((_, ci) =>
    d.rows.reduce((s, _r, ri) => s + (d.cells[ri]?.[ci] ?? 0), 0),
  );
  const { top, step } = niceMax(Math.max(...totals));
  const band = w / d.cols.length;
  const bw = Math.max(2, Math.min(48, band - 4));
  const every = Math.max(1, Math.ceil(d.cols.length / Math.max(1, Math.floor(w / 46))));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return (
    <div ref={ref} className={styles.vizRoot} style={{ display: 'flex', flexDirection: 'column' }}>
      {width > 0 && (
        <svg className={styles.svg} width={width} height={height - legendH} onMouseLeave={hide}>
          <g transform={`translate(${m.l},${m.t})`}>
            {ticks.map((t) => {
              const y = h - (t / top) * h;
              return (
                <g key={t}>
                  {t > 0 && <line x1={0} x2={w} y1={y} y2={y} className={styles.gridLine} />}
                  <text x={-6} y={y} dy="0.32em" textAnchor="end" className={styles.axisText}>
                    {fmt(t, d.format)}
                  </text>
                </g>
              );
            })}
            {d.cols.map((c, ci) => {
              const x = ci * band + (band - bw) / 2;
              let acc = 0;
              return (
                <g key={c}>
                  {d.rows.map((r, ri) => {
                    const v = d.cells[ri]?.[ci] ?? 0;
                    if (!v) return null;
                    const y0 = h - ((acc + v) / top) * h;
                    const hh = (v / top) * h;
                    acc += v;
                    return (
                      <rect
                        key={r}
                        x={x}
                        y={y0}
                        width={bw}
                        height={Math.max(0, hh - 1)}
                        rx={2}
                        fill={colors.get(r)}
                        onMouseMove={() =>
                          show({
                            x: m.l + x + bw / 2,
                            y: m.t + y0,
                            content: (
                              <>
                                {c} · {r} · <b>{fmtExact(v, d.format)}</b>
                              </>
                            ),
                          })
                        }
                      />
                    );
                  })}
                  {ci % every === 0 && (
                    <text x={x + bw / 2} y={h + 15} textAnchor="middle" className={styles.axisText}>
                      {c}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={0} x2={w} y1={h} y2={h} className={styles.baseline} />
          </g>
        </svg>
      )}
      <div className={styles.legendRow}>
        {d.rows.map((r) => (
          <span key={r}>
            <i className={styles.swatch} style={{ background: colors.get(r) }} />
            {r}
          </span>
        ))}
      </div>
      {tip}
    </div>
  );
}

// ═══════════ 트리맵(비중을 넓이로) ═══════════
type Rect = { x: number; y: number; w: number; h: number };
/** 정사각형에 가깝게 나누기(squarified) */
function squarify(values: number[], box: Rect): Rect[] {
  const out: Rect[] = new Array(values.length);
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const scale = (box.w * box.h) / total;
  const areas = values.map((v) => v * scale);
  let { x, y, w, h } = box;
  let i = 0;
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    const mx = Math.max(...row);
    const mn = Math.min(...row);
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) {
      row.push(areas[j]);
      j++;
    }
    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const rw = s / h;
      let yy = y;
      row.forEach((a, k) => {
        out[i + k] = { x, y: yy, w: rw, h: a / rw };
        yy += a / rw;
      });
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let xx = x;
      row.forEach((a, k) => {
        out[i + k] = { x: xx, y, w: a / rh, h: rh };
        xx += a / rh;
      });
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}
function TreemapViz({
  items,
  format,
}: {
  items: { key: string; label: string; value: number }[];
  format: DashFormat;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const pickOf = usePick();
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const colors = useMemo(() => colorMap(list.map((i) => i.key)), [list]);
  if (!list.length) return <Empty />;
  const total = list.reduce((s, i) => s + i.value, 0);
  const rects =
    width > 0
      ? squarify(
          list.map((i) => i.value),
          { x: 0, y: 0, w: width, h: height },
        )
      : [];
  return (
    <div ref={ref} className={styles.vizRoot}>
      {width > 0 && (
        <svg className={styles.svg} width={width} height={height} onMouseLeave={hide}>
          {list.map((it, i) => {
            const r = rects[i];
            if (!r) return null;
            const big = r.w > 56 && r.h > 34;
            return (
              <g
                key={it.key}
                {...pickOf(it.key)}
                onMouseMove={() =>
                  show({
                    x: r.x + r.w / 2,
                    y: r.y + 4,
                    content: (
                      <>
                        {it.label} · <b>{fmtExact(it.value, format)}</b> (
                        {((it.value / total) * 100).toFixed(1)}%)
                      </>
                    ),
                  })
                }
              >
                <rect
                  x={r.x + 1}
                  y={r.y + 1}
                  width={Math.max(0, r.w - 2)}
                  height={Math.max(0, r.h - 2)}
                  rx={4}
                  fill={colors.get(it.key)}
                />
                {big && (
                  <>
                    <text x={r.x + 8} y={r.y + 18} className={styles.treeLabel}>
                      {it.label.length > r.w / 9
                        ? `${it.label.slice(0, Math.floor(r.w / 9))}…`
                        : it.label}
                    </text>
                    <text x={r.x + 8} y={r.y + 32} className={styles.treeValue}>
                      {fmt(it.value, format)} · {((it.value / total) * 100).toFixed(0)}%
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {tip}
    </div>
  );
}

// ═══════════ 박스플롯(분포) ═══════════
function BoxViz({ d }: { d: Extract<DashData, { shape: 'box' }> }) {
  const { t } = useTranslation();
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  if (!d.items.length) return <Empty />;
  const labelW = Math.min(110, Math.max(56, width * 0.24));
  const m = { r: 14, b: 20 };
  const w = Math.max(0, width - labelW - m.r);
  const rowH = Math.max(22, Math.min(40, (height - m.b) / d.items.length));
  const boxH = Math.max(8, rowH * 0.55);
  const { top, step } = niceMax(Math.max(...d.items.map((i) => i.max)));
  const lo = Math.min(0, ...d.items.map((i) => i.min));
  const sx = (v: number) => labelW + ((v - lo) / (top - lo || 1)) * w;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).filter(
    (v) => v >= lo,
  );
  const H = rowH * d.items.length;
  return (
    <div ref={ref} className={styles.vizRoot} style={{ overflowY: 'auto' }}>
      {width > 0 && (
        <svg
          className={styles.svg}
          width={width}
          height={H + m.b}
          style={{ height: H + m.b }}
          onMouseLeave={hide}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={sx(v)} x2={sx(v)} y1={0} y2={H} className={styles.gridLine} />
              <text x={sx(v)} y={H + 14} textAnchor="middle" className={styles.axisText}>
                {fmt(v, d.format)}
              </text>
            </g>
          ))}
          {d.items.map((it, i) => {
            const cy = i * rowH + rowH / 2;
            return (
              <g
                key={it.key}
                onMouseMove={() =>
                  show({
                    x: sx(it.median),
                    y: cy - boxH / 2,
                    content: (
                      <>
                        <b>{it.label}</b> · {t('dash.boxN', { v0: it.n })}
                        <br />
                        {t('dash.boxMin')} {fmtExact(it.min, d.format)} · Q1{' '}
                        {fmtExact(it.q1, d.format)}
                        <br />
                        {t('dash.boxMedian')} <b>{fmtExact(it.median, d.format)}</b>
                        <br />
                        Q3 {fmtExact(it.q3, d.format)} · {t('dash.boxMax')}{' '}
                        {fmtExact(it.max, d.format)}
                      </>
                    ),
                  })
                }
              >
                <rect x={0} y={i * rowH} width={width} height={rowH} fill="transparent" />
                <text
                  x={labelW - 8}
                  y={cy}
                  dy="0.32em"
                  textAnchor="end"
                  className={styles.labelText}
                >
                  {it.label.length > 9 ? `${it.label.slice(0, 8)}…` : it.label}
                </text>
                <line
                  x1={sx(it.min)}
                  x2={sx(it.max)}
                  y1={cy}
                  y2={cy}
                  stroke="var(--ink-3, #999)"
                  strokeWidth={1.5}
                />
                <line
                  x1={sx(it.min)}
                  x2={sx(it.min)}
                  y1={cy - boxH / 4}
                  y2={cy + boxH / 4}
                  stroke="var(--ink-3, #999)"
                  strokeWidth={1.5}
                />
                <line
                  x1={sx(it.max)}
                  x2={sx(it.max)}
                  y1={cy - boxH / 4}
                  y2={cy + boxH / 4}
                  stroke="var(--ink-3, #999)"
                  strokeWidth={1.5}
                />
                <rect
                  x={sx(it.q1)}
                  y={cy - boxH / 2}
                  width={Math.max(2, sx(it.q3) - sx(it.q1))}
                  height={boxH}
                  rx={3}
                  fill="color-mix(in srgb, var(--series-1) 30%, transparent)"
                  stroke="var(--series-1)"
                  strokeWidth={1.5}
                />
                <line
                  x1={sx(it.median)}
                  x2={sx(it.median)}
                  y1={cy - boxH / 2}
                  y2={cy + boxH / 2}
                  stroke="var(--series-1)"
                  strokeWidth={2.5}
                />
              </g>
            );
          })}
        </svg>
      )}
      {tip}
    </div>
  );
}

// ═══════════ 산점도(두 숫자의 관계) ═══════════
function ScatterViz({ d }: { d: Extract<DashData, { shape: 'scatter' }> }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const pickOf = usePick();
  if (!d.points.length) return <Empty />;
  const m = { l: 50, r: 14, t: 12, b: 34 };
  const w = Math.max(0, width - m.l - m.r);
  const h = Math.max(0, height - m.t - m.b);
  const X = niceMax(Math.max(...d.points.map((p) => p.x)));
  const Y = niceMax(Math.max(...d.points.map((p) => p.y)));
  const sx = (v: number) => (v / X.top) * w;
  const sy = (v: number) => h - (v / Y.top) * h;
  const xt = Array.from({ length: Math.round(X.top / X.step) + 1 }, (_, i) => i * X.step);
  const yt = Array.from({ length: Math.round(Y.top / Y.step) + 1 }, (_, i) => i * Y.step);
  // 이름표는 바깥쪽(큰 값) 몇 개만 — 점이 많을 때 글자가 겹치지 않게
  const labeled = new Set(
    [...d.points]
      .sort((a, b) => b.x / X.top + b.y / Y.top - (a.x / X.top + a.y / Y.top))
      .slice(0, 4)
      .map((p) => p.key),
  );
  return (
    <div ref={ref} className={styles.vizRoot}>
      {width > 0 && (
        <svg className={styles.svg} width={width} height={height} onMouseLeave={hide}>
          <g transform={`translate(${m.l},${m.t})`}>
            {yt.map((v) => (
              <g key={`y${v}`}>
                {v > 0 && <line x1={0} x2={w} y1={sy(v)} y2={sy(v)} className={styles.gridLine} />}
                <text x={-6} y={sy(v)} dy="0.32em" textAnchor="end" className={styles.axisText}>
                  {fmt(v, d.yFormat)}
                </text>
              </g>
            ))}
            {xt.map((v) => (
              <text
                key={`x${v}`}
                x={sx(v)}
                y={h + 14}
                textAnchor="middle"
                className={styles.axisText}
              >
                {fmt(v, d.xFormat)}
              </text>
            ))}
            <line x1={0} x2={w} y1={h} y2={h} className={styles.baseline} />
            <text x={w} y={h + 28} textAnchor="end" className={styles.axisText}>
              {d.xLabel} →
            </text>
            <text x={4} y={-2} className={styles.axisText}>
              ↑ {d.yLabel}
            </text>
            {d.points.map((p) => (
              <g key={p.key} {...pickOf(p.key)}>
                <circle
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={5}
                  fill="var(--series-1)"
                  fillOpacity={0.75}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                  onMouseMove={() =>
                    show({
                      x: m.l + sx(p.x),
                      y: m.t + sy(p.y) - 6,
                      content: (
                        <>
                          <b>{p.label}</b>
                          <br />
                          {d.xLabel} {fmtExact(p.x, d.xFormat)}
                          <br />
                          {d.yLabel} {fmtExact(p.y, d.yFormat)}
                        </>
                      ),
                    })
                  }
                />
                {labeled.has(p.key) && (
                  <text x={sx(p.x) + 7} y={sy(p.y) - 6} className={styles.axisText}>
                    {p.label}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
      )}
      {tip}
    </div>
  );
}

export function VizBody({
  viz,
  data,
  item,
}: {
  viz: DashViz;
  data: DashData | null;
  item: DashItem;
}) {
  const { t } = useTranslation();
  if (viz === 'text') {
    return (
      <div className={`${styles.vizRoot} ${styles.text}`}>
        {item.text?.trim() || <span style={{ color: 'var(--muted)' }}>{t('dash.textEmpty')}</span>}
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
      if (viz === 'treemap') return <TreemapViz items={data.items} format={data.format} />;
      if (viz === 'histogram') return <ColumnViz items={data.items} format={data.format} gapless />;
      if (viz === 'bar' || viz === 'stacked')
        return <ColumnViz items={data.items} format={data.format} />;
      if (viz === 'hbar') return <HBarViz items={data.items} format={data.format} />;
      if (viz === 'pie' || viz === 'donut')
        return <PieViz items={data.items} format={data.format} donut={viz === 'donut'} />;
      if (viz === 'funnel') return <FunnelViz items={data.items} format={data.format} />;
      if (viz === 'map') return <MapViz d={data} />;
      return <HBarViz items={data.items} format={data.format} />;
    case 'series':
      if (viz === 'bar' || viz === 'stacked' || viz === 'histogram')
        return (
          <ColumnViz
            items={data.points.map((p) => ({ key: p.x, label: p.label, value: p.value }))}
            format={data.format}
          />
        );
      return <LineViz points={data.points} format={data.format} area={viz === 'area'} />;
    case 'matrix':
      return viz === 'stacked' ? <StackedViz d={data} /> : <HeatmapViz d={data} />;
    case 'box':
      return <BoxViz d={data} />;
    case 'scatter':
      return <ScatterViz d={data} />;
    case 'rows':
      return <ListViz d={data} />;
    case 'points':
      return <MapViz d={data} />;
  }
  return <Empty />;
}
