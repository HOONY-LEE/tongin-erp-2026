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

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const CALC: StatusMap = {
  RATE: { label: '정률', color: 'info' },
  FIXED: { label: '정액', color: 'primary' },
};

interface Receivable extends Row {
  customerName: string;
  contractCount: number;
  billed: number;
  paid: number;
  outstanding: number;
}
interface Monthly extends Row {
  month: string;
  count: number;
  total: number;
}
interface Rule extends Row {
  id: string;
  name: string;
  calcType: 'RATE' | 'FIXED';
  rate?: number | null;
  fixedAmount?: number | null;
}
interface BranchLine extends Row {
  contractNo: string;
  customerName: string;
  base: number;
  ruleName?: string | null;
  commission: number;
}
interface BranchResult {
  orgUnitName: string;
  contractCount: number;
  baseTotal: number;
  commissionTotal: number;
  lines: BranchLine[];
}

export default function Settlement() {
  const { t } = useTranslation();
  const toast = useToast();
  const orgs = useOptions('/org-units', 'name');

  const [recv, setRecv] = useState<Receivable[]>([]);
  const [onlyOut, setOnlyOut] = useState(true);
  const [monthly, setMonthly] = useState<Monthly[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleOpen, setRuleOpen] = useState(false);

  const [orgId, setOrgId] = useState('');
  const [year, setYear] = useState('2026');
  const [month, setMonth] = useState('6');
  const [branch, setBranch] = useState<BranchResult | null>(null);
  const { updatedAt, touch } = useUpdatedAt();

  const fail = useCallback(
    (e: unknown) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') }),
    [toast, t],
  );

  const loadRecv = useCallback(async () => {
    try {
      setRecv(await api<Receivable[]>(`/settlements/receivables?onlyOutstanding=${onlyOut}`));
    } catch (e) {
      fail(e);
    }
  }, [onlyOut, fail]);

  const loadRules = useCallback(async () => {
    try {
      setRules(await api<Rule[]>('/settlements/commission-rules'));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const loadAll = useCallback(async () => {
    try {
      await loadRecv();
      setMonthly(await api<Monthly[]>('/settlements/monthly'));
      await loadRules();
      touch();
    } catch (e) {
      fail(e);
    }
  }, [loadRecv, loadRules, fail]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const createRule = async (values: Record<string, unknown>) => {
    try {
      await api('/settlements/commission-rules', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await loadRules();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const removeRule = async (id: string) => {
    try {
      await api(`/settlements/commission-rules/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('common.deleted') });
      await loadRules();
    } catch (e) {
      fail(e);
    }
  };

  const runBranch = async () => {
    if (!orgId) {
      toast({ type: 'warning', title: t('settlement.pickOrg') });
      return;
    }
    try {
      setBranch(
        await api<BranchResult>(
          `/settlements/branch?orgUnitId=${orgId}&year=${year}&month=${month}`,
        ),
      );
    } catch (e) {
      fail(e);
    }
  };

  const recvCols: Column[] = [
    { title: t('settlement.customer'), dataIndex: 'customerName' },
    { title: t('settlement.contracts'), numeric: true, render: (r) => String(r.contractCount) },
    { title: t('settlement.billed'), numeric: true, render: (r) => won(r.billed) },
    { title: t('settlement.paid'), numeric: true, render: (r) => won(r.paid) },
    {
      title: t('settlement.outstanding'),
      numeric: true,
      render: (r) => <b style={{ color: 'var(--ark-color-text-danger)' }}>{won(r.outstanding)}</b>,
    },
  ];
  const monthlyCols: Column[] = [
    { title: t('settlement.month'), dataIndex: 'month' },
    { title: t('settlement.count'), numeric: true, render: (r) => String(r.count) },
    { title: t('settlement.inflow'), numeric: true, render: (r) => won(r.total) },
  ];
  const ruleCols: Column[] = [
    { title: t('settlement.ruleName'), dataIndex: 'name' },
    {
      title: t('settlement.calcType'),
      render: (r) => <StatusBadge value={String(r.calcType)} map={CALC} />,
    },
    {
      title: t('settlement.value'),
      render: (r) =>
        r.calcType === 'RATE' ? `${(Number(r.rate) * 100).toFixed(2)}%` : `${won(r.fixedAmount)}원`,
    },
    {
      title: '',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => removeRule(r.id as string)}>
          {t('common.delete')}
        </Button>
      ),
    },
  ];
  const branchCols: Column[] = [
    { title: t('settlement.contractNo'), dataIndex: 'contractNo' },
    { title: t('settlement.customer'), dataIndex: 'customerName' },
    { title: t('settlement.base'), numeric: true, render: (r) => won(r.base) },
    { title: t('settlement.rule'), render: (r) => String(r.ruleName ?? '-') },
    { title: t('settlement.commission'), numeric: true, render: (r) => won(r.commission) },
  ];

  const ruleFields: FormField[] = [
    {
      name: 'name',
      label: t('settlement.ruleName'),
      required: true,
      placeholder: '직영점 기본 5%',
    },
    {
      name: 'calcType',
      label: t('settlement.calcType'),
      required: true,
      type: 'select',
      options: [
        { value: 'RATE', label: t('settlement.rate') },
        { value: 'FIXED', label: t('settlement.fixed') },
      ],
    },
    { name: 'rate', label: `${t('settlement.rate')} (0~1)`, type: 'number', placeholder: '0.05' },
    {
      name: 'fixedAmount',
      label: `${t('settlement.fixed')} (원)`,
      type: 'number',
      placeholder: '50000',
    },
    { name: 'orgUnitId', label: t('settlement.org'), type: 'select', options: orgs },
    { name: 'priority', label: t('settlement.priority'), type: 'number', placeholder: '100' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.settlement')} onRefresh={loadAll} updatedAt={updatedAt} />
      <PageCard
        title={t('settlement.receivables')}
        count={recv.length}
        actions={
          <Button variant="outline" size="sm" onClick={() => setOnlyOut((v) => !v)}>
            {onlyOut ? t('settlement.showAll') : t('settlement.onlyOutstanding')}
          </Button>
        }
      >
        <DataTable columns={recvCols} rows={recv} />
      </PageCard>

      <PageCard title={t('settlement.monthlyInflow')} count={monthly.length}>
        <DataTable columns={monthlyCols} rows={monthly} />
      </PageCard>

      <PageCard
        title={t('settlement.commissionRules')}
        count={rules.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setRuleOpen(true)}>
            + {t('settlement.addRule')}
          </Button>
        }
      >
        <DataTable columns={ruleCols} rows={rules} />
      </PageCard>

      <PageCard title={t('settlement.branchSettlement')}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: 12,
          }}
        >
          <div style={{ minWidth: 200 }}>
            <Select
              label={t('settlement.org')}
              value={orgId}
              onValueChange={setOrgId}
              options={orgs}
              placeholder={t('settlement.pickOrg')}
            />
          </div>
          <Input
            label={t('settlement.year')}
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{ width: 100 }}
          />
          <Input
            label={t('settlement.monthLabel')}
            type="number"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ width: 80 }}
          />
          <Button variant="primary" onClick={runBranch}>
            {t('settlement.run')}
          </Button>
        </div>
        {branch && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge variant="subtle">{branch.orgUnitName}</Badge>
              <Badge variant="subtle" color="info">
                {t('settlement.contracts')} {branch.contractCount}
              </Badge>
              <Badge variant="subtle" color="neutral">
                {t('settlement.base')} {won(branch.baseTotal)}
              </Badge>
              <Badge variant="subtle" color="primary">
                {t('settlement.commission')} {won(branch.commissionTotal)}
              </Badge>
            </div>
            <DataTable columns={branchCols} rows={branch.lines} />
          </>
        )}
      </PageCard>

      <FormModal
        open={ruleOpen}
        onOpenChange={setRuleOpen}
        title={t('settlement.addRule')}
        size="md"
        fields={ruleFields}
        onSubmit={createRule}
      />
    </div>
  );
}
