import i18n from '../i18n';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { filterQuery, LIST_LIMIT } from '../lib/serverFilter';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  DataTable,
  FilterButton,
  PageHeader,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
} from '../components/ui';

export const CONTRACT_STATUS: StatusMap = {
  DRAFT: { label: i18n.t('deals.DRAFT'), color: 'neutral' },
  SIGNED: { label: i18n.t('deals.SIGNED'), color: 'success' },
  CANCELED: { label: i18n.t('deals.CANCELED'), color: 'error' },
};

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

export default function Contracts() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  const [flt, setFlt] = useState<FilterValues>({});
  /** 검색칸 — 서버에서 찾는다(계약번호·옛 번호·고객명) */
  const [q, setQ] = useState('');
  const query = filterQuery(flt, q);

  // 필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const data = await api<Row[]>(`/contracts${query}`);
      if (my !== seq.current) return;
      setRows(data);
      touch();
    } catch (e) {
      if (my === seq.current)
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [toast, t, query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const columns: Column[] = [
    { title: t('deals.contractNo'), dataIndex: 'contractNo' },
    {
      title: t('deals.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={CONTRACT_STATUS} />,
    },
    { title: t('contract.total'), numeric: true, render: (r) => won(r.totalAmount) },
    { title: t('contract.deposit'), numeric: true, render: (r) => won(r.depositAmount) },
    { title: t('contract.balance'), numeric: true, render: (r) => won(r.balanceAmount) },
  ];

  const filterFields: FilterField[] = [
    {
      key: 'period',
      label: t('deals.flt.period'),
      type: 'date',
      options: [
        { value: 'createdAt', label: t('deals.flt.createdAt') },
        { value: 'contractDate', label: t('deals.flt.contractDate') },
        { value: 'signedAt', label: t('deals.flt.signedAt') },
      ],
    },
    {
      key: 'status',
      label: t('deals.status'),
      type: 'multi',
      options: Object.entries(CONTRACT_STATUS).map(([value, s]) => ({ value, label: s.label })),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.contracts')} onRefresh={load} updatedAt={updatedAt} />
      {/* 계약은 접수 화면의 '고객에게 견적서 보내기'로 만들어진다 — 여기서 따로 만들지 않는다 */}
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
        onRowClick={(r) => navigate(`/contracts/${String(r.id)}`)}
      />
    </div>
  );
}
