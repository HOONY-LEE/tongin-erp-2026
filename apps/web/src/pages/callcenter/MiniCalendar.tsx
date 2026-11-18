import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
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
 * 상담 콘솔 오른쪽 위 — 아주 작은 이사일 마감 달력.
 * 마감한 날은 빨간 점(전체 마감은 칸 전체), 이사가 많은 날은 진하게. [자세히]는 마감 캘린더를 새 창으로.
 */
export function MiniCalendar() {
  const [ym, setYm] = useState(thisMonth);
  const { data } = useClosures(ym);
  const t = today();
  const cells = monthGrid(ym);
  // 마지막 주가 모두 다음 달이면 줄인다(5주 달력)
  const shown = cells.slice(35).every((c) => !c.inMonth) ? cells.slice(0, 35) : cells;

  return (
    <section className={`${styles.card} ${styles.miniCal}`}>
      <h3 className={styles.cardTitle}>
        <CalendarDays size={15} /> 이사일 마감
        <span className={styles.miniNav}>
          <button type="button" aria-label="지난달" onClick={() => setYm(shiftMonth(ym, -1))}>
            <ChevronLeft size={14} />
          </button>
          <b>{Number(ym.slice(5))}월</b>
          <button type="button" aria-label="다음 달" onClick={() => setYm(shiftMonth(ym, 1))}>
            <ChevronRight size={14} />
          </button>
        </span>
        <button
          type="button"
          className={styles.miniMore}
          onClick={() => window.open('/move-closures', '_blank', 'noopener')}
        >
          자세히 <ExternalLink size={12} />
        </button>
      </h3>
      <div className={styles.miniGrid}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <span key={d} className={`${styles.miniDow} ${i === 0 ? styles.sun : ''}`}>
            {d}
          </span>
        ))}
        {shown.map((c) => {
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
      <div className={styles.miniLegend}>
        <span>
          <i className={styles.miniDot} /> 지점 마감
        </span>
        <span>
          <i className={styles.miniAll} /> 전체 마감
        </span>
        <span>
          <i className={styles.miniBusyKey} /> 이사 {BUSY}건 이상
        </span>
      </div>
    </section>
  );
}
