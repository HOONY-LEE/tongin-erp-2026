import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tDyn } from '../i18n';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  DataTable,
  FormModal,
  PageHeader,
  RecordDetail,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';

const KIND: StatusMap = {
  CS: { label: i18n.t('misc.sup.CS'), color: 'info' },
  AS: { label: i18n.t('misc.sup.AS'), color: 'primary' },
};
const STATUS: StatusMap = {
  RECEIVED: { label: i18n.t('misc.st.received'), color: 'warning' },
  IN_PROGRESS: { label: i18n.t('misc.st.inProgress'), color: 'info' },
  RESOLVED: { label: i18n.t('misc.st.resolved'), color: 'success' },
  CLOSED: { label: i18n.t('misc.st.closed'), color: 'neutral' },
  CANCELED: { label: i18n.t('misc.st.canceled'), color: 'error' },
};
const PRIORITY: StatusMap = {
  LOW: { label: i18n.t('misc.pri.low'), color: 'neutral' },
  NORMAL: { label: i18n.t('misc.pri.normal'), color: 'info' },
  HIGH: { label: i18n.t('misc.pri.high'), color: 'error' },
};

interface Ticket extends Row {
  id: string;
  ticketNo: string;
  kind: string;
  subject: string;
  customerId?: string | null;
  priority: string;
  status: string;
  orgUnitId?: string | null;
  channel?: string | null;
  content?: string | null;
  resolution?: string | null;
  createdAt?: string | null;
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
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();

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
    { name: 'subject', label: t('support.subject'), required: true, placeholder: t('misc.title') },
    { name: 'customerId', label: t('support.customer'), type: 'select', options: customers },
    {
      name: 'channel',
      label: t('support.channel'),
      type: 'select',
      options: [
        { value: 'PHONE', label: t('support.phone') },
        { value: 'EMAIL', label: t('misc.email') },
        { value: 'KAKAO', label: t('misc.kakao') },
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

  if (detailId) {
    const d = rows.find((r) => r.id === detailId);
    const channelOpts = fields.find((f) => f.name === 'channel')?.options ?? [];
    const orgName = (id?: string | null) => orgs.find((o) => o.value === id)?.label;
    return (
      <RecordDetail
        loading={!d && loading}
        title={d ? `${d.ticketNo} ${d.subject}` : t('misc.notFound')}
        backLabel={t('nav.support')}
        onBack={closeDetail}
        actions={
          d ? (
            // 행 끝에 두던 처리 단계 버튼 — 상세 머리글로 옮겼다
            <>
              {d.status !== 'CLOSED' && d.status !== 'CANCELED' && (
                <Button variant="ghost" size="sm" onClick={() => transition(d.id, 'CANCELED')}>
                  {t('support.cancel')}
                </Button>
              )}
              {(NEXT[d.status] ?? []).map((n) => (
                <Button
                  key={n.to}
                  variant="primary"
                  size="sm"
                  onClick={() => transition(d.id, n.to)}
                >
                  {tDyn(n.labelKey)}
                </Button>
              ))}
            </>
          ) : undefined
        }
        sections={
          d
            ? [
                {
                  title: t('misc.ticketInfo'),
                  items: [
                    { label: t('support.ticketNo'), value: d.ticketNo },
                    { label: t('support.kind'), value: <StatusBadge value={d.kind} map={KIND} /> },
                    {
                      label: t('support.status'),
                      value: <StatusBadge value={d.status} map={STATUS} />,
                    },
                    {
                      label: t('support.priority'),
                      value: <StatusBadge value={d.priority} map={PRIORITY} />,
                    },
                    { label: t('support.customer'), value: customerName.get(String(d.customerId)) },
                    { label: t('support.org'), value: orgName(d.orgUnitId) },
                    {
                      label: t('support.channel'),
                      value: channelOpts.find((o) => o.value === d.channel)?.label ?? d.channel,
                    },
                    { label: t('misc.receivedAt'), value: d.createdAt?.slice(0, 10) },
                  ],
                },
                {
                  title: t('misc.content'),
                  items: [
                    { label: t('support.subject'), value: d.subject, wide: true },
                    { label: t('support.content'), value: d.content, wide: true },
                    { label: t('misc.resolution'), value: d.resolution, wide: true },
                  ],
                },
              ]
            : []
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.support')} onRefresh={load} updatedAt={updatedAt} />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => openDetail(String(r.id))}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            + {t('support.register')}
          </Button>
        }
      />

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
