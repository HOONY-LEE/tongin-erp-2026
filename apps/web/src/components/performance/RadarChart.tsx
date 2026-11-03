import { useEffect, useRef, useState } from 'react';

export interface RadarDatum {
  key: string;
  /** 축 이름 */
  short: string;
  /** 0~100 축 값(달성률, 100에서 자름) — 실적이 없으면 null */
  value: number | null;
  /** 축 아래 작은 글자(예: 93%) */
  caption?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * N각형(레이더) 차트 — 축마다 목표 대비 달성률(0~100). 바깥 테두리 = 목표 100%.
 * 라이브러리 없이 SVG로 그린다. 처음 그려질 때 가운데서 돌며 펼쳐진다(움직임 줄이기 설정이면 바로).
 */
export function RadarChart({
  data,
  size = 240,
  showLabels = true,
  animateMs = 700,
}: {
  data: RadarDatum[];
  size?: number;
  showLabels?: boolean;
  animateMs?: number;
}) {
  const n = Math.max(3, data.length);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - (showLabels ? Math.max(42, size * 0.17) : 10);
  const rings = [25, 50, 75, 100];

  const [p, setP] = useState(animateMs > 0 ? 0 : 1);
  const raf = useRef<number | null>(null);
  const sig = data.map((d) => `${d.key}:${d.value}`).join('|');
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (animateMs <= 0 || reduce || document.hidden) {
      setP(1);
      return;
    }
    setP(0);
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / animateMs);
      setP(easeOutCubic(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // 탭이 뒤에 있어 그리기가 멈춰도 끝 모양은 나오게
    const fallback = setTimeout(() => setP(1), animateMs + 150);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      clearTimeout(fallback);
    };
  }, [sig, animateMs]);

  const point = (i: number, value: number, scale = p) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (Math.max(0, Math.min(100, value)) / 100) * R * scale;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  };
  const poly = (vals: number[], scale?: number) =>
    vals.map((v, i) => point(i, v, scale).join(',')).join(' ');
  const vals = data.map((d) => d.value ?? 0);
  const spin = (1 - p) * -90;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={data.map((d) => `${d.short} ${d.value ?? '자료 없음'}`).join(', ')}
    >
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={poly(
            data.map(() => ring),
            1,
          )}
          fill="none"
          stroke="var(--ark-color-border)"
          strokeWidth={ring === 100 ? 1.5 : 1}
          strokeDasharray={ring === 100 ? '4 3' : undefined}
        />
      ))}
      {data.map((d, i) => {
        const [x, y] = point(i, 100, 1);
        return <line key={d.key} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--ark-color-border)" />;
      })}
      <g transform={`rotate(${spin} ${cx} ${cy})`} opacity={Math.min(1, p * 1.4)}>
        <polygon
          points={poly(vals)}
          fill="color-mix(in srgb, var(--ark-color-primary-500) 18%, transparent)"
          stroke="var(--ark-color-primary-500)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          if (d.value === null) return null;
          const [x, y] = point(i, d.value);
          return (
            <circle
              key={d.key}
              cx={x}
              cy={y}
              r={3}
              fill="var(--ark-color-primary-500)"
              stroke="var(--ark-color-bg)"
              strokeWidth={1.5}
            />
          );
        })}
      </g>
      {showLabels &&
        data.map((d, i) => {
          const [x, y] = point(i, 122, 1);
          const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
          return (
            <text
              key={d.key}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={600}
              fill="var(--ark-color-text-secondary)"
              opacity={Math.max(0, (p - 0.5) * 2)}
            >
              {d.short}
              <tspan
                x={x}
                dy={13}
                fontSize={10}
                fontWeight={500}
                fill="var(--ark-color-text-tertiary)"
              >
                {d.caption ?? (d.value === null ? '—' : `${Math.round(d.value * p)}`)}
              </tspan>
            </text>
          );
        })}
    </svg>
  );
}
