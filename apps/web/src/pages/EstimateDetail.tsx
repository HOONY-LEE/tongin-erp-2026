import { Fragment, useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, openDocument } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  FormModal,
  PageHeader,
  PageSkeleton,
  StatusBadge,
  useToast,
} from '../components/ui';
import { SendEstimateModal } from '../components/estimate/SendEstimate';
import { LEAD_STATUS } from '../lib/leadCodes';
import { formatPhone } from '../lib/phone';
import estStyles from '../components/estimate/estimate.module.css';
import { StepTabs, type StepDef } from '../components/estimate/parts';
import { BasicTab } from '../components/estimate/BasicTab';
import { ItemsTab } from '../components/estimate/ItemsTab';
import { OptionsTab } from '../components/estimate/OptionsTab';
import { SummaryTab } from '../components/estimate/SummaryTab';
import type { EstimateDetailData } from '../components/estimate/types';

/** 견적서 작성 순서 — 현장 견적사원이 실제로 채워 가는 순서 그대로 */
const STEPS: StepDef[] = [
  { key: 'basic', label: '기본정보' },
  { key: 'items', label: '물품정보' },
  { key: 'options', label: '옵션선택' },
  { key: 'summary', label: '견적·계약서' },
];
type StepKey = 'basic' | 'items' | 'options' | 'summary';

const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

