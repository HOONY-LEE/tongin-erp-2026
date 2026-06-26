import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
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
  SENT: { label: '발송완료', color: 'success' },
};
const CHANNEL: Record<string, string> = { SMS: '문자(SMS)', ALIMTALK: '알림톡' };

export default function Campaigns() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/campaigns'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api('/campaigns', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const send = async (r: Row) => {
    try {
      const sent = await api<{ recipientCount: number }>(`/campaigns/${r.id as string}/send`, {
        method: 'POST',
      });
      toast({ type: 'success', title: `${t('campaign.sentMsg')} (${sent.recipientCount})` });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const fields: FormField[] = [
    { name: 'name', label: t('campaign.name'), required: true, placeholder: '6월 이사고객 안내' },
    {
      name: 'channel',
      label: t('campaign.channel'),
      type: 'select',
      options: [
        { value: 'SMS', label: CHANNEL.SMS },
        { value: 'ALIMTALK', label: CHANNEL.ALIMTALK },
      ],
    },
    { name: 'targetGrade', label: t('campaign.targetGrade'), placeholder: '미입력 = 전체 고객' },
    { name: 'message', label: t('campaign.message'), required: true, placeholder: '안내 메시지…' },
  ];

  const columns: Column[] = [
    { title: t('campaign.name'), dataIndex: 'name' },
    {
      title: t('campaign.channel'),
      render: (r) => CHANNEL[r.channel as string] ?? String(r.channel),
    },
    { title: t('campaign.targetGrade'), render: (r) => String(r.targetGrade ?? '전체') },
    {
      title: t('campaign.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS} />,
    },
    {
      title: t('campaign.recipients'),
      numeric: true,
      render: (r) => String(r.recipientCount ?? 0),
    },
    {
      title: '',
      render: (r) =>
        r.status === 'DRAFT' ? (
          <Button variant="primary" size="sm" onClick={() => send(r)}>
            {t('campaign.send')}
          </Button>
        ) : null,
    },
  ];

  return (
    <PageCard
      title={t('nav.campaigns')}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          + {t('campaign.register')}
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} loading={loading} />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t('campaign.register')}
        size="md"
        fields={fields}
        onSubmit={onCreate}
      />
    </PageCard>
  );
}
