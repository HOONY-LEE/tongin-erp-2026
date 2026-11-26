import i18n from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FileSignature } from 'lucide-react';
import { formatPhone } from '../lib/phone';
import { EmployeeChip } from '../components/ui/EmployeeChip';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  DataTable,
  FilterButton,
  filterRows,
  FormModal,
  Input,
  PageCard,
  PageHeader,
  RecordDetail,
  SegmentedControl,
  Select,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import { thisMonth } from '../lib/workMenus';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const CALC: StatusMap = {
  RATE: { label: i18n.t('misc.rule.RATE'), color: 'info' },
  FIXED: { label: i18n.t('misc.rule.FIXED'), color: 'primary' },
};

interface Receivable extends Row {
  customerId: string;
  customerNo: string | null;
  customerName: string;
  phone: string | null;
  contracts: { id: string; contractNo: string }[];
  owner: { id: string; name: string } | null;
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
  orgUnitId?: string | null;
  serviceLine?: string | null;
  source?: string | null;
  priority?: number | null;
  isActive?: boolean;
  createdAt?: string | null;
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
  const navigate = useNavigate();
  const toast = useToast();
  const orgs = useOptions('/org-units', 'name');

  const [recv, setRecv] = useState<Receivable[]>([]);
  const [onlyOut, setOnlyOut] = useState(true);
  const [monthly, setMonthly] = useState<Monthly[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleOpen, setRuleOpen] = useState(false);
  // 규칙 목록을 처음 받기 전에는 상세가 '찾을 수 없음'으로 보이지 않게
  const [rulesLoading, setRulesLoading] = useState(true);
  /** 수수료 규칙 표 검색 옆 필터 */
  const [ruleFlt, setRuleFlt] = useState<FilterValues>({});
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();

