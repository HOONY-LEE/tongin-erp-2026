import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
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

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const INV_STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  ISSUED: { label: '발행', color: 'warning' },
  COLLECTED: { label: '수금완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

interface Receipt {
  amount: string | number;
}
interface Invoice extends Row {
  id: string;
  invoiceNo: string;
  title: string;
  amount: string | number;
  status: string;
  dueDate?: string | null;
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
  const partners = useOptions('/partners', 'name');

  const [margin, setMargin] = useState<MarginResult | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [precv, setPrecv] = useState<PartnerRecv[]>([]);
  const [invOpen, setInvOpen] = useState(false);
  const [receiptInv, setReceiptInv] = useState<Invoice | null>(null);

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
    }
  }, [fail]);

  useEffect(() => {
    void (async () => {
      try {
        setMargin(await api<MarginResult>('/billing/margins'));
      } catch (e) {
        fail(e);
      }
    })();
    void loadInvoices();
  }, [loadInvoices, fail]);

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
    {
      title: '',
      render: (r) => {
        const inv = r as Invoice;
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            {inv.status === 'DRAFT' && (
              <Button variant="outline" size="sm" onClick={() => issueInvoice(inv.id)}>
                {t('billing.issue')}
              </Button>
            )}
            {(inv.status === 'ISSUED' || inv.status === 'COLLECTED') && (
              <Button variant="primary" size="sm" onClick={() => setReceiptInv(inv)}>
                {t('billing.addReceipt')}
              </Button>
            )}
          </div>
        );
      },
    },
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
    { name: 'title', label: t('billing.title'), required: true, placeholder: '6월 전속 작업비' },
    {
      name: 'amount',
      label: t('billing.amount'),
      required: true,
      type: 'number',
      placeholder: '1000000',
    },
    { name: 'dueDate', label: t('billing.dueDate'), placeholder: 'YYYY-MM-DD' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageCard title={t('billing.margins')} count={margin?.count ?? 0}>
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
        count={invoices.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setInvOpen(true)}>
            + {t('billing.newInvoice')}
          </Button>
        }
      >
        <DataTable columns={invCols} rows={invoices} />
      </PageCard>

      <PageCard title={t('billing.partnerReceivables')} count={precv.length}>
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
    </div>
  );
}
