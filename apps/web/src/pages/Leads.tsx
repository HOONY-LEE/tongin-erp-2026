import i18n from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUrlFilter } from '../lib/useUrlFilter';
import { useOrgUnits } from '../lib/orgUnits';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useLeadCreateForm } from '../components/lead/useLeadCreateForm';
import { useLeadDuplicateGate } from '../components/lead/LeadDuplicateGate';
import {
  AddressView,
  Button,
  CopyText,
  DataTable,
  FilterButton,
  FormModal,
  ListPage,
  useToast,
  type Column,
  type DateRange,
  type FilterField,
  type FilterValues,
  type Row,
} from '../components/ui';
import {
  LEAD_STATUS,
  LEAD_STATUS_COLOR,
  LEAD_STATUS_SOLID,
  RECEIPT_SOURCES,
  SERVICE_LINES,
  codeLabel,
} from '../lib/leadCodes';
import { EmployeeChip, type EmployeeBrief } from '../components/ui/EmployeeChip';
import { Phone } from 'softium-ui/table';
import { StatusChip } from '../components/ui/StatusChip';
import { DocumentViewer } from '../components/ui/DocumentViewer';
import { FileText } from 'lucide-react';

const STATUS = LEAD_STATUS;

/** 지점에서 반려돼 본사로 돌아온 접수 — 다시 배정할 때까지 상태는 '반려' */
type LeadContract = {
  id: string;
  contractNo: string;
  status: string;
  estimateId: string;
  /** 보기 창에서 붙인다(파일 이름) */
  customerName?: string;
};

const isRejected = (r: Row) => !!r.rejectedAt && r.status === 'RECEIVED';
/** 화면의 상태 — 반려는 따로, 견적완료(QUOTED)는 계약미승인과 한 단계로 */
const statusKey = (r: Row) =>
  isRejected(r) ? 'REJECTED' : r.status === 'QUOTED' ? 'CONTRACT_PENDING' : String(r.status);

