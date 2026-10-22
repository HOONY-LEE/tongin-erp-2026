import { useMemo, useState } from 'react';
import {
  STATS_METRICS,
  STATS_METRIC_LABEL,
  type StatsByUnit,
  type StatsMetric,
} from '@tongin/shared';
import { PageCard, SegmentedControl, Select } from '../ui';
import { KOREA_MAP } from './koreaMap';
import styles from './dashboard.module.css';

type RegionRow = Omit<StatsByUnit, 'orgUnitName'> & { sido: string };

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

/** 지도 단계색 — 한 색(차트 막대색)의 옅음→짙음 5단계. 0은 바탕(트랙)색 */
const STEPS = [22, 40, 58, 78, 100];
const stepColor = (i: number) =>
  `color-mix(in oklab, var(--chart-bar) ${STEPS[i]}%, var(--chart-track))`;

/**
 * 작은 시·도를 큰 시·도 위에 그린다(서울이 경기 안에 있어 경기가 덮지 않게).
 * 이름표 겹침 보정 — 서울·인천은 경기 한가운데와 겹쳐서 옆으로 뺀다.
 */
const REGIONS = [...KOREA_MAP.regions].sort((a, b) => b.d.length - a.d.length);
const LABEL_NUDGE: Record<string, [number, number]> = {
  서울: [6, -26],
  인천: [-34, 4],
  경기: [16, 30],
  세종: [-10, -6],
  대전: [8, 10],
};
const labelPos = (r: { sido: string; cx: number; cy: number }) => {
  const [dx, dy] = LABEL_NUDGE[r.sido] ?? [0, 0];
  return { x: r.cx + dx, y: r.cy + dy };
};

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

/**
 * 지점·지역 실적 — 지표(접수·계약·작업·매출)를 골라 지점별 세로 막대 또는 시·도 지도로 본다.
 * 한 번에 한 지표만 그린다(단일 계열 — 범례 대신 제목이 무엇을 그렸는지 말한다).
 * 지도는 접수 출발지(시·도) 기준이다.
 */
export function UnitPerformance({
  byBranch,
  byRegion,
}: {
  byBranch: StatsByUnit[];
  byRegion: RegionRow[];
}) {
  const [metric, setMetric] = useState<StatsMetric>('revenue');
  const [view, setView] = useState<'bar' | 'map'>('bar');
  const [tip, setTip] = useState<Tip | null>(null);

  const bars = useMemo(
    () => [...byBranch].sort((a, b) => b[metric] - a[metric]),
    [byBranch, metric],
  );
  const maxBar = Math.max(1, ...bars.map((b) => b[metric]));

  const regionBy = useMemo(() => new Map(byRegion.map((r) => [r.sido, r])), [byRegion]);
  const maxRegion = Math.max(0, ...byRegion.map((r) => r[metric]));
  const stepOf = (v: number) =>
    v <= 0 || maxRegion <= 0 ? -1 : Math.min(4, Math.floor((v / maxRegion) * 5 - 1e-9));
  const ranked = [...byRegion].filter((r) => r[metric] > 0).sort((a, b) => b[metric] - a[metric]);

  const detail = (r: Omit<StatsByUnit, 'orgUnitName'>) => [
    `접수 ${r.leadCount}건 · 계약 ${r.contractCount}건`,
    `작업 ${r.workCount}건 · 매출 ${won(r.revenue)}`,
  ];
  const showTip = (e: React.MouseEvent, title: string, lines: string[]) => {
    const box = (e.currentTarget.closest(`.${styles.plot}`) as HTMLElement).getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title, lines });
  };

  const title = `${view === 'bar' ? '지점별' : '지역별(출발지)'} ${STATS_METRIC_LABEL[metric]}`;

  return (
    <PageCard
      title={title}
      actions={
        <div className={styles.controls}>
          <div style={{ width: 140 }}>
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
              setView(v as 'bar' | 'map');
              setTip(null);
            }}
            options={[
              { value: 'bar', label: '막대' },
              { value: 'map', label: '지도' },
            ]}
            size="sm"
          />
        </div>
      }
    >
      {view === 'bar' ? (
        bars.length === 0 ? (
          <div className={styles.empty}>데이터가 없습니다</div>
        ) : (
          <div className={styles.plot} onMouseLeave={() => setTip(null)}>
            <div className={styles.columns} role="list" aria-label={title}>
              {bars.map((b) => {
                const v = b[metric];
                return (
                  <div
                    key={b.orgUnitName}
                    role="listitem"
                    aria-label={`${b.orgUnitName} ${exact(v, metric)}`}
                    className={styles.column}
                    onMouseMove={(e) => showTip(e, b.orgUnitName, detail(b))}
                  >
                    <div className={styles.colValue}>{short(v, metric)}</div>
                    <div className={styles.colTrack}>
                      <div
                        className={styles.colBar}
                        style={{ height: `${(v / maxBar) * 100}%`, minHeight: v ? 3 : 0 }}
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
        )
      ) : (
        <div className={styles.mapWrap}>
          <div className={styles.plot} onMouseLeave={() => setTip(null)}>
            <svg
              viewBox={`0 0 ${KOREA_MAP.width} ${KOREA_MAP.height}`}
              className={styles.map}
              role="img"
              aria-label={`${title} 지도`}
            >
              {REGIONS.map((r) => {
                const row = regionBy.get(r.sido);
                const v = row?.[metric] ?? 0;
                const s = stepOf(v);
                return (
                  <path
                    key={r.sido}
                    d={r.d}
                    className={styles.region}
                    style={{ fill: s < 0 ? 'var(--chart-track)' : stepColor(s) }}
                    onMouseMove={(e) => showTip(e, r.name, row ? detail(row) : ['데이터 없음'])}
                  />
                );
              })}
              {REGIONS.map((r) => {
                const v = regionBy.get(r.sido)?.[metric] ?? 0;
                if (!v) return null;
                const p = labelPos(r);
                return (
                  <text key={r.sido} x={p.x} y={p.y} className={styles.mapLabel}>
                    <tspan x={p.x}>{r.sido}</tspan>
                    <tspan x={p.x} dy="1.15em" className={styles.mapValue}>
                      {short(v, metric)}
                    </tspan>
                  </text>
                );
              })}
            </svg>
            {tip && <TipBox tip={tip} />}
          </div>

          <div className={styles.mapSide}>
            <div className={styles.legend} aria-label="색 단계">
              <span>적음</span>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={styles.legendSwatch}
                  style={{ background: stepColor(i) }}
                />
              ))}
              <span>많음</span>
            </div>
            <div className={styles.legendNote}>
              가장 많은 지역 {maxRegion ? exact(maxRegion, metric) : '-'} 기준 5단계 · 접수 출발지
            </div>
            <ol className={styles.rank}>
              {ranked.map((r) => (
                <li key={r.sido}>
                  <span>{r.sido}</span>
                  <b>{exact(r[metric], metric)}</b>
                </li>
              ))}
              {!ranked.length && <li className={styles.empty}>데이터가 없습니다</li>}
            </ol>
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
