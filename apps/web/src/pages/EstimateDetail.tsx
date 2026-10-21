import { useCallback, useEffect, useState } from 'react';
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
  Spinner,
  StatusBadge,
  useToast,
  type StatusMap,
} from '../components/ui';
import { StepTabs, type StepDef } from '../components/estimate/parts';
import { BasicTab } from '../components/estimate/BasicTab';
import { ItemsTab } from '../components/estimate/ItemsTab';
import { OptionsTab } from '../components/estimate/OptionsTab';
import { SummaryTab } from '../components/estimate/SummaryTab';
import type { EstimateDetailData } from '../components/estimate/types';

const STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  QUOTED: { label: '견적완료', color: 'success' },
};

/** 견적서 작성 순서 — 현장 견적사원이 실제로 채워 가는 순서 그대로 */
const STEPS: StepDef[] = [
  { key: 'basic', label: '기본정보' },
  { key: 'items', label: '물품정보' },
  { key: 'options', label: '옵션선택' },
  { key: 'summary', label: '견적·계약서' },
];
type StepKey = 'basic' | 'items' | 'options' | 'summary';

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<EstimateDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [contractOpen, setContractOpen] = useState(false);
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

  const canEdit = can('ESTIMATE.WRITE');

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

  const quote = async () => {
    if (anyDirty && !window.confirm('저장하지 않은 변경이 있습니다. 그대로 견적을 확정할까요?')) {
      return;
    }
    try {
      await api(`/estimates/${id}/quote`, { method: 'POST' });
      toast({ type: 'success', title: t('estimate.quote') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const createContract = async (values: Record<string, unknown>) => {
    try {
      const created = await api<{ id: string }>('/contracts', {
        method: 'POST',
        body: JSON.stringify({ estimateId: id, ...values }),
      });
      toast({ type: 'success', title: t('common.created') });
      navigate(`/contracts/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  if (!data) {
    return <div style={{ padding: 40, textAlign: 'center' }}>{loading ? <Spinner /> : null}</div>;
  }

  const openDoc = () =>
    openDocument(`/estimates/${id}/document`).catch((e) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '문서 오류' }),
    );

  const flowActions = (
    <>
      <Button variant="outline" size="sm" onClick={openDoc}>
        {t('estimate.document')}
      </Button>
      {canEdit && (
        <Button variant="primary" size="sm" disabled={data.status === 'QUOTED'} onClick={quote}>
          {data.status === 'QUOTED' ? '견적 확정됨' : t('estimate.quote')}
        </Button>
      )}
      {/* 이미 계약된 견적이면 만들기 대신 그 계약으로 보낸다(서버도 중복 계약은 거절한다) */}
      {data.meta.contractId ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/contracts/${data.meta.contractId}`)}
        >
          계약 보기 →
        </Button>
      ) : (
        data.status === 'QUOTED' &&
        can('CONTRACT.WRITE') && (
          <Button variant="primary" size="sm" onClick={() => setContractOpen(true)}>
            {t('estimate.toContract')}
          </Button>
        )
      )}
    </>
  );

  const tabProps = { data, canEdit, onSaved };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={data.estimateNo}
        breadcrumbs={[
          {
            label: data.lead ? `접수 ${data.lead.leadNo}` : '접수',
            onClick: () => navigate(data.lead ? `/leads/${data.lead.id}` : '/leads'),
          },
        ]}
        onRefresh={load}
        updatedAt={updatedAt}
        tags={
          <>
            <StatusBadge value={data.status} map={STATUS} />
            <Badge variant="subtle" color="info">
              {t('estimate.totalCbm')} {Number(data.totalCbm)}
            </Badge>
          </>
        }
        actions={<div style={{ display: 'flex', gap: 8 }}>{flowActions}</div>}
      />

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
        <OptionsTab {...tabProps} onDirtyChange={dirtyHandlers.options} />
      </div>
      <div
        role="tabpanel"
        id="est-panel-summary"
        aria-labelledby="est-tab-summary"
        hidden={tab !== 'summary'}
      >
        <SummaryTab {...tabProps} onDirtyChange={dirtyHandlers.summary} actions={flowActions} />
      </div>

      <FormModal
        open={contractOpen}
        onOpenChange={setContractOpen}
        title={t('estimate.toContract')}
        // 견적서로 고객과 합의한 금액을 그대로 가져온다. 잔금은 서버가 총액 − 계약금으로 정한다.
        initialValues={{
          totalAmount: data.totalAmount == null ? '' : String(Number(data.totalAmount)),
          depositAmount: data.depositAmount == null ? '' : String(Number(data.depositAmount)),
        }}
        fields={[
          {
            name: 'totalAmount',
            label: t('contract.total'),
            required: true,
            alwaysShow: true,
            pairWithNext: true,
            type: 'number',
            placeholder: '예: 1800000',
          },
          {
            name: 'depositAmount',
            label: '계약금',
            alwaysShow: true,
            type: 'number',
            placeholder: '비우면 총액의 10%',
          },
        ]}
        onSubmit={createContract}
      />
    </div>
  );
}
