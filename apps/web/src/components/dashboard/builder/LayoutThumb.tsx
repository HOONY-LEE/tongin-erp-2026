import type { DashViz } from '@tongin/shared';
import { DASH_COLS } from '@tongin/shared';
import styles from './builder.module.css';
import { DashColorScope } from '../DashColorScope';

export interface ThumbItem {
  x: number;
  y: number;
  w: number;
  h: number;
  viz: DashViz;
}

const U = 10; // 한 칸 크기(미리보기 좌표)
const GAP = 1.6;

/** 위젯 하나를 보기 방식에 맞는 단순한 모양으로 */
function Glyph({ viz, x, y, w, h }: { viz: DashViz; x: number; y: number; w: number; h: number }) {
  const p = Math.min(w, h) * 0.16;
  const ix = x + p;
  const iy = y + p;
  const iw = w - p * 2;
  const ih = h - p * 2;
  const fill = 'var(--thumb-ink)';
  const soft = 'var(--thumb-soft)';
  switch (viz) {
    case 'card':
      return (
        <g>
          <rect x={ix} y={iy + ih * 0.1} width={iw * 0.35} height={ih * 0.12} rx={1} fill={soft} />
          <rect
            x={ix}
            y={iy + ih * 0.38}
            width={iw * 0.62}
            height={ih * 0.3}
            rx={1.5}
            fill={fill}
          />
        </g>
      );
    case 'gauge': {
      const r = Math.min(iw / 2, ih * 0.8);
      const cx = ix + iw / 2;
      const cy = iy + ih * 0.85;
      return (
        <g fill="none" strokeLinecap="round" strokeWidth={Math.max(1.5, r * 0.28)}>
          <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} stroke={soft} />
          <path
            d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r * 0.35},${cy - r * 0.94}`}
            stroke={fill}
          />
        </g>
      );
    }
    case 'bar': {
      const n = Math.max(4, Math.min(10, Math.round(iw / 6)));
      const bw = iw / n;
      return (
        <g fill={fill}>
          {Array.from({ length: n }, (_, i) => {
            const t = 0.35 + 0.6 * Math.abs(Math.sin(i * 1.7 + 0.4));
            return (
              <rect
                key={i}
                x={ix + i * bw + bw * 0.18}
                y={iy + ih * (1 - t)}
                width={bw * 0.64}
                height={ih * t}
                rx={0.8}
              />
            );
          })}
        </g>
      );
    }
    case 'hbar':
    case 'funnel': {
      const n = Math.max(3, Math.min(7, Math.round(ih / 6)));
      const bh = ih / n;
      return (
        <g fill={fill}>
          {Array.from({ length: n }, (_, i) => {
            const t = viz === 'funnel' ? 1 - i * (0.75 / n) : 0.95 - i * (0.6 / n);
            const bw = iw * t;
            return (
              <rect
                key={i}
                x={viz === 'funnel' ? ix + (iw - bw) / 2 : ix}
                y={iy + i * bh + bh * 0.18}
                width={bw}
                height={bh * 0.64}
                rx={0.8}
              />
            );
          })}
        </g>
      );
    }
    case 'line':
    case 'area': {
      const pts = Array.from({ length: 7 }, (_, i) => [
        ix + (iw / 6) * i,
        iy + ih * (0.75 - 0.5 * Math.abs(Math.sin(i * 1.1 + 0.6)) - i * 0.03),
      ]);
      const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
      return (
        <g>
          {viz === 'area' && (
            <path d={`${d} L${ix + iw},${iy + ih} L${ix},${iy + ih} Z`} fill={soft} />
          )}
          <path d={d} fill="none" stroke={fill} strokeWidth={1.4} strokeLinejoin="round" />
        </g>
      );
    }
    case 'pie':
    case 'donut': {
      const r = Math.min(iw, ih) / 2;
      const cx = ix + Math.min(iw, ih) / 2;
      const cy = iy + ih / 2;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={fill} />
          <path
            d={`M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 0 1 ${cx + r * 0.95},${cy + r * 0.3} Z`}
            fill={soft}
          />
          {viz === 'donut' && <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--thumb-card)" />}
          {iw > ih * 1.4 &&
            [0, 1, 2].map((i) => (
              <rect
                key={i}
                x={ix + ih + iw * 0.08}
                y={iy + ih * (0.2 + i * 0.25)}
                width={iw - ih - iw * 0.1}
                height={ih * 0.1}
                rx={1}
                fill={soft}
              />
            ))}
        </g>
      );
    }
    case 'table':
    case 'list': {
      const n = Math.max(2, Math.min(8, Math.round(ih / 5)));
      return (
        <g fill={soft}>
          {Array.from({ length: n }, (_, i) => (
            <rect
              key={i}
              x={ix}
              y={iy + (ih / n) * i + 0.6}
              width={i === 0 && viz === 'table' ? iw : iw * (0.55 + (0.4 * ((i * 37) % 10)) / 10)}
              height={Math.max(1, ih / n - 2)}
              rx={0.8}
              fill={i === 0 && viz === 'table' ? fill : soft}
            />
          ))}
        </g>
      );
    }
    case 'heatmap': {
      const cols = Math.max(4, Math.min(16, Math.round(iw / 4)));
      const rows = Math.max(3, Math.min(7, Math.round(ih / 4)));
      const cw = iw / cols;
      const ch = ih / rows;
      return (
        <g fill={fill}>
          {Array.from({ length: rows * cols }, (_, k) => {
            const r = Math.floor(k / cols);
            const c = k % cols;
            const o = 0.15 + 0.85 * Math.abs(Math.sin(r * 2.3 + c * 0.9));
            return (
              <rect
                key={k}
                x={ix + c * cw + 0.3}
                y={iy + r * ch + 0.3}
                width={cw - 0.6}
                height={ch - 0.6}
                rx={0.5}
                opacity={o}
              />
            );
          })}
        </g>
      );
    }
    case 'map': {
      // 한반도 남쪽을 떠올리게 하는 단순한 덩어리 + 점 몇 개
      const s = Math.min(iw / 0.7, ih);
      const ox = ix + (iw - s * 0.7) / 2;
      const oy = iy + (ih - s) / 2;
      const P = (a: number, b: number) => `${ox + a * s},${oy + b * s}`;
      return (
        <g>
          <path
            d={`M${P(0.22, 0.02)} L${P(0.5, 0.05)} L${P(0.62, 0.3)} L${P(0.68, 0.62)} L${P(0.55, 0.85)} L${P(0.25, 0.9)} L${P(0.12, 0.7)} L${P(0.2, 0.45)} L${P(0.1, 0.25)} Z`}
            fill={soft}
          />
          {[
            [0.3, 0.2],
            [0.45, 0.45],
            [0.28, 0.62],
            [0.52, 0.72],
          ].map(([a, b], i) => (
            <circle
              key={i}
              cx={ox + a * s}
              cy={oy + b * s}
              r={s * (0.05 + (i % 2) * 0.03)}
              fill={fill}
            />
          ))}
        </g>
      );
    }
    case 'text':
      return (
        <g fill={soft}>
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={ix}
              y={iy + ih * (0.15 + i * 0.3)}
              width={iw * (i === 2 ? 0.5 : 0.9)}
              height={ih * 0.14}
              rx={1}
            />
          ))}
        </g>
      );
  }
  return null;
}

/**
 * 대시보드 구성을 추상화한 작은 그림 — 위젯 자리·크기는 실제와 같고, 안쪽은 보기 방식을 떠올리게 하는 모양.
 */
export function LayoutThumb({
  items,
  className,
  color,
}: {
  items: ThumbItem[];
  className?: string;
  /** 템플릿 색 — 그림도 그 색으로 */
  color?: string | null;
}) {
  const rows = Math.max(
    6,
    items.reduce((m, i) => Math.max(m, i.y + i.h), 0),
  );
  const W = DASH_COLS * U;
  const H = rows * U;
  return (
    <DashColorScope color={color}>
      <svg
        className={`${styles.thumb} ${className ?? ''}`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMin meet"
        aria-hidden
      >
        {items.length === 0 ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={7} fill="var(--thumb-soft)">
            빈 화면
          </text>
        ) : (
          items.map((it, i) => {
            const x = it.x * U + GAP / 2;
            const y = it.y * U + GAP / 2;
            const w = it.w * U - GAP;
            const h = it.h * U - GAP;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={2}
                  fill="var(--thumb-card)"
                  stroke="var(--thumb-line)"
                  strokeWidth={0.5}
                />
                <Glyph viz={it.viz} x={x} y={y} w={w} h={h} />
              </g>
            );
          })
        )}
      </svg>
    </DashColorScope>
  );
}
