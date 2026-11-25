import { tDyn } from '../../i18n';
import { fmtDate } from '../../lib/dateFormat';
import {
  Banknote,
  ClipboardList,
  FileSignature,
  FileText,
  Headphones,
  LifeBuoy,
  MessageSquare,
  Truck,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import styles from './customerHistory.module.css';

export type HistoryKind =
  | 'sms'
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
export interface HistoryItem {
  at: string;
  kind: HistoryKind;
  title: string;
  detail?: string | null;
  actor?: string | null;
  link?: string | null;
}

export const HISTORY_KIND: Record<HistoryKind, { icon: LucideIcon; tone: string }> = {
  sms: { icon: MessageSquare, tone: 'green' },
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

/** 이력 종류 이름(통화·접수·견적…) */
export function historyKindLabel(kind: string): string {
  const key: Record<string, string> = {
    customer: 'cc.customer',
    call: 'cc.h.call',
    sms: 'cc.sms',
    lead: 'cc.lead',
    owner: 'cc.h.owner',
    estimate: 'cc.h.estimate',
    contract: 'cc.h.contract',
    payment: 'cc.h.payment',
    work: 'cc.h.work',
    service: 'cc.h.service',
  };
  if (kind === 'support') return 'AS';
  return key[kind] ? tDyn(key[kind], kind) : kind;
}

/** 종류 아이콘(동그라미) */
export function HistoryDot({ kind, size = 26 }: { kind: string; size?: number }) {
  const k = HISTORY_KIND[kind as HistoryKind] ?? HISTORY_KIND.customer;
  const Icon = k.icon;
  return (
    <span className={`${styles.dot} ${styles[k.tone]}`} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.54)} />
    </span>
  );
}

const time = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 이력 — 날짜별 묶음, 왼쪽 선으로 이어진 아이콘·시각·내용·담당 */
export function HistoryTimeline({
  items,
  onOpen,
  compact,
}: {
  items: HistoryItem[];
  onOpen?: (link: string) => void;
  compact?: boolean;
}) {
  const groups: { day: string; items: HistoryItem[] }[] = [];
  for (const it of items) {
    const d = fmtDate(it.at);
    if (groups[groups.length - 1]?.day !== d) groups.push({ day: d, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  return (
    <div className={`${styles.timeline} ${compact ? styles.compact : ''}`}>
      {groups.map((g) => (
        <div key={g.day}>
          <div className={styles.dayLabel}>{g.day}</div>
          <ol className={styles.list}>
            {g.items.map((it, i) => {
              const body = (
                <>
                  <HistoryDot kind={it.kind} size={compact ? 22 : 26} />
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
                  {it.link && onOpen ? (
                    <button
                      type="button"
                      className={`${styles.row} ${styles.clickable}`}
                      onClick={() => onOpen(it.link!)}
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
  );
}
