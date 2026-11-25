import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { fmtDate, fmtDateTime } from '../../lib/dateFormat';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { DataTable, SegmentedControl, useToast, type Column, type Row } from '../ui';
import {
  HistoryDot,
  historyKindLabel,
  type HistoryItem as Item,
  type HistoryKind as Kind,
} from './HistoryTimeline';
import styles from './customerHistory.module.css';

interface History {
  summary: {
    firstAt: string | null;
    firstChannel: string | null;
    owner: string | null;
    /** 가장 최근 접수(영업 기회)의 진행 단계 */
    stage: string | null;
    orgUnit: string | null;
    calls: number;
    leads: number;
    estimates: number;
    contracts: number;
    paid: number;
  };
  items: Item[];
}

const FILTERS: { value: string; label: string; kinds: Kind[] | null }[] = [
  { value: 'all', label: i18n.t('customers.h.all'), kinds: null },
  { value: 'call', label: i18n.t('customers.h.call'), kinds: ['call', 'sms'] },
  { value: 'lead', label: i18n.t('customers.h.lead'), kinds: ['customer', 'lead', 'owner'] },
  { value: 'deal', label: i18n.t('customers.h.deal'), kinds: ['estimate', 'contract', 'payment'] },
  { value: 'work', label: i18n.t('customers.h.work'), kinds: ['work', 'service', 'support'] },
];

const day = (iso: string) => fmtDate(iso);

/**
 * 고객 이력(CRM) — 처음 들어온 길, 지금 담당, 건수 요약과
 * 통화·접수·담당자 변경·견적·계약·입금·작업을 날짜별로 최신순.
 */
export function CustomerHistory({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<History | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    setData(null);
    api<History>(`/customers/${customerId}/history`)
      .then((r) => alive && setData(r))
      .catch((e) =>
        toast({
          type: 'error',
          title: e instanceof ApiError ? e.message : t('customers.h.loadFailed'),
        }),
      );
    return () => {
      alive = false;
    };
  }, [customerId, toast]);

  const rows = useMemo(() => {
    const kinds = FILTERS.find((f) => f.value === filter)?.kinds;
    return (data?.items ?? [])
      .filter((i) => !kinds || kinds.includes(i.kind))
      .map((it, i) => ({ ...it, id: `${it.at}-${i}` }));
  }, [data, filter]);

  const columns: Column[] = [
    {
      title: t('cc.col.time'),
      dataIndex: 'at',
      width: 180,
      render: (r) => <span className={styles.when}>{fmtDateTime(String(r.at))}</span>,
    },
    {
      title: t('cc.col.kind'),
      dataIndex: 'kind',
      width: 96,
      render: (r) => (
        <span className={styles.kindCell}>
          <HistoryDot kind={String(r.kind)} size={20} />
          {historyKindLabel(String(r.kind))}
        </span>
      ),
      exportValue: (r) => historyKindLabel(String(r.kind)),
    },
    {
      title: t('cc.content'),
      dataIndex: 'title',
      flex: 1,
      minWidth: 220,
      render: (r) => (
        <span className={styles.contentCell}>
          <span>{String(r.title)}</span>
          {r.detail ? <span className={styles.detail}>{String(r.detail)}</span> : null}
        </span>
      ),
    },
    {
      title: t('cc.col.assignee'),
      dataIndex: 'actor',
      width: 120,
      render: (r) => (r.actor ? String(r.actor) : '-'),
    },
  ];

  if (!data)
    return (
      <section className="rd-card">
        <h3 className="rd-title">{t('customers.h.title')}</h3>
        <p className={styles.muted}>{t('customers.loading')}</p>
      </section>
    );
  const s = data.summary;
  return (
    <>
      <section className="rd-card">
        <h3 className="rd-title">{t('customers.s.title')}</h3>
        <div className={styles.summary}>
          <div>
            <span>{t('customers.s.firstAt')}</span>
            <b>{s.firstAt ? day(s.firstAt) : '-'}</b>
          </div>
          <div>
            <span>{t('customers.s.source')}</span>
            <b>{s.firstChannel ?? '-'}</b>
          </div>
          <div>
            <span>{t('customers.s.stage')}</span>
            <b>{s.stage ?? '-'}</b>
          </div>
          <div>
            <span>{t('customers.s.owner')}</span>
            <b>{[s.orgUnit, s.owner].filter(Boolean).join(' · ') || '-'}</b>
          </div>
          <div>
            <span>{t('customers.s.calls')}</span>
            <b>
              {s.calls}
              {t('customers.s.count')}
            </b>
          </div>
          <div>
            <span>{t('customers.s.leads')}</span>
            <b>
              {s.leads}
              {t('customers.s.count')}
            </b>
          </div>
          <div>
            <span>{t('customers.s.deals')}</span>
            <b>
              {s.estimates}
              {t('customers.s.countSep')} {s.contracts}
              {t('customers.s.count')}
            </b>
          </div>
          <div>
            <span>{t('customers.s.paid')}</span>
            <b>{s.paid ? t('customers.s.won', { v0: s.paid.toLocaleString('ko-KR') }) : '-'}</b>
          </div>
        </div>
      </section>

      <section className="rd-card">
        <div className={styles.head}>
          <h3 className="rd-title">{t('customers.h.title')}</h3>
          <SegmentedControl
            size="sm"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
        </div>
        <DataTable
          bare
          noFooter
          pageSize={0}
          columns={columns}
          rows={rows as unknown as Row[]}
          onRowClick={(r) => r.link && navigate(String(r.link))}
        />
      </section>
    </>
  );
}
