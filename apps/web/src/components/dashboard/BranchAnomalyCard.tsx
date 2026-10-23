import { useEffect, useState } from 'react';
import {
  ANOMALY_LEVEL_LABEL,
  type AnomalyLevel,
  type BranchAnomaly,
  type BranchAnomalyReport,
} from '@tongin/shared';
import { Badge, DataTable, PageCard, type BadgeColor, type Column, type Row } from '../ui';
import { api } from '../../lib/api';

const LEVEL_COLOR: Record<AnomalyLevel, BadgeColor> = {
  NORMAL: 'neutral',
  WATCH: 'warning',
  SUSPECT: 'error',
};
const man = (v: number) => (v ? `${Math.round(v / 1e4).toLocaleString()}만` : '0');

/**
 * 이상 지점 — 미계약·멈춘 건은 많은데 계약 매출이 낮은 지점(전산 밖 계약·수수료 누락 의심).
 * 주의·의심 등급만 보여 준다. reload 값이 바뀔 때(대시보드 통계 로드·새로고침마다) 다시 불러온다.
 */
export function BranchAnomalyCard({ reload }: { reload: number }) {
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
    { title: '지점', render: (r) => b(r).orgUnitName, width: 110 },
    {
      title: '등급',
      width: 80,
      render: (r) => (
        <Badge variant="subtle" color={LEVEL_COLOR[b(r).level]}>
          {ANOMALY_LEVEL_LABEL[b(r).level]} {b(r).score}
        </Badge>
      ),
    },
    {
      title: '이사일 지난 미계약',
      numeric: true,
      render: (r) => `${b(r).metrics.pastMoveOpenCount}건`,
    },
    {
      title: '견적→계약',
      numeric: true,
      render: (r) => `${Math.round(b(r).metrics.conversionRate * 100)}%`,
    },
    { title: '계약 매출', numeric: true, render: (r) => man(b(r).metrics.revenue) },
    { title: '누락 추정', numeric: true, render: (r) => man(b(r).metrics.missingRevenue) },
    { title: '추정 미납 수수료', numeric: true, render: (r) => man(b(r).metrics.commissionAtRisk) },
    {
      title: '주요 사유',
      flex: 1,
      minWidth: 220,
      render: (r) => (
        <span title={b(r).reasons.join('\n')} style={{ fontSize: 13 }}>
          {b(r).reasons[0] ?? '-'}
        </span>
      ),
    },
  ];

  if (!data) return null;
  return (
    <PageCard title="이상 지점 (수수료 누락 의심)" count={flagged.length} plain>
      <div
        style={{
          fontSize: 12,
          color: 'var(--ark-color-text-secondary)',
          padding: '0 16px 8px',
        }}
      >
        최근 접수({data.from} ~ {data.to}) 기준, 접수 {data.minLeads}건 이상 지점
        {data.baseline.branchCount}곳의 중앙값과 비교한 통계 신호입니다. {data.commissionNote}.
      </div>
      {flagged.length ? (
        <DataTable columns={cols} rows={flagged as unknown as Row[]} rowKey="orgUnitId" />
      ) : (
        <div style={{ padding: 16, color: 'var(--ark-color-text-secondary)' }}>
          눈에 띄는 이상 지점이 없습니다.
        </div>
      )}
    </PageCard>
  );
}
