import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  PageCard,
  PageHeader,
  Spinner,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import { CONTRACT_STATUS } from './Contracts';

const PAY_STATUS: StatusMap = {
  PENDING: { label: '대기', color: 'warning' },
  PAID: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};
const KIND: Record<string, string> = { DEPOSIT: '계약금', BALANCE: '잔금' };
const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

interface Payment {
  id: string;
  kind: string;
  amount: string | number;
  status: string;
  virtualAccount?: string | null;
}
interface Contract {
  id: string;
  contractNo: string;
  status: string;
  totalAmount: string | number;
  depositAmount: string | number;
  balanceAmount: string | number;
  payments: Payment[];
}

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [woOpen, setWoOpen] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Contract>(`/contracts/${id}`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [id, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      toast({ type: 'success', title: okMsg });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const sign = () =>
    act(() => api(`/contracts/${id}/sign`, { method: 'POST' }), t('contract.sign'));
  const requestPay = (kind: 'DEPOSIT' | 'BALANCE') =>
    act(
      () => api(`/contracts/${id}/payments`, { method: 'POST', body: JSON.stringify({ kind }) }),
      t('common.created'),
    );
  const confirmPay = (pid: string) =>
    act(() => api(`/payments/${pid}/confirm`, { method: 'POST' }), t('contract.confirm'));

  const createWorkOrder = async (values: Record<string, unknown>) => {
    try {
      const created = await api<{ id: string }>('/work-orders', {
        method: 'POST',
        body: JSON.stringify({ contractId: id, ...values }),
      });
      toast({ type: 'success', title: t('common.created') });
      navigate(`/work-orders/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const payColumns: Column[] = [
    { title: '구분', render: (r) => KIND[r.kind as string] ?? String(r.kind) },
    { title: '금액', numeric: true, render: (r) => won(r.amount) },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={PAY_STATUS} /> },
    { title: '가상계좌', render: (r) => String(r.virtualAccount ?? '-') },
    {
      title: '',
      render: (r) =>
        r.status === 'PENDING' ? (
          <Button variant="primary" size="sm" onClick={() => confirmPay(r.id as string)}>
            {t('contract.confirm')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={data.contractNo}
        breadcrumbs={[{ label: t('contract.back'), onClick: () => navigate('/contracts') }]}
        onRefresh={load}
        updatedAt={updatedAt}
        tags={
          <>
            <StatusBadge value={data.status} map={CONTRACT_STATUS} />
            <Badge variant="subtle">
              {t('contract.total')} {won(data.totalAmount)}
            </Badge>
            <Badge variant="subtle" color="info">
              {t('contract.deposit')} {won(data.depositAmount)}
            </Badge>
            <Badge variant="subtle" color="neutral">
              {t('contract.balance')} {won(data.balanceAmount)}
            </Badge>
          </>
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" disabled={data.status !== 'DRAFT'} onClick={sign}>
              {t('contract.sign')}
            </Button>
            {data.status === 'SIGNED' && (
              <Button variant="primary" size="sm" onClick={() => setWoOpen(true)}>
                {t('contract.toWorkOrder')}
              </Button>
            )}
          </div>
        }
      />

      <PageCard
        title={t('contract.payments')}
        count={data.payments.length}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => requestPay('DEPOSIT')}>
              + {t('contract.requestDeposit')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => requestPay('BALANCE')}>
              + {t('contract.requestBalance')}
            </Button>
          </div>
        }
      >
        <DataTable columns={payColumns} rows={data.payments as unknown as Row[]} />
      </PageCard>

      <FormModal
        open={woOpen}
        onOpenChange={setWoOpen}
        title={t('contract.toWorkOrder')}
        fields={
          [
            { name: 'scheduledDate', label: t('work.scheduled'), placeholder: 'YYYY-MM-DD' },
          ] as FormField[]
        }
        onSubmit={createWorkOrder}
      />
    </div>
  );
}
