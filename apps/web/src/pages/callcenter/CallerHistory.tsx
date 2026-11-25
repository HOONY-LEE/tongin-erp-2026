import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../../components/ui';
import { HistoryTimeline, type HistoryItem } from '../../components/customer/HistoryTimeline';
import styles from '../callcenter.module.css';

/**
 * 상담 화면 아래 — 이 고객의 이력(통화·접수·견적·계약…) 최근 순, 왼쪽 선으로 이어진 타임라인.
 * 지금 보고 있는 콜은 뺀다. 고객이 없어도(새 번호) 같은 크기의 카드에 '없음'을 보여 준다.
 */
export function CallerHistory({
  customerId,
  callId,
}: {
  customerId: string | null;
  callId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  useEffect(() => {
    if (!customerId) {
      setItems([]);
      return;
    }
    let alive = true;
    setItems(null);
    api<{ items: HistoryItem[] }>(`/customers/${customerId}/history`)
      .then((r) => alive && setItems(r.items.filter((i) => i.link !== `/callcenter/${callId}`)))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [customerId, callId]);

  return (
    <section className={`${styles.card} ${styles.paneCard} ${styles.historyCard}`}>
      <div className={`${styles.paneHead} ${styles.sideHead}`}>
        <b>{t('cc.historyTitle')}</b>
        {customerId && (
          <button
            type="button"
            className={styles.historyMore}
            onClick={() => navigate(`/customers?detail=${customerId}`)}
          >
            {t('cc.historyMore')}
          </button>
        )}
      </div>
      <div className={styles.paneBody}>
        {items === null ? (
          <div className={styles.historySkel}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={34} radius={8} />
            ))}
          </div>
        ) : items.length ? (
          <HistoryTimeline items={items} onOpen={(l) => navigate(l)} compact />
        ) : (
          <div className={styles.emptyBox}>
            <History size={22} />
            <span>{t('cc.historyEmpty')}</span>
          </div>
        )}
      </div>
    </section>
  );
}
