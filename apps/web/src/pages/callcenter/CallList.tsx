import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { fmtDateTime } from '../../lib/dateFormat';
import { StatusChip } from '../../components/ui/StatusChip';
import { EmployeeChip, type EmployeeBrief } from '../../components/ui/EmployeeChip';
import { CopyText } from '../../components/ui/CopyText';
import { APPLE } from '../../lib/palette';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { DialButton } from './DialButton';
import { api, ApiError } from '../../lib/api';
import { LIST_LIMIT } from '../../lib/serverFilter';
import { useAuth } from '../../auth/AuthContext';
import {
  DataTable,
  FilterButton,
  SegmentedControl,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
} from '../../components/ui';
import { Phone as PhoneCell } from 'softium-ui/table';
import styles from '../callcenter.module.css';

export interface CallRow {
  callNo?: string | null;
  id: string;
  phone: string;
  status: string;
  channel: string | null;
  customerId: string | null;
  customerName: string | null;
  agentEmpId: string | null;
  agentName: string | null;
  leadId: string | null;
  leadNo: string | null;
  receivedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  hasRecording: boolean;
  hasTranscript?: boolean;
  memo: string | null;
  request: string | null;
}

/** 콜 상태 칩 색 — 애플 시스템 색(접수 상태 칩과 같은 모양) */
const CALL_STATUS_COLOR: Record<string, string> = {
  OPEN: APPLE.orange,
  OUTCALL: APPLE.yellow,
  DONE: APPLE.green,
  CANCELED: APPLE.gray,
};
const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: i18n.t('cc.st.TALKING'),
  CALLBACK: i18n.t('cc.st.CALLBACK'),
  OUTCALL: i18n.t('cc.outboundWaiting'),
  DONE: i18n.t('cc.st.DONE'),
  CANCELED: i18n.t('cc.canceled'),
};
/** 2026-11-20 16:14 */
const when = (iso: string) => fmtDateTime(iso);
const dur = (s: number | null) =>
  s == null
    ? '-'
    : s < 60
      ? i18n.t('cc.secN', { v0: s })
      : i18n.t('cc.msN', { v0: Math.floor(s / 60), v1: String(s % 60).padStart(2, '0') });
/** 콜 ID — 목록에서 읽기 쉽게 앞 8자리 */
const shortId = (id: string) => id.slice(0, 8).toUpperCase();

/**
 * 상담 콜 목록 — 다른 목록 화면과 같은 표(검색·정렬·페이지·칸 설정). 내 전화/전체 전화.
 * 최근 콜 500개를 받아 표 안에서 찾는다. 행을 누르면 그 콜의 상담 화면(/callcenter/<콜 id>)으로.
 * refreshKey가 바뀌면(콜이 끝나면) 다시 읽는다.
 */
