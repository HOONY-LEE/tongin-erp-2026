import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

const STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  QUOTED: { label: '발송됨', color: 'success' },
};

export default function Estimates() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/estimates'));
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
          // 견적은 접수 상세(= 견적서 화면)에서 본다
          onClick={() =>
            navigate(r.leadId ? `/leads/${String(r.leadId)}` : `/estimates/${String(r.id)}`)
          }
        >
          {t('estimate.detail')}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.estimates')} onRefresh={load} updatedAt={updatedAt} />
      {/* 견적은 접수를 열면 자동으로 만들어진다 — 여기서 따로 만들지 않는다 */}
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) =>
          navigate(r.leadId ? `/leads/${String(r.leadId)}` : `/estimates/${String(r.id)}`)
        }
      />
    </div>
  );
}
