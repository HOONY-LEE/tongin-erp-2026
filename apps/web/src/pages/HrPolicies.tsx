import i18n from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  Input,
  PageCard,
  PageHeader,
  Select,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import { fs } from '../lib/fontScale';
import { thisMonth } from '../lib/workMenus';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const KIND: StatusMap = {
  INCENTIVE: { label: i18n.t('hrp.kind.INCENTIVE'), color: 'success' },
  PENALTY: { label: i18n.t('hrp.kind.PENALTY'), color: 'error' },
};
const TARGET: Record<string, string> = {
  EMPLOYEE: i18n.t('hrp.target.EMPLOYEE'),
  BRANCH: i18n.t('hrp.target.BRANCH'),
};
const METRIC: Record<string, string> = {
  CONTRACT_REVENUE: i18n.t('hrp.metric.CONTRACT_REVENUE'),
  CONTRACT_COUNT: i18n.t('hrp.metric.CONTRACT_COUNT'),
  PAID_REVENUE: i18n.t('hrp.metric.PAID_REVENUE'),
  DONE_COUNT: i18n.t('hrp.metric.DONE_COUNT'),
  AS_COUNT: i18n.t('hrp.metric.AS_COUNT'),
};
const AMOUNT_METRIC = ['CONTRACT_REVENUE', 'PAID_REVENUE'];

interface PayoutLine {
  policyName: string;
  kind: string;
  metric: string;
  base: number;
  value: number;
  amount: number;
}
interface PayoutTarget {
  targetId: string;
  targetName: string;
  lines: PayoutLine[];
  incentive: number;
  penalty: number;
  net: number;
}

export default function HrPolicies() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const orgs = useOptions('/org-units', 'name');

  const [targetType, setTargetType] = useState('EMPLOYEE');
  // 기본은 이번 달(한국 시간)
  const [year, setYear] = useState(() => thisMonth().year);
  const [month, setMonth] = useState(() => thisMonth().month);
  const [result, setResult] = useState<PayoutTarget[] | null>(null);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/hr/policies'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('hrp.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api('/hr/policies', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('hrp.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('hrp.saveFailed') });
      throw e;
    }
  };

  const run = async () => {
    try {
      const r = await api<{ targets: PayoutTarget[] }>(
        `/hr/payout?year=${year}&month=${month}&targetType=${targetType}`,
      );
      setResult(r.targets);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('hrp.calcFailed') });
    }
  };

  const fields: FormField[] = [
    { name: 'name', label: t('hrp.name'), required: true, placeholder: t('hrp.namePh') },
    {
      name: 'kind',
      label: t('hrp.kindLabel'),
      type: 'select',
      options: [
        { value: 'INCENTIVE', label: t('hrp.kind.INCENTIVE') },
        { value: 'PENALTY', label: t('hrp.kind.PENALTY') },
      ],
    },
    {
      name: 'targetType',
      label: t('hrp.targetLabel'),
      required: true,
      type: 'select',
      options: [
        { value: 'EMPLOYEE', label: t('hrp.target.EMPLOYEE') },
        { value: 'BRANCH', label: t('hrp.target.BRANCH') },
      ],
    },
    {
      name: 'metric',
      label: t('hrp.metricLabel'),
      required: true,
      type: 'select',
      options: Object.entries(METRIC).map(([value, label]) => ({ value, label })),
    },
    {
      name: 'calcType',
      label: t('hrp.calcLabel'),
      required: true,
      type: 'select',
      options: [
        { value: 'RATE', label: t('hrp.calc.RATE') },
        { value: 'FIXED_PER_UNIT', label: t('hrp.calc.FIXED') },
      ],
    },
    { name: 'value', label: t('hrp.value'), required: true, type: 'number' },
    { name: 'orgScopeId', label: t('hrp.scope'), type: 'select', options: orgs },
    { name: 'priority', label: t('hrp.priority'), type: 'number', placeholder: '100' },
  ];

  const policyCols: Column[] = [
    { title: t('hrp.name'), dataIndex: 'name' },
    { title: t('hrp.kindLabel'), render: (r) => <StatusBadge value={String(r.kind)} map={KIND} /> },
    {
      title: t('hrp.targetLabel'),
      render: (r) => TARGET[r.targetType as string] ?? String(r.targetType),
    },
    { title: t('hrp.metricCol'), render: (r) => METRIC[r.metric as string] ?? String(r.metric) },
    {
      title: t('hrp.valueCol'),
      render: (r) =>
        r.calcType === 'RATE'
          ? `${(Number(r.value) * 100).toFixed(2)}%`
          : t('hrp.wonPer', { v0: won(r.value) }),
    },
    { title: t('hrp.active'), render: (r) => (r.isActive ? '✓' : '–') },
  ];

  const resultCols: Column[] = [
    { title: t('hrp.targetLabel'), dataIndex: 'targetName' },
    {
      title: t('hrp.breakdown'),
      // 정책 수만큼 줄이 쌓인다 — 행이 늘어나게(잘리지 않게). 줄 쌓기·줄마다 말줄임은 DataTable이 맡는다
      multiline: true,
      render: (r) =>
        (r.lines as PayoutLine[]).map((l, i) => (
          <span key={i} style={{ fontSize: fs(12), color: 'var(--ark-color-text-secondary)' }}>
            {l.policyName}: {METRIC[l.metric]}{' '}
            {AMOUNT_METRIC.includes(l.metric) ? won(l.base) : t('hrp.countN', { v0: l.base })} →{' '}
            <b style={{ color: l.amount < 0 ? 'var(--ark-color-error-600)' : 'inherit' }}>
              {won(l.amount)}
            </b>
          </span>
        )),
    },
    { title: t('hrp.incentive'), numeric: true, render: (r) => won(r.incentive) },
    { title: t('hrp.penalty'), numeric: true, render: (r) => won(r.penalty) },
    {
      title: t('hrp.net'),
      numeric: true,
      render: (r) => <b>{won(r.net)}</b>,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.hr')} onRefresh={load} updatedAt={updatedAt} />
      <PageCard
        title={t('hrp.title')}
        count={rows.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            {t('hrp.addBtn')}
          </Button>
        }
        plain
      >
        <DataTable columns={policyCols} rows={rows} loading={loading} />
        <FormModal
          open={open}
          onOpenChange={setOpen}
          title={t('hrp.addTitle')}
          size="md"
          fields={fields}
          onSubmit={onCreate}
        />
      </PageCard>

      <PageCard title={t('hrp.calcTitle')}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 160 }}>
            <Select
              label={t('hrp.targetType')}
              value={targetType}
              onValueChange={setTargetType}
              options={[
                { value: 'EMPLOYEE', label: t('hrp.target.EMPLOYEE') },
                { value: 'BRANCH', label: t('hrp.target.BRANCH') },
              ]}
            />
          </div>
          <Input
            label={t('hrp.year')}
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <Input
            label={t('hrp.month')}
            type="number"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Button variant="primary" onClick={run}>
            {t('hrp.calcBtn')}
          </Button>
        </div>
        {result && (
          <div style={{ marginTop: 16 }}>
            {result.length === 0 ? (
              <Badge variant="subtle" color="neutral">
                {t('hrp.empty')}
              </Badge>
            ) : (
              <DataTable columns={resultCols} rows={result as unknown as Row[]} />
            )}
          </div>
        )}
      </PageCard>
    </div>
  );
}
