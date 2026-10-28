import type { ReactNode } from 'react';
import { BatteryFull, Camera, ChevronLeft, ChevronRight, Mic, Signal, Wifi } from 'lucide-react';
import styles from './PhonePreview.module.css';

const hhmm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const korTime = (d: Date) => {
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 고객 휴대폰(아이폰)의 문자 앱처럼 보이는 미리보기 — 받은 문자는 왼쪽 회색 말풍선.
 * 장문(LMS)이면 제목이 첫 줄에 굵게 붙는다.
 */
export function PhonePreview({
  sender,
  senderNo,
  title,
  children,
  at = new Date(),
  compact,
}: {
  /** 연락처에 저장된 이름처럼 보이는 발신자 */
  sender: string;
  senderNo?: string;
  /** 장문 제목 */
  title?: string;
  /** 본문(비었으면 안내 문구) */
  children: ReactNode;
  /** 받은 시각(예약 발송이면 예약 시각) */
  at?: Date;
  /** 좁은 자리(발송 단계)에 작게 */
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.frame} ${compact ? styles.compact : ''}`}
      aria-label="휴대폰 미리보기"
    >
      <div className={styles.screen}>
        <div className={styles.status}>
          <span>{hhmm(at)}</span>
          <span className={styles.island} />
          <span className={styles.statusIcons}>
            <Signal size={13} />
            <Wifi size={13} />
            <BatteryFull size={16} />
          </span>
        </div>

        <div className={styles.nav}>
          <ChevronLeft size={22} className={styles.back} />
          <div className={styles.contact}>
            <span className={styles.avatar}>{sender.slice(0, 1)}</span>
            <span className={styles.name}>
              {sender}
              <ChevronRight size={11} />
            </span>
          </div>
        </div>

        <div className={styles.thread}>
          <div className={styles.meta}>
            문자 메시지
            <br />
            오늘 {korTime(at)}
          </div>
          <div className={styles.bubble}>
            {title && <b className={styles.subject}>{title}</b>}
            {children}
          </div>
          {senderNo && <div className={styles.from}>{senderNo}</div>}
        </div>

        <div className={styles.composer}>
          <span className={styles.plus}>
            <Camera size={16} />
          </span>
          <span className={styles.input}>
            문자 메시지
            <Mic size={14} />
          </span>
        </div>
        <span className={styles.home} />
      </div>
    </div>
  );
}
