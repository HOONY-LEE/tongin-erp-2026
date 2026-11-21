import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { type AnomalyLevel, type BranchAnomaly, type BranchAnomalyReport } from '@tongin/shared';
import { Badge, DataTable, PageCard, type BadgeColor, type Column, type Row } from '../ui';
import { api } from '../../lib/api';
import { fs } from '../../lib/fontScale';
import { ANOMALY_LEVEL_LABEL } from '../../i18n/codes';

const LEVEL_COLOR: Record<AnomalyLevel, BadgeColor> = {
  NORMAL: 'neutral',
  WATCH: 'warning',
  SUSPECT: 'error',
};
const man = (v: number) =>
  v ? i18n.t('dash.man', { v0: Math.round(v / 1e4).toLocaleString() }) : '0';

/**
 * 이상 지점 — 미계약·멈춘 건은 많은데 계약 매출이 낮은 지점(전산 밖 계약·수수료 누락 의심).
 * 주의·의심 등급만 보여 준다. reload 값이 바뀔 때(대시보드 통계 로드·새로고침마다) 다시 불러온다.
 */
export function BranchAnomalyCard({ reload }: { reload: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState<BranchAnomalyReport | null>(null);

  useEffect(() => {
    if (!reload) return; // 대시보드 통계를 처음 불러온 뒤부터
    api<BranchAnomalyReport>('/stats/branch-anomalies')
      .then(setData)
      .catch(() => setData(null));
  }, [reload]);

  const flagged = (data?.branches ?? []).filter((b) => b.level !== 'NORMAL');
  const b = (r: Row) => r as unknown as BranchAnomaly;
  const cols: Column[] = [
    { title: t('dash.branch'), render: (r) => b(r).orgUnitName, width: 110 },
    {
      title: t('dash.grade'),
      width: 80,
      render: (r) => (
        <Badge variant="subtle" color={LEVEL_COLOR[b(r).level]}>
          {ANOMALY_LEVEL_LABEL[b(r).level]} {b(r).score}
        </Badge>
      ),
    },
    {
      title: t('dash.pastMoveOpen'),
      numeric: true,
      render: (r) => t('dash.countUnit', { v0: b(r).metrics.pastMoveOpenCount }),
    },
    {
      title: t('dash.estToContract'),
      numeric: true,
      render: (r) => `${Math.round(b(r).metrics.conversionRate * 100)}%`,
    },
    { title: t('dash.contractRevenue'), numeric: true, render: (r) => man(b(r).metrics.revenue) },
    { title: t('dash.missingEst'), numeric: true, render: (r) => man(b(r).metrics.missingRevenue) },
    {
      title: t('dash.unpaidFeeEst'),
      numeric: true,
      render: (r) => man(b(r).metrics.commissionAtRisk),
    },
    {
      title: t('dash.mainReason'),
      flex: 1,
      minWidth: 220,
      render: (r) => (
        <span title={b(r).reasons.join('\n')} style={{ fontSize: fs(13) }}>
          {b(r).reasons[0] ?? '-'}
        </span>
      ),
    },
  ];

  if (!data) return null;
  return (
    <PageCard title={t('dash.anomalyTitle')} count={flagged.length} plain>
      <div
        style={{
          fontSize: fs(12),
          color: 'var(--ark-color-text-secondary)',
          padding: '0 16px 8px',
        }}
      >
        {t('dash.anomalyNote1')}
        {data.from} ~ {data.to}
        {t('dash.anomalyNote2')} {data.minLeads}
        {t('dash.anomalyNote3')}
        {data.baseline.branchCount}
        {t('dash.anomalyNote4')} {data.commissionNote}.
      </div>
      {flagged.length ? (
        <DataTable columns={cols} rows={flagged as unknown as Row[]} rowKey="orgUnitId" />
      ) : (
        <div style={{ padding: 16, color: 'var(--ark-color-text-secondary)' }}>
          {t('dash.noAnomaly')}
        </div>
      )}
    </PageCard>
  );
}
