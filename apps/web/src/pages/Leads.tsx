import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useOrgScope } from '../lib/useOrgScope';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useAuth } from '../auth/AuthContext';
import {
  AddressView,
  Button,
  CopyText,
  DataTable,
  FormModal,
  ListPage,
  SegmentedControl,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';
import { LEAD_STATUS, RECEIPT_SOURCES, SERVICE_LINES, codeLabel } from '../lib/leadCodes';
import { MOVE_KIND_LABEL, PARTNER_TYPE_LABEL, moveKindOf, type PartnerType } from '@tongin/shared';
import { Chip, Phone, type ChipTone } from 'softium-ui/table';

const STATUS = LEAD_STATUS;

// softium-ui Chip은 akron-ui StatusBadge와 톤 이름이 달라 매핑 필요(primary→accent, error→danger)
const CHIP_TONE: Record<string, ChipTone> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  primary: 'accent',
  success: 'success',
  error: 'danger',
};

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
  // 제휴·전속 업체 — 지점 직원도 고를 수 있게 접수 권한으로 받는 목록
  const [partners, setPartners] = useState<{ value: string; label: string; type: string }[]>([]);
  useEffect(() => {
    void api<{ id: string; name: string; type: string }[]>('/partners/options')
      .then((r) =>
        setPartners(
          r.map((p) => ({
            value: p.id,
            label: `[${PARTNER_TYPE_LABEL[p.type as PartnerType] ?? p.type}] ${p.name}`,
            type: p.type,
          })),
        ),
      )
      .catch(() => setPartners([]));
  }, []);
  const { updatedAt, touch } = useUpdatedAt();

  // 담당 지점 — 목록은 전체를 보여주고, 권한 밖 지점만 흐리게(선택 불가) 처리한다.
  const { options: orgs, ownOrgId, unrestricted: isAdmin } = useOrgScope();

  // 담당자 — 기본값은 항상 본인. 권한이 넓은 사용자만 다른 직원으로 바꿀 수 있다.
  // 직원 목록(/employees)은 EMPLOYEE.READ가 있어야 읽히는데, 바꿀 수 없는 사용자에게는
  // 애초에 필요 없다 — 그 경우 본인 한 명만 담은 목록을 만들어 비활성 상태로 보여준다.
  const employees = useOptions('/employees', 'name');
  const ownEmpOption =
    user?.employeeId && user.employeeName
      ? [{ value: user.employeeId, label: user.employeeName }]
      : [];
  const ownerOptions = isAdmin && employees.length ? employees : ownEmpOption;

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
    },
    {
      name: 'ownerEmpId',
      label: '담당자',
      alwaysShow: true,
      type: 'select',
      options: ownerOptions,
      // 본인 고정 — 담당자를 바꿀 권한이 없으면 목록을 열 필요도 없다.
      disabled: !isAdmin,
    },
    {
      name: 'source',
      label: '접수경로',
      alwaysShow: true,
      pairWithNext: true,
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
    {
      name: 'partnerId',
      label: '제휴·전속 업체(제휴이사·전속이사) — 전속이사는 본사 부서로만 배정',
      type: 'select',
      searchable: true,
      alwaysShow: true,
      options: partners,
    },
  ];
  // ERP 화면에서 직원이 직접 등록하는 접수라 경로는 '시스템'이 기본이다.
  const createInitial: Record<string, string> = { serviceLine: 'MOVING', source: 'SYSTEM' };
  // 지점 소속이면 그 지점, 관리자처럼 지점 스코프가 없으면 연결된 직원의 조직(시스템관리자)
  const defaultOrg = ownOrgId || user?.employeeOrgUnitId || '';
  if (defaultOrg) createInitial.orgUnitId = defaultOrg;
  if (user?.employeeId) createInitial.ownerEmpId = user.employeeId;

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      const created = await api<{ id: string }>('/leads', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      // 접수 상세(= 견적서 화면)로 바로 — 견적은 상세를 열 때 자동으로 만들어진다
      navigate(`/leads/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const columns: Column[] = [
    {
      title: '접수번호',
      dataIndex: 'leadNo',
      // 접수번호 + 호버 복사 버튼이 잘리지 않을 만큼은 확보한다.
      minWidth: 110,
      render: (r) => <CopyText value={String(r.leadNo)} />,
    },
    {
      title: '고객명',
      render: (r) => (r.customer as { name?: string } | null)?.name ?? '-',
    },
    {
      title: '전화번호',
      render: (r) => {
        const phone = (r.customer as { phonePrimary?: string } | null)?.phonePrimary;
        return phone ? <Phone value={phone} link={false} /> : '-';
      },
    },
    {
      title: '상태',
      dataIndex: 'status',
      render: (r) => {
        const s = STATUS[String(r.status)];
        return <Chip tone={CHIP_TONE[s?.color ?? 'neutral']}>{s?.label ?? String(r.status)}</Chip>;
      },
    },
    { title: '접수경로', render: (r) => codeLabel(RECEIPT_SOURCES, r.source as string) },
    { title: '상품', render: (r) => codeLabel(SERVICE_LINES, r.serviceLine as string) },
    {
      title: '이사 구분',
      render: (r) => {
        const p = r.partner as { name: string; type: string } | null;
        const kind = moveKindOf(p?.type);
        if (kind === 'GENERAL')
          return <span style={{ color: 'var(--ark-color-text-tertiary)' }}>일반</span>;
        return (
          <span title={p?.name}>
            <Chip tone={kind === 'EXCLUSIVE' ? 'warning' : 'info'}>{MOVE_KIND_LABEL[kind]}</Chip>{' '}
            {p?.name}
          </span>
        );
      },
      exportValue: (r) => {
        const p = r.partner as { name: string; type: string } | null;
        const kind = moveKindOf(p?.type);
        return kind === 'GENERAL' ? '일반이사' : `${MOVE_KIND_LABEL[kind]} · ${p?.name}`;
      },
    },
    {
      title: '출발',
      flex: 1,
      minWidth: 220,
      render: (r) => (
        <AddressView
          zipcode={r.fromZipcode as string}
          addr={r.fromAddr as string}
          addrDetail={r.fromAddrDetail as string}
          map={false}
          nowrap
        />
      ),
    },
    {
      title: '도착',
      flex: 1,
      minWidth: 220,
      render: (r) => (
        <AddressView
          zipcode={r.toZipcode as string}
          addr={r.toAddr as string}
          addrDetail={r.toAddrDetail as string}
          map={false}
          nowrap
        />
      ),
    },
  ];

  const current = STAGES.find((s) => s.key === stage) ?? STAGES[0];
  const filtered = rows.filter((r) => inStage(String(r.status), current.statuses));
  const countFor = (statuses: string[] | null) =>
    rows.filter((r) => inStage(String(r.status), statuses)).length;

  return (
    // 화면 높이에 맞춘다 — 기본 20개씩 보기, 화면에 다 안 들어가는 행은 표 안에서 스크롤(풋터는 늘 보임)
    <ListPage fit title={t('nav.leads')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        tabs={
          <SegmentedControl
            value={stage}
            onChange={setStage}
            options={STAGES.map((s) => ({
              value: s.key,
              label: loading && !rows.length ? s.label : `${s.label} ${countFor(s.statuses)}`,
            }))}
          />
        }
        fit
        pageSize={20}
        columns={columns}
        rows={filtered}
        loading={loading}
        onRowClick={(r) => navigate(`/leads/${r.id as string}`)}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + {t('lead.register')}
          </Button>
        }
        exportable
        exportFileName="leads"
      />

      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('lead.register')}
        size="md"
        fields={createFields}
        initialValues={createInitial}
        onSubmit={onCreate}
      />
    </ListPage>
  );
}
