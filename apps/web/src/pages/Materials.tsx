import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  PageHeader,
  RecordDetail,
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
  const { updatedAt, touch } = useUpdatedAt();
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<MaterialRow[]>('/materials'));
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
    { name: 'name', label: t('material.name'), required: true, placeholder: '소형 박스' },
    { name: 'category', label: t('material.category'), placeholder: '박스/포장지/유니폼' },
    { name: 'unit', label: t('material.unit'), placeholder: 'EA / SET / ROLL / BOX' },
    { name: 'safetyStock', label: t('material.safetyStock'), type: 'number', placeholder: '0' },
  ];

  const columns: Column[] = [
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
  ];

  const moveModal = (
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
  );

  // 행을 누르면 상세 — 입출고는 상세 머리글에서
  if (detailId) {
    const detail = rows.find((r) => r.id === detailId);
    return (
      <>
        <RecordDetail
          loading={!detail && loading}
          title={detail ? detail.name : '자재를 찾을 수 없습니다'}
          backLabel={t('nav.materials')}
          onBack={closeDetail}
          actions={
            detail ? (
              <Button variant="primary" size="sm" onClick={() => setMoveRow(detail)}>
                {t('material.move')}
              </Button>
            ) : undefined
          }
          sections={
            detail
              ? [
                  {
                    title: '자재 정보',
                    items: [
                      { label: t('material.name'), value: detail.name },
                      { label: '코드', value: detail.code },
                      { label: t('material.category'), value: detail.category },
                      { label: t('material.unit'), value: detail.unit },
                    ],
                  },
                  {
                    title: '재고',
                    items: [
                      {
                        label: t('material.stock'),
                        value: (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <b>{detail.stock}</b>
                            <StatusBadge
                              value={detail.lowStock ? 'LOW' : 'OK'}
                              map={STOCK_STATUS}
                            />
                          </span>
                        ),
                      },
                      { label: t('material.safetyStock'), value: String(detail.safetyStock) },
                    ],
                  },
                ]
              : []
          }
        />
        {moveModal}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.materials')} onRefresh={load} updatedAt={updatedAt} />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => openDetail(String(r.id))}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + {t('material.register')}
          </Button>
        }
      />

      {rows.some((r) => r.lowStock) && (
        <div>
          <Badge color="error" variant="subtle">
            ⚠ {t('material.lowStockWarn')}
          </Badge>
        </div>
      )}

      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('material.register')}
        size="md"
        fields={createFields}
        onSubmit={onCreate}
      />

      {moveModal}
    </div>
  );
}
