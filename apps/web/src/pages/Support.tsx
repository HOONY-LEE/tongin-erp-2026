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

const KIND: StatusMap = {
  CS: { label: 'CS상담', color: 'info' },
  AS: { label: 'AS하자', color: 'primary' },
};
const STATUS: StatusMap = {
  RECEIVED: { label: '접수', color: 'warning' },
  IN_PROGRESS: { label: '처리중', color: 'info' },
  RESOLVED: { label: '해결', color: 'success' },
  CLOSED: { label: '종료', color: 'neutral' },
  CANCELED: { label: '취소', color: 'error' },
};
const PRIORITY: StatusMap = {
  LOW: { label: '낮음', color: 'neutral' },
  NORMAL: { label: '보통', color: 'info' },
  HIGH: { label: '높음', color: 'error' },
};

interface Ticket extends Row {
  id: string;
  ticketNo: string;
  kind: string;
  subject: string;
  customerId?: string | null;
  priority: string;
  status: string;
}

// 상태별 다음 액션 (간단 워크플로우)
const NEXT: Record<string, { to: string; labelKey: string }[]> = {
  RECEIVED: [{ to: 'IN_PROGRESS', labelKey: 'support.start' }],
  IN_PROGRESS: [{ to: 'RESOLVED', labelKey: 'support.resolve' }],
  RESOLVED: [{ to: 'CLOSED', labelKey: 'support.close' }],
};

export default function Support() {
  const { t } = useTranslation();
  const toast = useToast();
  const customers = useOptions('/customers', 'name');
  const orgs = useOptions('/org-units', 'name');

  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const customerName = useMemo(
    () => new Map(customers.map((o) => [o.value, o.label])),
    [customers],
  );

  const fail = useCallback(
    (e: unknown) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') }),
    [toast, t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Ticket[]>('/support-tickets'));
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
      await api('/support-tickets', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const transition = async (id: string, to: string) => {
    try {
      await api(`/support-tickets/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      fail(e);
    }
  };

  const columns: Column[] = [
    { title: t('support.ticketNo'), dataIndex: 'ticketNo' },
    { title: t('support.kind'), render: (r) => <StatusBadge value={String(r.kind)} map={KIND} /> },
    { title: t('support.subject'), dataIndex: 'subject' },
    { title: t('support.customer'), render: (r) => customerName.get(String(r.customerId)) ?? '-' },
    {
      title: t('support.priority'),
      render: (r) => <StatusBadge value={String(r.priority)} map={PRIORITY} />,
    },
    {
      title: t('support.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS} />,
    },
    {
      title: '',
      render: (r) => {
        const ti = r as Ticket;
        const nexts = NEXT[ti.status] ?? [];
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            {nexts.map((n) => (
              <Button
                key={n.to}
                variant="outline"
                size="sm"
                onClick={() => transition(ti.id, n.to)}
              >
                {t(n.labelKey)}
              </Button>
            ))}
            {ti.status !== 'CLOSED' && ti.status !== 'CANCELED' && (
              <Button variant="ghost" size="sm" onClick={() => transition(ti.id, 'CANCELED')}>
                {t('support.cancel')}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const fields: FormField[] = [
    {
      name: 'kind',
      label: t('support.kind'),
      required: true,
      type: 'select',
      options: [
        { value: 'CS', label: t('support.cs') },
        { value: 'AS', label: t('support.as') },
      ],
    },
    { name: 'orgUnitId', label: t('support.org'), required: true, type: 'select', options: orgs },
    { name: 'subject', label: t('support.subject'), required: true, placeholder: '제목' },
    { name: 'customerId', label: t('support.customer'), type: 'select', options: customers },
    {
      name: 'channel',
      label: t('support.channel'),
      type: 'select',
      options: [
        { value: 'PHONE', label: t('support.phone') },
        { value: 'EMAIL', label: 'Email' },
        { value: 'KAKAO', label: '카카오' },
        { value: 'VISIT', label: t('support.visit') },
      ],
    },
    {
      name: 'priority',
      label: t('support.priority'),
      type: 'select',
      options: [
        { value: 'LOW', label: t('support.low') },
        { value: 'NORMAL', label: t('support.normal') },
        { value: 'HIGH', label: t('support.high') },
      ],
    },
    { name: 'content', label: t('support.content') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('nav.support')}
        onRefresh={load}
        updatedAt={updatedAt}
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            + {t('support.register')}
          </Button>
        }
      />
      <PageCard title="목록" count={rows.length}>
        <DataTable columns={columns} rows={rows} loading={loading} />
      </PageCard>

      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t('support.register')}
        size="md"
        fields={fields}
        onSubmit={onCreate}
      />
    </div>
  );
}
