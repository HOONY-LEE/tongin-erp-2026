import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, UserRound } from 'lucide-react';
import { DateFilter, type DateRange } from './DateFilter';
import { api, ApiError } from '../../lib/api';
import { DataTable, SegmentedControl, useToast, type Column, type Row } from '../../components/ui';
import { Phone as PhoneCell } from 'softium-ui/table';
import styles from '../callcenter.module.css';

export interface CallRow {
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
  memo: string | null;
  request: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: '상담 중',
  CALLBACK: '콜백 중',
  OUTCALL: '아웃콜 대기',
  DONE: '완료',
  CANCELED: '취소',
};
/** 11.18 10:05 */
const when = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const dur = (s: number | null) =>
  s == null
    ? '-'
    : s < 60
      ? `${s}초`
      : `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
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
  const toast = useToast();
  const navigate = useNavigate();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });

  const load = useCallback(
    async (sc: 'mine' | 'all', rg: DateRange) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ scope: sc, limit: '500' });
        if (rg.from) qs.set('from', rg.from);
        if (rg.to) qs.set('to', rg.to);
        const r = await api<{ total: number; rows: CallRow[] }>(`/cs-calls?${qs}`);
        setRows(r.rows);
      } catch (e) {
        toast({
          type: 'error',
          title: e instanceof ApiError ? e.message : '콜 목록을 불러오지 못했습니다',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );
  useEffect(() => {
    void load(scope, range);
  }, [scope, range, refreshKey, load]);

  const columns: Column[] = [
    { title: '콜ID', render: (r) => shortId(r.id as string), width: 84 },
    {
      title: '고객명',
      dataIndex: 'customerName',
      render: (r) => (r.customerName as string | null) ?? '새 번호',
      width: 100,
    },
    {
      title: '전화번호',
      dataIndex: 'phone',
      render: (r) => <PhoneCell value={r.phone as string} link={false} />,
      width: 140,
    },
    {
      title: '상담원',
      dataIndex: 'agentName',
      render: (r) =>
        r.agentName ? (
          <span className={styles.agentChip}>
            <UserRound size={12} />
            {r.agentName as string}
          </span>
        ) : (
          <span className={styles.callState}>-</span>
        ),
      width: 100,
      mask: false,
    },
    {
      title: '통화시각',
      dataIndex: 'receivedAt',
      render: (r) => when(r.receivedAt as string),
      width: 116,
    },
    {
      title: '통화시간',
      dataIndex: 'durationSec',
      render: (r) => dur(r.durationSec as number | null),
      width: 84,
    },
    {
      title: '접수',
      dataIndex: 'leadNo',
      // 누르면 그 접수 상세로(행 클릭 = 상담 화면과 따로)
      render: (r) =>
        r.leadId ? (
          <button
            type="button"
            className={styles.leadLink}
            title="접수 상세 열기"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/leads/${r.leadId as string}`);
            }}
          >
            <FileText size={13} />
            {(r.leadNo as string | null) ?? '접수'}
          </button>
        ) : (
          <span className={styles.callState}>-</span>
        ),
      flex: 1,
      minWidth: 140,
      mask: false,
    },
    {
      title: '상태',
      dataIndex: 'status',
      render: (r) => {
        const st = r.status as string;
        // 아직 마무리(상담 종료·접수)하지 않은 상담은 '마무리 전'
        const open = st === 'ASSIGNED' || st === 'CALLBACK';
        return (
          <span className={`${styles.stChip} ${styles[`st_${open ? 'OPEN' : st}`] ?? ''}`}>
            {open ? '마무리 전' : (STATUS_LABEL[st] ?? st)}
          </span>
        );
      },
      width: 96,
      mask: false,
    },
  ];

  return (
    <section className={`${styles.card} ${styles.listCard}`}>
      {stats}
      <DataTable
        viewSwitch={head}
        tabs={
          <SegmentedControl
            value={scope}
            onChange={(x) => setScope(x as 'mine' | 'all')}
            options={[
              { value: 'mine', label: '내 전화' },
              { value: 'all', label: '전체 전화' },
            ]}
          />
        }
        filters={<DateFilter value={range} onChange={setRange} />}
        fit
        pageSize={20}
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => onOpen(r.id as string)}
        exportable
        exportFileName="상담콜"
      />
    </section>
  );
}
