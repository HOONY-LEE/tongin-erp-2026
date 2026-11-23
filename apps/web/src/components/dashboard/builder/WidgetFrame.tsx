import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DASH_WIDGET_MAP,
  isCustomWidgetKey,
  type CustomWidgetRow,
  type StudioParams,
  type StudioResult,
  type DashDataResult,
  type DashItem,
  type StatsOverview,
} from '@tongin/shared';
import { api } from '../../../lib/api';
import { Skeleton } from '../../ui';
import { DrillCtx, VizBody } from '../viz/Charts';
import { StudioWidget } from '../studio/StudioWidget';
import { hasItemLink, itemLink, widgetLink } from '../drill';
import { UnitPerformance } from '../UnitPerformance';
import { BranchAnomalyCard } from '../BranchAnomalyCard';
import styles from './builder.module.css';
import { DASH_METRIC_LABEL, DASH_PERIOD_LABEL } from '../../../i18n/codes';
import { itemTitle, widgetDesc } from '../../../i18n/dashWidgets';

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
  drill,
}: {
  item: DashItem;
  result?: DashDataResult;
  loading?: boolean;
  actions?: ReactNode;
  selected?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  /** 보기 화면 — 제목·숫자·항목을 누르면 목록으로(편집 화면은 끈다) */
  drill?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (isCustomWidgetKey(item.widget))
    return (
      <CustomFrame
        item={item}
        actions={actions}
        selected={selected}
        dragHandleProps={dragHandleProps}
        drill={drill}
      />
    );
  const def = DASH_WIDGET_MAP.get(item.widget);
  if (!def) return null;
  if (def.shape === 'embed') {
    return (
      <div className={`${styles.embed} ${selected ? styles.selected : ''}`}>
        {(actions || dragHandleProps) && (
          <div className={styles.embedBar} {...dragHandleProps}>
            <span className={styles.title}>{itemTitle(item.title, def)}</span>
            {actions}
          </div>
        )}
        <div className={styles.embedBody}>
          <Embed widget={def.key} />
        </div>
      </div>
    );
  }
  const ok = !!result?.ok;
  const link = drill && ok ? widgetLink(item) : null;
  const pick =
    drill && ok && hasItemLink(item)
      ? (key: string) => {
          const href = itemLink(item, key);
          if (href) navigate(href);
        }
      : null;
  const title = itemTitle(item.title, def);
  const meta = [
    item.period ? DASH_PERIOD_LABEL[item.period] : null,
    def.metric && item.metric ? DASH_METRIC_LABEL[item.metric] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section
      className={`${styles.frame} ${selected ? styles.selected : ''}`}
      aria-label={itemTitle(item.title, def)}
    >
      <div className={styles.head} {...dragHandleProps}>
        {link ? (
          <button
            type="button"
            className={`${styles.title} ${styles.titleLink}`}
            title={`${widgetDesc(def)}\n${t('dash.openList')}`}
            onClick={() => navigate(link)}
          >
            {title}
            <ChevronRight size={14} aria-hidden />
          </button>
        ) : (
          <span className={styles.title} title={widgetDesc(def)}>
            {title}
          </span>
        )}
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
        ) : link && def.shape === 'value' ? (
          // 숫자 카드는 칸 전체를 눌러 목록으로
          <button
            type="button"
            className={styles.bodyLink}
            aria-label={`${title} — ${t('dash.openList')}`}
            onClick={() => navigate(link)}
          >
            <VizBody viz={item.viz} data={result?.ok ? result.data : null} item={item} />
          </button>
        ) : (
          <DrillCtx.Provider value={pick}>
            <VizBody viz={item.viz} data={result?.ok ? result.data : null} item={item} />
          </DrillCtx.Provider>
        )}
      </div>
    </section>
  );
}

/** 만든 위젯의 데이터 목록 화면(제목을 누르면) */
const DATASET_LIST: Record<string, string> = {
  lead: '/leads',
  contract: '/contracts',
  payment: '/payments-confirm',
  work: '/work-orders',
  support: '/support',
  customer: '/customers',
  estimate: '/estimates',
  service_order: '/service-orders',
  material_order: '/material-orders',
  stock: '/materials',
  cs_call: '/callcenter',
  cs_sms: '/sms-history',
  campaign: '/campaigns',
  invoice: '/billing',
  attendance: '/attendance',
  leave: '/leave',
  approval: '/approvals',
  task: '/tasks',
  calendar: '/calendar',
  space: '/spaces',
  asset: '/assets',
  branch: '/org-units',
  branch_case: '/branch-cases',
};

/**
 * 만든 위젯(위젯 스튜디오) 한 칸 — 설계서와 첫 데이터를 한 번에 받고, 조작하면 다시 부른다.
 * 데이터 권한·지점 범위는 서버가 보는 사람 기준으로 건다.
 */
function CustomFrame({
  item,
  actions,
  selected,
  dragHandleProps,
  drill,
}: {
  item: DashItem;
  actions?: ReactNode;
  selected?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  drill?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const id = item.widget.slice(3);
  const [widget, setWidget] = useState<CustomWidgetRow | null>(null);
  const [error, setError] = useState('');
  const first = useRef<StudioResult | null>(null);
  useEffect(() => {
    let alive = true;
    api<StudioResult & { widget: CustomWidgetRow }>(`/custom-widgets/${id}/data`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
      .then((r) => {
        if (!alive) return;
        first.current = r;
        setWidget(r.widget);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [id]);
  const load = (params: StudioParams) => {
    if (first.current && !Object.keys(params).length) {
      const r = first.current;
      first.current = null;
      return Promise.resolve(r);
    }
    return api<StudioResult>(`/custom-widgets/${id}/data`, {
      method: 'POST',
      body: JSON.stringify({ params }),
    });
  };
  const title = item.title || widget?.title || '';
  const link = drill && widget ? DATASET_LIST[widget.spec.dataset] : null;
  /** 제목 줄 오른쪽 칸 — '제목 줄'에 놓은 조작 요소(탭·드롭다운)가 들어온다 */
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <section className={`${styles.frame} ${selected ? styles.selected : ''}`} aria-label={title}>
      <div className={styles.head} {...dragHandleProps}>
        {link ? (
          <button
            type="button"
            className={`${styles.title} ${styles.titleLink}`}
            title={t('dash.openList')}
            onClick={() => navigate(link)}
          >
            {title}
            <ChevronRight size={14} aria-hidden />
          </button>
        ) : (
          <span className={styles.title} title={widget?.subtitle ?? undefined}>
            {title}
          </span>
        )}
        <span className={styles.spacer} />
        <span ref={setSlot} className={styles.headSlot} onMouseDown={(e) => e.stopPropagation()} />
        {actions}
      </div>
      <div className={styles.body}>
        {error ? (
          <div className={styles.error}>
            <Lock size={14} aria-hidden /> {error}
          </div>
        ) : !widget ? (
          <Skeleton height="100%" radius={8} />
        ) : (
          <StudioWidget spec={widget.spec} load={load} headerSlot={slot} />
        )}
      </div>
    </section>
  );
}
