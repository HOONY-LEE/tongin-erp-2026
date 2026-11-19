import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, UserRound, XCircle } from 'lucide-react';
import { Phone as PhoneCell } from 'softium-ui/table';
import { api, ApiError } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { PhonePreview } from '../components/PhonePreview';
import {
  DataTable,
  ListPage,
  Modal,
  SegmentedControl,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { DateFilter, type DateRange } from './callcenter/DateFilter';
import styles from './callcenter.module.css';

interface SmsRow {
  id: string;
  at: string;
  phone: string;
  customerId: string | null;
  customerName: string | null;
  callId: string | null;
  title: string | null;
  body: string;
  ok: boolean;
  reason: string | null;
  vendor: string | null;
  employeeName: string | null;
}

/** 11.18 10:05 */
const when = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** 문자 길이(EUC-KR) — 90byte 넘으면 장문 */
const bytes = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 1 : 2), 0);

/**
 * 문자 발송 내역 — 상담 콘솔에서 보낸 문자. 기본은 내가 보낸 것,
 * 상담 콘솔 전체 보기 권한이 있으면 '전체 문자'(모든 상담원)도 본다. 행을 누르면 보낸 내용.
 */
export default function SmsHistory() {
  const toast = useToast();
  const navigate = useNavigate();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const [rows, setRows] = useState<SmsRow[]>([]);
  const [canAll, setCanAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<SmsRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ scope });
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      const r = await api<{ canAll: boolean; rows: SmsRow[] }>(`/cs-sms/history?${qs}`);
      setRows(r.rows);
      setCanAll(r.canAll);
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '문자 내역을 불러오지 못했습니다',
      });
    } finally {
      setLoading(false);
    }
  }, [scope, range, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column[] = [
    { title: '보낸 시각', dataIndex: 'at', render: (r) => when(r.at as string), width: 116 },
    {
      title: '고객명',
      dataIndex: 'customerName',
      render: (r) => (r.customerName as string | null) ?? '-',
      width: 100,
    },
    {
      title: '받는 번호',
      dataIndex: 'phone',
      render: (r) => <PhoneCell value={r.phone as string} link={false} />,
      width: 140,
    },
    ...(scope === 'all'
      ? [
          {
            title: '보낸 사람',
            dataIndex: 'employeeName',
            render: (r: Row) =>
              r.employeeName ? (
                <span className={styles.agentChip}>
                  <UserRound size={12} />
                  {r.employeeName as string}
                </span>
              ) : (
                <span className={styles.callState}>-</span>
              ),
            width: 100,
            mask: false,
          } as Column,
        ]
      : []),
    {
      title: '종류',
      render: (r) => (bytes(r.body as string) > 90 ? '장문' : '단문'),
      width: 64,
    },
    { title: '내용', dataIndex: 'body', flex: 1, minWidth: 200 },
    {
      title: '결과',
      dataIndex: 'ok',
      render: (r) => (
        <span
          className={`${styles.stChip} ${r.ok ? styles.st_DONE : styles.st_OPEN}`}
          title={(r.reason as string | null) ?? undefined}
        >
          {r.ok ? '보냄' : '실패'}
        </span>
      ),
      width: 80,
      mask: false,
    },
  ];

  return (
    <ListPage
      fit
      title="문자 발송 내역"
      subtitle="상담 콘솔에서 보낸 문자입니다. 행을 누르면 보낸 내용을 봅니다."
    >
      <DataTable
        tabs={
          canAll ? (
            <SegmentedControl
              value={scope}
              onChange={(x) => setScope(x as 'mine' | 'all')}
              options={[
                { value: 'mine', label: '내 문자' },
                { value: 'all', label: '전체 문자' },
              ]}
            />
          ) : undefined
        }
        filters={<DateFilter value={range} onChange={setRange} />}
        fit
        pageSize={20}
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => setOpen(r as unknown as SmsRow)}
        exportable
        exportFileName="문자발송내역"
      />
      <Modal
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? `${formatPhone(open.phone)}에 보낸 문자` : ''}
      >
        {open && (
          <div className={styles.smsDetail}>
            <PhonePreview
              channel="SMS"
              sender="통인익스프레스"
              senderNo={undefined}
              lms={bytes(open.body) > 90}
              title={open.title ?? ''}
              body={open.body}
              width={250}
            />
            <dl className={styles.fuInfo}>
              <dt>보낸 시각</dt>
              <dd>{new Date(open.at).toLocaleString('ko-KR')}</dd>
              <dt>보낸 사람</dt>
              <dd>{open.employeeName ?? '-'}</dd>
              <dt>고객</dt>
              <dd>
                {open.customerId ? (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => navigate(`/customers?detail=${open.customerId}`)}
                  >
                    {open.customerName ?? '고객'}
                  </button>
                ) : (
                  (open.customerName ?? '-')
                )}
              </dd>
              <dt>결과</dt>
              <dd className={styles.smsResult}>
                {open.ok ? (
                  <>
                    <CheckCircle2 size={14} color="#16a34a" /> 보냄
                  </>
                ) : (
                  <>
                    <XCircle size={14} color="#dc2626" /> 실패
                  </>
                )}
                {open.reason && ` — ${open.reason}`}
              </dd>
              {open.callId && (
                <>
                  <dt>상담</dt>
                  <dd>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => navigate(`/callcenter/${open.callId}`)}
                    >
                      콜 {open.callId.slice(0, 8).toUpperCase()}
                    </button>
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </ListPage>
  );
}
