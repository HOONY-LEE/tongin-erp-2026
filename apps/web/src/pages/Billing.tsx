import i18n from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  DataTable,
  FilterButton,
  filterRows,
  FormModal,
  PageCard,
  PageHeader,
  RecordDetail,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const INV_STATUS: StatusMap = {
  DRAFT: { label: i18n.t('misc.bill.DRAFT'), color: 'neutral' },
  ISSUED: { label: i18n.t('misc.bill.ISSUED'), color: 'warning' },
  COLLECTED: { label: i18n.t('misc.bill.PAID'), color: 'success' },
  CANCELED: { label: i18n.t('misc.st.canceled'), color: 'error' },
};

interface Receipt {
  id?: string;
  amount: string | number;
  method?: string | null;
  receivedAt?: string | null;
  memo?: string | null;
}
interface Invoice extends Row {
  id: string;
  invoiceNo: string;
  title: string;
  amount: string | number;
  status: string;
  dueDate?: string | null;
  issuedAt?: string | null;
  createdAt?: string | null;
  orgUnitId?: string | null;
  memo?: string | null;
  partner?: { name: string } | null;
  receipts: Receipt[];
}
interface MarginLine extends Row {
  contractNo: string;
  customerName: string;
  revenue: number;
  outsourceCost: number;
  margin: number;
}
interface MarginResult {
  count: number;
  revenueTotal: number;
  outsourceCostTotal: number;
  marginTotal: number;
  lines: MarginLine[];
}
interface PartnerRecv extends Row {
  partnerName: string;
  invoiceCount: number;
  billed: number;
  collected: number;
  outstanding: number;
}

