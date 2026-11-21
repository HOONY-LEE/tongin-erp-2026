import i18n from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  DataTable,
  FilterButton,
  filterRows,
  PageHeader,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
} from '../components/ui';

const STATUS: StatusMap = {
  DRAFT: { label: i18n.t('deals.DRAFT'), color: 'neutral' },
  QUOTED: { label: i18n.t('deals.QUOTED'), color: 'success' },
};

export default function Estimates() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  const [flt, setFlt] = useState<FilterValues>({});

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
    { title: t('deals.estimateNo'), dataIndex: 'estimateNo' },
    {
      title: t('deals.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS} />,
    },
    { title: t('estimate.totalCbm'), numeric: true, render: (r) => String(r.totalCbm) },
    {
      title: t('deals.total'),
      numeric: true,
      render: (r) => (r.totalAmount != null ? Number(r.totalAmount).toLocaleString() : '-'),
    },
  ];

  const filterFields: FilterField[] = [
    { key: 'createdAt', label: t('deals.flt.createdAt'), type: 'date' },
    {
      key: 'status',
      label: t('deals.status'),
      type: 'multi',
      options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
    },
  ];
  const shown = filterRows(rows, filterFields, flt, (r, key) => r[key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.estimates')} onRefresh={load} updatedAt={updatedAt} />
      {/* 견적은 접수를 열면 자동으로 만들어진다 — 여기서 따로 만들지 않는다 */}
      <DataTable
        filters={<FilterButton fields={filterFields} value={flt} onChange={setFlt} />}
        columns={columns}
        rows={shown}
        loading={loading}
        // 견적은 접수 상세(= 견적서 화면)에서 본다
        onRowClick={(r) =>
          navigate(r.leadId ? `/leads/${String(r.leadId)}` : `/estimates/${String(r.id)}`)
        }
      />
    </div>
  );
}
