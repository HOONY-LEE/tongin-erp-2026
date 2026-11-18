import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { useOrgScope } from '../../lib/useOrgScope';
import { useToast } from '../../components/ui';
import {
  monthGrid,
  shiftMonth,
  thisMonth,
  today,
  useClosures,
} from '../../components/closure/useClosures';
import styles from '../callcenter.module.css';

type Status = 'CLOSED' | 'SOON' | 'OPEN';
const LABEL: Record<Status, string> = { CLOSED: '마감', SOON: '마감 예정', OPEN: '여유' };

/**
 * 상담 콘솔 오른쪽 위 — 아주 작은 이사일 마감 달력(늘 6주라 높이가 바뀌지 않는다).
 * 마감·마감 예정·오늘을 색으로, 마우스를 올리면 상태와 이사 건수.
 * 날짜를 누르면 작은 메뉴로 마감 / 마감 예정 / 여유를 바꾼다(본사는 전체, 지점은 자기 지점).
 * 오른쪽 위 아이콘은 마감 캘린더를 새 창으로.
 */
export function MiniCalendar() {
  const toast = useToast();
  const { can } = useAuth();
  const { unrestricted, ownOrgId } = useOrgScope();
  const [ym, setYm] = useState(thisMonth);
  const { data, reload } = useClosures(ym);
  const [menu, setMenu] = useState<{ date: string; x: number; y: number } | null>(null);
  const t = today();
  const [y, m] = ym.split('-').map(Number);
  const editable = can('LEAD.UPDATE');
  // 이 달력에서 바꾸는 대상 — 본사(범위 제한 없음)는 전체, 지점은 자기 지점
  const target = unrestricted ? null : ownOrgId || null;

  // 바깥을 누르거나 Esc면 메뉴를 닫는다
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);

  const statusOf = (date: string): Status => {
    const mine = data?.closures.find((x) => x.date === date && (x.orgUnitId ?? null) === target);
    return mine ? mine.kind : 'OPEN';
  };
  const setStatus = async (date: string, status: Status) => {
    setMenu(null);
    try {
      await api('/move-closures/status', {
        method: 'POST',
        body: JSON.stringify({ date, orgUnitId: target, status }),
      });
      await reload();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '바꾸지 못했습니다' });
    }
  };

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
        <span className={styles.miniKeys}>
          <i className={styles.keyClosed} /> 마감
          <i className={styles.keySoon} /> 예정
        </span>
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
        {monthGrid(ym).map((c, i) => {
          const status = statusOf(c.date);
          const others = (data?.closures ?? []).filter(
            (x) => x.date === c.date && (x.orgUnitId ?? null) !== target,
          );
          const leads = data?.counts.find((x) => x.date === c.date)?.leads ?? 0;
          const tip = [
            `${Number(c.date.slice(5, 7))}월 ${Number(c.date.slice(8))}일${
              c.date === t ? ' (오늘)' : ''
            }${status !== 'OPEN' ? ` · ${LABEL[status]}` : ''}`,
            `이사 ${leads}건`,
            ...others.map((x) => `${x.orgName ?? '전체'} ${LABEL[x.kind]}`),
          ].join('\n');
          return (
            <button
              key={c.date}
              type="button"
              data-tip={tip}
              className={[
                styles.miniDay,
                i % 7 >= 5 && styles.tipLeft,
                !c.inMonth && styles.miniOut,
                status === 'CLOSED' && styles.miniClosed,
                status === 'SOON' && styles.miniSoon,
                c.dow === 0 && styles.sun,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={(e) => {
                if (!editable) return;
                e.stopPropagation();
                const box = e.currentTarget.closest('section')!.getBoundingClientRect();
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({
                  date: c.date,
                  x: Math.min(r.left - box.left, box.width - 132),
                  y: r.bottom - box.top + 2,
                });
              }}
            >
              <span className={c.date === t ? styles.miniTodayNum : undefined}>
                {Number(c.date.slice(8))}
              </span>
              {others.length > 0 && <i className={styles.miniDot} />}
            </button>
          );
        })}
      </div>
      {menu && (
        <div
          className={styles.miniMenu}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.miniMenuHead}>
            {Number(menu.date.slice(5, 7))}월 {Number(menu.date.slice(8))}일
            {target === null ? ' · 전체' : ''}
          </div>
          {(statusOf(menu.date) === 'OPEN'
            ? (['CLOSED', 'SOON'] as Status[])
            : (['CLOSED', 'SOON', 'OPEN'] as Status[])
          ).map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className={styles[`mm_${s}`]}
              onClick={() => void setStatus(menu.date, s)}
            >
              <i />
              {LABEL[s]}
              {statusOf(menu.date) === s && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
