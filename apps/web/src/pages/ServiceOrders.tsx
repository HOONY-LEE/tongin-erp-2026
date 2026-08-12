import { useCallback, useEffect, useMemo, useState } from 'react';
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

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const SVC_LINE: StatusMap = {
  LIVING: { label: '리빙', color: 'info' },
  CARE: { label: '케어', color: 'primary' },
};
const SVC_STATUS: StatusMap = {
  REQUESTED: { label: '요청', color: 'warning' },
  SCHEDULED: { label: '일정확정', color: 'info' },
  DONE: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

interface ServiceOrder extends Row {
  id: string;
  orderNo: string;
  serviceLine: string;
  productId?: string | null;
  customerId?: string | null;
  scheduledDate?: string | null;
  amount?: string | number | null;
  status: string;
}

export default function ServiceOrders() {
  const { t } = useTranslation();
  const toast = useToast();
  const products = useOptions('/products', 'name');
  const customers = useOptions('/customers', 'name');
  const orgs = useOptions('/org-units', 'name');

  const [rows, setRows] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const nameOf = useMemo(() => {
    const p = new Map(products.map((o) => [o.value, o.label]));
    const c = new Map(customers.map((o) => [o.value, o.label]));
    return { product: p, customer: c };
  }, [products, customers]);

  const fail = useCallback(
    (e: unknown) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') }),
    [toast, t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<ServiceOrder[]>('/service-orders'));
      touch();
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [fail]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api('/service-orders', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const transition = async (id: string, to: string, msg: string) => {
    try {
      await api(`/service-orders/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      toast({ type: 'success', title: msg });
      await load();
    } catch (e) {
      fail(e);
    }
  };

  const columns: Column[] = [
    { title: t('service.orderNo'), dataIndex: 'orderNo' },
    {
      title: t('service.line'),
      render: (r) => <StatusBadge value={String(r.serviceLine)} map={SVC_LINE} />,
    },
    { title: t('service.product'), render: (r) => nameOf.product.get(String(r.productId)) ?? '-' },
    {
      title: t('service.customer'),
      render: (r) => nameOf.customer.get(String(r.customerId)) ?? '-',
    },
    { title: t('service.scheduled'), render: (r) => String(r.scheduledDate ?? '-').slice(0, 10) },
    { title: t('service.amount'), numeric: true, render: (r) => won(r.amount) },
    {
      title: t('service.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={SVC_STATUS} />,
    },
    {
      title: '',
      render: (r) => {
        const o = r as ServiceOrder;
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            {o.status === 'REQUESTED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => transition(o.id, 'SCHEDULED', t('service.scheduledMsg'))}
              >
                {t('service.schedule')}
              </Button>
            )}
            {o.status === 'SCHEDULED' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => transition(o.id, 'DONE', t('service.doneMsg'))}
              >
                {t('service.complete')}
              </Button>
            )}
            {o.status !== 'DONE' && o.status !== 'CANCELED' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => transition(o.id, 'CANCELED', t('service.canceledMsg'))}
              >
                {t('service.cancel')}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const fields: FormField[] = [
    {
      name: 'serviceLine',
      label: t('service.line'),
      required: true,
      type: 'select',
      options: [
        { value: 'LIVING', label: t('service.living') },
        { value: 'CARE', label: t('service.care') },
      ],
    },
    { name: 'orgUnitId', label: t('service.org'), required: true, type: 'select', options: orgs },
    { name: 'productId', label: t('service.product'), type: 'select', options: products },
    { name: 'customerId', label: t('service.customer'), type: 'select', options: customers },
    { name: 'scheduledDate', label: t('service.scheduled'), placeholder: 'YYYY-MM-DD' },
    { name: 'address', label: t('service.address') },
    { name: 'amount', label: t('service.amount'), type: 'number', placeholder: '150000' },
    { name: 'note', label: t('service.note') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('nav.serviceOrders')}
        onRefresh={load}
        updatedAt={updatedAt}
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            + {t('service.register')}
          </Button>
        }
      />
      <PageCard title="목록" count={rows.length}>
        <DataTable columns={columns} rows={rows} loading={loading} />
      </PageCard>

      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t('service.register')}
        size="md"
        fields={fields}
        onSubmit={onCreate}
      />
    </div>
  );
}
