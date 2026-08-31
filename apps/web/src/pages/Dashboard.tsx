import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, DataTable, PageCard, PageHeader, type Column } from '../components/ui';
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
  byBranch: { orgUnitName: string; contractCount: number; revenue: number }[];
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

/**
 * 가로 막대 차트 — 단일 계열(sequential)이라 범례 없이 제목이 무엇을 그렸는지 말한다.
 * 막대 끝에 값을 직접 표기(표면 대비가 3:1 미만인 브랜드 색이라 라벨이 필수 보조 수단).
 */
function BarChart({
  items,
  labelWidth = 76,
  valueWidth = 76,
}: {
  items: BarItem[];
  labelWidth?: number;
  valueWidth?: number;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) {
    return (
      <div style={{ color: 'var(--ark-color-text-tertiary)', fontSize: 13, padding: '8px 0' }}>
        데이터가 없습니다
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it) => (
        <div
          key={it.key}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          title={it.title}
        >
          <div
            style={{
              width: labelWidth,
              flexShrink: 0,
              fontSize: 13,
              color: 'var(--ark-color-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              background: 'var(--chart-track)',
              borderRadius: 4,
            }}
          >
            <div
              style={{
                width: `${(it.value / max) * 100}%`,
                minWidth: it.value ? 3 : 0,
                height: 20,
                background: 'var(--chart-bar)',
                /* 기준선 쪽은 각지게, 데이터 끝만 4px 둥글게 */
                borderRadius: '2px 4px 4px 2px',
                transition: 'width .3s',
              }}
            />
          </div>
          {/* 값은 막대 뒤가 아니라 고정폭 열에 둔다 — 최장 막대에서 라벨이 잘리지 않고
              숫자끼리 세로로 정렬돼 비교가 쉬워진다. */}
          <div
            style={{
              width: valueWidth,
              flexShrink: 0,
              textAlign: 'right',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ark-color-text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            {it.valueLabel ?? it.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
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

  const branchItems: BarItem[] = [...(data?.byBranch ?? [])]
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .map((b) => ({
      key: b.orgUnitName,
      label: b.orgUnitName,
      value: Number(b.revenue),
      valueLabel: wonShort(b.revenue),
      title: `${b.orgUnitName} ${won(b.revenue)}원 · 계약 ${b.contractCount}건`,
    }));

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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <PageCard title={t('dashboard.funnel')}>
          <BarChart items={funnelItems} />
        </PageCard>

        <PageCard title={t('dashboard.byBranch')}>
          <BarChart items={branchItems} labelWidth={92} valueWidth={68} />
        </PageCard>
      </div>

      <PageCard title="지점별 상세" count={data?.byBranch.length ?? 0} plain>
        <DataTable columns={branchCols} rows={data?.byBranch ?? []} rowKey="orgUnitName" />
      </PageCard>
    </div>
  );
}
