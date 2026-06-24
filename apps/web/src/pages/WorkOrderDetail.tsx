import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  PageCard,
  Spinner,
  StatusBadge,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { WORK_STATUS } from './WorkOrders';

const RESOURCE: Record<string, string> = { CREW: '인력', VEHICLE: '차량' };

interface Assignment {
  id: string;
  resourceType: string;
  resourceRef?: string | null;
}
interface WorkOrder {
  id: string;
  workNo: string;
  status: string;
  scheduledDate?: string | null;
  assignments: Assignment[];
}

export default function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<WorkOrder>(`/work-orders/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [id, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      toast({ type: 'success', title: okMsg });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const start = () =>
    act(() => api(`/work-orders/${id}/start`, { method: 'POST' }), t('work.start'));
  const complete = () =>
    act(() => api(`/work-orders/${id}/complete`, { method: 'POST' }), t('work.complete'));
  const addAssignment = (values: Record<string, unknown>) =>
    act(
      () => api(`/work-orders/${id}/assignments`, { method: 'POST', body: JSON.stringify(values) }),
      t('common.created'),
    );

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const columns: Column[] = [
    { title: '유형', render: (r) => RESOURCE[r.resourceType as string] ?? String(r.resourceType) },
    { title: '내용', render: (r) => String(r.resourceRef ?? '-') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/work-orders')}>
          ← {t('work.back')}
        </Button>
        <h3 style={{ margin: 0 }}>{data.workNo}</h3>
        <StatusBadge value={data.status} map={WORK_STATUS} />
        {data.scheduledDate && (
          <Badge variant="subtle" color="info">
            {t('work.scheduled')} {String(data.scheduledDate).slice(0, 10)}
          </Badge>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="primary" size="sm" disabled={data.status !== 'ASSIGNED'} onClick={start}>
            {t('work.start')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={data.status !== 'IN_PROGRESS'}
            onClick={complete}
          >
            {t('work.complete')}
          </Button>
        </div>
      </div>

      <PageCard
        title={t('work.assignments')}
        count={data.assignments.length}
        actions={
          <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
            + {t('work.assign')}
          </Button>
        }
      >
        <DataTable columns={columns} rows={data.assignments as unknown as Row[]} />
      </PageCard>

      <FormModal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title={t('work.assign')}
        fields={[
          {
            name: 'resourceType',
            label: '유형',
            required: true,
            type: 'select',
            options: [
              { value: 'CREW', label: '인력' },
              { value: 'VEHICLE', label: '차량' },
            ],
          },
          { name: 'resourceRef', label: '내용', placeholder: '현장팀 5명 / 5톤 트럭' },
        ]}
        onSubmit={addAssignment}
      />
    </div>
  );
}
