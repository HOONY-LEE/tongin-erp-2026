import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ACCESS_LABEL,
  ACCESS_METHODS,
  HANDLING,
  HANDLING_LABEL,
  LEAD_STATUS_LABEL,
  type EstimateMeta,
} from '@tongin/shared';
import { api, ApiError, openDocument } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  AddressView,
  Badge,
  Button,
  DataTable,
  FormModal,
  PageCard,
  PageHeader,
  Spinner,
  StatusBadge,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';

interface Zone {
  id: string;
  name: string;
}
interface Line {
  id: string;
  itemName: string;
  qty: string | number;
  cbm: string | number;
  handling: string;
  zoneId?: string | null;
}
interface Addon {
  id: string;
  name: string;
  qty: string | number;
  unitPrice: string | number;
  amount: string | number;
  memo?: string | null;
}
interface Estimate {
  id: string;
  estimateNo: string;
  status: string;
  productId: string;
  totalCbm: string | number;
  baseAmount: string | number | null;
  totalAmount: string | number | null;
  moveAmount: string | number | null;
  vatMode: string;
  vatAmount: string | number | null;
  depositAmount: string | number | null;
  balanceAmount: string | number | null;
  addons: Addon[];
  fromPyeong: number | null;
  toPyeong: number | null;
  fromAccess: string;
  fromAccessNote: string | null;
  toAccess: string;
  toAccessNote: string | null;
  meta: EstimateMeta;
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
  zones: Zone[];
  lines: Line[];
}

const STATUS: StatusMap = {
  DRAFT: { label: '작성중', color: 'neutral' },
  QUOTED: { label: '견적완료', color: 'success' },
};
const HANDLING_TEXT: Record<string, string> = HANDLING_LABEL;

