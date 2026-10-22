import { useMemo, useState } from 'react';
import {
  STATS_METRICS,
  STATS_METRIC_LABEL,
  type StatsByUnit,
  type StatsMetric,
} from '@tongin/shared';
import { PageCard, SegmentedControl, Select } from '../ui';
import { KOREA_MAP, projectLatLng } from './koreaMap';
import styles from './dashboard.module.css';

/** 막대는 상위 몇 지점까지 */
const TOP_N = 5;
/** 가장 큰 점의 반지름(지도 좌표) — 점의 '넓이'가 값에 비례하도록 반지름은 제곱근 */
const MAX_R = 26;
const MIN_R = 4;

const won = (n: number) => `${n.toLocaleString()}원`;
/** 막대·지도 위 짧은 표기 — 1,103만 / 2.4억 */
const short = (n: number, metric: StatsMetric) => {
  if (metric !== 'revenue') return `${n.toLocaleString()}건`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return n.toLocaleString();
};
const exact = (n: number, metric: StatsMetric) =>
  metric === 'revenue' ? won(n) : `${n.toLocaleString()}건`;

const regionCenter = new Map(KOREA_MAP.regions.map((r) => [r.sido, [r.cx, r.cy] as const]));

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

/**
 * 지점 실적 — 지표(접수·계약·작업·매출)를 골라 전국 지도의 점(크기 = 값) 또는 상위 지점 세로 막대로 본다.
 * 한 번에 한 지표만 그린다(단일 계열 — 범례 대신 제목이 무엇을 그렸는지 말한다).
 * 지점 위치는 조직관리에서 넣은 주소 좌표. 좌표가 없으면 그 시·도 한가운데에 찍는다.
 */
export function UnitPerformance({ byBranch }: { byBranch: StatsByUnit[] }) {
  const [metric, setMetric] = useState<StatsMetric>('revenue');
  const [view, setView] = useState<'map' | 'bar'>('map');
  const [tip, setTip] = useState<Tip | null>(null);

  const sorted = useMemo(
    () => [...byBranch].sort((a, b) => b[metric] - a[metric]),
    [byBranch, metric],
  );
  const bars = sorted.slice(0, TOP_N);
  const maxV = Math.max(1, ...sorted.map((b) => b[metric]));

  /** 지도 위 지점 점 — 큰 점을 먼저 그려 작은 점이 가려지지 않게 */
  const dots = useMemo(
    () =>
      sorted
        .map((b) => {
          const pos =
            b.lat != null && b.lng != null
              ? projectLatLng(b.lat, b.lng)
              : b.sido
                ? regionCenter.get(b.sido)
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
  const unplaced = sorted.filter((b) => b.lat == null && !b.sido);

  /**
   * 이름표 자리 — 수도권처럼 점이 몰리면 이름표가 겹치므로, 위에서부터 차례로 놓으며
   * 앞서 놓은 이름표와 겹치면 아래로 내린다(내린 이름표는 점과 가는 선으로 잇는다).
   */
  const labels = useMemo(() => {
    const LINE = 24;
    const placed: { d: (typeof dots)[number]; lx: number; ly: number }[] = [];
    for (const d of [...dots].filter((x) => x.v > 0).sort((a, b) => a.y - b.y)) {
      let lx = d.x + d.r + 6;
      let ly = d.y;
      for (let moved = true; moved; ) {
        moved = false;
        for (const p of placed) {
          if (Math.abs(p.lx - lx) < 80 && Math.abs(p.ly - ly) < LINE) {
            ly = p.ly + LINE;
            lx = Math.max(lx, p.lx);
            moved = true;
          }
        }
      }
      placed.push({ d, lx, ly });
    }
    return placed;
  }, [dots]);

  const detail = (r: StatsByUnit) => [
    `접수 ${r.leadCount}건 · 계약 ${r.contractCount}건`,
    `작업 ${r.workCount}건 · 매출 ${won(r.revenue)}`,
  ];
  const showTip = (e: React.MouseEvent, title: string, lines: string[]) => {
    const box = (e.currentTarget.closest(`.${styles.plot}`) as HTMLElement).getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title, lines });
  };

  const title = `지점별 ${STATS_METRIC_LABEL[metric]}${view === 'bar' ? ` (상위 ${TOP_N})` : ''}`;

  return (
    <PageCard
      title={title}
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
      {sorted.length === 0 ? (
        <div className={styles.empty}>데이터가 없습니다</div>
      ) : view === 'bar' ? (
        <div className={styles.plot} onMouseLeave={() => setTip(null)}>
          <div className={styles.columns} role="list" aria-label={title}>
            {bars.map((b) => {
              const v = b[metric];
              return (
                <div
                  key={b.orgUnitId ?? b.orgUnitName}
                  role="listitem"
                  aria-label={`${b.orgUnitName} ${exact(v, metric)}`}
                  className={styles.column}
                  onMouseMove={(e) => showTip(e, b.orgUnitName, detail(b))}
                >
                  <div className={styles.colValue}>{short(v, metric)}</div>
                  <div className={styles.colTrack}>
                    <div
                      className={styles.colBar}
                      style={{ height: `${(v / maxV) * 100}%`, minHeight: v ? 3 : 0 }}
                    />
                  </div>
                  <div className={styles.colLabel} title={b.orgUnitName}>
                    {b.orgUnitName}
                  </div>
                </div>
              );
            })}
          </div>
          {tip && <TipBox tip={tip} />}
        </div>
      ) : (
        <div className={styles.plot} onMouseLeave={() => setTip(null)}>
          <svg
            viewBox={`0 0 ${KOREA_MAP.width} ${KOREA_MAP.height}`}
            className={styles.map}
            role="img"
            aria-label={`${title} 지도`}
          >
            {KOREA_MAP.regions.map((r) => (
              <path key={r.sido} d={r.d} className={styles.region} />
            ))}
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
                <circle cx={d.x} cy={d.y} r={Math.max(d.r, 10)} fill="transparent" />
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={d.r}
                  className={d.v > 0 ? styles.dotFill : styles.dotEmpty}
                />
              </g>
            ))}
            {labels.map(({ d, lx, ly }) => {
              const key = d.b.orgUnitId ?? d.b.orgUnitName;
              const moved = Math.abs(ly - d.y) > 1 || lx > d.x + d.r + 7;
              return (
                <g key={`t-${key}`}>
                  {moved && (
                    <line
                      x1={d.x + d.r * 0.7}
                      y1={d.y + d.r * 0.3}
                      x2={lx - 2}
                      y2={ly}
                      className={styles.leader}
                    />
                  )}
                  <text x={lx} y={ly} className={styles.dotLabel}>
                    <tspan x={lx}>{d.b.orgUnitName}</tspan>
                    <tspan x={lx} dy="1.1em" className={styles.mapValue}>
                      {short(d.v, metric)}
                    </tspan>
                  </text>
                </g>
              );
            })}
          </svg>
          {tip && <TipBox tip={tip} />}
          <div className={styles.mapFoot}>
            <span className={styles.legend}>
              <svg width="44" height="26" aria-hidden>
                <circle cx="8" cy="18" r="4" className={styles.dotFill} />
                <circle cx="30" cy="13" r="11" className={styles.dotFill} />
              </svg>
              점이 클수록 많습니다 · 최대 {exact(sorted[0]?.[metric] ?? 0, metric)}
            </span>
            {unplaced.length > 0 && (
              <span className={styles.legendNote}>
                위치 없는 지점 {unplaced.length}곳은 지도에 없습니다(조직관리에서 주소 등록)
              </span>
            )}
          </div>
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
