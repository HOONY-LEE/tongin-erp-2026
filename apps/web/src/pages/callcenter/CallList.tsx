import { useCallback, useEffect, useState } from 'react';
import { List, Play } from 'lucide-react';
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
  DONE: '끝',
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
}: {
  refreshKey: number;
  onOpen: (id: string) => void;
}) {
  const toast = useToast();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (sc: 'mine' | 'all') => {
      setLoading(true);
      try {
        const r = await api<{ total: number; rows: CallRow[] }>(`/cs-calls?scope=${sc}&limit=500`);
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
    void load(scope);
  }, [scope, refreshKey, load]);

  const columns: Column[] = [
    { title: '콜ID', render: (r) => shortId(r.id as string), width: 78 },
    {
      title: '고객명',
      dataIndex: 'customerName',
      render: (r) => (r.customerName as string | null) ?? '새 번호',
      width: 80,
    },
    {
      title: '전화번호',
      dataIndex: 'phone',
      render: (r) => <PhoneCell value={r.phone as string} link={false} />,
      width: 124,
    },
    {
      title: '상담원',
      dataIndex: 'agentName',
      render: (r) =>
        (r.agentName as string | null) ?? STATUS_LABEL[r.status as string] ?? (r.status as string),
      width: 72,
    },
    {
      title: '통화시각',
      dataIndex: 'receivedAt',
      render: (r) => when(r.receivedAt as string),
      width: 104,
    },
    {
      title: '통화시간',
      dataIndex: 'durationSec',
      render: (r) => dur(r.durationSec as number | null),
      width: 76,
    },
    {
      title: '녹취',
      render: (r) => (r.hasRecording ? <Play size={14} aria-label="녹취 있음" /> : '-'),
      width: 52,
      mask: false,
    },
    {
      title: '메모',
      dataIndex: 'request',
      render: (r) => (r.request as string | null) ?? (r.memo as string | null) ?? '',
      flex: 1,
      minWidth: 140,
    },
    { title: '접수', dataIndex: 'leadNo', width: 124 },
  ];

  return (
    <section className={`${styles.card} ${styles.listCard}`}>
      <h3 className={styles.cardTitle}>
        <List size={15} /> 상담 콜 목록
      </h3>
      <DataTable
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
        fit
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
