import { codeLabel } from '../i18n';
import i18n from '../i18n';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { Send } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, cachedApi, openDocument } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  ConfirmModal,
  FormModal,
  PageHeader,
  PageSkeleton,
  StatusBadge,
  useToast,
} from '../components/ui';
import { SendEstimateModal } from '../components/estimate/SendEstimate';
import { LEAD_STATUS } from '../lib/leadCodes';
import { formatPhone } from '../lib/phone';
import { fs } from '../lib/fontScale';

/** 지점 반려 사유·접수 취소 형태 — 서버(dto/reject-lead.dto.ts)와 같은 목록 */
const REJECT_KINDS = ['지점 마감', '지점 견적 거부', '서비스 지역 아님', '일정 불가', '기타'];
const CANCEL_KINDS = ['중복 접수', '고객 취소', '이사일 마감', '타사 계약', '연락 불가', '기타'];
import { moveKindOf } from '@tongin/shared';
import estStyles from '../components/estimate/estimate.module.css';
import { StepTabs, type StepDef } from '../components/estimate/parts';
import { BasicTab } from '../components/estimate/BasicTab';
import { ItemsTab } from '../components/estimate/ItemsTab';
import { OptionsTab } from '../components/estimate/OptionsTab';
import { SummaryTab } from '../components/estimate/SummaryTab';
import type { EstimateDetailData } from '../components/estimate/types';
import { MOVE_KIND_LABEL } from '../i18n/codes';

/** 견적서 작성 순서 — 현장 견적사원이 실제로 채워 가는 순서 그대로 */
const STEPS: StepDef[] = [
  { key: 'basic', label: i18n.t('est.tab.basic') },
  { key: 'items', label: i18n.t('est.tab.items') },
  { key: 'options', label: i18n.t('est.tab.options') },
  { key: 'summary', label: i18n.t('est.tab.summary') },
];
type StepKey = 'basic' | 'items' | 'options' | 'summary';

const shortDate = (iso: string | null) => (iso ? fmtDateTime(iso) : null);

