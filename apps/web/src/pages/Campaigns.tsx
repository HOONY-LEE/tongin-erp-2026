import i18n from '../i18n';
import { useCallback, useEffect, useState, useRef } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { type CampaignChannel } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { filterQuery, LIST_LIMIT } from '../lib/serverFilter';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  DataTable,
  FilterButton,
  ListPage,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
} from '../components/ui';
import { CAMPAIGN_CHANNEL_LABEL } from '../i18n/codes';

export const CAMPAIGN_STATUS_MAP: StatusMap = {
  DRAFT: { label: i18n.t('camp.cst.DRAFT'), color: 'neutral' },
  SCHEDULED: { label: i18n.t('camp.cst.SCHEDULED'), color: 'info' },
  SENDING: { label: i18n.t('camp.cst.SENDING'), color: 'warning' },
  SENT: { label: i18n.t('camp.cst.SENT'), color: 'success' },
  CANCELED: { label: i18n.t('camp.cancel'), color: 'error' },
};

const dt = (v: unknown) => fmtDateTime(v) || '-';

/** 마케팅 캠페인 목록 — 등록·수정·삭제는 별도 화면(행을 누르면 열린다, 대상 고르기까지 한 곳에서) */
export default function Campaigns() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  const [flt, setFlt] = useState<FilterValues>({});
  /** 검색칸 — 서버에서 찾는다(이름·제목·본문) */
  const [q, setQ] = useState('');
  const query = filterQuery(flt, q);

  // 필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const data = await api<Row[]>(`/campaigns${query}`);
      if (my !== seq.current) return;
      setRows(data);
      touch();
    } catch (e) {
      if (my === seq.current)
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [toast, t, touch, query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const columns: Column[] = [
    { title: t('camp.campaign'), dataIndex: 'name', flex: 1, minWidth: 180 },
    {
      title: t('camp.col.channel'),
      render: (r) => CAMPAIGN_CHANNEL_LABEL[r.channel as CampaignChannel] ?? String(r.channel),
    },
    {
      title: t('camp.col.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={CAMPAIGN_STATUS_MAP} />,
    },
    {
      title: t('camp.recipients'),
      numeric: true,
      render: (r) => t('camp.peopleN', { v0: Number(r.recipientCount ?? 0) }),
    },
    {
      title: t('camp.col.result'),
      render: (r) =>
        r.status === 'SENT'
          ? t('camp.resultN', { v0: Number(r.sentCount ?? 0), v1: Number(r.failedCount ?? 0) })
          : '-',
    },
    {
      title: t('camp.col.sendAt'),
      render: (r) =>
        r.status === 'SCHEDULED' ? t('camp.scheduledOf', { v0: dt(r.scheduledAt) }) : dt(r.sentAt),
    },
    { title: t('camp.col.createdAt'), render: (r) => dt(r.createdAt) },
  ];

  const filterFields: FilterField[] = [
    {
      key: 'period',
      label: t('camp.flt.period'),
      type: 'date',
      options: [
        { value: 'createdAt', label: t('camp.flt.createdAt') },
        { value: 'sendAt', label: t('camp.flt.sendAt') },
      ],
    },
    {
      key: 'channel',
      label: t('camp.col.channel'),
      type: 'multi',
      options: Object.entries(CAMPAIGN_CHANNEL_LABEL).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      key: 'status',
      label: t('camp.col.status'),
      type: 'multi',
      options: Object.entries(CAMPAIGN_STATUS_MAP).map(([value, s]) => ({
        value,
        label: s.label,
      })),
    },
  ];

  return (
    <ListPage title={t('nav.campaigns')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        filters={
          <FilterButton
            fields={filterFields}
            value={flt}
            onChange={setFlt}
            limited={rows.length >= LIST_LIMIT}
          />
        }
        onSearch={setQ}
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => navigate(`/campaigns/${String(r.id)}`)}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => navigate('/campaigns/new')}>
            {t('camp.createBtn')}
          </Button>
        }
      />
    </ListPage>
  );
}
