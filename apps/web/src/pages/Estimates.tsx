import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import {
  Button,
  DataTable,
  FormModal,
  PageCard,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';

const STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  QUOTED: { label: '견적완료', color: 'success' },
};

export default function Estimates() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const leads = useOptions('/leads', 'leadNo');
  const customers = useOptions('/customers', 'name');
  const orgs = useOptions('/org-units', 'name');
  const products = useOptions('/products', 'name');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/estimates'));
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
    { name: 'leadId', label: '리드', required: true, type: 'select', options: leads },
    { name: 'customerId', label: '고객', required: true, type: 'select', options: customers },
    { name: 'orgUnitId', label: '담당 지점', required: true, type: 'select', options: orgs },
    { name: 'productId', label: '상품', required: true, type: 'select', options: products },
  ];

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      const created = await api<{ id: string }>('/estimates', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      navigate(`/estimates/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const columns: Column[] = [
    { title: '견적번호', dataIndex: 'estimateNo' },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS} /> },
    { title: t('estimate.totalCbm'), numeric: true, render: (r) => String(r.totalCbm) },
    {
      title: '총액',
      numeric: true,
      render: (r) => (r.totalAmount != null ? Number(r.totalAmount).toLocaleString() : '-'),
    },
    {
      title: '',
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/estimates/${r.id as string}`)}
        >
          {t('estimate.detail')}
        </Button>
      ),
    },
  ];

  return (
    <PageCard
      title={t('nav.estimates')}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          + {t('estimate.create')}
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} loading={loading} />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t('estimate.create')}
        fields={fields}
        onSubmit={onCreate}
      />
    </PageCard>
  );
}
