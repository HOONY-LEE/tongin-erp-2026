import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  DataTable,
  FormModal,
  PageCard,
  PageHeader,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';

export const CONTRACT_STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  SIGNED: { label: '서명완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

export default function Contracts() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const estimates = useOptions('/estimates', 'estimateNo');
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/contracts'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const fields: FormField[] = [
    { name: 'estimateId', label: '견적', required: true, type: 'select', options: estimates },
    { name: 'totalAmount', label: '총 계약금액', required: true, type: 'number' },
    { name: 'depositRatio', label: '계약금 비율(예: 0.1)', type: 'number', placeholder: '0.1' },
  ];

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      const created = await api<{ id: string }>('/contracts', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      navigate(`/contracts/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const columns: Column[] = [
    { title: '계약번호', dataIndex: 'contractNo' },
    {
      title: '상태',
      render: (r) => <StatusBadge value={String(r.status)} map={CONTRACT_STATUS} />,
    },
    { title: t('contract.total'), numeric: true, render: (r) => won(r.totalAmount) },
    { title: t('contract.deposit'), numeric: true, render: (r) => won(r.depositAmount) },
    { title: t('contract.balance'), numeric: true, render: (r) => won(r.balanceAmount) },
    {
      title: '',
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/contracts/${r.id as string}`)}
        >
          {t('contract.detail')}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('nav.contracts')}
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            + {t('contract.create')}
          </Button>
        }
        onRefresh={load}
        updatedAt={updatedAt}
      />
      <PageCard title="목록" count={rows.length}>
        <DataTable columns={columns} rows={rows} loading={loading} />
      </PageCard>
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t('contract.create')}
        fields={fields}
        onSubmit={onCreate}
      />
    </div>
  );
}
