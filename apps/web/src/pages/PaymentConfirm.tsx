import i18n from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import {
  Badge,
  Button,
  DataTable,
  FilterButton,
  filterRows,
  PageHeader,
  RecordDetail,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
} from '../components/ui';
import { fs } from '../lib/fontScale';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const STATUS: StatusMap = {
  AWAITING: { label: i18n.t('pay.st.waiting'), color: 'warning' },
  DEPOSIT_PAID: { label: i18n.t('pay.st.deposit'), color: 'info' },
  COMPLETED: { label: i18n.t('pay.st.done'), color: 'success' },
};

interface PayRow extends Row {
  estimateId: string;
  estimateNo: string;
  contractNo: string | null;
  customerName: string;
  totalAmount: number | null;
  depositAmount: number | null;
  balanceAmount: number | null;
  depositPaid: boolean;
  balancePaid: boolean;
  status: string;
  leadId: string;
  sentAt: string | null;
  signed: boolean;
  depositAccount: string | null;
  depositProvider: string | null;
  depositPaidAt: string | null;
}

const md = (iso: unknown) => fmtDateTime(iso);

export default function PaymentConfirm() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  const [flt, setFlt] = useState<FilterValues>({});
  // 상세는 견적 단위(?detail=<estimateId>) — 목록 행 키와 같다
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<PayRow[]>('/payment-confirmations'));
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

  // 시연 — 고객이 계좌이체했다고 치고 자동 입금확인(웹훅과 같은 처리)을 태운다
  const simulate = async (r: Row) => {
    try {
      await api(`/estimates/${String(r.estimateId)}/simulate-deposit`, { method: 'POST' });
      toast({ type: 'success', title: t('pay.simulated') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  // 고객이 서명·입금하면 상태가 저절로 바뀌므로 화면을 열어 둔 동안 가끔 다시 읽는다
  useEffect(() => {
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const confirm = async (r: Row, kind: 'deposit' | 'balance') => {
    try {
      await api(`/payment-confirmations/${String(r.estimateId)}/${kind}`, { method: 'POST' });
      toast({ type: 'success', title: t('pay.confirmed') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const columns: Column[] = [
    {
      title: t('pay.customer'),
      render: (r) => <span style={{ fontWeight: 600 }}>{String(r.customerName)}</span>,
    },
    {
      title: t('pay.estContract'),
      render: (r) => (
        <span>
          {String(r.estimateNo)}
          {r.contractNo ? ` · ${String(r.contractNo)}` : ''}
        </span>
      ),
    },
    {
      title: t('pay.estSign'),
      render: (r) =>
        r.sentAt || r.signed ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {Boolean(r.sentAt) && (
              <span style={{ fontSize: fs(12), color: 'var(--ark-color-text-secondary)' }}>
                {md(r.sentAt)} {t('pay.sent')}
              </span>
            )}
            <Badge variant="subtle" color={r.signed ? 'success' : 'neutral'}>
              {r.signed ? t('pay.signed') : t('pay.awaitingSign')}
            </Badge>
          </span>
        ) : (
          '-'
        ),
    },
    {
      title: t('pay.account'),
      render: (r) =>
        r.depositAccount ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {String(r.depositAccount)}
            {r.depositProvider === 'TOSS' && (
              <Badge variant="subtle" color="info">
                {t('pay.auto')}
              </Badge>
            )}
          </span>
        ) : (
          '-'
        ),
    },
    { title: t('pay.total'), numeric: true, render: (r) => won(r.totalAmount) },
    {
      title: t('pay.deposit10'),
      numeric: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {won(r.depositAmount)}
          {Boolean(r.depositPaid) && (
            <Badge variant="subtle" color="success">
              {r.depositPaidAt ? t('pay.paidOn', { v0: md(r.depositPaidAt) }) : t('pay.done')}
            </Badge>
          )}
        </span>
      ),
    },
    {
      title: t('pay.balance'),
      numeric: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {won(r.balanceAmount)}
          {Boolean(r.balancePaid) && (
            <Badge variant="subtle" color="success">
              {t('pay.done')}
            </Badge>
          )}
        </span>
      ),
    },
    {
      title: t('pay.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS} />,
    },
  ];

  const filterFields: FilterField[] = [
    {
      key: 'period',
      label: t('pay.flt.period'),
      type: 'date',
      options: [
        { value: 'sentAt', label: t('pay.estimateSent') },
        { value: 'depositPaidAt', label: t('pay.flt.depositPaidAt') },
      ],
    },
    {
      key: 'status',
      label: t('pay.status'),
      type: 'multi',
      options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
    },
    {
      key: 'signed',
      label: t('pay.signature'),
      type: 'single',
      options: [
        { value: 'yes', label: t('pay.signed') },
        { value: 'no', label: t('pay.awaitingSign') },
      ],
    },
    {
      key: 'method',
      label: t('pay.flt.method'),
      type: 'single',
      options: [
        { value: 'auto', label: t('pay.flt.auto') },
        { value: 'manual', label: t('pay.flt.manual') },
      ],
    },
  ];
  const shown = filterRows(rows, filterFields, flt, (r, key) =>
    key === 'signed'
      ? r.signed
        ? 'yes'
        : 'no'
      : key === 'method'
        ? r.depositProvider === 'TOSS'
          ? 'auto'
          : 'manual'
        : r[key],
  );

  // 입금 확인 상세 — 행 끝에 두던 입금 확인·시뮬레이션 버튼과 접수 링크를 머리글로 옮겼다
  if (detailId) {
    const d = rows.find((r) => r.estimateId === detailId);
    const paidBadge = (paid: boolean, at?: string | null) =>
      paid ? (
        <Badge variant="subtle" color="success">
          {at ? t('pay.paidOn', { v0: md(at) }) : t('pay.done')}
        </Badge>
      ) : (
        <Badge variant="subtle" color="neutral">
          {t('pay.waiting')}
        </Badge>
      );
    return (
      <RecordDetail
        loading={!d && loading}
        title={d ? `${d.customerName} · ${d.estimateNo}` : t('pay.notFound')}
        backLabel={t('nav.paymentsConfirm')}
        onBack={closeDetail}
        actions={
          d ? (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/leads/${d.leadId}`)}>
                {t('pay.viewLead')}
              </Button>
              {!d.depositPaid && Boolean(d.depositAccount) && d.depositProvider !== 'TOSS' && (
                <Button variant="outline" size="sm" onClick={() => simulate(d)}>
                  {t('pay.simulate')}
                </Button>
              )}
              {!d.depositPaid && (
                <Button variant="primary" size="sm" onClick={() => confirm(d, 'deposit')}>
                  {t('pay.confirmDeposit')}
                </Button>
              )}
              {d.depositPaid && !d.balancePaid && (
                <Button variant="primary" size="sm" onClick={() => confirm(d, 'balance')}>
                  {t('pay.confirmBalance')}
                </Button>
              )}
            </>
          ) : undefined
        }
        sections={
          d
            ? [
                {
                  title: t('pay.estContract2'),
                  items: [
                    { label: t('pay.customer'), value: d.customerName },
                    { label: t('pay.estimateNo'), value: d.estimateNo },
                    { label: t('pay.contractNo'), value: d.contractNo },
                    {
                      label: t('pay.status'),
                      value: <StatusBadge value={d.status} map={STATUS} />,
                    },
                    { label: t('pay.estimateSent'), value: md(d.sentAt) },
                    {
                      label: t('pay.signature'),
                      value: (
                        <Badge variant="subtle" color={d.signed ? 'success' : 'neutral'}>
                          {d.signed ? t('pay.signed') : t('pay.awaitingSign')}
                        </Badge>
                      ),
                    },
                  ],
                },
                {
                  title: t('pay.payment'),
                  items: [
                    {
                      label: t('pay.account'),
                      value: d.depositAccount ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {d.depositAccount}
                          {d.depositProvider === 'TOSS' && (
                            <Badge variant="subtle" color="info">
                              {t('pay.auto')}
                            </Badge>
                          )}
                        </span>
                      ) : null,
                    },
                    {
                      label: t('pay.total'),
                      value: d.totalAmount != null ? won(d.totalAmount) : null,
                    },
                    {
                      label: t('pay.deposit10'),
                      value: d.depositAmount != null ? won(d.depositAmount) : null,
                    },
                    {
                      label: t('pay.st.deposit'),
                      value: paidBadge(d.depositPaid, d.depositPaidAt),
                    },
                    {
                      label: t('pay.balance'),
                      value: d.balanceAmount != null ? won(d.balanceAmount) : null,
                    },
                    { label: t('pay.balancePaid'), value: paidBadge(d.balancePaid) },
                  ],
                },
              ]
            : []
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('nav.paymentsConfirm')}
        subtitle={t('pay.subtitle')}
        onRefresh={load}
        updatedAt={updatedAt}
      />
      <DataTable
        filters={<FilterButton fields={filterFields} value={flt} onChange={setFlt} />}
        columns={columns}
        rows={shown}
        rowKey="estimateId"
        loading={loading}
        onRowClick={(r) => openDetail(String(r.estimateId))}
      />
    </div>
  );
}
