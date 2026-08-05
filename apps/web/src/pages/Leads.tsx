import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useAuth } from '../auth/AuthContext';
import {
  AddressView,
  Button,
  DataTable,
  FormModal,
  PageCard,
  PageHeader,
  SegmentedControl,
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
const RECEIPT_SOURCES = [
  { value: 'HOMEPAGE', label: '홈페이지' },
  { value: 'AIBOT', label: 'AI상담봇' },
  { value: 'PHONE', label: '전화상담' },
  { value: 'NAVER', label: '네이버' },
  { value: 'INSTAGRAM', label: '인스타그램' },
  { value: 'PARTNER', label: '제휴사' },
  { value: 'WALK_IN', label: '방문접수' },
  { value: 'ETC', label: '기타' },
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

export default function Leads() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [stage, setStage] = useState('ALL');
  const orgs = useOptions('/org-units', 'name');
  const partners = useOptions('/partners', 'name');
  const { updatedAt, touch } = useUpdatedAt();

  // 관리자(전체 데이터범위·슈퍼권한)만 담당 지점을 자유 선택 — 일반 직원은 본인 소속 지점으로 고정
  const isAdmin = !!user && (user.permissions.includes('*') || user.scopes.some((s) => s.dataScope === 'ALL'));
  const ownOrgId = user?.scopes.find((s) => s.orgScopeId)?.orgScopeId ?? '';
  const lockOrg = !isAdmin && !!ownOrgId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/leads'));
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

  const createFields: FormField[] = [
    {
      name: 'customerName',
      label: '고객명',
      required: true,
      alwaysShow: true,
      pairWithNext: true,
      placeholder: '홍길동',
    },
    {
      name: 'customerPhone',
      label: '연락처',
      required: true,
      alwaysShow: true,
      type: 'tel',
    },
    {
      name: 'orgUnitId',
      label: '담당 지점',
      required: true,
      alwaysShow: true,
      pairWithNext: true,
      type: 'select',
      options: orgs,
      disabled: lockOrg,
    },
    {
      name: 'source',
      label: '접수경로',
      alwaysShow: true,
      type: 'select',
      options: RECEIPT_SOURCES,
    },
    {
      name: 'serviceLine',
      label: '상품명',
      required: true,
      alwaysShow: true,
      type: 'select',
      options: SERVICE_LINES,
    },
    { name: 'fromAddress', label: '출발지', alwaysShow: true, type: 'address', addrPrefix: 'from' },
    { name: 'toAddress', label: '도착지', alwaysShow: true, type: 'address', addrPrefix: 'to' },
    { name: 'partnerId', label: '거래처(제휴·B2B)', type: 'select', options: partners },
  ];
  const createInitial: Record<string, string> = { serviceLine: 'MOVING' };
  if (lockOrg) createInitial.orgUnitId = ownOrgId;

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

  const columns: Column[] = [
    { title: '접수번호', render: (r) => <b>{String(r.leadNo)}</b> },
    {
      title: '고객명',
      render: (r) => {
        const c = r.customer as { name?: string } | null;
        return c?.name ?? '-';
      },
    },
    {
      title: '전화번호',
      render: (r) => {
        const c = r.customer as { phonePrimary?: string } | null;
        return c?.phonePrimary ?? '-';
      },
    },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS} /> },
    { title: '출처', render: (r) => String(r.source ?? '-') },
    { title: '서비스', render: (r) => String(r.serviceLine ?? '-') },
    {
      title: '출발',
      render: (r) => (
        <AddressView
          zipcode={r.fromZipcode as string}
          addr={r.fromAddr as string}
          addrDetail={r.fromAddrDetail as string}
          lat={r.fromLat as number}
          lng={r.fromLng as number}
        />
      ),
    },
    {
      title: '도착',
      render: (r) => (
        <AddressView
          zipcode={r.toZipcode as string}
          addr={r.toAddr as string}
          addrDetail={r.toAddrDetail as string}
          lat={r.toLat as number}
          lng={r.toLng as number}
        />
      ),
    },
  ];

  const current = STAGES.find((s) => s.key === stage) ?? STAGES[0];
  const filtered = rows.filter((r) => inStage(String(r.status), current.statuses));
  const countFor = (statuses: string[] | null) =>
    rows.filter((r) => inStage(String(r.status), statuses)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.leads')} onRefresh={load} updatedAt={updatedAt} />

      <PageCard
        title={
          <SegmentedControl
            value={stage}
            onChange={setStage}
            options={STAGES.map((s) => ({
              value: s.key,
              label: `${s.label} (${countFor(s.statuses)})`,
            }))}
          />
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + {t('lead.register')}
          </Button>
        }
      >
        <DataTable
          columns={columns}
          rows={filtered}
          loading={loading}
          onRowClick={(r) => navigate(`/leads/${r.id as string}`)}
        />
      </PageCard>

      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('lead.register')}
        size="md"
        fields={createFields}
        initialValues={createInitial}
        onSubmit={onCreate}
      />
    </div>
  );
}
