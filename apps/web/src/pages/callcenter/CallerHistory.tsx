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
  sms: '문자',
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
    <section className={`${styles.card} ${styles.paneCard} ${styles.historyCard}`}>
      <div className={`${styles.paneHead} ${styles.historyHead}`}>
        <b>
          <History size={15} /> 고객 이력
        </b>
        {items && <span className={styles.count}>{items.length}</span>}
        <button
          type="button"
          className={styles.historyMore}
          onClick={() => navigate(`/customers?detail=${customerId}`)}
        >
          고객 정보 전체 보기
        </button>
      </div>
      <div className={styles.paneBody}>
        {items === null ? (
          <p className={styles.muted}>불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className={styles.muted}>이전 기록이 없습니다.</p>
        ) : (
          <table className={styles.hTable}>
            <thead>
              <tr>
                <th style={{ width: 148 }}>일시</th>
                <th style={{ width: 76 }}>구분</th>
                <th>내용</th>
                <th style={{ width: 90 }}>담당</th>
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
