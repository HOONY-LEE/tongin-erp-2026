import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, UserRound, XCircle } from 'lucide-react';
import { Phone as PhoneCell } from 'softium-ui/table';
import { api, ApiError } from '../lib/api';
import { LIST_LIMIT } from '../lib/serverFilter';
import { formatPhone } from '../lib/phone';
import { PhonePreview } from '../components/PhonePreview';
import {
  DataTable,
  FilterButton,
  filterRows,
  ListPage,
  Modal,
  SegmentedControl,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
} from '../components/ui';
import styles from './callcenter.module.css';

interface SmsRow {
  id: string;
  at: string;
  phone: string;
  customerId: string | null;
  customerName: string | null;
  callId: string | null;
  callNo: string | null;
  title: string | null;
  body: string;
  ok: boolean;
  reason: string | null;
  vendor: string | null;
  employeeName: string | null;
}

/** 2026-11-20 16:14 */
const when = (iso: string) => fmtDateTime(iso);
/** 문자 길이(EUC-KR) — 90byte 넘으면 장문 */
const bytes = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 1 : 2), 0);

/**
 * 문자 발송 내역 — 상담 콘솔에서 보낸 문자. 기본은 내가 보낸 것,
 * 상담 콘솔 전체 보기 권한이 있으면 '전체 문자'(모든 상담원)도 본다. 행을 누르면 보낸 내용.
 */
