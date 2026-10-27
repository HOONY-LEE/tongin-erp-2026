import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import {
  DASH_PERIOD_LABEL,
  DASH_METRIC_LABEL,
  DASH_WIDGET_MAP,
  type DashDataResult,
  type DashItem,
  type StatsOverview,
} from '@tongin/shared';
import { api } from '../../../lib/api';
import { Skeleton } from '../../ui';
import { VizBody } from '../viz/Charts';
import { UnitPerformance } from '../UnitPerformance';
import { BranchAnomalyCard } from '../BranchAnomalyCard';
import styles from './builder.module.css';

/** 기존 대시보드 부품(스스로 데이터를 부른다) */
function Embed({ widget }: { widget: string }) {
  const [byBranch, setByBranch] = useState<StatsOverview['byBranch'] | null>(null);
  useEffect(() => {
    if (widget !== 'branch.performance') return;
    api<StatsOverview>('/stats/overview')
      .then((d) => setByBranch(d.byBranch))
      .catch(() => setByBranch([]));
  }, [widget]);
  if (widget === 'branch.anomalyReport') return <BranchAnomalyCard reload={1} />;
  if (!byBranch) return <Skeleton height="100%" radius={10} />;
  return <UnitPerformance byBranch={byBranch} />;
}

/**
 * 위젯 한 칸 — 제목·기간 표시 + 본문(그래프). 편집 화면에서는 actions(옮기기 손잡이 등)를 덧붙인다.
 */
export function WidgetFrame({
  item,
  result,
  loading,
  actions,
  selected,
  dragHandleProps,
}: {
  item: DashItem;
  result?: DashDataResult;
  loading?: boolean;
  actions?: ReactNode;
  selected?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
}) {
  const def = DASH_WIDGET_MAP.get(item.widget);
  if (!def) return null;
  if (def.shape === 'embed') {
    return (
      <div className={`${styles.embed} ${selected ? styles.selected : ''}`}>
        {(actions || dragHandleProps) && (
          <div className={styles.embedBar} {...dragHandleProps}>
            <span className={styles.title}>{item.title || def.title}</span>
            {actions}
          </div>
        )}
        <div className={styles.embedBody}>
          <Embed widget={def.key} />
        </div>
      </div>
    );
  }
  const meta = [
    item.period ? DASH_PERIOD_LABEL[item.period] : null,
    def.metric && item.metric ? DASH_METRIC_LABEL[item.metric] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section
      className={`${styles.frame} ${selected ? styles.selected : ''}`}
      aria-label={item.title || def.title}
    >
      <div className={styles.head} {...dragHandleProps}>
        <span className={styles.title} title={def.description}>
          {item.title || def.title}
        </span>
        {meta && <span className={styles.meta}>{meta}</span>}
        <span className={styles.spacer} />
        {actions}
      </div>
      <div className={styles.body}>
        {def.shape === 'text' ? (
          <VizBody viz="text" data={null} item={item} />
        ) : loading && !result ? (
          <Skeleton height="100%" radius={8} />
        ) : result && !result.ok ? (
          <div className={styles.error}>
            <Lock size={14} aria-hidden /> {result.error}
          </div>
        ) : (
          <VizBody viz={item.viz} data={result?.ok ? result.data : null} item={item} />
        )}
      </div>
    </section>
  );
}
