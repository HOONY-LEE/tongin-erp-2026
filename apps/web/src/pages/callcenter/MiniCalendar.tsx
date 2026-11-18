import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import {
  monthGrid,
  shiftMonth,
  thisMonth,
  today,
  useClosures,
} from '../../components/closure/useClosures';
import styles from '../callcenter.module.css';

/** 이사 건수가 이만큼 넘으면 '많은 날'로 진하게 */
const BUSY = 5;

/**
 * 상담 콘솔 오른쪽 위 — 아주 작은 이사일 마감 달력(늘 6주라 높이가 바뀌지 않는다).
 * 지점 마감은 빨간 점, 전체 마감은 빨간 칸, 이사가 많은 날은 진하게. 날짜에 마우스를 올리면 자세히.
 * 오른쪽 위 아이콘은 마감 캘린더를 새 창으로.
 */
export function MiniCalendar() {
  const [ym, setYm] = useState(thisMonth);
  const { data } = useClosures(ym);
  const t = today();
  const [y, m] = ym.split('-').map(Number);

  return (
    <section className={`${styles.card} ${styles.paneCard} ${styles.miniCal}`}>
      <div className={`${styles.paneHead} ${styles.miniHead}`}>
        <b>
          {y}년 {m}월
        </b>
        <button type="button" aria-label="지난달" onClick={() => setYm(shiftMonth(ym, -1))}>
          <ChevronLeft size={15} />
        </button>
        <button type="button" aria-label="다음 달" onClick={() => setYm(shiftMonth(ym, 1))}>
          <ChevronRight size={15} />
        </button>
        <button
          type="button"
          className={styles.miniMore}
          aria-label="이사일 마감 캘린더 새 창으로 열기"
          title="이사일 마감 캘린더(새 창)"
          onClick={() => window.open('/move-closures', '_blank', 'noopener')}
        >
          <ExternalLink size={14} />
        </button>
      </div>
      <div className={styles.miniGrid}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <span key={d} className={`${styles.miniDow} ${i === 0 ? styles.sun : ''}`}>
            {d}
          </span>
        ))}
        {monthGrid(ym).map((c) => {
          const closed = data?.closures.filter((x) => x.date === c.date) ?? [];
          const all = closed.some((x) => !x.orgUnitId);
          const leads = data?.counts.find((x) => x.date === c.date)?.leads ?? 0;
          const tip = [
            `${Number(c.date.slice(5, 7))}/${Number(c.date.slice(8))} 이사 ${leads}건`,
            ...closed.map((x) => `마감: ${x.orgName ?? '전체'}${x.memo ? ` (${x.memo})` : ''}`),
          ].join('\n');
          return (
            <span
              key={c.date}
              title={tip}
              className={[
                styles.miniDay,
                !c.inMonth && styles.miniOut,
                c.date === t && styles.miniToday,
                all && styles.miniClosed,
                leads >= BUSY && styles.miniBusy,
                c.dow === 0 && styles.sun,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {Number(c.date.slice(8))}
              {closed.length > 0 && !all && <i className={styles.miniDot} />}
            </span>
          );
        })}
      </div>
    </section>
  );
}