export default function Billing() {
  const { t } = useTranslation();
  const toast = useToast();
  // 청구 대상은 기업고객·제휴사만 — 전속업체는 우리가 지급하는 쪽이라 작업오더 전속원가로 관리한다
  const partners = useOptions('/partners', 'name', 'id', (r) => r.type !== 'OUTSOURCE');
  const orgs = useOptions('/org-units', 'name');

  const [margin, setMargin] = useState<MarginResult | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [precv, setPrecv] = useState<PartnerRecv[]>([]);
  const [invOpen, setInvOpen] = useState(false);
  const [receiptInv, setReceiptInv] = useState<Invoice | null>(null);
  // 청구서 목록을 처음 받기 전에는 상세가 '찾을 수 없음'으로 보이지 않게
  const [invLoading, setInvLoading] = useState(true);
  /** 청구서 표 검색 옆 필터 */
  const [invFlt, setInvFlt] = useState<FilterValues>({});
  const { updatedAt, touch } = useUpdatedAt();
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();

  const fail = useCallback(
    (e: unknown) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') }),
    [toast, t],
  );

  const loadInvoices = useCallback(async () => {
    try {
      setInvoices(await api<Invoice[]>('/billing/invoices'));
      setPrecv(await api<PartnerRecv[]>('/billing/partner-receivables'));
    } catch (e) {
      fail(e);
    } finally {
      setInvLoading(false);
    }
  }, [fail]);

  const loadAll = useCallback(async () => {
    try {
      setMargin(await api<MarginResult>('/billing/margins'));
      await loadInvoices();
      touch();
    } catch (e) {
      fail(e);
    }
  }, [loadInvoices, fail]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const createInvoice = async (values: Record<string, unknown>) => {
    try {
      await api('/billing/invoices', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await loadInvoices();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const issueInvoice = async (id: string) => {
    try {
      await api(`/billing/invoices/${id}/issue`, { method: 'POST' });
      toast({ type: 'success', title: t('billing.issued') });
      await loadInvoices();
    } catch (e) {
      fail(e);
    }
  };

  const addReceipt = async (values: Record<string, unknown>) => {
    if (!receiptInv) return;
    try {
      await api(`/billing/invoices/${receiptInv.id}/receipts`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('billing.receiptAdded') });
      setReceiptInv(null);
      await loadInvoices();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const collectedOf = (inv: Invoice) => inv.receipts.reduce((s, r) => s + Number(r.amount), 0);
  const invPartners = [
    ...new Set(invoices.map((i) => i.partner?.name).filter((x): x is string => !!x)),
  ].sort((a, b) => a.localeCompare(b, 'ko'));
  const invFields: FilterField[] = [
    {
      key: 'period',
      label: t('billing.flt.period'),
      type: 'date',
      options: [
        { value: 'createdAt', label: t('billing.flt.createdAt') },
        { value: 'issuedAt', label: t('billing.flt.issuedAt') },
        { value: 'dueDate', label: t('billing.flt.dueDate') },
      ],
    },
    {
      key: 'status',
      label: t('billing.flt.status'),
      type: 'multi',
      options: Object.entries(INV_STATUS).map(([value, v]) => ({ value, label: v.label })),
    },
    ...(invPartners.length
      ? [
          {
            key: 'partner',
            label: t('billing.flt.partner'),
            type: 'multi',
            options: invPartners.map((x) => ({ value: x, label: x })),
          } as FilterField,
        ]
      : []),
    ...(orgs.length > 1
      ? [
          {
            key: 'orgUnitId',
            label: t('billing.flt.branch'),
            type: 'multi',
            options: orgs,
          } as FilterField,
        ]
      : []),
    {
      key: 'outstanding',
      label: t('billing.flt.outstanding'),
      type: 'single',
      options: [
        { value: 'yes', label: t('billing.flt.has') },
        { value: 'no', label: t('billing.flt.none') },
      ],
    },
  ];
  const shownInvoices = filterRows(invoices, invFields, invFlt, (i, key) =>
    key === 'partner'
      ? (i.partner?.name ?? '')
      : key === 'outstanding'
        ? i.status !== 'CANCELED' && Number(i.amount) - collectedOf(i) > 0
          ? 'yes'
          : 'no'
        : i[key],
  );

  const marginCols: Column[] = [
    { title: t('billing.contractNo'), dataIndex: 'contractNo' },
    { title: t('billing.customer'), dataIndex: 'customerName' },
    { title: t('billing.revenue'), numeric: true, render: (r) => won(r.revenue) },
    { title: t('billing.outsourceCost'), numeric: true, render: (r) => won(r.outsourceCost) },
    {
      title: t('billing.margin'),
      numeric: true,
      render: (r) => (
        <b
          style={{
            color:
              Number(r.margin) >= 0
                ? 'var(--ark-color-text-success)'
                : 'var(--ark-color-text-danger)',
          }}
        >
          {won(r.margin)}
        </b>
      ),
    },
  ];

  const invCols: Column[] = [
    { title: t('billing.invoiceNo'), dataIndex: 'invoiceNo' },
    { title: t('billing.partner'), render: (r) => String((r as Invoice).partner?.name ?? '-') },
    { title: t('billing.title'), dataIndex: 'title' },
    { title: t('billing.amount'), numeric: true, render: (r) => won(r.amount) },
    {
      title: t('billing.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={INV_STATUS} />,
    },
    { title: t('billing.collected'), numeric: true, render: (r) => won(collectedOf(r as Invoice)) },
  ];

  const precvCols: Column[] = [
    { title: t('billing.partner'), dataIndex: 'partnerName' },
    { title: t('billing.invoiceCount'), numeric: true, render: (r) => String(r.invoiceCount) },
    { title: t('billing.billed'), numeric: true, render: (r) => won(r.billed) },
    { title: t('billing.collected'), numeric: true, render: (r) => won(r.collected) },
    {
      title: t('billing.outstanding'),
      numeric: true,
      render: (r) => <b style={{ color: 'var(--ark-color-text-danger)' }}>{won(r.outstanding)}</b>,
    },
  ];

  const invoiceFields: FormField[] = [
    {
      name: 'partnerId',
      label: t('billing.partner'),
      required: true,
      type: 'select',
      options: partners,
    },
    {
      name: 'orgUnitId',
      label: t('misc.ownerBranch'),
      alwaysShow: true,
      type: 'select',
      options: orgs,
    },
    {
      name: 'title',
      label: t('billing.title'),
      required: true,
      placeholder: t('misc.billTitlePh'),
    },
    {
      name: 'amount',
      label: t('billing.amount'),
      required: true,
      type: 'number',
      placeholder: '1000000',
    },
    { name: 'dueDate', label: t('billing.dueDate'), placeholder: 'YYYY-MM-DD' },
  ];

  const methodLabel: Record<string, string> = {
    TRANSFER: t('billing.transfer'),
    CASH: t('billing.cash'),
    CARD: t('billing.card'),
  };

  const receiptModal = (
    <FormModal
      open={!!receiptInv}
      onOpenChange={(o) => !o && setReceiptInv(null)}
      title={`${t('billing.addReceipt')} — ${receiptInv?.invoiceNo ?? ''}`}
      fields={[
        {
          name: 'amount',
          label: t('billing.amount'),
          required: true,
          type: 'number',
          placeholder: '500000',
        },
        {
          name: 'method',
          label: t('billing.method'),
          type: 'select',
          options: [
            { value: 'TRANSFER', label: t('billing.transfer') },
            { value: 'CASH', label: t('billing.cash') },
            { value: 'CARD', label: t('billing.card') },
          ],
        },
      ]}
      onSubmit={addReceipt}
    />
  );

  // 청구서 상세 — 행 끝에 두던 발행·수납 버튼을 머리글로 옮겼다
  if (detailId) {
    const d = invoices.find((r) => r.id === detailId);
    const collected = d ? collectedOf(d) : 0;
    const receiptCols: Column[] = [
      { title: t('misc.paidAt'), render: (r) => String(r.receivedAt ?? '-').slice(0, 10) },
      {
        title: t('billing.method'),
        render: (r) => methodLabel[String(r.method)] ?? String(r.method ?? '-'),
      },
      { title: t('billing.amount'), numeric: true, render: (r) => won(r.amount) },
      { title: t('misc.memo'), render: (r) => String(r.memo ?? '-') },
    ];
    return (
      <>
        <RecordDetail
          loading={!d && invLoading}
          title={d ? `${d.invoiceNo} ${d.title}` : t('misc.notFound')}
          backLabel={t('nav.billing')}
          onBack={closeDetail}
          actions={
            d ? (
              <>
                {d.status === 'DRAFT' && (
                  <Button variant="primary" size="sm" onClick={() => issueInvoice(d.id)}>
                    {t('billing.issue')}
                  </Button>
                )}
                {(d.status === 'ISSUED' || d.status === 'COLLECTED') && (
                  <Button variant="primary" size="sm" onClick={() => setReceiptInv(d)}>
                    {t('billing.addReceipt')}
                  </Button>
                )}
              </>
            ) : undefined
          }
          sections={
            d
              ? [
                  {
                    title: t('misc.invoice'),
                    items: [
                      { label: t('billing.invoiceNo'), value: d.invoiceNo },
                      {
                        label: t('billing.status'),
                        value: <StatusBadge value={d.status} map={INV_STATUS} />,
                      },
                      { label: t('billing.partner'), value: d.partner?.name },
                      {
                        label: t('misc.ownerBranch'),
                        value: orgs.find((o) => o.value === d.orgUnitId)?.label,
                      },
                      { label: t('billing.title'), value: d.title, wide: true },
                      { label: t('misc.createdAt'), value: d.createdAt?.slice(0, 10) },
                      { label: t('misc.issuedAt'), value: d.issuedAt?.slice(0, 10) },
                      { label: t('billing.dueDate'), value: d.dueDate?.slice(0, 10) },
                      { label: t('misc.memo'), value: d.memo, wide: true },
                    ],
                  },
                  {
                    title: t('misc.amount'),
                    items: [
                      { label: t('billing.amount'), value: won(d.amount) },
                      { label: t('billing.collected'), value: won(collected) },
                      { label: t('billing.outstanding'), value: won(Number(d.amount) - collected) },
                    ],
                  },
                ]
              : []
          }
        >
          {d && (
            <PageCard title={t('misc.payments')} count={d.receipts.length} plain>
              <DataTable columns={receiptCols} rows={d.receipts as unknown as Row[]} />
            </PageCard>
          )}
        </RecordDetail>
        {receiptModal}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.billing')} onRefresh={loadAll} updatedAt={updatedAt} />
      <PageCard title={t('billing.margins')} count={margin?.count ?? 0} plain>
        {margin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Badge variant="subtle" color="info">
              {t('billing.revenue')} {won(margin.revenueTotal)}
            </Badge>
            <Badge variant="subtle" color="neutral">
              {t('billing.outsourceCost')} {won(margin.outsourceCostTotal)}
            </Badge>
            <Badge variant="subtle" color="primary">
              {t('billing.margin')} {won(margin.marginTotal)}
            </Badge>
          </div>
        )}
        <DataTable columns={marginCols} rows={margin?.lines ?? []} />
      </PageCard>

      <PageCard
        title={t('billing.invoices')}
        count={shownInvoices.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setInvOpen(true)}>
            + {t('billing.newInvoice')}
          </Button>
        }
        plain
      >
        <DataTable
          columns={invCols}
          rows={shownInvoices}
          onRowClick={(r) => openDetail(String(r.id))}
          filters={<FilterButton fields={invFields} value={invFlt} onChange={setInvFlt} />}
        />
      </PageCard>

      <PageCard title={t('billing.partnerReceivables')} count={precv.length} plain>
        <DataTable columns={precvCols} rows={precv} />
      </PageCard>

      <FormModal
        open={invOpen}
        onOpenChange={setInvOpen}
        title={t('billing.newInvoice')}
        size="md"
        fields={invoiceFields}
        onSubmit={createInvoice}
      />

      {receiptModal}
    </div>
  );
}
