import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatsOverview } from '@tongin/shared';
import { UnitPerformance } from '../components/dashboard/UnitPerformance';
import { ColumnChart } from '../components/dashboard/ColumnChart';
import { BranchAnomalyCard } from '../components/dashboard/BranchAnomalyCard';
import dashStyles from '../components/dashboard/dashboard.module.css';
import { Card, DataTable, PageCard, PageHeader, type Column, type Row } from '../components/ui';
import { api } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

/** KPI 타일·막대 끝 라벨용 축약 표기 — 1,103만 / 2.4억.
 *  원 단위 그대로 쓰면 8자리를 넘겨 좁은 타일에서 넘쳐흐른다. */
const wonShort = (v: unknown) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return n.toLocaleString();
};

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: '접수',
  CONSULT_ASSIGNED: '상담배정',
  CONSULT_TOSS: '상담토스',
  QUOTED: '견적완료',
  CONTRACTED: '계약',
  WORK_TOSS: '작업토스',
  IN_PROGRESS: '작업중',
  DONE: '완료',
  CANCELED: '취소',
};

interface Overview {
  funnel: { status: string; count: number }[];
  kpi: {
    leadTotal: number;
    contractCount: number;
    doneCount: number;
    revenue: number;
    collected: number;
    outstanding: number;
    conversionRate: number;
  };
  byBranch: StatsOverview['byBranch'];
  byRegion: StatsOverview['byRegion'];
}

interface BarItem {
  key: string;
  label: string;
  value: number;
  /** 막대 끝에 직접 표기할 값 (미지정 시 value) */
  valueLabel?: string;
  /** 마우스오버 시 보여줄 정확한 값 */
  title?: string;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [reload, setReload] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(() => {
    return api<Overview>('/stats/overview')
      .then((d) => {
        setData(d);
        setReload((n) => n + 1);
        touch();
      })
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpi = data?.kpi;
  const kpiCards = [
    { label: t('dashboard.kpiLeads'), value: kpi ? String(kpi.leadTotal) : '-' },
    { label: t('dashboard.kpiContracts'), value: kpi ? String(kpi.contractCount) : '-' },
    { label: t('dashboard.kpiDone'), value: kpi ? String(kpi.doneCount) : '-' },
    {
      label: t('dashboard.kpiConversion'),
      value: kpi ? `${(kpi.conversionRate * 100).toFixed(1)}%` : '-',
    },
    {
      label: t('dashboard.kpiRevenue'),
      value: kpi ? wonShort(kpi.revenue) : '-',
      exact: kpi && won(kpi.revenue),
    },
    {
      label: t('dashboard.kpiCollected'),
      value: kpi ? wonShort(kpi.collected) : '-',
      exact: kpi && won(kpi.collected),
    },
    {
      label: t('dashboard.kpiOutstanding'),
      value: kpi ? wonShort(kpi.outstanding) : '-',
      exact: kpi && won(kpi.outstanding),
      danger: true,
    },
  ];

  const leadTotal = kpi?.leadTotal ?? 0;
  const funnelItems: BarItem[] = (data?.funnel ?? []).map((f) => ({
    key: f.status,
    label: STATUS_LABEL[f.status] ?? f.status,
    value: f.count,
    valueLabel: leadTotal
      ? `${f.count} · ${Math.round((f.count / leadTotal) * 100)}%`
      : String(f.count),
    title: `${STATUS_LABEL[f.status] ?? f.status} ${f.count}건`,
  }));

  const branchCols: Column[] = [
    { title: t('dashboard.branch'), dataIndex: 'orgUnitName' },
    { title: '접수', numeric: true, render: (r) => String(r.leadCount ?? 0) },
    { title: t('dashboard.contractCount'), numeric: true, render: (r) => String(r.contractCount) },
    { title: '작업', numeric: true, render: (r) => String(r.workCount ?? 0) },
    { title: t('dashboard.revenue'), numeric: true, render: (r) => won(r.revenue) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('dashboard.title')} onRefresh={load} updatedAt={updatedAt} />

      <div
        style={{
          display: 'grid',
          /* auto-fit + minmax(0,1fr) — 남는 폭을 타일들이 나눠 갖고, 좁아지면 줄바꿈된다.
             (auto-fill + 고정 150px는 타일 폭이 안 늘어나 큰 금액이 넘쳐흐르던 원인) */
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        {kpiCards.map((c) => (
          <Card key={c.label} style={{ padding: 16, minWidth: 0 }}>
            <div
              style={{
                color: 'var(--ark-color-text-secondary)',
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {c.label}
            </div>
            <div
              title={c.exact || undefined}
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginTop: 6,
                letterSpacing: '-0.02em',
                overflowWrap: 'anywhere',
                color: c.danger ? 'var(--ark-color-text-danger)' : undefined,
              }}
            >
              {c.value}
            </div>
          </Card>
        ))}
      </div>

      <div className={dashStyles.twoCol}>
        <PageCard title={t('dashboard.funnel')}>
          <div className={dashStyles.plotBox}>
            <ColumnChart
              label={t('dashboard.funnel')}
              items={funnelItems.map((f) => ({
                key: f.key,
                label: f.label,
                value: f.value,
                valueLabel: String(f.value),
                subLabel: leadTotal ? `${Math.round((f.value / leadTotal) * 100)}%` : undefined,
                tip: [f.title ?? f.label],
              }))}
            />
          </div>
        </PageCard>
        <UnitPerformance byBranch={data?.byBranch ?? []} />
      </div>

      <BranchAnomalyCard reload={reload} />

      <PageCard title="지점별 상세" count={data?.byBranch.length ?? 0} plain>
        <DataTable
          columns={branchCols}
          rows={(data?.byBranch ?? []) as unknown as Row[]}
          rowKey="orgUnitName"
        />
      </PageCard>
    </div>
  );
}
