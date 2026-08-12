import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, ChevronRight, Pencil } from 'lucide-react';
import { LEAD_TRANSITIONS, type LeadStatus } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { formatPhone } from '../lib/phone';
import { josaRo } from '../lib/korean';
import { LEAD_STATUS, RECEIPT_SOURCES, SERVICE_LINES, codeLabel } from '../lib/leadCodes';
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

const won = (v: unknown) => (v != null ? `${Number(v).toLocaleString()}원` : '-');
const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : '-');
/** 타임스탬프를 사용자 로컬 시각으로. (서버는 UTC로 내려준다) */
const ymdhm = (v: unknown) => {
  if (!v) return '-';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  createdAt?: string;
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
  signedAt?: string | null;
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
interface Named {
  id: string;
  name: string;
}
interface LeadCase {
  id: string;
  leadNo: string;
  status: string;
  createdAt?: string;
  orgUnitId?: string | null;
  customerId?: string | null;
  ownerEmpId?: string | null;
  partnerId?: string | null;
  source?: string | null;
  serviceLine?: string | null;
  moveDate?: string | null;
  visitDate?: string | null;
  expectedAmount?: string | number | null;
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
  customer?: { id: string; name: string; phonePrimary?: string | null } | null;
  orgUnit?: Named | null;
  ownerEmp?: Named | null;
  partner?: Named | null;
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

/** 라벨-값 한 칸. 값이 비면 흐린 '-'. */
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children == null || children === '-' || children === '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--ark-color-text-tertiary)' }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          color: empty ? 'var(--ark-color-text-tertiary)' : 'var(--ark-color-text)',
          wordBreak: 'break-word',
        }}
      >
        {empty ? '-' : children}
      </span>
    </div>
  );
}

/** 반응형 정보 그리드 — 화면이 좁아지면 칸 수가 자동으로 줄어든다. */
function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px 24px',
      }}
    >
      {children}
    </div>
  );
}

