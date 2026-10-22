import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CAMPAIGN_CHANNEL_LABEL, type CampaignChannel } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  DataTable,
  PageHeader,
  StatusBadge,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';

export const CAMPAIGN_STATUS_MAP: StatusMap = {
  DRAFT: { label: '작성 중', color: 'neutral' },
  SCHEDULED: { label: '예약됨', color: 'info' },
  SENDING: { label: '발송 중', color: 'warning' },
  SENT: { label: '발송 완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

const dt = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

/** 마케팅 캠페인 목록 — 등록·수정은 별도 화면(대상 고르기까지 한 곳에서) */
export default function Campaigns() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/campaigns'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t, touch]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column[] = [
    { title: '캠페인', dataIndex: 'name', flex: 1, minWidth: 180 },
    {
      title: '채널',
      render: (r) => CAMPAIGN_CHANNEL_LABEL[r.channel as CampaignChannel] ?? String(r.channel),
    },
    {
      title: '상태',
      render: (r) => <StatusBadge value={String(r.status)} map={CAMPAIGN_STATUS_MAP} />,
    },
    { title: '받는 사람', numeric: true, render: (r) => `${Number(r.recipientCount ?? 0)}명` },
    {
      title: '결과',
      render: (r) =>
        r.status === 'SENT'
          ? `성공 ${Number(r.sentCount ?? 0)} · 실패 ${Number(r.failedCount ?? 0)}`
          : '-',
    },
    {
      title: '발송(예약) 시각',
      render: (r) => (r.status === 'SCHEDULED' ? `${dt(r.scheduledAt)} 예약` : dt(r.sentAt)),
    },
    { title: '작성', render: (r) => dt(r.createdAt) },
  ];

  return (
    <>
      <PageHeader title={t('nav.campaigns')} onRefresh={load} updatedAt={updatedAt} />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => navigate(`/campaigns/${String(r.id)}`)}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => navigate('/campaigns/new')}>
            + 캠페인 등록
          </Button>
        }
      />
    </>
  );
}
