import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import {
  Badge,
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

interface MaterialRow extends Row {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  unit: string;
  safetyStock: number;
  stock: number;
  lowStock: boolean;
}

const STOCK_STATUS: StatusMap = {
  OK: { label: '정상', color: 'success' },
  LOW: { label: '부족', color: 'error' },
};

export default function Materials() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [moveRow, setMoveRow] = useState<MaterialRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<MaterialRow[]>('/materials'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api('/materials', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onMove = async (values: Record<string, unknown>) => {
    if (!moveRow) return;
    try {
      await api(`/materials/${moveRow.id}/movements`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      setMoveRow(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const createFields: FormField[] = [
    { name: 'code', label: t('material.code'), required: true, placeholder: 'BOX-S' },
    { name: 'name', label: t('material.name'), required: true, placeholder: '소형 박스' },
    { name: 'category', label: t('material.category'), placeholder: '박스/포장지/유니폼' },
    { name: 'unit', label: t('material.unit'), placeholder: 'EA / SET / ROLL / BOX' },
    { name: 'safetyStock', label: t('material.safetyStock'), type: 'number', placeholder: '0' },
  ];

  const columns: Column[] = [
    { title: t('material.code'), dataIndex: 'code' },
    { title: t('material.name'), dataIndex: 'name' },
    { title: t('material.category'), render: (r) => String(r.category ?? '-') },
    { title: t('material.unit'), render: (r) => String(r.unit) },
    {
      title: t('material.stock'),
      numeric: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <b>{String(r.stock)}</b>
          <StatusBadge value={r.lowStock ? 'LOW' : 'OK'} map={STOCK_STATUS} />
        </span>
      ),
    },
    { title: t('material.safetyStock'), numeric: true, render: (r) => String(r.safetyStock) },
    {
      title: '',
      render: (r) => (
        <Button variant="outline" size="sm" onClick={() => setMoveRow(r as MaterialRow)}>
          {t('material.move')}
        </Button>
      ),
    },
  ];

  return (
    <PageCard
      title={t('nav.materials')}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          + {t('material.register')}
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} loading={loading} />

      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('material.register')}
        size="md"
        fields={createFields}
        onSubmit={onCreate}
      />

      <FormModal
        open={!!moveRow}
        onOpenChange={(o) => !o && setMoveRow(null)}
        title={`${t('material.move')} — ${moveRow?.name ?? ''} (${t('material.stock')} ${moveRow?.stock ?? 0})`}
        fields={[
          {
            name: 'type',
            label: t('material.moveType'),
            required: true,
            type: 'select',
            options: [
              { value: 'IN', label: t('material.in') },
              { value: 'OUT', label: t('material.out') },
              { value: 'ADJUST', label: t('material.adjust') },
            ],
          },
          {
            name: 'qty',
            label: t('material.qty'),
            required: true,
            type: 'number',
            placeholder: '1',
          },
          { name: 'reason', label: t('material.reason'), placeholder: '발주입고 / 작업출고 …' },
        ]}
        onSubmit={onMove}
      />

      {rows.some((r) => r.lowStock) && (
        <div style={{ marginTop: 12 }}>
          <Badge color="error" variant="subtle">
            ⚠ {t('material.lowStockWarn')}
          </Badge>
        </div>
      )}
    </PageCard>
  );
}
