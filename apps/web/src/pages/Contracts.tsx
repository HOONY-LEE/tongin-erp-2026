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

export const CONTRACT_STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  SIGNED: { label: '서명완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

export default function Contracts() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/contracts'));
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
    { title: '계약번호', dataIndex: 'contractNo' },
    {
      title: '상태',
      render: (r) => <StatusBadge value={String(r.status)} map={CONTRACT_STATUS} />,
    },
    { title: t('contract.total'), numeric: true, render: (r) => won(r.totalAmount) },
    { title: t('contract.deposit'), numeric: true, render: (r) => won(r.depositAmount) },
    { title: t('contract.balance'), numeric: true, render: (r) => won(r.balanceAmount) },
    {
      title: '',
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/contracts/${r.id as string}`)}
        >
          {t('contract.detail')}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.contracts')} onRefresh={load} updatedAt={updatedAt} />
      {/* 계약은 접수 화면의 '고객에게 견적서 보내기'로 만들어진다 — 여기서 따로 만들지 않는다 */}
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => navigate(`/contracts/${String(r.id)}`)}
      />
    </div>
  );
}