export default function SmsHistory() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [rows, setRows] = useState<SmsRow[]>([]);
  const [canAll, setCanAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<SmsRow | null>(null);
  const [flt, setFlt] = useState<FilterValues>({});
  /** 검색칸 — 서버에서 찾는다(번호·제목·본문·고객명) */
  const [q, setQ] = useState('');
  // 단문/장문은 바이트 수라 화면에서 거른다 — 서버에는 나머지 조건만(보낸 날짜 '기간'은 from·to로)
  const serverFlt = JSON.stringify(
    Object.fromEntries(
      Object.entries(flt).filter(
        ([k, v]) => k !== 'type' && k !== 'period' && (Array.isArray(v) ? v.length : !!v),
      ),
    ),
  );
  const range = (flt.period ?? {}) as { from?: string; to?: string };

  // 날짜·필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ scope });
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      if (serverFlt !== '{}') qs.set('f', serverFlt);
      if (q.trim()) qs.set('q', q.trim().slice(0, 100));
      const r = await api<{ canAll: boolean; rows: SmsRow[] }>(`/cs-sms/history?${qs}`);
      if (my !== seq.current) return;
      setRows(r.rows);
      setCanAll(r.canAll);
    } catch (e) {
      if (my === seq.current)
        toast({
          type: 'error',
          title: e instanceof ApiError ? e.message : t('camp.smsLoadFailed'),
        });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [scope, range.from, range.to, toast, serverFlt, q]);
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const columns: Column[] = [
    {
      title: t('camp.col.sentAt'),
      dataIndex: 'at',
      render: (r) => when(r.at as string),
      width: 116,
    },
    {
      title: t('camp.col.customer'),
      dataIndex: 'customerName',
      render: (r) => (r.customerName as string | null) ?? '-',
      width: 100,
    },
    {
      title: t('camp.col.to'),
      dataIndex: 'phone',
      render: (r) => <PhoneCell value={r.phone as string} link={false} />,
      width: 140,
    },
    ...(scope === 'all'
      ? [
          {
            title: t('camp.col.sender'),
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
      title: t('camp.col.type'),
      render: (r) => (bytes(r.body as string) > 90 ? t('camp.long') : t('camp.short')),
      width: 64,
    },
    { title: t('camp.col.content'), dataIndex: 'body', flex: 1, minWidth: 200 },
    {
      title: t('camp.col.result'),
      dataIndex: 'ok',
      render: (r) => (
        <span
          className={`${styles.stChip} ${r.ok ? styles.st_DONE : styles.st_OPEN}`}
          title={(r.reason as string | null) ?? undefined}
        >
          {r.ok ? t('camp.sent') : t('camp.st.FAILED')}
        </span>
      ),
      width: 80,
      mask: false,
    },
  ];

  // 보낸 사람 고르기 목록 — 거른 결과로 줄지 않게 한 번 본 이름은 계속 둔다
  const [seenSenders, setSeenSenders] = useState<string[]>([]);
  useEffect(() => {
    setSeenSenders((prev) => {
      const next = new Set(prev);
      for (const r of rows) if (r.employeeName) next.add(r.employeeName);
      return next.size === prev.length ? prev : [...next];
    });
  }, [rows]);
  const senders = [...seenSenders].sort((a, b) => a.localeCompare(b, 'ko'));
  const filterFields: FilterField[] = [
    { key: 'period', label: t('camp.col.sentAt'), type: 'date' },
    {
      key: 'ok',
      label: t('camp.col.result'),
      type: 'single',
      options: [
        { value: 'yes', label: t('camp.sent') },
        { value: 'no', label: t('camp.st.FAILED') },
      ],
    },
    {
      key: 'type',
      label: t('camp.col.type'),
      type: 'single',
      options: [
        { value: 'short', label: t('camp.short') },
        { value: 'long', label: t('camp.long') },
      ],
    },
    ...(scope === 'all' && senders.length > 1
      ? [
          {
            key: 'employeeName',
            label: t('camp.col.sender'),
            type: 'multi',
            options: senders.map((x) => ({ value: x, label: x })),
          } as FilterField,
        ]
      : []),
  ];
  // 날짜(DateFilter)·결과·보낸 사람·검색은 서버에서, 단문/장문(바이트 수)만 받은 목록에서 거른다
  const shown = filterRows(
    rows,
    filterFields.filter((f) => f.key === 'type'),
    flt,
    (r) => (bytes(r.body) > 90 ? 'long' : 'short'),
  );

  return (
    <ListPage fit title={t('camp.smsHistory')} subtitle={t('camp.smsHistorySub')}>
      <DataTable
        tabs={
          canAll ? (
            <SegmentedControl
              value={scope}
              onChange={(x) => setScope(x as 'mine' | 'all')}
              options={[
                { value: 'mine', label: t('camp.mySms') },
                { value: 'all', label: t('camp.allSms') },
              ]}
            />
          ) : undefined
        }
        filters={
          <>
            <FilterButton
              fields={filterFields}
              value={flt}
              onChange={setFlt}
              limited={rows.length >= LIST_LIMIT}
            />
          </>
        }
        fit
        pageSize={20}
        columns={columns}
        onSearch={setQ}
        rows={shown as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => setOpen(r as unknown as SmsRow)}
        exportable
        exportFileName={t('camp.smsExport')}
      />
      <Modal
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? t('camp.smsTo', { v0: formatPhone(open.phone) }) : ''}
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
              <dt>{t('camp.col.sentAt')}</dt>
              <dd>{new Date(open.at).toLocaleString('ko-KR')}</dd>
              <dt>{t('camp.col.sender')}</dt>
              <dd>{open.employeeName ?? '-'}</dd>
              <dt>{t('camp.kind.CUSTOMER')}</dt>
              <dd>
                {open.customerId ? (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => navigate(`/customers?detail=${open.customerId}`)}
                  >
                    {open.customerName ?? t('camp.kind.CUSTOMER')}
                  </button>
                ) : (
                  (open.customerName ?? '-')
                )}
              </dd>
              <dt>{t('camp.col.result')}</dt>
              <dd className={styles.smsResult}>
                {open.ok ? (
                  <>
                    <CheckCircle2 size={14} color="#16a34a" /> {t('camp.sent')}
                  </>
                ) : (
                  <>
                    <XCircle size={14} color="#dc2626" /> {t('camp.st.FAILED')}
                  </>
                )}
                {open.reason && ` — ${open.reason}`}
              </dd>
              {open.callId && (
                <>
                  <dt>{t('camp.consult')}</dt>
                  <dd>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => navigate(`/callcenter/${open.callId}`)}
                    >
                      {t('camp.call')} {open.callNo ?? open.callId.slice(0, 8).toUpperCase()}
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