/** 진행 — 접수 → 견적서 발송 → 고객 서명 → 계약금 입금 → 작업. 단계는 저절로 넘어간다 */
function FlowBar({ data }: { data: EstimateDetailData }) {
  const { t } = useTranslation();
  const m = data.meta;
  const done = m.leadStatus === 'DONE';
  const steps = [
    { label: t('est.flow.received'), when: m.receivedDate, ok: true },
    // 문자가 막혀도 링크를 직접 전해 서명했다면 발송된 것으로 본다
    { label: t('est.flow.sent'), when: shortDate(m.sentAt), ok: !!m.sentAt || !!m.signedAt },
    { label: t('est.flow.signed'), when: shortDate(m.signedAt), ok: !!m.signedAt },
    { label: t('est.flow.deposit'), when: shortDate(m.depositPaidAt), ok: !!m.depositPaidAt },
    // 본사가 확인해 승인해야 '계약' — 그 전은 '계약미승인'
    {
      label: t('est.flow.approved'),
      when: shortDate(m.contractApprovedAt),
      ok: !!m.contractApprovedAt,
    },
    { label: t('est.flow.work'), when: m.workDate, ok: !!m.workOrderId || done },
    { label: t('est.flow.done'), when: null, ok: done },
  ];
  const current = steps.findIndex((s) => !s.ok);
  return (
    <div className={estStyles.flow} aria-label={t('est.flow.title')}>
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
  /** 지점 반려·접수 취소 창 */
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  /** 조직 이름·본사 id — 반려 버튼(지점 접수만)과 반려 안내에 쓴다 */
  const [orgs, setOrgs] = useState<{ id: string; code: string; name: string; type?: string }[]>([]);
  useEffect(() => {
    void cachedApi<{ id: string; code: string; name: string; type?: string }[]>('/org-units')
      .then(setOrgs)
      .catch(() => setOrgs([]));
  }, []);
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('est.docError') }),
    );

  const leadStatus = data.meta.leadStatus;
  const closed = leadStatus === 'DONE' || leadStatus === 'CANCELED';
  /** 접수 취소 — 형태·사유를 남긴다 */
  const cancelLead = async (values: Record<string, unknown>) => {
    if (!data.lead) return;
    try {
      await api(`/leads/${data.lead.id}/cancel`, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('est.canceled') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };
  /** 지점 반려 — 본사로 되돌린다(형태·사유) */
  const rejectLead = async (values: Record<string, unknown>) => {
    if (!data.lead) return;
    try {
      await api(`/leads/${data.lead.id}/reject`, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('est.rejected') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };
  const hqId = orgs.find((o) => o.code === 'CO-MOVING')?.id;
  const orgName = (id?: string | null) => (id ? (orgs.find((o) => o.id === id)?.name ?? '') : '');
  // 반려는 지점에 배정된 접수만, 계약 전까지
  const canReject =
    canEdit &&
    !closed &&
    !!data.lead?.orgUnitId &&
    !!hqId &&
    data.lead.orgUnitId !== hqId &&
    ['BRANCH', 'PARTNER'].includes(orgs.find((o) => o.id === data.lead!.orgUnitId)?.type ?? '') &&
    !['CONTRACT_PENDING', 'CONTRACTED', 'WORK_TOSS', 'DONE', 'CANCELED'].includes(leadStatus ?? '');

  // 계약이 성립했으면(서명 또는 계약금 입금) 작업을 잡는다 — 접수 화면에서 바로
  // 본사가 계약을 승인해야 작업을 잡는다(서명·계약금만으로는 '계약미승인')
  const contractReady = !!data.meta.contractApprovedAt;
  const canApprove =
    can('CONTRACT.APPROVE') &&
    !closed &&
    !!data.meta.contractId &&
    !data.meta.contractApprovedAt &&
    leadStatus === 'CONTRACT_PENDING';
  const approve = async () => {
    try {
      await api(`/contracts/${data.meta.contractId}/approve`, { method: 'POST' });
      toast({ type: 'success', title: t('est.approved') });
      setApproveOpen(false);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('est.approveFailed') });
    }
  };
  const createWorkOrder = async (values: Record<string, unknown>) => {
    try {
      const wo = await api<{ id: string }>('/work-orders', {
        method: 'POST',
        body: JSON.stringify({ contractId: data.meta.contractId, ...values }),
      });
      toast({ type: 'success', title: t('est.workCreated') });
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
        <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
          {t('est.cancelLead')}
        </Button>
      )}
      {canReject && (
        <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)}>
          {t('est.reject')}
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
          {t('est.viewContract')}
        </Button>
      )}
      {canApprove && (
        <Button variant="primary" size="sm" onClick={() => setApproveOpen(true)}>
          {t('est.flow.approved')}
        </Button>
      )}
      {data.meta.workOrderId ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/work-orders/${data.meta.workOrderId}`)}
        >
          {t('est.viewWork')}
        </Button>
      ) : (
        canEdit &&
        !closed &&
        contractReady &&
        can('WORK_ORDER.CREATE') && (
          <Button variant="primary" size="sm" onClick={() => setWoOpen(true)}>
            {t('est.createWork')}
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
          {data.meta.sentAt || data.meta.signedAt ? t('est.resend') : t('est.send')}
        </Button>
      )}
    </>
  );

  const tabProps = { data, canEdit, onSaved };
  // 고객이 서명한 견적은 금액·상품을 바꾸지 않는다(서명한 계약서와 달라지므로) — 서버도 막는다
  const signedLock = data.meta.signedAt ? t('est.signedLocked') : undefined;
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
              {t('est.estimate')} {data.estimateNo}
            </Badge>
          </>
        }
        actions={<div style={{ display: 'flex', gap: 8 }}>{flowActions}</div>}
      />

      <FlowBar data={data} />

      {/* 제휴이사·전속이사면 그 업체의 혜택·조건을 견적 위에 — 할인·할증을 빠뜨리지 않게 */}
      {data.lead?.partner &&
        (data.lead.partner.type === 'AFFILIATE' || data.lead.partner.type === 'EXCLUSIVE') && (
          <PartnerNotice partner={data.lead.partner} note={data.lead.productNote} />
        )}

      {/* 지점 반려 안내 — 본사에서 다시 배정할 때 사유를 보게 */}
      {data.lead?.rejectedAt && data.lead.orgUnitId === hqId && !closed && (
        <div className={estStyles.rejectNote}>
          <b>{t('est.branchReject')}</b>
          <span>
            {orgName(data.lead.rejectedFromOrgId) || t('est.branch')} ·{' '}
            {codeLabel('reason', data.lead.rejectKind ?? '')} · {fmtDateTime(data.lead.rejectedAt)}
          </span>
          {data.lead.rejectReason && <p>{data.lead.rejectReason}</p>}
        </div>
      )}
      {/* 중복 접수 — 서로 이어진 접수(번호를 누르면 그 접수로) */}
      {(data.lead?.dupOf || !!data.lead?.dupLeads?.length) && (
        <div className={estStyles.cancelNote}>
          <b>{t('leadDup.title')}</b>
          {data.lead.dupOf && (
            <span>
              {t('leadDup.replacedOld')}{' '}
              <a
                href={`/leads/${data.lead.dupOf.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/leads/${data.lead!.dupOf!.id}`);
                }}
              >
                {data.lead.dupOf.leadNo}
              </a>
            </span>
          )}
          {data.lead.dupLeads?.map((x) => (
            <span key={x.id}>
              {t('leadDup.replacedBy')}{' '}
              <a
                href={`/leads/${x.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/leads/${x.id}`);
                }}
              >
                {x.leadNo}
              </a>
            </span>
          ))}
        </div>
      )}
      {/* 취소 사유 */}
      {leadStatus === 'CANCELED' && data.lead?.cancelKind && (
        <div className={estStyles.cancelNote}>
          <b>{t('est.cancelLead')}</b>
          <span>{data.lead.cancelKind}</span>
          {data.lead.cancelReason && <p>{data.lead.cancelReason}</p>}
        </div>
      )}

      {/* 상담 때 받은 고객 요청사항 — 견적·작업에서 빠뜨리지 않게 */}
      {data.lead?.customerRequest && (
        <div
          style={{
            padding: '10px 16px',
            border: '1px solid var(--ark-color-border)',
            borderRadius: 10,
            fontSize: fs(13),
            whiteSpace: 'pre-line',
          }}
        >
          <b>{t('est.customerRequest')}</b> · {data.lead.customerRequest}
        </div>
      )}

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

      <ConfirmModal
        open={approveOpen}
        title={t('est.flow.approved')}
        message={t('est.approveQ')}
        confirmLabel={t('est.flow.approved')}
        onClose={() => setApproveOpen(false)}
        onConfirm={() => void approve()}
      />
      <FormModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={t('est.rejectTitle')}
        size="sm"
        fields={[
          {
            name: 'kind',
            label: t('est.rejectReason'),
            type: 'select',
            required: true,
            alwaysShow: true,
            options: REJECT_KINDS.map((k) => ({ value: k, label: codeLabel('reason', k) })),
          },
          {
            name: 'reason',
            label: t('est.rejectMemo'),
            type: 'textarea',
            alwaysShow: true,
          },
        ]}
        onSubmit={rejectLead}
      />
      <FormModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('est.cancelLead')}
        size="sm"
        fields={[
          {
            name: 'kind',
            label: t('est.cancelKind'),
            type: 'select',
            required: true,
            alwaysShow: true,
            options: CANCEL_KINDS.map((k) => ({ value: k, label: codeLabel('reason', k) })),
          },
          {
            name: 'reason',
            label: t('est.cancelReason'),
            type: 'textarea',
            required: true,
            alwaysShow: true,
          },
        ]}
        onSubmit={cancelLead}
      />
      <FormModal
        open={woOpen}
        onOpenChange={setWoOpen}
        title={t('est.createWork')}
        initialValues={data.lead?.moveDate ? { scheduledDate: data.lead.moveDate } : undefined}
        fields={[
          {
            name: 'scheduledDate',
            label: t('est.workDate'),
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

function PartnerNotice({
  partner,
  note,
}: {
  partner: { name: string; type: string; benefit: string | null; intake: string | null };
  /** 접수에 남긴 상품 특이사항 — 있으면 이것을, 없으면 업체의 지금 혜택을 */
  note?: string | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const kind = MOVE_KIND_LABEL[moveKindOf(partner.type)];
  const text = (note?.trim() || partner.benefit?.trim()) ?? '';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 16px',
        border: '1px solid var(--ark-color-border)',
        borderRadius: 10,
        background: 'var(--ark-color-bg-muted)',
        fontSize: fs(13),
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge variant="subtle" color={partner.type === 'EXCLUSIVE' ? 'warning' : 'primary'}>
          {kind}
        </Badge>
        <b>{partner.name}</b>
        {partner.type === 'EXCLUSIVE' && (
          <span style={{ color: 'var(--ark-color-text-secondary)' }}>{t('est.hqOnly')}</span>
        )}
        {partner.intake && (
          <span style={{ color: 'var(--ark-color-text-secondary)' }}>
            {t('est.intake')} {partner.intake}
          </span>
        )}
        {text.length > 120 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              marginLeft: 'auto',
              border: 0,
              background: 'none',
              color: 'var(--ark-color-text-secondary)',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {open ? t('est.collapse') : t('est.expand')}
          </button>
        )}
      </div>
      {text && (
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {open || text.length <= 120 ? text : `${text.slice(0, 120)}…`}
        </div>
      )}
    </div>
  );
}
