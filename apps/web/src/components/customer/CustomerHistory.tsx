import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  ClipboardList,
  FileSignature,
  FileText,
  Headphones,
  LifeBuoy,
  Truck,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { SegmentedControl, useToast } from '../ui';
import styles from './customerHistory.module.css';

type Kind =
  | 'customer'
  | 'call'
  | 'lead'
  | 'owner'
  | 'estimate'
  | 'contract'
  | 'payment'
  | 'work'
  | 'service'
  | 'support';
interface Item {
  at: string;
  kind: Kind;
  title: string;
  detail?: string | null;
  actor?: string | null;
  link?: string | null;
}
interface History {
  summary: {
    firstAt: string | null;
    firstChannel: string | null;
    owner: string | null;
    orgUnit: string | null;
    calls: number;
    leads: number;
    estimates: number;
    contracts: number;
    paid: number;
  };
  items: Item[];
}

const KIND: Record<Kind, { icon: LucideIcon; tone: string }> = {
  customer: { icon: UserPlus, tone: 'gray' },
  call: { icon: Headphones, tone: 'green' },
  lead: { icon: ClipboardList, tone: 'blue' },
  owner: { icon: Users, tone: 'purple' },
  estimate: { icon: FileText, tone: 'blue' },
  contract: { icon: FileSignature, tone: 'orange' },
  payment: { icon: Banknote, tone: 'orange' },
  work: { icon: Truck, tone: 'teal' },
  service: { icon: Wrench, tone: 'teal' },
  support: { icon: LifeBuoy, tone: 'red' },
};
const FILTERS: { value: string; label: string; kinds: Kind[] | null }[] = [
  { value: 'all', label: '전체', kinds: null },
  { value: 'call', label: '통화', kinds: ['call'] },
  { value: 'lead', label: '접수·담당', kinds: ['customer', 'lead', 'owner'] },
  { value: 'deal', label: '견적·계약', kinds: ['estimate', 'contract', 'payment'] },
  { value: 'work', label: '작업·AS', kinds: ['work', 'service', 'support'] },
];

const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const time = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 고객 이력(CRM) — 처음 들어온 길, 지금 담당, 건수 요약과
 * 통화·접수·담당자 변경·견적·계약·입금·작업을 날짜별로 최신순.
 */
export function CustomerHistory({ customerId }: { customerId: string }) {
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
          title: e instanceof ApiError ? e.message : '고객 이력을 불러오지 못했습니다',
        }),
      );
    return () => {
      alive = false;
    };
  }, [customerId, toast]);

  const groups = useMemo(() => {
    const kinds = FILTERS.find((f) => f.value === filter)?.kinds;
    const list = (data?.items ?? []).filter((i) => !kinds || kinds.includes(i.kind));
    const out: { day: string; items: Item[] }[] = [];
    for (const it of list) {
      const d = day(it.at);
      if (out[out.length - 1]?.day !== d) out.push({ day: d, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [data, filter]);

  if (!data)
    return (
      <section className="rd-card">
        <h3 className="rd-title">고객 이력</h3>
        <p className={styles.muted}>불러오는 중…</p>
      </section>
    );
  const s = data.summary;
  return (
    <>
      <section className="rd-card">
        <h3 className="rd-title">고객 요약</h3>
        <div className={styles.summary}>
          <div>
            <span>처음 들어온 날</span>
            <b>{s.firstAt ? day(s.firstAt) : '-'}</b>
          </div>
          <div>
            <span>유입 경로</span>
            <b>{s.firstChannel ?? '-'}</b>
          </div>
          <div>
            <span>지금 담당</span>
            <b>{[s.orgUnit, s.owner].filter(Boolean).join(' · ') || '-'}</b>
          </div>
          <div>
            <span>통화</span>
            <b>{s.calls}건</b>
          </div>
          <div>
            <span>접수</span>
            <b>{s.leads}건</b>
          </div>
          <div>
            <span>견적 · 계약</span>
            <b>
              {s.estimates}건 · {s.contracts}건
            </b>
          </div>
          <div>
            <span>입금</span>
            <b>{s.paid ? `${s.paid.toLocaleString('ko-KR')}원` : '-'}</b>
          </div>
        </div>
      </section>

      <section className="rd-card">
        <div className={styles.head}>
          <h3 className="rd-title">고객 이력</h3>
          <SegmentedControl
            size="sm"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
        </div>
        {groups.length === 0 ? (
          <p className={styles.muted}>기록이 없습니다.</p>
        ) : (
          <div className={styles.timeline}>
            {groups.map((g) => (
              <div key={g.day} className={styles.day}>
                <div className={styles.dayLabel}>{g.day}</div>
                <ol className={styles.list}>
                  {g.items.map((it, i) => {
                    const k = KIND[it.kind];
                    const Icon = k.icon;
                    const body = (
                      <>
                        <span className={`${styles.dot} ${styles[k.tone]}`}>
                          <Icon size={14} />
                        </span>
                        <span className={styles.time}>{time(it.at)}</span>
                        <span className={styles.main}>
                          <b>{it.title}</b>
                          {it.detail && <span className={styles.detail}>{it.detail}</span>}
                        </span>
                        {it.actor && <span className={styles.actor}>{it.actor}</span>}
                      </>
                    );
                    return (
                      <li key={`${it.at}-${i}`}>
                        {it.link ? (
                          <button
                            type="button"
                            className={`${styles.row} ${styles.clickable}`}
                            onClick={() => navigate(it.link!)}
                          >
                            {body}
                          </button>
                        ) : (
                          <div className={styles.row}>{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
