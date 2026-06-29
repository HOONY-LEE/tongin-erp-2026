import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import {
  Badge,
  Button,
  DataTable,
  PageCard,
  StatusBadge,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const STATUS: StatusMap = {
  AWAITING: { label: '입금전(미계약)', color: 'warning' },
  DEPOSIT_PAID: { label: '계약금 입금완료', color: 'info' },
  COMPLETED: { label: '완료(잔금까지)', color: 'success' },
};

interface PayRow extends Row {
  estimateId: string;
  estimateNo: string;
  contractNo: string | null;
  customerName: string;
  totalAmount: number | null;
  depositAmount: number | null;
  balanceAmount: number | null;
  depositPaid: boolean;
  balancePaid: boolean;
  status: string;
}

export default function PaymentConfirm() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<PayRow[]>('/payment-confirmations'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (r: Row, kind: 'deposit' | 'balance') => {
    try {
      await api(`/payment-confirmations/${String(r.estimateId)}/${kind}`, { method: 'POST' });
      toast({ type: 'success', title: '입금이 확인되었습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const columns: Column[] = [
    { title: '고객', dataIndex: 'customerName' },
    {
      title: '견적/계약',
      render: (r) => (
        <span>
          {String(r.estimateNo)}
          {r.contractNo ? ` · ${String(r.contractNo)}` : ''}
        </span>
      ),
    },
    { title: '총액', numeric: true, render: (r) => won(r.totalAmount) },
    {
      title: '계약금(10%)',
      numeric: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {won(r.depositAmount)}
          {Boolean(r.depositPaid) && (
            <Badge variant="subtle" color="success">
              완료
            </Badge>
          )}
        </span>
      ),
    },
    {
      title: '잔금',
      numeric: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {won(r.balanceAmount)}
          {Boolean(r.balancePaid) && (
            <Badge variant="subtle" color="success">
              완료
            </Badge>
          )}
        </span>
      ),
    },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS} /> },
    {
      title: '입금확인',
      render: (r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          {!r.depositPaid && (
            <Button variant="primary" size="sm" onClick={() => confirm(r, 'deposit')}>
              계약금 확인
            </Button>
          )}
          {Boolean(r.depositPaid) && !r.balancePaid && (
            <Button variant="outline" size="sm" onClick={() => confirm(r, 'balance')}>
              잔금 확인
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageCard title={t('nav.paymentsConfirm')} count={rows.length}>
      <div style={{ marginBottom: 12 }}>
        <Badge variant="subtle" color="info">
          견적서 전달 후 계약금(10%) 입금 시 계약 성립 · 잔금 입금 시 완료 (토스페이먼츠 연동 예정)
        </Badge>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} />
    </PageCard>
  );
}