const ACCESS_TEXT: Record<string, string> = ACCESS_LABEL;
const ACCESS_OPTIONS = ACCESS_METHODS.map((a) => ({ value: a, label: ACCESS_LABEL[a] }));
/** 작업조건 한 줄 — "24평 · 사다리차", 기타면 메모까지 */
const conditionText = (pyeong: number | null, access: string, note: string | null) =>
  [
    pyeong != null ? `${pyeong}평` : null,
    `${ACCESS_TEXT[access] ?? access}${access === 'ETC' && note ? `(${note})` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');

/** 견적 정보(메타) 한 칸 */
function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--ark-color-text-tertiary)' }}>{label}</span>
      <span style={{ overflowWrap: 'anywhere' }}>{value || '-'}</span>
    </div>
  );
}

const won = (v: unknown) => (v == null || v === '' ? '-' : `${Number(v).toLocaleString()}원`);

/** 금액 한 줄 — 라벨 왼쪽, 값 오른쪽 정렬(숫자끼리 세로로 맞아 비교가 쉬워진다). */
function AmountRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ flex: 1, color: 'var(--ark-color-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, fontSize: strong ? 18 : undefined }}>
        {value}
      </span>
    </div>
  );
}
/** 처리구분 선택지 — shared 코드 순서를 그대로 따른다(운반/경유/방치/폐기) */
const HANDLING_OPTIONS = HANDLING.map((h) => ({ value: h, label: HANDLING_LABEL[h] }));

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [addonOpen, setAddonOpen] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const [condOpen, setCondOpen] = useState(false);
  const cbmItems = useOptions('/cbm-items', 'name');
  const addonServices = useOptions('/addon-services', 'name');
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Estimate>(`/estimates/${id}`));
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

  const addonTotal = (data?.addons ?? []).reduce((sum, a) => sum + Number(a.amount ?? 0), 0);
  // 견적사원이 계약금·잔금을 따로 적는데, 이후 옵션이 바뀌면 합이 총비용과 어긋날 수 있다
  const amountMismatch =
    data?.depositAmount != null &&
    data?.balanceAmount != null &&
    data?.totalAmount != null &&
    Math.abs(Number(data.depositAmount) + Number(data.balanceAmount) - Number(data.totalAmount)) >
      0.5;

  const addZone = async (values: Record<string, unknown>) => {
    try {
      await api(`/estimates/${id}/zones`, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const addLine = async (values: Record<string, unknown>) => {
    try {
      await api(`/estimates/${id}/lines`, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const addAddon = async (values: Record<string, unknown>) => {
    try {
      await api(`/estimates/${id}/addons`, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const removeAddon = async (addonId: string) => {
    try {
      await api(`/estimates/${id}/addons/${addonId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const saveConditions = async (values: Record<string, unknown>) => {
    try {
      await api(`/estimates/${id}/conditions`, { method: 'PUT', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.saved') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const saveAmounts = async (values: Record<string, unknown>) => {
    try {
      await api(`/estimates/${id}/amounts`, { method: 'PUT', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.saved') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const quote = async () => {
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

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const zoneName = (zid?: string | null) => data.zones.find((z) => z.id === zid)?.name ?? '-';
  const zoneOptions = data.zones.map((z) => ({ value: z.id, label: z.name }));

  const lineColumns: Column[] = [
    { title: t('estimate.zones'), render: (r) => zoneName(r.zoneId as string | undefined) },
    { title: '품목', dataIndex: 'itemName' },
    { title: '수량', numeric: true, render: (r) => String(r.qty) },
    { title: 'CBM', numeric: true, render: (r) => String(r.cbm) },
    { title: '처리', render: (r) => HANDLING_TEXT[r.handling as string] ?? String(r.handling) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={data.estimateNo}
        breadcrumbs={[{ label: t('estimate.back'), onClick: () => navigate('/estimates') }]}
        onRefresh={load}
        updatedAt={updatedAt}
        tags={
          <>
            <StatusBadge value={data.status} map={STATUS} />
            <Badge variant="subtle" color="info">
              {t('estimate.totalCbm')} {String(data.totalCbm)}
            </Badge>
          </>
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openDocument(`/estimates/${id}/document`).catch((e) =>
                  toast({ type: 'error', title: e instanceof ApiError ? e.message : '문서 오류' }),
                )
              }
            >
              {t('estimate.document')}
            </Button>
            <Button variant="primary" size="sm" disabled={data.status === 'QUOTED'} onClick={quote}>
              {t('estimate.quote')}
            </Button>
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
              data.status === 'QUOTED' && (
                <Button variant="primary" size="sm" onClick={() => setContractOpen(true)}>
                  {t('estimate.toContract')}
                </Button>
              )
            )}
          </div>
        }
      />

      {/* 견적서 머리 정보 — 접수·계약·작업에서 모아 온 값(따로 입력하지 않는다) */}
      <PageCard title="견적 정보">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '12px 16px',
          }}
        >
          <MetaItem label="고객명" value={data.meta.customerName} />
          <MetaItem label="고객연락처" value={data.meta.customerPhone} />
          <MetaItem label="계약번호" value={data.meta.contractNo} />
          <MetaItem
            label="진행상태"
            value={data.meta.leadStatus ? LEAD_STATUS_LABEL[data.meta.leadStatus] : null}
          />
          <MetaItem label="담당자" value={data.meta.estimatorName} />
          <MetaItem label="담당자연락처" value={data.meta.estimatorPhone} />
          <MetaItem label="이사종류" value={data.meta.productName} />
          <MetaItem label="지점명" value={data.meta.orgUnitName} />
          <MetaItem label="접수일" value={data.meta.receivedDate} />
          <MetaItem label="상담일" value={data.meta.consultDate} />
          <MetaItem label="계약일" value={data.meta.contractDate} />
          <MetaItem label="작업일(이사일)" value={data.meta.workDate} />
        </div>
      </PageCard>

      {(data.fromAddr || data.toAddr) && (
        <PageCard title={t('estimate.moveAddress')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AddressView
              label={t('estimate.from')}
              zipcode={data.fromZipcode}
              addr={data.fromAddr}
              addrDetail={data.fromAddrDetail}
              lat={data.fromLat}
              lng={data.fromLng}
            />
            <AddressView
              label={t('estimate.to')}
              zipcode={data.toZipcode}
              addr={data.toAddr}
              addrDetail={data.toAddrDetail}
              lat={data.toLat}
              lng={data.toLng}
            />
          </div>
        </PageCard>
      )}

      <PageCard
        title="작업 조건"
        actions={
          <Button variant="outline" size="sm" onClick={() => setCondOpen(true)}>
            수정
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AmountRow
            label="전 작업조건"
            value={conditionText(data.fromPyeong, data.fromAccess, data.fromAccessNote)}
          />
          <AmountRow
            label="후 작업조건"
            value={conditionText(data.toPyeong, data.toAccess, data.toAccessNote)}
          />
        </div>
      </PageCard>

      <PageCard
        title={t('estimate.zones')}
        count={data.zones.length}
        actions={
          <Button variant="outline" size="sm" onClick={() => setZoneOpen(true)}>
            + {t('estimate.addZone')}
          </Button>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {data.zones.length ? (
            data.zones.map((z) => (
              <Badge key={z.id} variant="subtle">
                {z.name}
              </Badge>
            ))
          ) : (
            <span style={{ color: 'var(--ark-color-text-tertiary)' }}>구역 없음</span>
          )}
        </div>
      </PageCard>

      <PageCard
        title={t('estimate.lines')}
        count={data.lines.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setLineOpen(true)}>
            + {t('estimate.addLine')}
          </Button>
        }
        plain
      >
        <DataTable columns={lineColumns} rows={data.lines as unknown as Row[]} />
      </PageCard>

      <PageCard
        title="옵션 상품"
        count={data.addons.length}
        actions={
          <Button variant="outline" size="sm" onClick={() => setAddonOpen(true)}>
            + 옵션 추가
          </Button>
        }
      >
        {data.addons.length === 0 ? (
          <span style={{ color: 'var(--ark-color-text-tertiary)' }}>
            선택한 옵션이 없습니다 (사다리차·청소·보관 등)
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.addons.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--ark-color-border)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  {a.name}
                  {a.memo && (
                    <span style={{ color: 'var(--ark-color-text-tertiary)', marginLeft: 6 }}>
                      · {a.memo}
                    </span>
                  )}
                </span>
                <span style={{ color: 'var(--ark-color-text-secondary)', whiteSpace: 'nowrap' }}>
                  {won(a.unitPrice)} × {Number(a.qty)}
                </span>
                <b style={{ minWidth: 100, textAlign: 'right' }}>{won(a.amount)}</b>
                <Button variant="ghost" size="sm" onClick={() => void removeAddon(a.id)}>
                  삭제
                </Button>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      <PageCard
        title="견적 금액"
        actions={
          <Button variant="primary" size="sm" onClick={() => setAmountOpen(true)}>
            금액 입력
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AmountRow label="이사비용" value={won(data.moveAmount)} />
          <AmountRow label="옵션 합계" value={won(addonTotal)} />
          <AmountRow
            label={`부가세 (${data.vatMode === 'INCLUDED' ? '포함' : '불포함'})`}
            value={data.vatMode === 'INCLUDED' ? won(data.vatAmount) : '별도'}
          />
          <div style={{ borderTop: '1px solid var(--ark-color-border)', paddingTop: 8 }}>
            <AmountRow label="총비용" value={won(data.totalAmount)} strong />
          </div>
          <AmountRow label="계약금" value={won(data.depositAmount)} />
          <AmountRow label="잔금" value={won(data.balanceAmount)} />
          {amountMismatch && (
            <div style={{ fontSize: 12, color: 'var(--ark-color-warning-600, #d97706)' }}>
              계약금 + 잔금({won(Number(data.depositAmount) + Number(data.balanceAmount))})이
              총비용과 다릅니다. 계약 전환 시 잔금은 총비용 − 계약금으로 다시 계산됩니다.
            </div>
          )}
        </div>
      </PageCard>

      <FormModal
        open={zoneOpen}
        onOpenChange={setZoneOpen}
        title={t('estimate.addZone')}
        fields={[
          { name: 'name', label: '구역명', required: true, placeholder: '안방/거실/사무실…' },
        ]}
        onSubmit={addZone}
      />

      <FormModal
        open={lineOpen}
        onOpenChange={setLineOpen}
        title={t('estimate.addLine')}
        fields={[
          { name: 'zoneId', label: t('estimate.zones'), type: 'select', options: zoneOptions },
          { name: 'cbmItemId', label: '품목', required: true, type: 'select', options: cbmItems },
          { name: 'qty', label: '수량', type: 'number', placeholder: '1' },
          {
            name: 'handling',
            label: '처리',
            type: 'select',
            options: HANDLING_OPTIONS,
          },
        ]}
        onSubmit={addLine}
      />

      <FormModal
        open={addonOpen}
        onOpenChange={setAddonOpen}
        title="옵션 추가"
        fields={[
          {
            name: 'addonServiceId',
            label: '옵션',
            alwaysShow: true,
            type: 'select',
            options: addonServices,
            placeholder: '상품관리에 등록된 옵션에서 선택',
          },
          {
            name: 'name',
            label: '옵션명 (직접 입력)',
            alwaysShow: true,
            placeholder: '목록에 없으면 여기에 직접 입력',
          },
          {
            name: 'qty',
            label: '수량',
            alwaysShow: true,
            pairWithNext: true,
            type: 'number',
            placeholder: '1',
          },
          {
            name: 'unitPrice',
            label: '단가',
            alwaysShow: true,
            type: 'number',
            placeholder: '비우면 등록된 가격',
          },
          { name: 'memo', label: '메모', placeholder: '예: 일반장롱 분해/설치' },
        ]}
        onSubmit={addAddon}
      />

      <FormModal
        open={amountOpen}
        onOpenChange={setAmountOpen}
        title="견적 금액 입력"
        initialValues={{
          moveAmount: data.moveAmount == null ? '' : String(data.moveAmount),
          vatMode: data.vatMode,
          vatAmount: data.vatAmount == null ? '' : String(data.vatAmount),
          depositAmount: data.depositAmount == null ? '' : String(data.depositAmount),
          balanceAmount: data.balanceAmount == null ? '' : String(data.balanceAmount),
        }}
        fields={[
          {
            name: 'moveAmount',
            label: '이사비용 (옵션 제외)',
            alwaysShow: true,
            type: 'number',
            placeholder: '예: 1800000',
          },
          {
            name: 'vatMode',
            label: '부가세',
            alwaysShow: true,
            pairWithNext: true,
            type: 'select',
            options: [
              { value: 'EXCLUDED', label: '불포함(별도)' },
              { value: 'INCLUDED', label: '포함' },
            ],
          },
          {
            name: 'vatAmount',
            label: '부가세 금액 (포함일 때)',
            alwaysShow: true,
            type: 'number',
            placeholder: '포함 선택 시 입력',
          },
          {
            name: 'depositAmount',
            label: '계약금',
            alwaysShow: true,
            pairWithNext: true,
            type: 'number',
          },
          { name: 'balanceAmount', label: '잔금', alwaysShow: true, type: 'number' },
        ]}
        onSubmit={saveAmounts}
      />

      <FormModal
        open={condOpen}
        onOpenChange={setCondOpen}
        title="작업 조건"
        initialValues={{
          fromPyeong: data.fromPyeong == null ? '' : String(data.fromPyeong),
          fromAccess: data.fromAccess,
          fromAccessNote: data.fromAccessNote ?? '',
          toPyeong: data.toPyeong == null ? '' : String(data.toPyeong),
          toAccess: data.toAccess,
          toAccessNote: data.toAccessNote ?? '',
        }}
        fields={[
          {
            name: 'fromPyeong',
            label: '전 평수',
            alwaysShow: true,
            pairWithNext: true,
            type: 'number',
          },
          {
            name: 'fromAccess',
            label: '전 작업방식',
            alwaysShow: true,
            type: 'select',
            options: ACCESS_OPTIONS,
          },
          {
            name: 'fromAccessNote',
            label: '전 기타 내용',
            alwaysShow: true,
            placeholder: '기타 선택 시 (예: 곤돌라)',
          },
          {
            name: 'toPyeong',
            label: '후 평수',
            alwaysShow: true,
            pairWithNext: true,
            type: 'number',
          },
          {
            name: 'toAccess',
            label: '후 작업방식',
            alwaysShow: true,
            type: 'select',
            options: ACCESS_OPTIONS,
          },
          {
            name: 'toAccessNote',
            label: '후 기타 내용',
            alwaysShow: true,
            placeholder: '기타 선택 시',
          },
        ]}
        onSubmit={saveConditions}
      />

      <FormModal
        open={contractOpen}
        onOpenChange={setContractOpen}
        title={t('estimate.toContract')}
        // 견적서로 고객과 합의한 금액을 그대로 가져온다 — 다시 계산해 입력하지 않게.
        // 잔금은 서버가 총액 − 계약금으로 정하므로 따로 묻지 않는다.
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
