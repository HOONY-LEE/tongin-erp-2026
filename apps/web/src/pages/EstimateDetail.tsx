import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
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
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';

interface Zone {
  id: string;
  name: string;
}
interface Line {
  id: string;
  itemName: string;
  qty: string | number;
  cbm: string | number;
  handling: string;
  zoneId?: string | null;
}
interface Estimate {
  id: string;
  estimateNo: string;
  status: string;
  totalCbm: string | number;
  totalAmount: string | number | null;
  zones: Zone[];
  lines: Line[];
}

const STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  QUOTED: { label: '견적완료', color: 'success' },
};
const HANDLING: Record<string, string> = { CARRY: '운반', LEAVE: '방치', DISPOSE: '폐기' };

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const cbmItems = useOptions('/cbm-items', 'name');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Estimate>(`/estimates/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [id, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const addZone = async (values: Record<string, unknown>) => {
    try {
      await api(`/estimates/${id}/zones`, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const addLine = async (values: Record<string, unknown>) => {
    try {
      await api(`/estimates/${id}/lines`, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const quote = async () => {
    try {
      await api(`/estimates/${id}/quote`, { method: 'POST' });
      toast({ type: 'success', title: t('estimate.quote') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const zoneName = (zid?: string | null) => data.zones.find((z) => z.id === zid)?.name ?? '-';
  const zoneOptions = data.zones.map((z) => ({ value: z.id, label: z.name }));

  const lineColumns: Column[] = [
    { title: t('estimate.zones'), render: (r) => zoneName(r.zoneId as string | undefined) },
    { title: '품목', dataIndex: 'itemName' },
    { title: '수량', numeric: true, render: (r) => String(r.qty) },
    { title: 'CBM', numeric: true, render: (r) => String(r.cbm) },
    { title: '처리', render: (r) => HANDLING[r.handling as string] ?? String(r.handling) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/estimates')}>
          ← {t('estimate.back')}
        </Button>
        <h3 style={{ margin: 0 }}>{data.estimateNo}</h3>
        <StatusBadge value={data.status} map={STATUS} />
        <Badge variant="subtle" color="info">
          {t('estimate.totalCbm')} {String(data.totalCbm)}
        </Badge>
        <div style={{ marginLeft: 'auto' }}>
          <Button variant="primary" size="sm" disabled={data.status === 'QUOTED'} onClick={quote}>
            {t('estimate.quote')}
          </Button>
        </div>
      </div>

      <PageCard
        title={t('estimate.zones')}
        count={data.zones.length}
        actions={
          <Button variant="outline" size="sm" onClick={() => setZoneOpen(true)}>
            + {t('estimate.addZone')}
          </Button>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {data.zones.length ? (
            data.zones.map((z) => (
              <Badge key={z.id} variant="subtle">
                {z.name}
              </Badge>
            ))
          ) : (
            <span style={{ color: 'var(--ark-color-text-tertiary)' }}>구역 없음</span>
          )}
        </div>
      </PageCard>

      <PageCard
        title={t('estimate.lines')}
        count={data.lines.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setLineOpen(true)}>
            + {t('estimate.addLine')}
          </Button>
        }
      >
        <DataTable columns={lineColumns} rows={data.lines as unknown as Row[]} />
      </PageCard>

      <FormModal
        open={zoneOpen}
        onOpenChange={setZoneOpen}
        title={t('estimate.addZone')}
        fields={[
          { name: 'name', label: '구역명', required: true, placeholder: '안방/거실/사무실…' },
        ]}
        onSubmit={addZone}
      />

      <FormModal
        open={lineOpen}
        onOpenChange={setLineOpen}
        title={t('estimate.addLine')}
        fields={[
          { name: 'zoneId', label: t('estimate.zones'), type: 'select', options: zoneOptions },
          { name: 'cbmItemId', label: '품목', required: true, type: 'select', options: cbmItems },
          { name: 'qty', label: '수량', type: 'number', placeholder: '1' },
          {
            name: 'handling',
            label: '처리',
            type: 'select',
            options: [
              { value: 'CARRY', label: '운반' },
              { value: 'LEAVE', label: '방치' },
              { value: 'DISPOSE', label: '폐기' },
            ],
          },
        ]}
        onSubmit={addLine}
      />
    </div>
  );
}
