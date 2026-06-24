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

export const WORK_STATUS: StatusMap = {
  ASSIGNED: { label: '배정', color: 'neutral' },
  IN_PROGRESS: { label: '작업중', color: 'info' },
  DONE: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

export default function WorkOrders() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const contracts = useOptions('/contracts', 'contractNo');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/work-orders'));
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
    {
      name: 'contractId',
      label: '계약(서명완료)',
      required: true,
      type: 'select',
      options: contracts,
    },
    { name: 'scheduledDate', label: t('work.scheduled'), placeholder: 'YYYY-MM-DD' },
  ];

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      const created = await api<{ id: string }>('/work-orders', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      navigate(`/work-orders/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const columns: Column[] = [
    { title: '작업번호', dataIndex: 'workNo' },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={WORK_STATUS} /> },
    { title: t('work.scheduled'), render: (r) => String(r.scheduledDate ?? '-').slice(0, 10) },
    {
      title: '',
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/work-orders/${r.id as string}`)}
        >
          {t('work.detail')}
        </Button>
      ),
    },
  ];

  return (
    <PageCard
      title={t('nav.workOrders')}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          + {t('work.create')}
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} loading={loading} />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t('work.create')}
        fields={fields}
        onSubmit={onCreate}
      />
    </PageCard>
  );
}
