import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { Badge, DataTable, PageCard, useToast, type Column, type Row } from '../components/ui';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '0');

export default function Branches() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/branches/overview'));
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
    { title: '지점', dataIndex: 'name' },
    { title: '코드', render: (r) => String(r.code ?? '-') },
    { title: '계약 건수', numeric: true, render: (r) => String(r.contractCount ?? 0) },
    {
      title: '매출(계약)',
      numeric: true,
      render: (r) => <b>{won(r.revenue)}</b>,
    },
    {
      title: '작업 진행',
      numeric: true,
      render: (r) =>
        Number(r.workActive) > 0 ? (
          <Badge variant="subtle" color="info">
            {String(r.workActive)}
          </Badge>
        ) : (
          '0'
        ),
    },
    { title: '작업 완료', numeric: true, render: (r) => String(r.workDone ?? 0) },
    {
      title: '직원',
      numeric: true,
      render: (r) => `${String(r.employeeCount ?? 0)}명`,
    },
  ];

  return (
    <PageCard title={t('nav.branches')} count={rows.length}>
      <div style={{ marginBottom: 12 }}>
        <Badge variant="subtle" color="neutral">
          지점별 매출·작업·직원 현황 (직영/가맹점)
        </Badge>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} />
    </PageCard>
  );
}
