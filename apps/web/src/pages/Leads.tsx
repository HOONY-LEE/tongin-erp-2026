import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useLeadCreateForm } from '../components/lead/useLeadCreateForm';
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
  type Row,
} from '../components/ui';
import { LEAD_STATUS, RECEIPT_SOURCES, SERVICE_LINES, codeLabel } from '../lib/leadCodes';
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
  { key: 'INTAKE', label: '접수', statuses: ['RECEIVED', 'CONSULT_TOSS'] },
  { key: 'QUOTE', label: '견적', statuses: ['QUOTED', 'CONTRACT_PENDING'] },
  { key: 'CONTRACT', label: '계약', statuses: ['CONTRACTED'] },
  { key: 'WORK', label: '작업', statuses: ['WORK_TOSS', 'DONE'] },
];
const inStage = (status: string, statuses: string[] | null) =>
  statuses === null ? true : statuses.includes(status);

export default function Leads() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // 상담 콘솔에서 콜백·콜 받기로 왔으면(?new=1&phone=…&call=…) 그 번호가 들어간 접수 창을 바로 연다
  const [params, setParams] = useSearchParams();
  const fromCall = params.get('new') === '1';
  const callId = params.get('call');
  // 접수를 등록해 상세로 가는 중에는 창이 닫혀도 주소를 건드리지 않는다(목록으로 되돌아가지 않게)
  const leaving = useRef(false);
  useEffect(() => {
    if (fromCall) setCreateOpen(true);
  }, [fromCall]);
  const [stage, setStage] = useState('ALL');
  const { updatedAt, touch } = useUpdatedAt();

  // 간편접수 창 항목·기본값 — 상담 콘솔과 같은 창
  const { fields: createFields, defaults } = useLeadCreateForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 접수번호 칸 검색값에 옛 번호(이전 전산·시연 번호)도 — 옛 번호로 찾아도 나온다
      setRows(
        (await api<Row[]>('/leads')).map((r) => ({
          ...r,
          leadNoSearch: [r.leadNo, r.legacyNo].filter(Boolean).join(' '),
        })),
      );
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

  const createInitial: Record<string, string> = { ...defaults };
  if (fromCall) {
    const phone = params.get('phone');
    const name = params.get('name');
    if (phone) createInitial.customerPhone = phone;
    if (name) createInitial.customerName = name;
    createInitial.source = 'PHONE';
  }

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      const created = await api<{ id: string }>('/leads', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: t('common.created') });
      // 콜에서 온 접수면 그 콜을 끝내고 접수와 잇는다(실패해도 접수는 남아 있으니 알리기만)
      if (callId)
        await api(`/cs-calls/${callId}/finish`, {
          method: 'POST',
          body: JSON.stringify({ result: 'DONE', leadId: created.id }),
        }).catch(() =>
          toast({
            type: 'warning',
            title: '접수는 등록했지만 콜을 끝내지 못했습니다 — 상담 콘솔에서 끝내 주세요',
          }),
        );
      // 접수 상세(= 견적서 화면)로 바로 — 견적은 상세를 열 때 자동으로 만들어진다
      leaving.current = true;
      navigate(`/leads/${created.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const columns: Column[] = [
    {
      title: '접수번호',
      dataIndex: 'leadNoSearch',
      // 접수번호 + 호버 복사 버튼이 잘리지 않을 만큼은 확보한다.
      minWidth: 110,
      render: (r) => <CopyText value={String(r.leadNo)} />,
      exportValue: (r) => String(r.leadNo),
    },
    {
      title: '고객명',
      // 이름이 긴 고객(법인명 등)이 많다
      minWidth: 140,
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
        const chip = (
          <Chip tone={CHIP_TONE[s?.color ?? 'neutral']}>{s?.label ?? String(r.status)}</Chip>
        );
        // 지점에서 반려돼 본사로 돌아온 접수 — 다시 배정할 때까지 상태는 '반려'
        return r.rejectedAt && r.status === 'RECEIVED' ? (
          <Chip tone={CHIP_TONE.warning}>반려</Chip>
        ) : (
          chip
        );
      },
    },
    { title: '접수경로', render: (r) => codeLabel(RECEIPT_SOURCES, r.source as string) },
    {
      title: '상품',
      // 상품 이름이 긴 경우가 많다
      minWidth: 160,
      render: (r) => codeLabel(SERVICE_LINES, r.serviceLine as string),
    },
    {
      title: '출발',
      flex: 1,
      minWidth: 220,
      render: (r) => (
        <AddressView
          zipcode={r.fromZipcode as string}
          addr={r.fromAddr as string}
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
        onOpenChange={(o) => {
          setCreateOpen(o);
          // 콜에서 온 창을 닫으면 주소의 번호를 지운다(새로고침해도 다시 뜨지 않게)
          if (!o && fromCall && !leaving.current) setParams({}, { replace: true });
        }}
        title={fromCall ? `${t('lead.register')} — 상담 콜` : t('lead.register')}
        size="md"
        fields={createFields}
        initialValues={createInitial}
        onSubmit={onCreate}
      />
    </ListPage>
  );
}
