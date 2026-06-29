import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import {
  AddressView,
  Badge,
  Button,
  PageCard,
  Spinner,
  StatusBadge,
  useToast,
  type StatusMap,
} from '../components/ui';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const LEAD_STATUS: StatusMap = {
  RECEIVED: { label: '접수', color: 'neutral' },
  CONSULT_ASSIGNED: { label: '상담배정', color: 'info' },
  CONSULT_TOSS: { label: '상담토스', color: 'info' },
  QUOTED: { label: '견적완료', color: 'warning' },
  CONTRACTED: { label: '계약', color: 'primary' },
  WORK_TOSS: { label: '작업토스', color: 'primary' },
  IN_PROGRESS: { label: '작업중', color: 'info' },
  DONE: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};
const EST_STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  QUOTED: { label: '견적완료', color: 'success' },
};
const CONTRACT_STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  SIGNED: { label: '서명완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};
const WORK_STATUS: StatusMap = {
  ASSIGNED: { label: '배정', color: 'neutral' },
  IN_PROGRESS: { label: '작업중', color: 'info' },
  DONE: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};

interface Estimate {
  id: string;
  estimateNo: string;
  status: string;
  totalCbm: string | number;
  totalAmount: string | number | null;
}
interface Payment {
  id: string;
  kind: string;
  amount: string | number;
  status: string;
}
interface Contract {
  id: string;
  contractNo: string;
  status: string;
  totalAmount: string | number;
  payments: Payment[];
}
interface Ticket {
  id: string;
  kind: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
}
interface WorkOrder {
  id: string;
  workNo: string;
  status: string;
  scheduledDate: string | null;
}
interface LeadCase {
  id: string;
  leadNo: string;
  status: string;
  source?: string | null;
  serviceLine?: string | null;
  fromZipcode?: string | null;
  fromAddr?: string | null;
  fromAddrDetail?: string | null;
  fromLat?: number | null;
  fromLng?: number | null;
  toZipcode?: string | null;
  toAddr?: string | null;
  toAddrDetail?: string | null;
  toLat?: number | null;
  toLng?: number | null;
  customer?: { name: string; phonePrimary?: string | null } | null;
  estimates: Estimate[];
  contracts: Contract[];
  workOrders: WorkOrder[];
  supportTickets: Ticket[];
}

const PAY_STATUS: StatusMap = {
  PENDING: { label: '대기', color: 'warning' },
  PAID: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};
const TICKET_STATUS: StatusMap = {
  RECEIVED: { label: '접수', color: 'neutral' },
  IN_PROGRESS: { label: '처리중', color: 'info' },
  RESOLVED: { label: '해결', color: 'success' },
  CLOSED: { label: '종료', color: 'neutral' },
  CANCELED: { label: '취소', color: 'error' },
};
const PAY_KIND: Record<string, string> = { DEPOSIT: '계약금', BALANCE: '잔금' };

/** 문서흐름 한 단계(카드). 비어 있으면 안내. */
function Stage({
  step,
  title,
  empty,
  children,
}: {
  step: number;
  title: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PageCard title={`${step}. ${title}`}>
      {empty ? (
        <span style={{ color: 'var(--ark-color-text-tertiary)' }}>아직 진행 전</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
      )}
    </PageCard>
  );
}

function DocRow({
  no,
  badge,
  info,
  onOpen,
}: {
  no: string;
  badge: React.ReactNode;
  info: string;
  onOpen?: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        border: '1px solid var(--ark-color-gray-200)',
        borderRadius: 8,
      }}
    >
      <b style={{ minWidth: 160 }}>{no}</b>
      {badge}
      <span style={{ color: 'var(--ark-color-text-secondary)', flex: 1 }}>{info}</span>
      {onOpen && (
        <Button variant="outline" size="sm" onClick={onOpen}>
          열기 →
        </Button>
      )}
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<LeadCase | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<LeadCase>(`/leads/${id}/case`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [id, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
          ← {t('nav.leads')}
        </Button>
        <h3 style={{ margin: 0 }}>{data.leadNo}</h3>
        <StatusBadge value={data.status} map={LEAD_STATUS} />
        {data.customer && (
          <Badge variant="subtle" color="info">
            {data.customer.name}
            {data.customer.phonePrimary ? ` · ${data.customer.phonePrimary}` : ''}
          </Badge>
        )}
        <span style={{ color: 'var(--ark-color-text-tertiary)' }}>
          한 건의 여정을 접수번호 {data.leadNo} 로 추적합니다
        </span>
      </div>

      <Stage step={1} title="접수">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>
            출처 {String(data.source ?? '-')} · 서비스 {String(data.serviceLine ?? '-')}
          </span>
          {(data.fromAddr || data.toAddr) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <AddressView
                label="출발"
                zipcode={data.fromZipcode}
                addr={data.fromAddr}
                addrDetail={data.fromAddrDetail}
                lat={data.fromLat}
                lng={data.fromLng}
              />
              <AddressView
                label="도착"
                zipcode={data.toZipcode}
                addr={data.toAddr}
                addrDetail={data.toAddrDetail}
                lat={data.toLat}
                lng={data.toLng}
              />
            </div>
          )}
        </div>
      </Stage>

      <Stage step={2} title="견적" empty={data.estimates.length === 0}>
        {data.estimates.map((e) => (
          <DocRow
            key={e.id}
            no={e.estimateNo}
            badge={<StatusBadge value={e.status} map={EST_STATUS} />}
            info={`물량 ${String(e.totalCbm)}CBM · 금액 ${won(e.totalAmount)}`}
            onOpen={() => navigate(`/estimates/${e.id}`)}
          />
        ))}
      </Stage>

      <Stage step={3} title="계약" empty={data.contracts.length === 0}>
        {data.contracts.map((c) => (
          <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <DocRow
              no={c.contractNo}
              badge={<StatusBadge value={c.status} map={CONTRACT_STATUS} />}
              info={`총액 ${won(c.totalAmount)}`}
              onOpen={() => navigate(`/contracts/${c.id}`)}
            />
            {c.payments.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 12 }}>
                {c.payments.map((p) => (
                  <Badge key={p.id} variant="subtle" color={PAY_STATUS[p.status]?.color}>
                    {PAY_KIND[p.kind] ?? p.kind} {won(p.amount)} ·{' '}
                    {PAY_STATUS[p.status]?.label ?? p.status}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </Stage>

      <Stage step={4} title="작업" empty={data.workOrders.length === 0}>
        {data.workOrders.map((w) => (
          <DocRow
            key={w.id}
            no={w.workNo}
            badge={<StatusBadge value={w.status} map={WORK_STATUS} />}
            info={`작업예정일 ${String(w.scheduledDate ?? '-').slice(0, 10)}`}
            onOpen={() => navigate(`/work-orders/${w.id}`)}
          />
        ))}
      </Stage>

      {data.supportTickets.length > 0 && (
        <PageCard title={`CS·AS 이력 (${data.supportTickets.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.supportTickets.map((tk) => (
              <DocRow
                key={tk.id}
                no={`${tk.kind === 'AS' ? 'AS' : 'CS'} · ${tk.subject}`}
                badge={<StatusBadge value={tk.status} map={TICKET_STATUS} />}
                info={String(tk.createdAt).slice(0, 10)}
              />
            ))}
          </div>
        </PageCard>
      )}
    </div>
  );
}
