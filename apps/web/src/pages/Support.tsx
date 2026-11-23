import i18n from '../i18n';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { tDyn } from '../i18n';
import { api, ApiError } from '../lib/api';
import { useUrlFilter } from '../lib/useUrlFilter';
import { filterQuery, LIST_LIMIT } from '../lib/serverFilter';
import { useOptions } from '../lib/useOptions';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { Phone } from 'softium-ui/table';
import { formatPhone } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { fmtDateTime } from '../lib/dateFormat';
import { AsIntakeModal } from '../components/support/AsIntakeModal';
import { AsCategoryManager } from '../components/support/AsCategoryManager';
import { PriorityLabel } from '../components/support/PriorityLabel';
import {
  Button,
  CopyText,
  DataTable,
  FilterButton,
  PageHeader,
  RecordDetail,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
} from '../components/ui';

const KIND: StatusMap = {
  CS: { label: i18n.t('misc.sup.CS'), color: 'info' },
  AS: { label: i18n.t('misc.sup.AS'), color: 'primary' },
};
const STATUS: StatusMap = {
  RECEIVED: { label: i18n.t('misc.st.received'), color: 'warning' },
  IN_PROGRESS: { label: i18n.t('misc.st.inProgress'), color: 'info' },
  RESOLVED: { label: i18n.t('misc.st.resolved'), color: 'success' },
  CLOSED: { label: i18n.t('misc.st.closed'), color: 'neutral' },
  CANCELED: { label: i18n.t('misc.st.canceled'), color: 'error' },
};

interface Ticket extends Row {
  id: string;
  ticketNo: string;
  kind: string;
  category?: string | null;
  subject: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  leadId?: string | null;
  leadNo?: string | null;
  /** 담당 지점 — 관련 접수(견적건) → 고객 지점(서버가 채움). 옛 건은 orgUnitId */
  orgName?: string | null;
  priority: string;
  status: string;
  orgUnitId?: string | null;
  channel?: string | null;
  content?: string | null;
  resolution?: string | null;
  createdAt?: string | null;
}

// 상태별 다음 액션 (간단 워크플로우)
const NEXT: Record<string, { to: string; labelKey: string }[]> = {
  RECEIVED: [{ to: 'IN_PROGRESS', labelKey: 'support.start' }],
  IN_PROGRESS: [{ to: 'RESOLVED', labelKey: 'support.resolve' }],
  RESOLVED: [{ to: 'CLOSED', labelKey: 'support.close' }],
};

