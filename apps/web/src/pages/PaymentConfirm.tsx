import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import {
  Badge,
  Button,
  DataTable,
  PageHeader,
  RecordDetail,
  StatusBadge,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const STATUS: StatusMap = {
  AWAITING: { label: '계약금 입금대기', color: 'warning' },
  DEPOSIT_PAID: { label: '계약금 입금', color: 'info' },
  COMPLETED: { label: '완료(잔금까지)', color: 'success' },
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

const md = (iso: unknown) =>
  iso
    ? new Date(String(iso)).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

export default function PaymentConfirm() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
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
      toast({ type: 'success', title: '입금이 자동으로 확인되었습니다(시뮬레이션)' });
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
      toast({ type: 'success', title: '입금이 확인되었습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const columns: Column[] = [
    {
      title: '고객',
      render: (r) => <span style={{ fontWeight: 600 }}>{String(r.customerName)}</span>,
    },
    {
      title: '견적/계약',
      render: (r) => (
        <span>
          {String(r.estimateNo)}
          {r.contractNo ? ` · ${String(r.contractNo)}` : ''}
        </span>
      ),
    },
    {
      title: '견적서·서명',
      render: (r) =>
        r.sentAt || r.signed ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {Boolean(r.sentAt) && (
              <span style={{ fontSize: 12, color: 'var(--ark-color-text-secondary)' }}>
                {md(r.sentAt)} 발송
              </span>
            )}
            <Badge variant="subtle" color={r.signed ? 'success' : 'neutral'}>
              {r.signed ? '서명완료' : '서명대기'}
            </Badge>
          </span>
        ) : (
          '-'
        ),
    },
    {
      title: '입금 계좌',
      render: (r) =>
        r.depositAccount ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {String(r.depositAccount)}
            {r.depositProvider === 'TOSS' && (
              <Badge variant="subtle" color="info">
                자동확인
              </Badge>
            )}
          </span>
        ) : (
          '-'
        ),
    },
    { title: '총액', numeric: true, render: (r) => won(r.totalAmount) },
    {
      title: '계약금(10%)',
      numeric: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {won(r.depositAmount)}
          {Boolean(r.depositPaid) && (
            <Badge variant="subtle" color="success">
              {r.depositPaidAt ? `${md(r.depositPaidAt)} 입금` : '완료'}
            </Badge>
          )}
        </span>
      ),
    },
    {
      title: '잔금',
      numeric: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {won(r.balanceAmount)}
          {Boolean(r.balancePaid) && (
            <Badge variant="subtle" color="success">
              완료
            </Badge>
          )}
        </span>
      ),
    },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS} /> },
  ];

  // 입금 확인 상세 — 행 끝에 두던 입금 확인·시뮬레이션 버튼과 접수 링크를 머리글로 옮겼다
  if (detailId) {
    const d = rows.find((r) => r.estimateId === detailId);
    const paidBadge = (paid: boolean, at?: string | null) =>
      paid ? (
        <Badge variant="subtle" color="success">
          {at ? `${md(at)} 입금` : '완료'}
        </Badge>
      ) : (
        <Badge variant="subtle" color="neutral">
          대기
        </Badge>
      );
    return (
      <RecordDetail
        loading={!d && loading}
        title={d ? `${d.customerName} · ${d.estimateNo}` : '찾을 수 없습니다'}
        backLabel={t('nav.paymentsConfirm')}
        onBack={closeDetail}
        actions={
          d ? (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/leads/${d.leadId}`)}>
                접수 보기
              </Button>
              {!d.depositPaid && Boolean(d.depositAccount) && d.depositProvider !== 'TOSS' && (
                <Button variant="outline" size="sm" onClick={() => simulate(d)}>
                  입금 시뮬레이션
                </Button>
              )}
              {!d.depositPaid && (
                <Button variant="primary" size="sm" onClick={() => confirm(d, 'deposit')}>
                  계약금 확인
                </Button>
              )}
              {d.depositPaid && !d.balancePaid && (
                <Button variant="primary" size="sm" onClick={() => confirm(d, 'balance')}>
                  잔금 확인
                </Button>
              )}
            </>
          ) : undefined
        }
        sections={
          d
            ? [
                {
                  title: '견적·계약',
                  items: [
                    { label: '고객', value: d.customerName },
                    { label: '견적번호', value: d.estimateNo },
                    { label: '계약번호', value: d.contractNo },
                    { label: '상태', value: <StatusBadge value={d.status} map={STATUS} /> },
                    { label: '견적서 발송', value: md(d.sentAt) },
                    {
                      label: '서명',
                      value: (
                        <Badge variant="subtle" color={d.signed ? 'success' : 'neutral'}>
                          {d.signed ? '서명완료' : '서명대기'}
                        </Badge>
                      ),
                    },
                  ],
                },
                {
                  title: '입금',
                  items: [
                    {
                      label: '입금 계좌',
                      value: d.depositAccount ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {d.depositAccount}
                          {d.depositProvider === 'TOSS' && (
                            <Badge variant="subtle" color="info">
                              자동확인
                            </Badge>
                          )}
                        </span>
                      ) : null,
                    },
                    { label: '총액', value: d.totalAmount != null ? won(d.totalAmount) : null },
                    {
                      label: '계약금(10%)',
                      value: d.depositAmount != null ? won(d.depositAmount) : null,
                    },
                    { label: '계약금 입금', value: paidBadge(d.depositPaid, d.depositPaidAt) },
                    {
                      label: '잔금',
                      value: d.balanceAmount != null ? won(d.balanceAmount) : null,
                    },
                    { label: '잔금 입금', value: paidBadge(d.balancePaid) },
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
        subtitle="고객에게 견적서를 보내면 여기에 올라옵니다 · 계약금이 들어오면 자동으로 '계약금 입금'으로 바뀝니다"
        onRefresh={load}
        updatedAt={updatedAt}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey="estimateId"
        loading={loading}
        onRowClick={(r) => openDetail(String(r.estimateId))}
      />
    </div>
  );
}
