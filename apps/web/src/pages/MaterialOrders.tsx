import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import {
  Button,
  DataTable,
  Input,
  Modal,
  PageCard,
  Select,
  StatusBadge,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';

const ORDER_STATUS: StatusMap = {
  REQUESTED: { label: '요청', color: 'warning' },
  APPROVED: { label: '승인', color: 'info' },
  SHIPPED: { label: '출고완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

interface OrderLine {
  id: string;
  qty: number;
  material?: { name: string } | null;
}
interface Order extends Row {
  id: string;
  orderNo: string;
  status: string;
  note?: string | null;
  orgUnit?: { name: string } | null;
  lines: OrderLine[];
}
interface LineDraft {
  materialId: string;
  qty: string;
}

export default function MaterialOrders() {
  const { t } = useTranslation();
  const toast = useToast();
  const orgs = useOptions('/org-units', 'name');
  const materials = useOptions('/materials', 'name');

  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ materialId: '', qty: '1' }]);

  const fail = useCallback(
    (e: unknown) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') }),
    [toast, t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Order[]>('/material-orders'));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [fail]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setOrgId('');
    setNote('');
    setLines([{ materialId: '', qty: '1' }]);
  };

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast({ type: 'success', title: msg });
      await load();
    } catch (e) {
      fail(e);
    }
  };

  const submit = async () => {
    if (!orgId) {
      toast({ type: 'warning', title: t('order.pickOrg') });
      return;
    }
    const valid = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (!valid.length) {
      toast({ type: 'warning', title: t('order.needLine') });
      return;
    }
    setSaving(true);
    try {
      await api('/material-orders', {
        method: 'POST',
        body: JSON.stringify({
          orgUnitId: orgId,
          note: note || undefined,
          lines: valid.map((l) => ({ materialId: l.materialId, qty: Number(l.qty) })),
        }),
      });
      toast({ type: 'success', title: t('common.created') });
      setOpen(false);
      resetForm();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const columns: Column[] = [
    { title: t('order.orderNo'), dataIndex: 'orderNo' },
    { title: t('order.org'), render: (r) => String((r as Order).orgUnit?.name ?? '-') },
    {
      title: t('order.items'),
      render: (r) =>
        (r as Order).lines.map((l) => `${l.material?.name ?? '?'}×${l.qty}`).join(', ') || '-',
    },
    {
      title: t('order.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={ORDER_STATUS} />,
    },
    {
      title: '',
      render: (r) => {
        const o = r as Order;
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            {o.status === 'REQUESTED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  act(
                    () => api(`/material-orders/${o.id}/approve`, { method: 'POST' }),
                    t('order.approved'),
                  )
                }
              >
                {t('order.approve')}
              </Button>
            )}
            {o.status === 'APPROVED' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  act(
                    () => api(`/material-orders/${o.id}/ship`, { method: 'POST' }),
                    t('order.shipped'),
                  )
                }
              >
                {t('order.ship')}
              </Button>
            )}
            {o.status !== 'SHIPPED' && o.status !== 'CANCELED' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  act(
                    () => api(`/material-orders/${o.id}/cancel`, { method: 'POST' }),
                    t('order.canceled'),
                  )
                }
              >
                {t('order.cancel')}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <PageCard
      title={t('nav.materialOrders')}
      count={rows.length}
      actions={
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          + {t('order.register')}
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} loading={loading} />

      <Modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
        title={t('order.register')}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label={t('order.org')}
            value={orgId}
            onValueChange={setOrgId}
            options={orgs}
            placeholder={t('order.pickOrg')}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--ark-color-text-secondary)' }}>
              {t('order.lines')}
            </span>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Select
                    label={i === 0 ? t('order.material') : undefined}
                    value={l.materialId}
                    onValueChange={(v) => setLine(i, { materialId: v })}
                    options={materials}
                    placeholder={t('order.pickMaterial')}
                  />
                </div>
                <Input
                  label={i === 0 ? t('order.qty') : undefined}
                  type="number"
                  value={l.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })}
                  style={{ width: 90 }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLines((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s))
                  }
                >
                  ✕
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLines((s) => [...s, { materialId: '', qty: '1' }])}
              >
                + {t('order.addLine')}
              </Button>
            </div>
          </div>
          <Input
            label={t('order.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="비고"
          />
        </div>
      </Modal>
    </PageCard>
  );
}
