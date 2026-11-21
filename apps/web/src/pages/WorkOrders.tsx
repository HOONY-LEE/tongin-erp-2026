import i18n from '../i18n';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, downloadFile } from '../lib/api';
import { filterQuery, LIST_LIMIT } from '../lib/serverFilter';
import { useOptions } from '../lib/useOptions';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  DataTable,
  FilterButton,
  FormModal,
  PageHeader,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
} from '../components/ui';

export const WORK_STATUS: StatusMap = {
  ASSIGNED: { label: i18n.t('misc.wo.ASSIGNED'), color: 'neutral' },
  IN_PROGRESS: { label: i18n.t('misc.wo.IN_PROGRESS'), color: 'info' },
  DONE: { label: i18n.t('misc.done'), color: 'success' },
  CANCELED: { label: i18n.t('misc.st.canceled'), color: 'error' },
};

export default function WorkOrders() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const contracts = useOptions('/contracts', 'contractNo');
  const { updatedAt, touch } = useUpdatedAt();
  const [flt, setFlt] = useState<FilterValues>({});
  /** 검색칸 — 서버에서 찾는다(작업번호·옛 번호·계약번호·고객명) */
  const [q, setQ] = useState('');
  const query = filterQuery(flt, q);

  // 필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const data = await api<Row[]>(`/work-orders${query}`);
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

  const fields: FormField[] = [
    {
      name: 'contractId',
      label: t('misc.contractSigned'),
      required: true,
      type: 'select',
      options: contracts,
    },
    { name: 'scheduledDate', label: t('work.scheduled'), placeholder: 'YYYY-MM-DD' },
  ];

  const exportIcs = async () => {
    try {
      await downloadFile('/calendar/work-orders.ics', 'tongin-schedule.ics');
      toast({ type: 'success', title: t('work.exportDone') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    }
  };

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      const created = await api<{ id: string }>('/work-orders', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      navigate(`/work-orders/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const columns: Column[] = [
    { title: t('misc.workNo'), dataIndex: 'workNo' },
    {
      title: t('misc.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={WORK_STATUS} />,
    },
    { title: t('work.scheduled'), render: (r) => String(r.scheduledDate ?? '-').slice(0, 10) },
  ];

  const filterFields: FilterField[] = [
    {
      key: 'period',
      label: t('work.flt.period'),
      type: 'date',
      options: [
        { value: 'scheduledDate', label: t('work.scheduled') },
        { value: 'createdAt', label: t('work.flt.createdAt') },
      ],
    },
    {
      key: 'status',
      label: t('misc.status'),
      type: 'multi',
      options: Object.entries(WORK_STATUS).map(([value, s]) => ({ value, label: s.label })),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.workOrders')} onRefresh={load} updatedAt={updatedAt} />
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
        onRowClick={(r) => navigate(`/work-orders/${String(r.id)}`)}
        toolbarActions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={exportIcs}>
              📅 {t('work.exportIcs')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
              + {t('work.create')}
            </Button>
          </div>
        }
      />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t('work.create')}
        fields={fields}
        onSubmit={onCreate}
      />
    </div>
  );
}
