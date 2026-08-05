import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  AddressView,
  Badge,
  Button,
  FormModal,
  PageCard,
  PageHeader,
  Spinner,
  StatusBadge,
  useToast,
  type FormField,
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
  orgUnitId?: string | null;
  customerId?: string | null;
  source?: string | null;
  serviceLine?: string | null;
  fromZipcode?: string | null;
  fromAddr?: string | null;
  fromAddrDetail?: string | null;
  fromSido?: string | null;
  fromSigungu?: string | null;
  fromLat?: number | null;
  fromLng?: number | null;
  toZipcode?: string | null;
  toAddr?: string | null;
  toAddrDetail?: string | null;
  toSido?: string | null;
  toSigungu?: string | null;
  toLat?: number | null;
  toLng?: number | null;
  customer?: { name: string; phonePrimary?: string | null } | null;
  estimates: Estimate[];
  contracts: Contract[];
  workOrders: WorkOrder[];
  supportTickets: Ticket[];
}

// 견적 생성 시 리드의 구조적 주소(우편번호·도로명·상세·시도/시군구·좌표)를 승계
const ADDR_KEYS = [
  'fromZipcode',
  'fromAddr',
  'fromAddrDetail',
  'fromSido',
  'fromSigungu',
  'fromLat',
  'fromLng',
  'toZipcode',
  'toAddr',
  'toAddrDetail',
  'toSido',
  'toSigungu',
  'toLat',
  'toLng',
] as const;

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
  title,
  empty,
  actions,
  children,
}: {
  title: string;
  empty?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PageCard title={title} actions={actions}>
      {empty ? (
        <span style={{ color: 'var(--ark-color-text-tertiary)' }}>아직 진행 전</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
      )}
    </PageCard>
  );
}

// 리드 상태 → 케이스 흐름 4단계 그룹 (Leads.tsx STAGES와 동일한 그룹핑)
const STAGE_GROUPS = [
  ['RECEIVED', 'CONSULT_ASSIGNED', 'CONSULT_TOSS'],
  ['QUOTED'],
  ['CONTRACTED'],
  ['WORK_TOSS', 'IN_PROGRESS', 'DONE'],
];

/** 리드 현재 상태로 몇 번째 단계(접수=0/견적=1/계약=2/작업=3)가 진행중인지 계산. */
function currentStageIndex(status: string): number {
  const idx = STAGE_GROUPS.findIndex((g) => g.includes(status));
  return idx === -1 ? 0 : idx;
}

