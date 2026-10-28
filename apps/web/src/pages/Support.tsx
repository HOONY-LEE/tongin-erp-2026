import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

  if (detailId) {
    const d = rows.find((r) => r.id === detailId);
    const channelOpts = fields.find((f) => f.name === 'channel')?.options ?? [];
    const orgName = (id?: string | null) => orgs.find((o) => o.value === id)?.label;
    return (
      <RecordDetail
        loading={!d && loading}
        title={d ? `${d.ticketNo} ${d.subject}` : '찾을 수 없습니다'}
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
                  {t(n.labelKey)}
                </Button>
              ))}
            </>
          ) : undefined
        }
        sections={
          d
            ? [
                {
                  title: '접수 정보',
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
                    { label: '접수일', value: d.createdAt?.slice(0, 10) },
                  ],
                },
                {
                  title: '내용',
                  items: [
                    { label: t('support.subject'), value: d.subject, wide: true },
                    { label: t('support.content'), value: d.content, wide: true },
                    { label: '처리 결과', value: d.resolution, wide: true },
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
