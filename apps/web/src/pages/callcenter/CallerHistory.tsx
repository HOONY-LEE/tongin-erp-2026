import { useEffect, useState } from 'react';
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
  customer: '고객',
  call: '통화',
  lead: '접수',
  owner: '담당',
  estimate: '견적',
  contract: '계약',
  payment: '입금',
  work: '작업',
  service: '서비스',
  support: 'AS',
};
const when = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 상담 화면 아래 — 이 고객의 이력(통화·접수·견적·계약…) 최근 순 목록.
 * 지금 보고 있는 콜은 뺀다. 전체는 고객관리에서.
 */
export function CallerHistory({ customerId, callId }: { customerId: string; callId: string }) {
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
    <section className={styles.history}>
      <div className={styles.historyHead}>
        <b>
          <History size={14} /> 고객 이력
        </b>
        {items && <span className={styles.muted}>{items.length}건</span>}
        <button
          type="button"
          className={styles.historyMore}
          onClick={() => navigate(`/customers?detail=${customerId}`)}
        >
          고객 정보 전체 보기
        </button>
      </div>
      {items === null ? (
        <p className={styles.muted}>불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className={styles.muted}>이전 기록이 없습니다.</p>
      ) : (
        <ul className={styles.historyList}>
          {items.slice(0, 30).map((it, i) => (
            <li key={`${it.at}-${i}`}>
              <button
                type="button"
                disabled={!it.link}
                onClick={() => it.link && navigate(it.link)}
              >
                <span className={styles.hWhen}>{when(it.at)}</span>
                <span className={`${styles.hKind} ${styles[`k_${it.kind}`] ?? ''}`}>
                  {KIND_LABEL[it.kind] ?? it.kind}
                </span>
                <span className={styles.hText}>
                  {it.title}
                  {it.detail && <span className={styles.muted}> · {it.detail}</span>}
                </span>
                <span className={styles.hActor}>{it.actor ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