/** 큰 사각형 버튼 스텝 네비게이션 — 클릭으로 자유롭게 이동, 선택된 단계는 배경색으로 표시. */
function StepNav({
  steps,
  active,
  completedIndex,
  onChange,
}: {
  steps: { step: number; label: string; count: number }[];
  active: number;
  completedIndex: number;
  onChange: (step: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
      {steps.map((s, i) => {
        const isActive = s.step === active;
        const isDone = i < completedIndex && !isActive;
        return (
          <Fragment key={s.step}>
            <button
              type="button"
              onClick={() => onChange(s.step)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '16px 18px',
                border: 'none',
                borderRadius: 10,
                background: isActive
                  ? 'color-mix(in srgb, var(--ark-color-primary-500) 5%, transparent)'
                  : 'var(--ark-color-bg-subtle)',
                color: isActive ? 'var(--ark-color-primary-500)' : 'var(--ark-color-text)',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                transition: 'background .15s ease',
              }}
            >
              {isDone && <Check size={16} />}
              <span>
                {s.step}. {s.label}
              </span>
              {s.count > 0 && (
                <Badge variant="subtle" color="primary">
                  {s.count}
                </Badge>
              )}
            </button>
            {i < steps.length - 1 && (
              <ChevronRight
                size={22}
                style={{ color: 'var(--ark-color-text-tertiary)', flexShrink: 0, alignSelf: 'center' }}
              />
            )}
          </Fragment>
        );
      })}
    </div>
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
  const [transOpen, setTransOpen] = useState(false);
  const [estOpen, setEstOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const { updatedAt, touch } = useUpdatedAt();
  const customers = useOptions('/customers', 'name');
  const products = useOptions('/products', 'name');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<LeadCase>(`/leads/${id}/case`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [id, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onTransition = async (values: Record<string, unknown>) => {
    try {
      await api(`/leads/${id}/transition`, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      setTransOpen(false);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onCreateEstimate = async (values: Record<string, unknown>) => {
    if (!data) return;
    try {
      const inheritedAddr = Object.fromEntries(
        ADDR_KEYS.filter((kk) => data[kk] != null).map((kk) => [kk, data[kk]]),
      );
      const created = await api<{ id: string }>('/estimates', {
        method: 'POST',
        body: JSON.stringify({
          leadId: data.id,
          orgUnitId: data.orgUnitId,
          ...inheritedAddr,
          ...values,
        }),
      });
      toast({ type: 'success', title: t('common.created') });
      setEstOpen(false);
      navigate(`/estimates/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={data.leadNo}
        subtitle={`한 건의 여정을 접수번호 ${data.leadNo} 로 추적합니다`}
        breadcrumbs={[{ label: t('nav.leads'), onClick: () => navigate('/leads') }]}
        onRefresh={load}
        updatedAt={updatedAt}
        tags={
          <>
            <StatusBadge value={data.status} map={LEAD_STATUS} />
            {data.customer && (
              <Badge variant="subtle" color="info">
                {data.customer.name}
                {data.customer.phonePrimary ? ` · ${data.customer.phonePrimary}` : ''}
              </Badge>
            )}
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => setTransOpen(true)}>
            {t('lead.changeStatus')}
          </Button>
        }
      />

      <StepNav
        active={activeStep}
        onChange={setActiveStep}
        completedIndex={currentStageIndex(data.status)}
        steps={[
          { step: 1, label: '접수', count: 0 },
          { step: 2, label: '견적', count: data.estimates.length },
          { step: 3, label: '계약', count: data.contracts.length },
          { step: 4, label: '작업', count: data.workOrders.length },
        ]}
      />

      {activeStep === 1 && (
        <Stage title="1. 접수">
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
      )}

      {activeStep === 2 && (
        <Stage
          title="2. 견적"
          empty={data.estimates.length === 0}
          actions={
            <Button variant="primary" size="sm" onClick={() => setEstOpen(true)}>
              + {t('lead.toEstimate')}
            </Button>
          }
        >
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
      )}

      {activeStep === 3 && (
        <Stage title="3. 계약" empty={data.contracts.length === 0}>
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
      )}

      {activeStep === 4 && (
        <Stage title="4. 작업" empty={data.workOrders.length === 0}>
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
      )}

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

      <FormModal
        open={transOpen}
        onOpenChange={setTransOpen}
        title={`${t('lead.changeStatus')} — ${data.leadNo}`}
        fields={[
          {
            name: 'to',
            label: '변경할 상태',
            required: true,
            type: 'select',
            options: Object.entries(LEAD_STATUS).map(([value, s]) => ({
              value,
              label: s.label,
            })),
          },
        ]}
        onSubmit={onTransition}
      />

      <FormModal
        open={estOpen}
        onOpenChange={setEstOpen}
        title={`${t('lead.toEstimate')} — ${data.leadNo}`}
        size="md"
        initialValues={data.customerId ? { customerId: data.customerId } : undefined}
        fields={
          [
            {
              name: 'customerId',
              label: '고객',
              required: true,
              type: 'select',
              options: customers,
            },
            {
              name: 'productId',
              label: '이사상품',
              required: true,
              type: 'select',
              options: products,
            },
            { name: 'fromPyeong', label: '출발지 평수', type: 'number' },
            { name: 'toPyeong', label: '도착지 평수', type: 'number' },
          ] as FormField[]
        }
        onSubmit={onCreateEstimate}
      />
    </div>
  );
}