export default function Support() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const orgs = useOptions('/org-units', 'name');
  /** 접수 유형(코드 → 이름) */
  const [categories, setCategories] = useState<
    { code: string; name: string; isActive?: boolean }[]
  >([]);
  const [catOpen, setCatOpen] = useState(false);
  const loadCategories = useCallback(
    () =>
      api<{ code: string; name: string; isActive?: boolean }[]>('/support-tickets/categories')
        .then(setCategories)
        .catch(() => setCategories([])),
    [],
  );
  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);
  const catName = (code?: string | null) =>
    categories.find((c) => c.code === code)?.name ?? code ?? '-';
  const orgOf = (r: Ticket) => r.orgName ?? orgs.find((o) => o.value === r.orgUnitId)?.label ?? '-';

  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  const [flt, setFlt] = useUrlFilter();
  /** 검색칸 — 서버에서 찾는다(접수번호·옛 번호·제목·내용·고객명) */
  const [q, setQ] = useState('');
  const query = filterQuery(flt, q);
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();

  const fail = useCallback(
    (e: unknown) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') }),
    [toast, t],
  );

  // 필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const data = await api<Ticket[]>(`/support-tickets${query}`);
      if (my !== seq.current) return;
      setRows(data);
      touch();
    } catch (e) {
      if (my === seq.current) fail(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [fail, query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const transition = async (id: string, to: string) => {
    try {
      await api(`/support-tickets/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      fail(e);
    }
  };

  const columns: Column[] = [
    {
      title: t('support.ticketNo'),
      dataIndex: 'ticketNo',
      width: 150,
      render: (r) => <CopyText value={String(r.ticketNo)} />,
      exportValue: (r) => String(r.ticketNo),
    },
    {
      title: t('asx.colCategory'),
      dataIndex: 'category',
      width: 110,
      render: (r) => catName(r.category as string | null),
      exportValue: (r) => catName(r.category as string | null),
    },
    { title: t('support.subject'), dataIndex: 'subject', flex: 1, minWidth: 180 },
    {
      title: t('support.customer'),
      dataIndex: 'customerName',
      width: 110,
      render: (r) => <b>{(r.customerName as string | null) ?? '-'}</b>,
      exportValue: (r) => (r.customerName as string | null) ?? '',
    },
    {
      title: t('leads.col.phone'),
      dataIndex: 'customerPhone',
      width: 140,
      render: (r) =>
        r.customerPhone ? <Phone value={String(r.customerPhone)} link={false} /> : '-',
    },
    {
      title: t('asx.colLead'),
      dataIndex: 'leadNo',
      width: 150,
      mask: false,
      render: (r) =>
        r.leadId ? (
          <button
            type="button"
            className="dt-doc-btn"
            onClick={(e) => {
              e.stopPropagation(); // 행 클릭(A/S 상세)과 겹치지 않게
              navigate(`/leads/${r.leadId as string}`);
            }}
          >
            <span className="id-mono">{String(r.leadNo)}</span>
          </button>
        ) : (
          '-'
        ),
      exportValue: (r) => (r.leadNo as string | null) ?? '',
    },
    {
      title: t('asx.colOrg'),
      width: 120,
      render: (r) => orgOf(r as Ticket),
    },
    {
      title: t('support.priority'),
      dataIndex: 'priority',
      width: 90,
      mask: false,
      render: (r) => <PriorityLabel value={r.priority as string} />,
      exportValue: (r) =>
        t(
          r.priority === 'HIGH'
            ? 'support.high'
            : r.priority === 'LOW'
              ? 'support.low'
              : 'support.normal',
        ),
    },
    {
      title: t('support.status'),
      dataIndex: 'status',
      width: 100,
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS} />,
    },
    {
      title: t('asx.colAt'),
      dataIndex: 'createdAt',
      width: 150,
      render: (r) => fmtDateTime(r.createdAt as string),
      exportValue: (r) => fmtDateTime(r.createdAt as string),
    },
  ];

  const KIND_OPTS = [
    { value: 'CS', label: t('support.cs') },
    { value: 'AS', label: t('support.as') },
  ];
  const CHANNEL_OPTS = [
    { value: 'PHONE', label: t('support.phone') },
    { value: 'EMAIL', label: t('misc.email') },
    { value: 'KAKAO', label: t('misc.kakao') },
    { value: 'VISIT', label: t('support.visit') },
  ];
  const PRIORITY_OPTS = [
    { value: 'HIGH', label: t('support.high') },
    { value: 'NORMAL', label: t('support.normal') },
    { value: 'LOW', label: t('support.low') },
  ];

  const filterFields: FilterField[] = [
    { key: 'createdAt', label: t('misc.receivedAt'), type: 'date' },
    {
      key: 'category',
      label: t('asx.colCategory'),
      type: 'multi',
      options: categories.map((c) => ({ value: c.code, label: c.name })),
    },
    { key: 'kind', label: t('support.kind'), type: 'multi', options: KIND_OPTS },
    {
      key: 'status',
      label: t('support.status'),
      type: 'multi',
      options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
    },
    {
      key: 'priority',
      label: t('support.priority'),
      type: 'multi',
      options: PRIORITY_OPTS,
    },
    {
      key: 'channel',
      label: t('support.channel'),
      type: 'multi',
      options: CHANNEL_OPTS,
    },
  ];

  if (detailId) {
    const d = rows.find((r) => r.id === detailId);
    const channelOpts = CHANNEL_OPTS;
    return (
      <RecordDetail
        loading={!d && loading}
        title={d ? `${d.ticketNo} ${d.subject}` : t('misc.notFound')}
        backLabel={t('nav.support')}
        onBack={closeDetail}
        actions={
          d ? (
            // 행 끝에 두던 처리 단계 버튼 — 상세 머리글로 옮겼다
            <>
              {d.status !== 'CLOSED' && d.status !== 'CANCELED' && (
                <Button variant="ghost" size="sm" onClick={() => transition(d.id, 'CANCELED')}>
                  {t('support.cancel')}
                </Button>
              )}
              {(NEXT[d.status] ?? []).map((n) => (
                <Button
                  key={n.to}
                  variant="primary"
                  size="sm"
                  onClick={() => transition(d.id, n.to)}
                >
                  {tDyn(n.labelKey)}
                </Button>
              ))}
            </>
          ) : undefined
        }
        sections={
          d
            ? [
                {
                  title: t('misc.ticketInfo'),
                  items: [
                    { label: t('support.ticketNo'), value: d.ticketNo },
                    { label: t('support.kind'), value: <StatusBadge value={d.kind} map={KIND} /> },
                    {
                      label: t('support.status'),
                      value: <StatusBadge value={d.status} map={STATUS} />,
                    },
                    { label: t('asx.colCategory'), value: catName(d.category) },
                    { label: t('support.priority'), value: <PriorityLabel value={d.priority} /> },
                    {
                      label: t('support.customer'),
                      value: d.customerName
                        ? `${d.customerName}${d.customerPhone ? ` · ${formatPhone(d.customerPhone)}` : ''}`
                        : '-',
                    },
                    {
                      label: t('asx.colLead'),
                      value: d.leadId ? (
                        <button
                          type="button"
                          className="dt-doc-btn"
                          onClick={() => navigate(`/leads/${d.leadId as string}`)}
                        >
                          <span className="id-mono">{d.leadNo}</span>
                        </button>
                      ) : (
                        '-'
                      ),
                    },
                    { label: t('asx.colOrg'), value: orgOf(d) },
                    {
                      label: t('support.channel'),
                      value: channelOpts.find((o) => o.value === d.channel)?.label ?? d.channel,
                    },
                    { label: t('misc.receivedAt'), value: d.createdAt?.slice(0, 10) },
                  ],
                },
                {
                  title: t('misc.content'),
                  items: [
                    { label: t('support.subject'), value: d.subject, wide: true },
                    { label: t('support.content'), value: d.content, wide: true },
                    { label: t('misc.resolution'), value: d.resolution, wide: true },
                  ],
                },
              ]
            : []
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t('nav.support')} onRefresh={load} updatedAt={updatedAt} />
      <DataTable
        filters={
          <FilterButton
            fields={filterFields}
            value={flt}
            onChange={setFlt}
            limited={rows.length >= LIST_LIMIT}
          />
        }
        onSearch={setQ}
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => openDetail(String(r.id))}
        exportable
        exportCompact
        exportFileName="as"
        toolbarActions={
          <>
            {/* 접수 유형 관리 — 관리자만 */}
            {can('COMMON_CODE.UPDATE') && (
              <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
                <Settings2 size={15} /> {t('asx.manage')}
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
              + {t('asx.btn')}
            </Button>
          </>
        }
      />

      <AsIntakeModal open={open} onClose={() => setOpen(false)} onCreated={() => void load()} />
      <AsCategoryManager
        open={catOpen}
        onClose={() => {
          setCatOpen(false);
          void loadCategories();
        }}
      />
    </div>
  );
}
