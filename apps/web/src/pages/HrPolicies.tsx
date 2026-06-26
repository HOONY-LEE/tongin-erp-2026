import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  Input,
  PageCard,
  Select,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const KIND: StatusMap = {
  INCENTIVE: { label: '수당(+)', color: 'success' },
  PENALTY: { label: '패널티(−)', color: 'error' },
};
const TARGET: Record<string, string> = { EMPLOYEE: '견적사원', BRANCH: '지점' };
const METRIC: Record<string, string> = {
  CONTRACT_REVENUE: '계약매출',
  CONTRACT_COUNT: '계약건수',
  PAID_REVENUE: '입금매출',
  DONE_COUNT: '완료작업수',
  AS_COUNT: 'AS접수수',
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
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const orgs = useOptions('/org-units', 'name');

  const [targetType, setTargetType] = useState('EMPLOYEE');
  const [year, setYear] = useState('2026');
  const [month, setMonth] = useState('6');
  const [result, setResult] = useState<PayoutTarget[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/hr/policies'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '조회 실패' });
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
      toast({ type: 'success', title: '등록되었습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장 실패' });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '계산 실패' });
    }
  };

  const fields: FormField[] = [
    { name: 'name', label: '정책명', required: true, placeholder: '견적사원 입금매출 수당' },
    {
      name: 'kind',
      label: '구분',
      type: 'select',
      options: [
        { value: 'INCENTIVE', label: '수당(+)' },
        { value: 'PENALTY', label: '패널티(−)' },
      ],
    },
    {
      name: 'targetType',
      label: '대상',
      required: true,
      type: 'select',
      options: [
        { value: 'EMPLOYEE', label: '견적사원' },
        { value: 'BRANCH', label: '지점' },
      ],
    },
    {
      name: 'metric',
      label: '실적 지표',
      required: true,
      type: 'select',
      options: Object.entries(METRIC).map(([value, label]) => ({ value, label })),
    },
    {
      name: 'calcType',
      label: '계산방식',
      required: true,
      type: 'select',
      options: [
        { value: 'RATE', label: '정률(매출×비율)' },
        { value: 'FIXED_PER_UNIT', label: '단위당 정액(건수×금액)' },
      ],
    },
    { name: 'value', label: '값 (정률=0.015 / 정액=30000)', required: true, type: 'number' },
    { name: 'orgScopeId', label: '적용 지점(선택)', type: 'select', options: orgs },
    { name: 'priority', label: '우선순위', type: 'number', placeholder: '100' },
  ];

  const policyCols: Column[] = [
    { title: '정책명', dataIndex: 'name' },
    { title: '구분', render: (r) => <StatusBadge value={String(r.kind)} map={KIND} /> },
    { title: '대상', render: (r) => TARGET[r.targetType as string] ?? String(r.targetType) },
    { title: '지표', render: (r) => METRIC[r.metric as string] ?? String(r.metric) },
    {
      title: '값',
      render: (r) =>
        r.calcType === 'RATE' ? `${(Number(r.value) * 100).toFixed(2)}%` : `${won(r.value)}원/건`,
    },
    { title: '사용', render: (r) => (r.isActive ? '✓' : '–') },
  ];

  const resultCols: Column[] = [
    { title: '대상', dataIndex: 'targetName' },
    {
      title: '산출 내역',
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(r.lines as PayoutLine[]).map((l, i) => (
            <span key={i} style={{ fontSize: 12, color: 'var(--ark-color-text-secondary)' }}>
              {l.policyName}: {METRIC[l.metric]}{' '}
              {AMOUNT_METRIC.includes(l.metric) ? won(l.base) : `${l.base}건`} →{' '}
              <b style={{ color: l.amount < 0 ? 'var(--ark-color-error-600)' : 'inherit' }}>
                {won(l.amount)}
              </b>
            </span>
          ))}
        </div>
      ),
    },
    { title: '수당', numeric: true, render: (r) => won(r.incentive) },
    { title: '패널티', numeric: true, render: (r) => won(r.penalty) },
    {
      title: '순지급',
      numeric: true,
      render: (r) => <b>{won(r.net)}</b>,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageCard
        title="인센티브/패널티 정책"
        count={rows.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            + 정책 등록
          </Button>
        }
      >
        <DataTable columns={policyCols} rows={rows} loading={loading} />
        <FormModal
          open={open}
          onOpenChange={setOpen}
          title="정책 등록"
          size="md"
          fields={fields}
          onSubmit={onCreate}
        />
      </PageCard>

      <PageCard title="정산 계산 (월별 실적 적용)">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 160 }}>
            <Select
              label="대상유형"
              value={targetType}
              onValueChange={setTargetType}
              options={[
                { value: 'EMPLOYEE', label: '견적사원' },
                { value: 'BRANCH', label: '지점' },
              ]}
            />
          </div>
          <Input
            label="연도"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <Input
            label="월"
            type="number"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Button variant="primary" onClick={run}>
            계산
          </Button>
        </div>
        {result && (
          <div style={{ marginTop: 16 }}>
            {result.length === 0 ? (
              <Badge variant="subtle" color="neutral">
                해당 기간 적용 실적이 없습니다
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
