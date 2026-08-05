import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, DataTable, PageCard, PageHeader, type Column } from '../components/ui';
import { api } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

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
  byBranch: { orgUnitName: string; contractCount: number; revenue: number }[];
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(() => {
    return api<Overview>('/stats/overview')
      .then((d) => {
        setData(d);
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
    { label: t('dashboard.kpiRevenue'), value: kpi ? won(kpi.revenue) : '-' },
    { label: t('dashboard.kpiCollected'), value: kpi ? won(kpi.collected) : '-' },
    { label: t('dashboard.kpiOutstanding'), value: kpi ? won(kpi.outstanding) : '-', danger: true },
  ];

  const maxFunnel = Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [1]));

  const branchCols: Column[] = [
    { title: t('dashboard.branch'), dataIndex: 'orgUnitName' },
    { title: t('dashboard.contractCount'), numeric: true, render: (r) => String(r.contractCount) },
    { title: t('dashboard.revenue'), numeric: true, render: (r) => won(r.revenue) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('dashboard.title')} onRefresh={load} updatedAt={updatedAt} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 16,
        }}
      >
        {kpiCards.map((c) => (
          <Card key={c.label} style={{ padding: 20 }}>
            <div style={{ color: 'var(--ark-color-text-secondary)', fontSize: 13 }}>{c.label}</div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                marginTop: 6,
                color: c.danger ? 'var(--ark-color-text-danger)' : undefined,
              }}
            >
              {c.value}
            </div>
          </Card>
        ))}
      </div>

      <PageCard title={t('dashboard.funnel')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(data?.funnel ?? []).map((f) => (
            <div key={f.status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 80, fontSize: 13, color: 'var(--ark-color-text-secondary)' }}>
                {STATUS_LABEL[f.status] ?? f.status}
              </div>
              <div style={{ flex: 1, background: 'var(--ark-color-bg-subtle)', borderRadius: 4 }}>
                <div
                  style={{
                    width: `${(f.count / maxFunnel) * 100}%`,
                    minWidth: f.count ? 24 : 0,
                    height: 22,
                    background: 'var(--ark-color-primary-500)',
                    borderRadius: 4,
                    transition: 'width .3s',
                  }}
                />
              </div>
              <div style={{ width: 40, textAlign: 'right', fontWeight: 600 }}>{f.count}</div>
            </div>
          ))}
        </div>
      </PageCard>

      <PageCard title={t('dashboard.byBranch')} count={data?.byBranch.length ?? 0}>
        <DataTable columns={branchCols} rows={data?.byBranch ?? []} />
      </PageCard>
    </div>
  );
}