export function CallList({
  refreshKey,
  onOpen,
  stats,
  head,
}: {
  refreshKey: number;
  onOpen: (id: string) => void;
  /** 카드 위 오늘 숫자(오늘 들어온 콜·상담 중·아웃콜 대기·오늘 끝낸 콜) */
  stats?: ReactNode;
  /** 검색 줄 오른쪽 끝(목록 바꾸는 탭) */
  head?: ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  // '전체 전화'는 상담 콘솔 전체 보기 권한이 있는 사람만(그 밖에는 '내 전화' 하나)
  const { can } = useAuth();
  const canAll = can('CS_CALL.ALL');
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [flt, setFlt] = useState<FilterValues>({});
  // 내 전화 / 전체 전화 — 전체 보기 권한(관리자·슈퍼관리자)이면 전체가 기본
  const [scope, setScope] = useState<'mine' | 'all'>(canAll ? 'all' : 'mine');
  /** 검색칸 — 서버에서 찾는다(전화번호·고객명) */
  const [q, setQ] = useState('');

  // 날짜·필터·검색 모두 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(
    async (f: FilterValues, text: string, sc: 'mine' | 'all') => {
      const my = ++seq.current;
      setLoading(true);
      try {
        const qs = new URLSearchParams({ scope: sc, limit: String(LIST_LIMIT) });
        // 통화 날짜(필터의 '기간')는 from·to로, 나머지 조건은 f로
        const rg = (f.period ?? {}) as { from?: string; to?: string };
        if (rg.from) qs.set('from', rg.from);
        if (rg.to) qs.set('to', rg.to);
        const picked = Object.fromEntries(
          Object.entries(f).filter(
            ([k, v]) => k !== 'period' && k !== 'scope' && (Array.isArray(v) ? v.length : !!v),
          ),
        );
        if (Object.keys(picked).length) qs.set('f', JSON.stringify(picked));
        if (text.trim()) qs.set('q', text.trim().slice(0, 50));
        const r = await api<{ total: number; rows: CallRow[] }>(`/cs-calls?${qs}`);
        if (my !== seq.current) return;
        setRows(r.rows);
      } catch (e) {
        if (my === seq.current)
          toast({
            type: 'error',
            title: e instanceof ApiError ? e.message : t('cc.listLoadFailed'),
          });
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [toast],
  );
  useEffect(() => {
    const id = window.setTimeout(() => void load(flt, q, canAll ? scope : 'mine'), 250);
    return () => window.clearTimeout(id);
  }, [flt, q, scope, canAll, refreshKey, load]);

  const columns: Column[] = [
    {
      title: t('cc.col.callNo'),
      dataIndex: 'callNo',
      // 다른 ID(접수번호 등)와 같은 모양 — 고정폭 서체 + 호버 복사
      render: (r) => <CopyText value={(r.callNo as string | null) ?? shortId(r.id as string)} />,
    },
    {
      title: t('cc.customerName'),
      dataIndex: 'customerName',
      // 고객명이 없으면 '-'
      render: (r) => (r.customerName as string | null) || '-',
      flex: 1,
      minWidth: 160,
    },
    {
      title: t('cc.phone'),
      dataIndex: 'phone',
      render: (r) => <PhoneCell value={r.phone as string} link={false} />,
    },
    {
      title: t('cc.agent'),
      dataIndex: 'agentName',
      // 접수의 담당자 칩과 같은 것 — 누르면 프로필 카드
      render: (r) =>
        r.agent ? (
          <EmployeeChip emp={r.agent as EmployeeBrief} />
        ) : (
          <span className={styles.callState}>-</span>
        ),
      mask: false,
    },
    {
      title: t('cc.col.at'),
      dataIndex: 'receivedAt',
      render: (r) => when(r.receivedAt as string),
    },
    {
      title: t('cc.col.duration'),
      dataIndex: 'durationSec',
      render: (r) => dur(r.durationSec as number | null),
    },
    {
      title: t('cc.lead'),
      dataIndex: 'leadNo',
      // 누르면 그 접수 상세로(행 클릭 = 상담 화면과 따로)
      render: (r) =>
        r.leadId ? (
          <button
            type="button"
            className={styles.leadLink}
            title={t('cc.openLeadDetail')}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/leads/${r.leadId as string}`);
            }}
          >
            <FileText size={13} />
            {/* 접수 ID — 다른 ID와 같은 고정폭 서체 */}
            <span className="id-mono">{(r.leadNo as string | null) ?? t('cc.lead')}</span>
          </button>
        ) : (
          <span className={styles.callState}>-</span>
        ),
      width: 150,
      mask: false,
    },
    {
      title: t('cc.status'),
      dataIndex: 'status',
      render: (r) => {
        const st = r.status as string;
        // 아직 마무리(상담 종료·접수)하지 않은 상담은 '마무리 전'
        const open = st === 'ASSIGNED' || st === 'CALLBACK';
        return (
          <StatusChip color={CALL_STATUS_COLOR[open ? 'OPEN' : st] ?? APPLE.gray}>
            {open ? t('cc.notWrapped') : (STATUS_LABEL[st] ?? st)}
          </StatusChip>
        );
      },
      exportValue: (r) => {
        const st = r.status as string;
        return st === 'ASSIGNED' || st === 'CALLBACK'
          ? t('cc.notWrapped')
          : (STATUS_LABEL[st] ?? st);
      },
      mask: false,
    },
  ];

  const yesNo = [
    { value: 'yes', label: t('cc.flt.has') },
    { value: 'no', label: t('cc.flt.none') },
  ];
  const filterFields: FilterField[] = [
    { key: 'period', label: t('cc.callDate'), type: 'date' },
    {
      key: 'status',
      label: t('cc.status'),
      type: 'multi',
      options: [
        { value: 'OPEN', label: t('cc.notWrapped') },
        ...(['OUTCALL', 'DONE', 'CANCELED'] as const).map((v) => ({
          value: v,
          label: STATUS_LABEL[v],
        })),
      ],
    },
    { key: 'lead', label: t('cc.flt.lead'), type: 'single', options: yesNo },
    { key: 'recording', label: t('cc.flt.recording'), type: 'single', options: yesNo },
  ];
  // 기간·필터·검색은 서버에서 거른다

  return (
    <section className={`${styles.card} ${styles.listCard}`}>
      {stats}
      {head && <div className={styles.listHead}>{head}</div>}
      <DataTable
        filters={
          <FilterButton
            fields={filterFields}
            value={flt}
            onChange={setFlt}
            limited={rows.length >= LIST_LIMIT}
          />
        }
        tabs={
          canAll ? (
            <SegmentedControl
              size="sm"
              value={scope}
              onChange={(v) => setScope(v as 'mine' | 'all')}
              options={[
                { value: 'all', label: t('cc.allCalls') },
                { value: 'mine', label: t('cc.myCalls') },
              ]}
            />
          ) : undefined
        }
        fit
        pageSize={20}
        columns={columns}
        onSearch={setQ}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => onOpen(r.id as string)}
        exportable
        exportFileName={t('cc.exportName')}
        exportCompact
        toolbarActions={<DialButton />}
      />
    </section>
  );
}
