import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
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
        title: e instanceof ApiError ? e.message : t('camp.smsLoadFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [scope, range, toast]);
  useEffect(() => {
    void load();
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
        filters={<DateFilter value={range} onChange={setRange} />}
        fit
        pageSize={20}
        columns={columns}
        rows={rows as unknown as Row[]}
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