/** 진행 — 접수 → 견적서 발송 → 고객 서명 → 계약금 입금 → 작업. 단계는 저절로 넘어간다 */
function FlowBar({ data }: { data: EstimateDetailData }) {
  const m = data.meta;
  const done = m.leadStatus === 'DONE';
  const steps = [
    { label: '접수', when: m.receivedDate, ok: true },
    // 문자가 막혀도 링크를 직접 전해 서명했다면 발송된 것으로 본다
    { label: '견적서 발송', when: shortDate(m.sentAt), ok: !!m.sentAt || !!m.signedAt },
    { label: '고객 서명', when: shortDate(m.signedAt), ok: !!m.signedAt },
    { label: '계약금 입금', when: shortDate(m.depositPaidAt), ok: !!m.depositPaidAt },
    { label: '작업', when: m.workDate, ok: !!m.workOrderId || done },
    { label: '완료', when: null, ok: done },
  ];
  const current = steps.findIndex((s) => !s.ok);
  return (
    <div className={estStyles.flow} aria-label="진행 상황">
      {steps.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && <span className={[estStyles.flowLine, s.ok ? estStyles.done : ''].join(' ')} />}
          <span
            className={[
              estStyles.flowStep,
              s.ok ? estStyles.done : '',
              i === current ? estStyles.current : '',
            ].join(' ')}
          >
            <span className={estStyles.flowDot}>{s.ok ? '✓' : i + 1}</span>
            <span>
              {s.label}
              {s.ok && s.when && <span className={estStyles.flowWhen}> · {s.when}</span>}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * 접수 상세 = 견적서 화면. 접수(/leads/:id)를 열면 그 접수의 견적을 바로 띄운다.
 * 견적은 '고객에게 보내기' 한 번으로 고객 서명·계약금 입금까지 이어지고, 진행 단계는 저절로 넘어간다.
 */
export default function EstimateDetail({ estimateId }: { estimateId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const id = estimateId ?? params.id;
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<EstimateDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const { updatedAt, touch } = useUpdatedAt();

  // 탭은 주소에 남겨 둔다 — 새로고침·뒤로가기 해도 보던 단계로 돌아온다
  const tab = (STEPS.find((s) => s.key === searchParams.get('tab'))?.key ?? 'basic') as StepKey;
  const setTab = (key: string) =>
    setSearchParams(
      (p) => {
        p.set('tab', key);
        return p;
      },
      { replace: true },
    );

  const canEdit = can('ESTIMATE.UPDATE');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<EstimateDetailData>(`/estimates/${id}`));
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

  // 탭마다 "저장 안 한 변경" 표시 — 핸들러는 한 번만 만들어 탭의 effect가 매번 다시 돌지 않게 한다
  const [dirtyHandlers] = useState(
    () =>
      Object.fromEntries(
        STEPS.map((s) => [
          s.key,
          (v: boolean) => setDirty((d) => (d[s.key] === v ? d : { ...d, [s.key]: v })),
        ]),
      ) as Record<StepKey, (v: boolean) => void>,
  );

  // 저장 안 한 변경이 있는 채로 창을 닫거나 새로고침하면 묻는다
  const anyDirty = Object.values(dirty).some(Boolean);
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyDirty]);

  const onSaved = (next: EstimateDetailData) => {
    setData(next);
    touch();
  };

  if (!data) {
    return loading ? <PageSkeleton /> : null;
  }

  const openDoc = () =>
    openDocument(`/estimates/${id}/document`).catch((e) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '문서 오류' }),
    );

  const leadStatus = data.meta.leadStatus;
  const closed = leadStatus === 'DONE' || leadStatus === 'CANCELED';
  const cancelLead = async () => {
    if (!data.lead || !window.confirm('이 접수를 취소할까요? 취소하면 되돌릴 수 없습니다.')) return;
    try {
      await api(`/leads/${data.lead.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to: 'CANCELED' }),
      });
      toast({ type: 'success', title: '접수를 취소했습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  // 계약이 성립했으면(서명 또는 계약금 입금) 작업을 잡는다 — 접수 화면에서 바로
  const contractReady = !!data.meta.signedAt || !!data.meta.depositPaidAt;
  const createWorkOrder = async (values: Record<string, unknown>) => {
    try {
      const wo = await api<{ id: string }>('/work-orders', {
        method: 'POST',
        body: JSON.stringify({ contractId: data.meta.contractId, ...values }),
      });
      toast({ type: 'success', title: '작업을 만들었습니다' });
      await load();
      navigate(`/work-orders/${wo.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const flowActions = (
    <>
      {canEdit && !closed && data.lead && (
        <Button variant="ghost" size="sm" onClick={() => void cancelLead()}>
          접수 취소
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={openDoc}>
        {t('estimate.document')}
      </Button>
      {data.meta.contractId && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/contracts/${data.meta.contractId}`)}
        >
          계약 보기
        </Button>
      )}
      {data.meta.workOrderId ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/work-orders/${data.meta.workOrderId}`)}
        >
          작업 보기
        </Button>
      ) : (
        canEdit &&
        !closed &&
        contractReady &&
        can('WORK_ORDER.CREATE') && (
          <Button variant="primary" size="sm" onClick={() => setWoOpen(true)}>
            작업 만들기
          </Button>
        )
      )}
      {/* 계약금까지 들어왔으면 다시 보낼 일이 없다 */}
      {canEdit && !closed && !data.meta.depositPaidAt && (
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Send size={14} />}
          onClick={() => setSendOpen(true)}
        >
          {data.meta.sentAt || data.meta.signedAt ? '견적서 다시 보내기' : '고객에게 견적서 보내기'}
        </Button>
      )}
    </>
  );

  const tabProps = { data, canEdit, onSaved };
  // 고객이 서명한 견적은 금액·상품을 바꾸지 않는다(서명한 계약서와 달라지므로) — 서버도 막는다
  const signedLock = data.meta.signedAt
    ? '고객이 서명한 견적이라 금액·상품은 바꿀 수 없습니다.'
    : undefined;
  const priceProps = { ...tabProps, canEdit: canEdit && !signedLock, lockedReason: signedLock };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={data.lead?.leadNo ?? data.estimateNo}
        breadcrumbs={[{ label: t('nav.leads'), onClick: () => navigate('/leads') }]}
        onRefresh={load}
        updatedAt={updatedAt}
        tags={
          <>
            {leadStatus && <StatusBadge value={leadStatus} map={LEAD_STATUS} />}
            {data.meta.customerName && (
              <Badge variant="subtle" color="info">
                {data.meta.customerName}
                {data.meta.customerPhone ? ` · ${formatPhone(data.meta.customerPhone)}` : ''}
              </Badge>
            )}
            <Badge variant="subtle" color="neutral">
              견적 {data.estimateNo}
            </Badge>
          </>
        }
        actions={<div style={{ display: 'flex', gap: 8 }}>{flowActions}</div>}
      />

      <FlowBar data={data} />

      <StepTabs steps={STEPS} value={tab} onChange={setTab} dirty={dirty} />

      {/* 탭을 옮겨도 입력하던 내용이 남도록 네 탭을 모두 띄워 두고 보이는 것만 바꾼다 */}
      <div
        role="tabpanel"
        id="est-panel-basic"
        aria-labelledby="est-tab-basic"
        hidden={tab !== 'basic'}
      >
        <BasicTab {...tabProps} onDirtyChange={dirtyHandlers.basic} />
      </div>
      <div
        role="tabpanel"
        id="est-panel-items"
        aria-labelledby="est-tab-items"
        hidden={tab !== 'items'}
      >
        <ItemsTab {...tabProps} onDirtyChange={dirtyHandlers.items} />
      </div>
      <div
        role="tabpanel"
        id="est-panel-options"
        aria-labelledby="est-tab-options"
        hidden={tab !== 'options'}
      >
        <OptionsTab {...priceProps} onDirtyChange={dirtyHandlers.options} />
      </div>
      <div
        role="tabpanel"
        id="est-panel-summary"
        aria-labelledby="est-tab-summary"
        hidden={tab !== 'summary'}
      >
        <SummaryTab {...priceProps} onDirtyChange={dirtyHandlers.summary} />
      </div>

      <FormModal
        open={woOpen}
        onOpenChange={setWoOpen}
        title="작업 만들기"
        initialValues={data.lead?.moveDate ? { scheduledDate: data.lead.moveDate } : undefined}
        fields={[
          {
            name: 'scheduledDate',
            label: '작업일(이사일)',
            type: 'date',
            required: true,
            alwaysShow: true,
          },
        ]}
        onSubmit={createWorkOrder}
      />
      <SendEstimateModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        data={data}
        dirty={anyDirty}
        onSent={() => void load()}
      />
    </div>
  );
}