  const [orgId, setOrgId] = useState('');
  // 기본은 이번 달(한국 시간)
  const [year, setYear] = useState(() => thisMonth().year);
  const [month, setMonth] = useState(() => thisMonth().month);
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
    } finally {
      setRulesLoading(false);
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
    if (!window.confirm(t('misc.ruleDeleteQ'))) return;
    try {
      await api(`/settlements/commission-rules/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('common.deleted') });
      closeDetail();
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

  // 표가 왼쪽에 몰리지 않게 칸마다 너비를 주고, 고객 ID·전화·계약서·담당자를 함께 보인다
  const recvCols: Column[] = [
    {
      title: t('settlement.customerNo'),
      dataIndex: 'customerNo',
      width: 130,
      render: (r) => <span className="id-mono">{r.customerNo ? String(r.customerNo) : '-'}</span>,
    },
    { title: t('settlement.customer'), dataIndex: 'customerName', width: 120 },
    {
      title: t('settlement.phone'),
      dataIndex: 'phone',
      width: 140,
      render: (r) => (r.phone ? formatPhone(String(r.phone)) : '-'),
    },
    {
      title: t('settlement.contractDocs'),
      minWidth: 200,
      flex: 1,
      exportValue: (r) => (r as Receivable).contracts.map((c) => c.contractNo).join(', ') || null,
      // 최근 계약서 바로 가기 — 여러 건이면 '외 n건'
      render: (r) => {
        const list = (r as Receivable).contracts;
        if (!list.length) return '-';
        const [first, ...rest] = list;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <button
              type="button"
              title={t('pay.openContract')}
              onClick={() => navigate(`/contracts/${first.id}`)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: 0,
                border: 0,
                background: 'none',
                color: 'var(--ark-color-info-600, #2563eb)',
                cursor: 'pointer',
                font: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <FileSignature size={14} aria-hidden />
              <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>
                {first.contractNo}
              </span>
            </button>
            {rest.length > 0 && (
              <span style={{ color: 'var(--ark-color-text-secondary)', whiteSpace: 'nowrap' }}>
                {t('settlement.moreN', { v0: rest.length })}
              </span>
            )}
          </span>
        );
      },
    },
    {
      title: t('settlement.owner'),
      width: 120,
      exportValue: (r) => (r as Receivable).owner?.name ?? null,
      render: (r) => {
        const o = (r as Receivable).owner;
        return o ? <EmployeeChip emp={o} /> : '-';
      },
    },
    {
      title: t('settlement.contracts'),
      numeric: true,
      width: 80,
      render: (r) => String(r.contractCount),
    },
    { title: t('settlement.billed'), numeric: true, width: 130, render: (r) => won(r.billed) },
    { title: t('settlement.paid'), numeric: true, width: 130, render: (r) => won(r.paid) },
    {
      title: t('settlement.outstanding'),
      numeric: true,
      width: 130,
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
        r.calcType === 'RATE'
          ? `${(Number(r.rate) * 100).toFixed(2)}%`
          : t('misc.won', { v0: won(r.fixedAmount) }),
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
      placeholder: t('misc.ruleNamePh'),
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
      label: t('misc.wonParen', { v0: t('settlement.fixed') }),
      type: 'number',
      placeholder: '50000',
    },
    { name: 'orgUnitId', label: t('settlement.org'), type: 'select', options: orgs },
    { name: 'priority', label: t('settlement.priority'), type: 'number', placeholder: '100' },
  ];

  // 수수료 규칙 상세 — 행 끝에 두던 삭제 버튼을 머리글로 옮겼다
  if (detailId) {
    const d = rules.find((r) => r.id === detailId);
    return (
      <RecordDetail
        loading={!d && rulesLoading}
        title={d ? d.name : t('misc.notFound')}
        backLabel={t('settlement.commissionRules')}
        onBack={closeDetail}
        actions={
          d ? (
            <Button variant="ghost" size="sm" onClick={() => removeRule(d.id)}>
              {t('common.delete')}
            </Button>
          ) : undefined
        }
        sections={
          d
            ? [
                {
                  title: t('settlement.commissionRules'),
                  items: [
                    { label: t('settlement.ruleName'), value: d.name },
                    {
                      label: t('settlement.calcType'),
                      value: <StatusBadge value={d.calcType} map={CALC} />,
                    },
                    {
                      label: t('settlement.value'),
                      value:
                        d.calcType === 'RATE'
                          ? `${(Number(d.rate) * 100).toFixed(2)}%`
                          : t('misc.won', { v0: won(d.fixedAmount) }),
                    },
                    { label: t('settlement.priority'), value: d.priority ?? null },
                    {
                      label: t('settlement.org'),
                      value: d.orgUnitId
                        ? (orgs.find((o) => o.value === d.orgUnitId)?.label ?? d.orgUnitId)
                        : t('misc.all'),
                    },
                    { label: t('misc.serviceLine'), value: d.serviceLine ?? t('misc.all') },
                    { label: t('misc.source'), value: d.source ?? t('misc.all') },
                    {
                      label: t('misc.on'),
                      value: (
                        <Badge
                          variant="subtle"
                          color={d.isActive === false ? 'neutral' : 'success'}
                        >
                          {d.isActive === false ? t('misc.unused') : t('misc.on')}
                        </Badge>
                      ),
                    },
                    { label: t('misc.registeredAt'), value: d.createdAt?.slice(0, 10) },
                  ],
                },
              ]
            : []
        }
      />
    );
  }

  const ruleFilterFields: FilterField[] = [
    {
      key: 'calcType',
      label: t('settlement.flt.calcType'),
      type: 'multi',
      options: Object.entries(CALC).map(([value, v]) => ({ value, label: v.label })),
    },
    ...(orgs.length > 1
      ? [
          {
            key: 'orgUnitId',
            label: t('settlement.flt.branch'),
            type: 'multi',
            options: orgs,
          } as FilterField,
        ]
      : []),
    {
      key: 'active',
      label: t('settlement.flt.active'),
      type: 'single',
      options: [
        { value: 'on', label: t('settlement.flt.on') },
        { value: 'off', label: t('settlement.flt.off') },
      ],
    },
  ];
  const shownRules = filterRows(rules, ruleFilterFields, ruleFlt, (r, key) =>
    key === 'active' ? (r.isActive === false ? 'off' : 'on') : r[key],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.settlement')} onRefresh={loadAll} updatedAt={updatedAt} />
      {/* 고객별 미수금 — 페이지 첫 표라 따로 제목 없이, 검색 줄 오른쪽에서 미수금만/전체를 고른다 */}
      <DataTable
        columns={recvCols}
        rows={recv}
        rowKey="customerId"
        viewSwitch={
          <SegmentedControl
            value={onlyOut ? 'out' : 'all'}
            onChange={(v) => setOnlyOut(v === 'out')}
            options={[
              { value: 'out', label: t('settlement.onlyOutstanding') },
              { value: 'all', label: t('settlement.showAll').replace(t('misc.viewSuffix'), '') },
            ]}
          />
        }
      />

      <PageCard title={t('settlement.monthlyInflow')} count={monthly.length} plain>
        <DataTable columns={monthlyCols} rows={monthly} rowKey="month" />
      </PageCard>

      <PageCard
        title={t('settlement.commissionRules')}
        count={shownRules.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setRuleOpen(true)}>
            + {t('settlement.addRule')}
          </Button>
        }
        plain
      >
        <DataTable
          columns={ruleCols}
          rows={shownRules}
          onRowClick={(r) => openDetail(String(r.id))}
          filters={<FilterButton fields={ruleFilterFields} value={ruleFlt} onChange={setRuleFlt} />}
        />
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
              label={`${t('settlement.org')} *`}
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
          <Button variant="primary" onClick={runBranch} disabled={!orgId}>
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
            <DataTable columns={branchCols} rows={branch.lines} rowKey="contractId" />
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
