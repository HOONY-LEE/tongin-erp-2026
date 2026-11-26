import i18n from '../i18n';
import { useCallback, useEffect, useState, useRef, type ReactNode } from 'react';
import { FileSignature, FileText } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { fmtDateTime } from '../lib/dateFormat';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { filterQuery, LIST_LIMIT } from '../lib/serverFilter';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import {
  Badge,
  Button,
  DataTable,
  FilterButton,
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

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const STATUS: StatusMap = {
  AWAITING: { label: i18n.t('pay.st.waiting'), color: 'warning' },
  DEPOSIT_PAID: { label: i18n.t('pay.st.deposit'), color: 'info' },
  COMPLETED: { label: i18n.t('pay.st.done'), color: 'success' },
};

interface PayRow extends Row {
  estimateId: string;
  estimateNo: string;
  contractId: string | null;
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

/** 표 안 문서 바로가기 — 아이콘 + 번호. 누르면 그 견적·계약 화면으로(행 클릭 상세는 열리지 않는다) */
function DocLink({
  icon,
  label,
  title,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 0,
        border: 0,
        background: 'none',
        color: 'var(--ark-color-info-600, #2563eb)',
        cursor: 'pointer',
        font: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{label}</span>
    </button>
  );
}

export default function PaymentConfirm() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  // 입금처리는 입금 수정 권한이 있는 사람만(없으면 상태만 본다)
  const canPay = can('PAYMENT.UPDATE');
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  const [flt, setFlt] = useState<FilterValues>({});
  /** 검색칸 — 서버에서 찾는다(견적번호·계약번호·고객명·전화) */
  const [q, setQ] = useState('');
  const query = filterQuery(flt, q);
  // 상세는 견적 단위(?detail=<estimateId>) — 목록 행 키와 같다
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();

  // 필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const data = await api<PayRow[]>(`/payment-confirmations${query}`);
      if (my !== seq.current) return;
      setRows(data);
      touch();
    } catch (e) {
      if (my === seq.current)
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [toast, t, query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
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
    // 돈이 들어왔다고 확정하는 일이라 한 번 더 묻는다(계약금 입금 = 계약 성립)
    const amount = won(kind === 'deposit' ? r.depositAmount : r.balanceAmount);
    const q = kind === 'deposit' ? 'pay.markDepositQ' : 'pay.markBalanceQ';
    if (!window.confirm(t(q, { v0: String(r.customerName), v1: amount }))) return;
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
      width: 100,
      render: (r) => <span style={{ fontWeight: 600 }}>{String(r.customerName)}</span>,
    },
    // 견적·계약은 칸을 나눠 아이콘 + 번호로 — 누르면 그 화면으로 간다
    {
      title: t('pay.estimate'),
      width: 160,
      exportValue: (r) => String(r.estimateNo),
      render: (r) => (
        <DocLink
          icon={<FileText size={14} aria-hidden />}
          label={String(r.estimateNo)}
          title={t('pay.openEstimate')}
          onClick={() => navigate(`/estimates/${String(r.estimateId)}`)}
        />
      ),
    },
    {
      title: t('pay.contract'),
      width: 160,
      exportValue: (r) => (r.contractNo ? String(r.contractNo) : null),
      render: (r) =>
        r.contractId && r.contractNo ? (
          <DocLink
            icon={<FileSignature size={14} aria-hidden />}
            label={String(r.contractNo)}
            title={t('pay.openContract')}
            onClick={() => navigate(`/contracts/${String(r.contractId)}`)}
          />
        ) : (
          '-'
        ),
    },
    // 서명은 상태만(서명완료·서명대기) — 보낸 날짜는 상세에서 본다
    {
      title: t('pay.signature'),
      width: 90,
      render: (r) =>
        r.sentAt || r.signed ? (
          <Badge variant="subtle" color={r.signed ? 'success' : 'neutral'}>
            {r.signed ? t('pay.signed') : t('pay.awaitingSign')}
          </Badge>
        ) : (
          '-'
        ),
    },
    {
      title: t('pay.account'),
      width: 170,
      render: (r) => (r.depositAccount ? String(r.depositAccount) : '-'),
    },
    { title: t('pay.total'), numeric: true, width: 110, render: (r) => won(r.totalAmount) },
    { title: t('pay.deposit10'), numeric: true, width: 110, render: (r) => won(r.depositAmount) },
    // 계약금·잔금 입금은 칸을 나눠 각각 처리 — 들어왔으면 입금일, 아니면 입금처리 버튼
    {
      title: t('pay.depositPay'),
      width: 130,
      exportValue: (r) =>
        r.depositPaid ? (r.depositPaidAt ? md(r.depositPaidAt) : t('pay.done')) : t('pay.waiting'),
      render: (r) =>
        r.depositPaid ? (
          <Badge variant="subtle" color="success">
            {r.depositPaidAt ? t('pay.paidOn', { v0: md(r.depositPaidAt) }) : t('pay.done')}
          </Badge>
        ) : canPay ? (
          <Button variant="outline" size="sm" onClick={() => void confirm(r, 'deposit')}>
            {t('pay.markPaid')}
          </Button>
        ) : (
          <Badge variant="subtle" color="neutral">
            {t('pay.waiting')}
          </Badge>
        ),
    },
    { title: t('pay.balance'), numeric: true, width: 110, render: (r) => won(r.balanceAmount) },
    {
      title: t('pay.balancePay'),
      width: 110,
      exportValue: (r) => (r.balancePaid ? t('pay.done') : t('pay.waiting')),
      render: (r) =>
        r.balancePaid ? (
          <Badge variant="subtle" color="success">
            {t('pay.done')}
          </Badge>
        ) : canPay ? (
          <span title={r.depositPaid ? undefined : t('pay.depositFirst')}>
            <Button
              variant="outline"
              size="sm"
              disabled={!r.depositPaid}
              onClick={() => void confirm(r, 'balance')}
            >
              {t('pay.markPaid')}
            </Button>
          </span>
        ) : (
          <Badge variant="subtle" color="neutral">
            {t('pay.waiting')}
          </Badge>
        ),
    },
    {
      title: t('pay.status'),
      width: 140,
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
                      value: d.depositAccount ?? null,
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
        rows={rows}
        rowKey="estimateId"
        loading={loading}
        onRowClick={(r) => openDetail(String(r.estimateId))}
      />
    </div>
  );
}
