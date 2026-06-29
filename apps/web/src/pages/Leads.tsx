import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import {
  AddressView,
  Button,
  DataTable,
  FormModal,
  PageCard,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';

const STATUS: StatusMap = {
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
const SERVICE_LINES = [
  { value: 'MOVING', label: '이사(무빙)' },
  { value: 'LIVING', label: '리빙' },
  { value: 'CARE', label: '케어' },
  { value: 'B2B_MOVING', label: '기업이전' },
  { value: 'GENERAL', label: '일반' },
];

// 단계 탭 = lead.status 그룹 (한 케이스가 상태로 전 단계를 관통)
const STAGES: { key: string; label: string; statuses: string[] | null }[] = [
  { key: 'ALL', label: '전체', statuses: null },
  { key: 'INTAKE', label: '접수', statuses: ['RECEIVED', 'CONSULT_ASSIGNED', 'CONSULT_TOSS'] },
  { key: 'QUOTE', label: '견적', statuses: ['QUOTED'] },
  { key: 'CONTRACT', label: '계약', statuses: ['CONTRACTED'] },
  { key: 'WORK', label: '작업', statuses: ['WORK_TOSS', 'IN_PROGRESS', 'DONE'] },
];
const inStage = (status: string, statuses: string[] | null) =>
  statuses === null ? true : statuses.includes(status);
const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '0');

export default function Leads() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [transRow, setTransRow] = useState<Row | null>(null);
  const [estRow, setEstRow] = useState<Row | null>(null);
  const [stage, setStage] = useState('ALL');
  const orgs = useOptions('/org-units', 'name');
  const customers = useOptions('/customers', 'name');
  const products = useOptions('/products', 'name');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/leads'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const createFields: FormField[] = [
    { name: 'orgUnitId', label: '담당 지점', required: true, type: 'select', options: orgs },
    { name: 'customerName', label: '고객명', required: true, placeholder: '홍길동' },
    { name: 'customerPhone', label: '연락처', placeholder: '010-0000-0000' },
    { name: 'source', label: '접수경로', placeholder: 'HOMEPAGE / AIBOT ...' },
    { name: 'serviceLine', label: '서비스라인', type: 'select', options: SERVICE_LINES },
    { name: 'fromAddress', label: '출발지', type: 'address', addrPrefix: 'from' },
    { name: 'toAddress', label: '도착지', type: 'address', addrPrefix: 'to' },
  ];

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

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api('/leads', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onTransition = async (values: Record<string, unknown>) => {
    if (!transRow) return;
    try {
      await api(`/leads/${transRow.id as string}/transition`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      setTransRow(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onCreateEstimate = async (values: Record<string, unknown>) => {
    if (!estRow) return;
    try {
      const inheritedAddr = Object.fromEntries(
        ADDR_KEYS.filter((kk) => estRow[kk] != null).map((kk) => [kk, estRow[kk]]),
      );
      const created = await api<{ id: string }>('/estimates', {
        method: 'POST',
        body: JSON.stringify({
          leadId: estRow.id,
          orgUnitId: estRow.orgUnitId,
          ...inheritedAddr,
          ...values,
        }),
      });
      toast({ type: 'success', title: t('common.created') });
      setEstRow(null);
      navigate(`/estimates/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const columns: Column[] = [
    {
      title: '접수번호',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/leads/${r.id as string}`)}>
          {String(r.leadNo)}
        </Button>
      ),
    },
    {
      title: '고객',
      render: (r) => {
        const c = r.customer as { name?: string; phonePrimary?: string } | null;
        return c?.name ? (
          <span>
            <b>{c.name}</b>
            {c.phonePrimary ? (
              <span style={{ color: 'var(--ark-color-text-tertiary)' }}> · {c.phonePrimary}</span>
            ) : null}
          </span>
        ) : (
          '-'
        );
      },
    },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS} /> },
    { title: '출처', render: (r) => String(r.source ?? '-') },
    { title: '서비스', render: (r) => String(r.serviceLine ?? '-') },
    {
      title: '이사 경로',
      render: (r) =>
        r.fromAddr || r.toAddr ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <AddressView
              label="출발"
              zipcode={r.fromZipcode as string}
              addr={r.fromAddr as string}
              addrDetail={r.fromAddrDetail as string}
              lat={r.fromLat as number}
              lng={r.fromLng as number}
            />
            <AddressView
              label="도착"
              zipcode={r.toZipcode as string}
              addr={r.toAddr as string}
              addrDetail={r.toAddrDetail as string}
              lat={r.toLat as number}
              lng={r.toLng as number}
            />
          </div>
        ) : (
          '-'
        ),
    },
    {
      title: '작업',
      render: (r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" size="sm" onClick={() => setEstRow(r)}>
            {t('lead.toEstimate')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransRow(r)}>
            {t('lead.changeStatus')}
          </Button>
        </div>
      ),
    },
  ];

  const current = STAGES.find((s) => s.key === stage) ?? STAGES[0];
  const filtered = rows.filter((r) => inStage(String(r.status), current.statuses));
  const countFor = (statuses: string[] | null) =>
    rows.filter((r) => inStage(String(r.status), statuses)).length;
  const expectedSum = filtered.reduce((acc, r) => acc + Number(r.expectedAmount ?? 0), 0);
  const doneCount = rows.filter((r) => r.status === 'DONE').length;
  const doneRate = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;

  const kpis = [
    { label: `케이스 수 (${current.label})`, value: String(filtered.length) },
    { label: '예상가치', value: `₩${won(expectedSum)}` },
    { label: '완료율 (전체)', value: `${doneRate}%` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              border: '1px solid var(--ark-color-gray-200)',
              borderRadius: 12,
              padding: '16px 20px',
              background: 'var(--ark-color-bg)',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--ark-color-text-secondary)' }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <PageCard
        title="영업 파이프라인"
        count={filtered.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + {t('lead.register')}
          </Button>
        }
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {STAGES.map((s) => (
            <Button
              key={s.key}
              variant={stage === s.key ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setStage(s.key)}
            >
              {s.label} ({countFor(s.statuses)})
            </Button>
          ))}
        </div>
        <DataTable columns={columns} rows={filtered} loading={loading} />
      </PageCard>

      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('lead.register')}
        size="md"
        fields={createFields}
        onSubmit={onCreate}
      />

      <FormModal
        open={!!transRow}
        onOpenChange={(o) => !o && setTransRow(null)}
        title={`${t('lead.changeStatus')} — ${(transRow?.leadNo as string) ?? ''}`}
        fields={[
          {
            name: 'to',
            label: '변경할 상태',
            required: true,
            type: 'select',
            options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
          },
        ]}
        onSubmit={onTransition}
      />

      <FormModal
        open={!!estRow}
        onOpenChange={(o) => !o && setEstRow(null)}
        title={`${t('lead.toEstimate')} — ${(estRow?.leadNo as string) ?? ''}`}
        size="md"
        initialValues={estRow?.customerId ? { customerId: String(estRow.customerId) } : undefined}
        fields={[
          { name: 'customerId', label: '고객', required: true, type: 'select', options: customers },
          {
            name: 'productId',
            label: '이사상품',
            required: true,
            type: 'select',
            options: products,
          },
          { name: 'fromPyeong', label: '출발지 평수', type: 'number' },
          { name: 'toPyeong', label: '도착지 평수', type: 'number' },
        ]}
        onSubmit={onCreateEstimate}
      />
    </div>
  );
}
