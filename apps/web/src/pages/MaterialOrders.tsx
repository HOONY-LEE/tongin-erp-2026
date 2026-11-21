import i18n from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { filterQuery, LIST_LIMIT } from '../lib/serverFilter';
import { useOptions } from '../lib/useOptions';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import {
  Button,
  DataTable,
  FilterButton,
  Input,
  Modal,
  PageHeader,
  RecordDetail,
  Select,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
} from '../components/ui';
import { fs } from '../lib/fontScale';

const ORDER_STATUS: StatusMap = {
  REQUESTED: { label: i18n.t('misc.so.REQUESTED'), color: 'warning' },
  APPROVED: { label: i18n.t('misc.mo.APPROVED'), color: 'info' },
  SHIPPED: { label: i18n.t('misc.mo.SHIPPED'), color: 'success' },
  CANCELED: { label: i18n.t('misc.st.canceled'), color: 'error' },
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
  orgUnitId?: string | null;
  orgUnit?: { id?: string; name: string } | null;
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
  /** 검색 옆 필터 — 요청일·상태·지점 */
  const [flt, setFlt] = useState<FilterValues>({});
  /** 검색칸 — 서버에서 찾는다(발주번호·메모·지점) */
  const [q, setQ] = useState('');
  /** 지점 고르기 목록 — 거른 결과로 줄어들지 않게 본 적 있는 지점을 모아 둔다 */
  const [orgSeen, setOrgSeen] = useState<Map<string, string>>(new Map());
  const query = filterQuery(flt, q);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ materialId: '', qty: '1' }]);
  const { updatedAt, touch } = useUpdatedAt();
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();

  const fail = useCallback(
    (e: unknown) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') }),
    [toast, t],
  );

  // 필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const data = await api<Order[]>(`/material-orders${query}`);
      if (my !== seq.current) return;
      setRows(data);
      setOrgSeen((prev) => {
        const next = new Map(prev);
        for (const o of data) if (o.orgUnitId && o.orgUnit) next.set(o.orgUnitId, o.orgUnit.name);
        return next.size === prev.size ? prev : next;
      });
      touch();
    } catch (e) {
      if (my === seq.current) fail(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [fail, query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
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

  // 필수 항목(요청 지점·품목 한 줄 이상)이 채워져야 저장 버튼 활성
  const canSubmit = !!orgId && lines.some((l) => l.materialId && Number(l.qty) > 0);

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
  ];

  // 행을 누르면 상세 — 승인·출고·취소는 상세 머리글에서
  if (detailId) {
    const o = rows.find((r) => r.id === detailId);
    return (
      <RecordDetail
        loading={!o && loading}
        title={o ? o.orderNo : t('misc.orderNotFound')}
        backLabel={t('nav.materialOrders')}
        onBack={closeDetail}
        actions={
          o && o.status !== 'SHIPPED' && o.status !== 'CANCELED' ? (
            <>
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
            </>
          ) : undefined
        }
        sections={
          o
            ? [
                {
                  title: t('misc.orderInfo'),
                  items: [
                    { label: t('order.orderNo'), value: o.orderNo },
                    { label: t('order.org'), value: o.orgUnit?.name },
                    {
                      label: t('order.status'),
                      value: <StatusBadge value={o.status} map={ORDER_STATUS} />,
                    },
                    { label: t('order.note'), value: o.note, wide: true },
                  ],
                },
                {
                  title: t('order.items'),
                  items: o.lines.length
                    ? o.lines.map((l, i) => ({
                        label: `${i + 1}. ${l.material?.name ?? '?'}`,
                        value: `${l.qty}`,
                      }))
                    : [{ label: t('order.items'), value: null }],
                },
              ]
            : []
        }
      />
    );
  }

  const orderOrgs = [...orgSeen]
    .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
    .map(([value, label]) => ({ value, label }));
  const filterFields: FilterField[] = [
    { key: 'createdAt', label: t('order.flt.period'), type: 'date' },
    {
      key: 'status',
      label: t('order.flt.status'),
      type: 'multi',
      options: Object.entries(ORDER_STATUS).map(([value, v]) => ({ value, label: v.label })),
    },
    ...(orderOrgs.length > 1
      ? [
          {
            key: 'orgUnitId',
            label: t('order.flt.org'),
            type: 'multi',
            options: orderOrgs,
          } as FilterField,
        ]
      : []),
  ];
  // 필터·검색은 서버가 걸어 보낸다
  const shown = rows;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.materialOrders')} onRefresh={load} updatedAt={updatedAt} />
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
        rows={shown}
        loading={loading}
        onRowClick={(r) => openDetail(String(r.id))}
        toolbarActions={
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
      />

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
            <Button variant="primary" onClick={submit} disabled={!canSubmit || saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label={`${t('order.org')} *`}
            value={orgId}
            onValueChange={setOrgId}
            options={orgs}
            placeholder={t('order.pickOrg')}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: fs(13), color: 'var(--ark-color-text-secondary)' }}>
              {t('order.lines')}
              <span style={{ color: 'var(--ark-color-primary-500)' }}> *</span>
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
            placeholder={t('misc.note')}
          />
        </div>
      </Modal>
    </div>
  );
}