// 상태 필터 — 모든 상태(반려 포함, 견적완료는 계약미승인에 포함)
const STAGES: { key: string; label: string }[] = [
  { key: 'RECEIVED', label: i18n.t('leads.st.RECEIVED') },
  { key: 'REJECTED', label: i18n.t('leads.st.REJECTED') },
  { key: 'CONSULT_TOSS', label: STATUS.CONSULT_TOSS.label },
  { key: 'CONTRACT_PENDING', label: STATUS.CONTRACT_PENDING.label },
  { key: 'CONTRACTED', label: STATUS.CONTRACTED.label },
  { key: 'WORK_TOSS', label: STATUS.WORK_TOSS.label },
  { key: 'DONE', label: STATUS.DONE.label },
  { key: 'CANCELED', label: STATUS.CANCELED.label },
];
/** 필터 값 → 서버 검색 주소 조건 */
const searchParams = (flt: FilterValues, q: string) => {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  if ((flt.stage as string[] | undefined)?.length)
    p.set('stage', (flt.stage as string[]).join(','));
  const period = flt.period as DateRange | undefined;
  if (period?.from) p.set('from', period.from);
  if (period?.to) p.set('to', period.to);
  if (period?.on) p.set('period', period.on);
  for (const k of ['source', 'serviceLine', 'fromSido', 'org'])
    if ((flt[k] as string[] | undefined)?.length) p.set(k, (flt[k] as string[]).join(','));
  for (const k of ['owner', 'contract']) if (flt[k]) p.set(k, flt[k] as string);
  return p.toString();
};
type LeadSearchResult = {
  rows: Row[];
  limited: boolean;
  counts: Record<string, number>;
  regions: string[];
};

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
  /** 검색 옆 필터 — 기간·상태·경로·상품·지역·담당·계약서 */
  const [flt, setFlt] = useUrlFilter();
  // 담당 지점 필터 — 조직 목록을 볼 수 있는 계정만(못 보면 칸을 숨긴다)
  const { units } = useOrgUnits();
  const branches = units.filter((u) => u.type === 'BRANCH' && u.isActive);
  /** 표 검색칸 — 서버에서 찾는다(접수번호·옛 번호·고객명·전화·출발지) */
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [regions, setRegions] = useState<string[]>([]);
  /** 조건에 맞는 접수가 한 번에 보낼 수(1,000건)보다 많다 */
  const [limited, setLimited] = useState(false);
  const query = searchParams(flt, q);
  /** 계약서 보기 창 */
  const [doc, setDoc] = useState<LeadContract | null>(null);
  const { updatedAt, touch } = useUpdatedAt();

  // 간편접수 창 항목·기본값 — 상담 콘솔과 같은 창
  const { fields: createFields, defaults } = useLeadCreateForm();
  const dup = useLeadDuplicateGate();

  // 늦게 온 앞선 응답이 최근 조건의 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const res = await api<LeadSearchResult>(`/leads/search${query ? `?${query}` : ''}`);
      if (my !== seq.current) return;
      setCounts(res.counts);
      setRegions(res.regions);
      setLimited(res.limited);
      // 접수번호 칸 검색값에 옛 번호(이전 전산·시연 번호)도
      setRows(
        res.rows.map((r) => ({
          ...r,
          leadNoSearch: [r.leadNo, r.legacyNo].filter(Boolean).join(' '),
          ownerName: (r.ownerEmp as EmployeeBrief | null)?.name ?? '',
        })),
      );
      touch();
    } catch (e) {
      if (my === seq.current)
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [toast, t, query]);

  // 조건이 바뀌면 잠깐 기다렸다가(검색칸 타자 중엔 한 번만) 다시 받는다
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
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
    // 같은 출발지·서비스 요청일의 접수가 먼저 있으면 하나로 진행하게 묻는다(창을 닫으면 입력 창은 그대로)
    const pick = await dup.ask(values);
    if (!pick) throw new Error('duplicate-check-closed');
    try {
      const created =
        pick.kind === 'existing'
          ? { id: pick.lead.id }
          : await api<{ id: string }>('/leads', {
              method: 'POST',
              body: JSON.stringify({
                ...values,
                ...(pick.kind === 'replace' && { replaceLeadId: pick.lead.id }),
              }),
            });
      toast({
        type: 'success',
        title:
          pick.kind === 'existing'
            ? t('leadDup.linked', { v0: pick.lead.leadNo })
            : t('common.created'),
      });
      // 콜에서 온 접수면 그 콜을 끝내고 접수와 잇는다(실패해도 접수는 남아 있으니 알리기만)
      if (callId)
        await api(`/cs-calls/${callId}/finish`, {
          method: 'POST',
          body: JSON.stringify({ result: 'DONE', leadId: created.id }),
        }).catch(() =>
          toast({
            type: 'warning',
            title: t('leads.callNotClosed'),
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
      title: t('leads.col.no'),
      dataIndex: 'leadNoSearch',
      // 칸 폭 고정 — 탭(상태)마다 데이터가 달라도 표 모양이 그대로(접수번호 12자 + 복사 아이콘)
      width: 172,
      render: (r) => <CopyText value={String(r.leadNo)} />,
      exportValue: (r) => String(r.leadNo),
    },
    {
      title: t('leads.col.customer'),
      // 이름이 긴 고객(법인명 등)이 많다
      width: 150,
      render: (r) => <b>{(r.customer as { name?: string } | null)?.name ?? '-'}</b>,
      exportValue: (r) => (r.customer as { name?: string } | null)?.name ?? '',
    },
    {
      title: t('leads.col.phone'),
      width: 148,
      render: (r) => {
        const phone = (r.customer as { phonePrimary?: string } | null)?.phonePrimary;
        return phone ? <Phone value={phone} link={false} /> : '-';
      },
    },
    {
      title: t('leads.col.product'),
      // 상품 이름이 긴 경우가 많다
      width: 170,
      render: (r) => codeLabel(SERVICE_LINES, r.serviceLine as string),
    },
    {
      title: t('leads.col.source'),
      width: 112,
      render: (r) => codeLabel(RECEIPT_SOURCES, r.source as string),
    },
    {
      title: t('leads.col.status'),
      dataIndex: 'status',
      width: 112,
      render: (r) => {
        const key = statusKey(r);
        return (
          <StatusChip
            color={LEAD_STATUS_COLOR[key] ?? LEAD_STATUS_COLOR.CANCELED}
            solid={LEAD_STATUS_SOLID.has(key)}
            mono
          >
            {key === 'REJECTED' ? t('leads.st.REJECTED') : (STATUS[key]?.label ?? key)}
          </StatusChip>
        );
      },
      exportValue: (r) => {
        const key = statusKey(r);
        return key === 'REJECTED' ? t('leads.st.REJECTED') : (STATUS[key]?.label ?? key);
      },
    },
    {
      title: t('leads.col.owner'),
      dataIndex: 'ownerName',
      width: 128,
      mask: false,
      render: (r) => {
        const emp = r.ownerEmp as EmployeeBrief | null;
        return emp ? (
          <EmployeeChip emp={emp} />
        ) : (
          <span style={{ color: 'var(--ark-color-text-tertiary)' }}>-</span>
        );
      },
      exportValue: (r) => (r.ownerEmp as EmployeeBrief | null)?.name ?? '',
    },
    {
      title: t('leads.col.contract'),
      width: 172,
      mask: false,
      render: (r) => {
        const c = (r.contracts as LeadContract[] | undefined)?.[0];
        return c ? (
          <button
            type="button"
            className="dt-doc-btn"
            title={t('leads.viewContract')}
            onClick={(e) => {
              e.stopPropagation(); // 행 클릭(접수 상세)과 겹치지 않게
              setDoc({ ...c, customerName: (r.customer as { name?: string } | null)?.name });
            }}
          >
            <FileText size={14} aria-hidden />
            <span className="id-mono">{c.contractNo}</span>
          </button>
        ) : (
          <span style={{ color: 'var(--ark-color-text-tertiary)' }}>-</span>
        );
      },
      exportValue: (r) => (r.contracts as LeadContract[] | undefined)?.[0]?.contractNo ?? '',
    },
    {
      title: t('leads.col.at'),
      dataIndex: 'createdAt',
      width: 168,
      render: (r) => fmtDateTime(r.createdAt),
      exportValue: (r) => fmtDateTime(r.createdAt),
    },
    {
      title: t('leads.col.from'),
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

  const filterFields: FilterField[] = [
    {
      key: 'period',
      label: t('leads.flt.period'),
      type: 'date',
      options: [
        { value: 'createdAt', label: t('leads.flt.createdAt') },
        { value: 'moveDate', label: t('leads.flt.moveDate') },
        { value: 'visitDate', label: t('leads.flt.visitDate') },
      ],
    },
    {
      key: 'stage',
      label: t('leads.col.status'),
      type: 'multi',
      // 상태마다 건수(다른 조건을 건 상태에서 서버가 센 값)
      options: STAGES.map((s) => ({
        value: s.key,
        label: Object.keys(counts).length ? `${s.label} ${counts[s.key] ?? 0}` : s.label,
      })),
    },
    { key: 'source', label: t('leads.flt.source'), type: 'multi', options: RECEIPT_SOURCES },
    { key: 'serviceLine', label: t('leads.flt.product'), type: 'multi', options: SERVICE_LINES },
    ...(regions.length
      ? [
          {
            key: 'fromSido',
            label: t('leads.flt.region'),
            type: 'multi',
            options: regions.map((x) => ({ value: x, label: x })),
          } as FilterField,
        ]
      : []),
    ...(branches.length
      ? [
          {
            key: 'org',
            label: t('leads.flt.branch'),
            type: 'multi',
            options: branches.map((u) => ({ value: u.id, label: u.name })),
          } as FilterField,
        ]
      : []),
    {
      key: 'owner',
      label: t('leads.flt.owner'),
      type: 'single',
      options: [
        { value: 'yes', label: t('leads.flt.assigned') },
        { value: 'no', label: t('leads.flt.unassigned') },
      ],
    },
    {
      key: 'contract',
      label: t('leads.flt.contract'),
      type: 'single',
      options: [
        { value: 'yes', label: t('leads.flt.has') },
        { value: 'no', label: t('leads.flt.none') },
      ],
    },
  ];
  // 필터·검색은 서버에서
  const filtered = rows;

  return (
    // 화면 높이에 맞춘다 — 기본 20개씩 보기, 화면에 다 안 들어가는 행은 표 안에서 스크롤(풋터는 늘 보임)
    <ListPage fit title={t('nav.leads')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        filters={
          <FilterButton fields={filterFields} value={flt} onChange={setFlt} limited={limited} />
        }
        onSearch={setQ}
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
        exportCompact
        exportFileName="leads"
      />

      <FormModal
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          // 콜에서 온 창을 닫으면 주소의 번호를 지운다(새로고침해도 다시 뜨지 않게)
          if (!o && fromCall && !leaving.current) setParams({}, { replace: true });
        }}
        title={fromCall ? t('leads.fromCall', { v0: t('lead.register') }) : t('lead.register')}
        size="md"
        fields={createFields}
        initialValues={createInitial}
        onSubmit={onCreate}
      />
      {dup.modal}
      {doc && (
        <DocumentViewer
          path={`/estimates/${doc.estimateId}/document`}
          estimatePath={`/estimates/${doc.estimateId}`}
          title={t('leads.contractTitle', {
            v0: doc.contractNo,
            v1: doc.customerName ? ` · ${doc.customerName}` : '',
          })}
          fileName={t('leads.contractFile', {
            v0: doc.customerName || t('leads.customerFallback'),
            v1: doc.contractNo,
          })}
          onClose={() => setDoc(null)}
        />
      )}
    </ListPage>
  );
}
