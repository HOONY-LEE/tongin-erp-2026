import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
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
  RECEIVED: { label: '접수', color: 'neutral' },
  CONSULT_ASSIGNED: { label: '상담배정', color: 'info' },
  CONSULT_TOSS: { label: '상담토스', color: 'info' },
  QUOTED: { label: '견적완료', color: 'warning' },
  CONTRACTED: { label: '계약', color: 'primary' },
  WORK_TOSS: { label: '작업토스', color: 'primary' },
  IN_PROGRESS: { label: '작업중', color: 'info' },
  DONE: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};
const SERVICE_LINES = [
  { value: 'MOVING', label: '이사(무빙)' },
  { value: 'LIVING', label: '리빙' },
  { value: 'CARE', label: '케어' },
  { value: 'B2B_MOVING', label: '기업이전' },
  { value: 'GENERAL', label: '일반' },
];

export default function Leads() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [transRow, setTransRow] = useState<Row | null>(null);
  const [estRow, setEstRow] = useState<Row | null>(null);
  const orgs = useOptions('/org-units', 'name');
  const customers = useOptions('/customers', 'name');
  const products = useOptions('/products', 'name');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/leads'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const createFields: FormField[] = [
    { name: 'orgUnitId', label: '담당 지점', required: true, type: 'select', options: orgs },
    { name: 'customerId', label: '고객', type: 'select', options: customers },
    { name: 'source', label: '접수경로', placeholder: 'HOMEPAGE / AIBOT ...' },
    { name: 'serviceLine', label: '서비스라인', type: 'select', options: SERVICE_LINES },
    { name: 'fromAddr', label: '출발지' },
    { name: 'toAddr', label: '도착지' },
  ];

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api('/leads', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onTransition = async (values: Record<string, unknown>) => {
    if (!transRow) return;
    try {
      await api(`/leads/${transRow.id as string}/transition`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      setTransRow(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onCreateEstimate = async (values: Record<string, unknown>) => {
    if (!estRow) return;
    try {
      const created = await api<{ id: string }>('/estimates', {
        method: 'POST',
        body: JSON.stringify({
          leadId: estRow.id,
          orgUnitId: estRow.orgUnitId,
          fromAddr: estRow.fromAddr ?? undefined,
          toAddr: estRow.toAddr ?? undefined,
          ...values,
        }),
      });
      toast({ type: 'success', title: t('common.created') });
      setEstRow(null);
      navigate(`/estimates/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const columns: Column[] = [
    { title: '접수번호', dataIndex: 'leadNo' },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS} /> },
    { title: '출처', render: (r) => String(r.source ?? '-') },
    { title: '서비스', render: (r) => String(r.serviceLine ?? '-') },
    {
      title: '이사 경로',
      render: (r) => (r.fromAddr || r.toAddr ? `${r.fromAddr ?? '-'} → ${r.toAddr ?? '-'}` : '-'),
    },
    {
      title: '작업',
      render: (r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" size="sm" onClick={() => setEstRow(r)}>
            {t('lead.toEstimate')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransRow(r)}>
            {t('lead.changeStatus')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageCard
      title={t('nav.leads')}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          + {t('lead.register')}
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} loading={loading} />

      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('lead.register')}
        size="md"
        fields={createFields}
        onSubmit={onCreate}
      />

      <FormModal
        open={!!transRow}
        onOpenChange={(o) => !o && setTransRow(null)}
        title={`${t('lead.changeStatus')} — ${(transRow?.leadNo as string) ?? ''}`}
        fields={[
          {
            name: 'to',
            label: '변경할 상태',
            required: true,
            type: 'select',
            options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
          },
        ]}
        onSubmit={onTransition}
      />

      <FormModal
        open={!!estRow}
        onOpenChange={(o) => !o && setEstRow(null)}
        title={`${t('lead.toEstimate')} — ${(estRow?.leadNo as string) ?? ''}`}
        size="md"
        initialValues={estRow?.customerId ? { customerId: String(estRow.customerId) } : undefined}
        fields={[
          { name: 'customerId', label: '고객', required: true, type: 'select', options: customers },
          {
            name: 'productId',
            label: '이사상품',
            required: true,
            type: 'select',
            options: products,
          },
          { name: 'fromPyeong', label: '출발지 평수', type: 'number' },
          { name: 'toPyeong', label: '도착지 평수', type: 'number' },
        ]}
        onSubmit={onCreateEstimate}
      />
    </PageCard>
  );
}
