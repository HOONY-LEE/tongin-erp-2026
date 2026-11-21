import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { fmtDateTime } from '../../lib/dateFormat';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { DataTable, type Column, type Row } from '../../components/ui';
import { EmployeeChip, type EmployeeBrief } from '../../components/ui/EmployeeChip';
import styles from '../callcenter.module.css';

interface Item {
  at: string;
  kind: string;
  title: string;
  detail?: string | null;
  actor?: string | null;
  actorEmp?: EmployeeBrief | null;
  link?: string | null;
}
const KIND_LABEL: Record<string, string> = {
  customer: i18n.t('cc.customer'),
  call: i18n.t('cc.h.call'),
  sms: i18n.t('cc.sms'),
  lead: i18n.t('cc.lead'),
  owner: i18n.t('cc.h.owner'),
  estimate: i18n.t('cc.h.estimate'),
  contract: i18n.t('cc.h.contract'),
  payment: i18n.t('cc.h.payment'),
  work: i18n.t('cc.h.work'),
  service: i18n.t('cc.h.service'),
  support: 'AS',
};
const when = (iso: string) => fmtDateTime(iso);

/**
 * 상담 화면 아래 — 이 고객의 이력(통화·접수·견적·계약…) 최근 순 목록.
 * 지금 보고 있는 콜은 뺀다. 전체는 고객관리에서.
 */
export function CallerHistory({ customerId, callId }: { customerId: string; callId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ items: Item[] }>(`/customers/${customerId}/history`)
      .then((r) => alive && setItems(r.items.filter((i) => i.link !== `/callcenter/${callId}`)))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [customerId, callId]);

  const columns: Column[] = [
    {
      title: t('cc.col.time'),
      dataIndex: 'at',
      width: 170,
      render: (r) => when(String(r.at)),
    },
    {
      title: t('cc.col.kind'),
      dataIndex: 'kind',
      width: 90,
      render: (r) => (
        <span className={`${styles.hKind} ${styles[`k_${String(r.kind)}`] ?? ''}`}>
          {KIND_LABEL[String(r.kind)] ?? String(r.kind)}
        </span>
      ),
    },
    {
      title: t('cc.content'),
      dataIndex: 'title',
      flex: 1,
      minWidth: 200,
      render: (r) => (
        <>
          {String(r.title)}
          {r.detail ? <span className={styles.muted}> · {String(r.detail)}</span> : null}
        </>
      ),
    },
    {
      title: t('cc.col.assignee'),
      dataIndex: 'actor',
      width: 130,
      render: (r) =>
        r.actorEmp ? <EmployeeChip emp={r.actorEmp as EmployeeBrief} /> : String(r.actor ?? ''),
    },
  ];

  return (
    <section className={`${styles.card} ${styles.paneCard} ${styles.historyCard}`}>
      <div className={`${styles.paneHead} ${styles.historyHead}`}>
        <b>{t('cc.history')}</b>
        {items && <span className={styles.count}>{items.length}</span>}
        <button
          type="button"
          className={styles.historyMore}
          onClick={() => navigate(`/customers?detail=${customerId}`)}
        >
          {t('cc.viewCustomer')}
        </button>
      </div>
      <div className={styles.paneBody}>
        {items === null ? (
          <p className={styles.muted}>{t('cc.loading')}</p>
        ) : items.length === 0 ? (
          <p className={styles.muted}>{t('cc.noHistory')}</p>
        ) : (
          <DataTable
            bare
            fit
            pageSize={50}
            columns={columns}
            rows={
              items
                .slice(0, 50)
                .map((it, i) => ({ ...it, id: `${it.at}-${i}` })) as unknown as Row[]
            }
            onRowClick={(r) => r.link && navigate(String(r.link))}
          />
        )}
      </div>
    </section>
  );
}
