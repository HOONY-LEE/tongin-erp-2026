import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { fmtDateTime } from '../../lib/dateFormat';
import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { api } from '../../lib/api';
import styles from '../callcenter.module.css';

interface Item {
  at: string;
  kind: string;
  title: string;
  detail?: string | null;
  actor?: string | null;
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

  return (
    <section className={`${styles.card} ${styles.paneCard} ${styles.historyCard}`}>
      <div className={`${styles.paneHead} ${styles.historyHead}`}>
        <b>
          <History size={15} /> {t('cc.history')}
        </b>
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
          <table className={styles.hTable}>
            <thead>
              <tr>
                <th style={{ width: 148 }}>{t('cc.col.time')}</th>
                <th style={{ width: 76 }}>{t('cc.col.kind')}</th>
                <th>{t('cc.content')}</th>
                <th style={{ width: 90 }}>{t('cc.h.owner')}</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 50).map((it, i) => (
                <tr
                  key={`${it.at}-${i}`}
                  className={it.link ? styles.hClickable : undefined}
                  onClick={() => it.link && navigate(it.link)}
                >
                  <td className={styles.hWhen}>{when(it.at)}</td>
                  <td>
                    <span className={`${styles.hKind} ${styles[`k_${it.kind}`] ?? ''}`}>
                      {KIND_LABEL[it.kind] ?? it.kind}
                    </span>
                  </td>
                  <td className={styles.hText}>
                    {it.title}
                    {it.detail && <span className={styles.muted}> · {it.detail}</span>}
                  </td>
                  <td className={styles.hActor}>{it.actor ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