/** 아직 문서가 없는 단계 — 왜 비었는지와 다음에 뭘 해야 하는지를 같이 보여준다. */
function EmptyStage({
  message,
  hint,
  action,
}: {
  message: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '32px 16px',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600 }}>{message}</span>
      {hint && (
        <span style={{ fontSize: 13, color: 'var(--ark-color-text-tertiary)', maxWidth: 420 }}>
          {hint}
        </span>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
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
                style={{
                  color: 'var(--ark-color-text-tertiary)',
                  flexShrink: 0,
                  alignSelf: 'center',
                }}
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
  const [editOpen, setEditOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const { updatedAt, touch } = useUpdatedAt();
  const customers = useOptions('/customers', 'name');
  const products = useOptions('/products', 'name');
  const employees = useOptions('/employees', 'name');
  const partners = useOptions('/partners', 'name');

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

  const changeStatus = async (to: string) => {
    try {
      await api(`/leads/${id}/transition`, { method: 'POST', body: JSON.stringify({ to }) });
      toast({
        type: 'success',
        title: `상태를 '${LEAD_STATUS[to]?.label ?? to}'(으)로 변경했습니다`,
      });
      setTransOpen(false);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onEdit = async (values: Record<string, unknown>) => {
    try {
      await api(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.saved') });
      setEditOpen(false);
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

  const stageIndex = currentStageIndex(data.status);
  // 처음 열면 진행중인 단계를 펼쳐 준다(그 뒤에는 사용자가 고른 단계를 유지).
  const step = activeStep ?? stageIndex + 1;

  const allowed = (LEAD_TRANSITIONS[data.status as LeadStatus] ?? []) as string[];
  const nextStatus = allowed.find((s) => s !== 'CANCELED');
  const nextLabel = nextStatus ? (LEAD_STATUS[nextStatus]?.label ?? nextStatus) : '';

  const editInitial: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (v != null && v !== '') editInitial[k] = String(v);
  };
  put('customerId', data.customerId);
  put('ownerEmpId', data.ownerEmpId);
  put('partnerId', data.partnerId);
  put('source', data.source);
  put('serviceLine', data.serviceLine);
  put('moveDate', ymd(data.moveDate) === '-' ? '' : ymd(data.moveDate));
  put('visitDate', ymd(data.visitDate) === '-' ? '' : ymd(data.visitDate));
  for (const k of ADDR_KEYS) put(k, data[k]);

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
                {data.customer.phonePrimary ? ` · ${formatPhone(data.customer.phonePrimary)}` : ''}
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {nextStatus && (
              <Button variant="primary" size="sm" onClick={() => void changeStatus(nextStatus)}>
                {nextLabel}
                {josaRo(nextLabel)} 진행
                <ArrowRight size={14} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
              </Button>
            )}
            {allowed.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setTransOpen(true)}>
                {t('lead.changeStatus')}
              </Button>
            )}
          </>
        }
      />

      <StepNav
        active={step}
        onChange={setActiveStep}
        completedIndex={stageIndex}
        steps={[
          { step: 1, label: '접수', count: 0 },
          { step: 2, label: '견적', count: data.estimates.length },
          { step: 3, label: '계약', count: data.contracts.length },
          { step: 4, label: '작업', count: data.workOrders.length },
        ]}
      />

      {step === 1 && (
        <>
          <PageCard
            title="접수 정보"
            actions={
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                수정
              </Button>
            }
          >
            <FieldGrid>
              <Field label="고객명">{data.customer?.name}</Field>
              <Field label="연락처">
                {data.customer?.phonePrimary ? (
                  <a
                    href={`tel:${data.customer.phonePrimary}`}
                    style={{ color: 'var(--ark-color-primary-600)', textDecoration: 'none' }}
                  >
                    {formatPhone(data.customer.phonePrimary)}
                  </a>
                ) : null}
              </Field>
              <Field label="담당 지점">{data.orgUnit?.name}</Field>
              <Field label="담당자">{data.ownerEmp?.name}</Field>
              <Field label="접수경로">{codeLabel(RECEIPT_SOURCES, data.source)}</Field>
              <Field label="상품">{codeLabel(SERVICE_LINES, data.serviceLine)}</Field>
              <Field label="거래처">{data.partner?.name}</Field>
              <Field label="이사예정일">{ymd(data.moveDate)}</Field>
              <Field label="방문견적일">{ymd(data.visitDate)}</Field>
              <Field label="예상금액">
                {data.expectedAmount != null ? won(data.expectedAmount) : null}
              </Field>
              <Field label="접수일시">{ymdhm(data.createdAt)}</Field>
            </FieldGrid>
          </PageCard>

          <PageCard title="이사 경로">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="출발지">
                {data.fromAddr ? (
                  <AddressView
                    zipcode={data.fromZipcode}
                    addr={data.fromAddr}
                    addrDetail={data.fromAddrDetail}
                    lat={data.fromLat}
                    lng={data.fromLng}
                  />
                ) : null}
              </Field>
              <Field label="도착지">
                {data.toAddr ? (
                  <AddressView
                    zipcode={data.toZipcode}
                    addr={data.toAddr}
                    addrDetail={data.toAddrDetail}
                    lat={data.toLat}
                    lng={data.toLng}
                  />
                ) : null}
              </Field>
            </div>
          </PageCard>
        </>
      )}

      {step === 2 && (
        <PageCard
          title="견적"
          count={data.estimates.length}
          actions={
            <Button variant="primary" size="sm" onClick={() => setEstOpen(true)}>
              + {t('lead.toEstimate')}
            </Button>
          }
        >
          {data.estimates.length === 0 ? (
            <EmptyStage
              message="아직 견적이 없습니다"
              hint="견적을 만들면 이 접수의 주소·고객 정보가 그대로 옮겨집니다. 물량(CBM)과 금액은 견적 상세에서 입력합니다."
              action={
                <Button variant="primary" onClick={() => setEstOpen(true)}>
                  + {t('lead.toEstimate')}
                </Button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.estimates.map((e) => (
                <DocRow
                  key={e.id}
                  no={e.estimateNo}
                  badge={<StatusBadge value={e.status} map={EST_STATUS} />}
                  info={`물량 ${String(e.totalCbm)}CBM · 금액 ${won(e.totalAmount)} · 작성 ${ymd(e.createdAt)}`}
                  onOpen={() => navigate(`/estimates/${e.id}`)}
                />
              ))}
            </div>
          )}
        </PageCard>
      )}

      {step === 3 && (
        <PageCard title="계약" count={data.contracts.length}>
          {data.contracts.length === 0 ? (
            <EmptyStage
              message="아직 계약이 없습니다"
              hint={
                data.estimates.length === 0
                  ? '계약은 견적에서 만들어집니다. 먼저 견적을 등록하세요.'
                  : '견적 상세 화면의 "계약 전환" 버튼으로 계약을 만듭니다.'
              }
              action={
                <Button
                  variant={data.estimates.length === 0 ? 'primary' : 'outline'}
                  onClick={() => setActiveStep(2)}
                >
                  견적 단계로 이동
                </Button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.contracts.map((c) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <DocRow
                    no={c.contractNo}
                    badge={<StatusBadge value={c.status} map={CONTRACT_STATUS} />}
                    info={`총액 ${won(c.totalAmount)}${c.signedAt ? ` · 서명 ${ymd(c.signedAt)}` : ''}`}
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
            </div>
          )}
        </PageCard>
      )}

      {step === 4 && (
        <PageCard title="작업" count={data.workOrders.length}>
          {data.workOrders.length === 0 ? (
            <EmptyStage
              message="아직 작업지시가 없습니다"
              hint={
                data.contracts.length === 0
                  ? '작업지시는 계약에서 만들어집니다. 먼저 계약을 진행하세요.'
                  : '계약 상세 화면의 "작업지시 생성" 버튼으로 작업을 배정합니다.'
              }
              action={
                <Button
                  variant={data.contracts.length === 0 ? 'primary' : 'outline'}
                  onClick={() => setActiveStep(3)}
                >
                  계약 단계로 이동
                </Button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.workOrders.map((w) => (
                <DocRow
                  key={w.id}
                  no={w.workNo}
                  badge={<StatusBadge value={w.status} map={WORK_STATUS} />}
                  info={`작업예정일 ${ymd(w.scheduledDate)}`}
                  onOpen={() => navigate(`/work-orders/${w.id}`)}
                />
              ))}
            </div>
          )}
        </PageCard>
      )}

      {data.supportTickets.length > 0 && (
        <PageCard title="CS·AS 이력" count={data.supportTickets.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.supportTickets.map((tk) => (
              <DocRow
                key={tk.id}
                no={`${tk.kind === 'AS' ? 'AS' : 'CS'} · ${tk.subject}`}
                badge={<StatusBadge value={tk.status} map={TICKET_STATUS} />}
                info={ymd(tk.createdAt)}
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
            label: `변경할 상태 (현재: ${LEAD_STATUS[data.status]?.label ?? data.status})`,
            required: true,
            type: 'select',
            // 상태머신이 허용하는 전이만 노출 — 고르고 나서 거부당하지 않도록
            options: allowed.map((value) => ({
              value,
              label: LEAD_STATUS[value]?.label ?? value,
            })),
          },
        ]}
        onSubmit={(v) => changeStatus(String(v.to))}
      />

      <FormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`접수 정보 수정 — ${data.leadNo}`}
        size="md"
        initialValues={editInitial}
        fields={
          [
            {
              name: 'customerId',
              label: '고객',
              alwaysShow: true,
              type: 'select',
              options: customers,
            },
            {
              name: 'ownerEmpId',
              label: '담당자',
              alwaysShow: true,
              type: 'select',
              options: employees,
            },
            {
              name: 'source',
              label: '접수경로',
              alwaysShow: true,
              pairWithNext: true,
              type: 'select',
              options: RECEIPT_SOURCES,
            },
            { name: 'serviceLine', label: '상품', type: 'select', options: SERVICE_LINES },
            {
              name: 'moveDate',
              label: '이사예정일',
              alwaysShow: true,
              pairWithNext: true,
              type: 'date',
            },
            { name: 'visitDate', label: '방문견적일', type: 'date' },
            {
              name: 'fromAddress',
              label: '출발지',
              alwaysShow: true,
              type: 'address',
              addrPrefix: 'from',
            },
            {
              name: 'toAddress',
              label: '도착지',
              alwaysShow: true,
              type: 'address',
              addrPrefix: 'to',
            },
            { name: 'partnerId', label: '거래처(제휴·B2B)', type: 'select', options: partners },
          ] as FormField[]
        }
        onSubmit={onEdit}
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
