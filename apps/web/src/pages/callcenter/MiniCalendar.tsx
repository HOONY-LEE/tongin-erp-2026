import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
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

type Status = 'CLOSED' | 'OPEN';
const LABEL: Record<Status, string> = {
  CLOSED: i18n.t('cc.cal.CLOSED'),
  OPEN: i18n.t('cc.cal.OPEN'),
};

/**
 * 상담 콘솔 오른쪽 위 — 아주 작은 이사일 마감 달력(늘 6주라 높이가 바뀌지 않는다).
 * 마감·오늘을 색으로(토요일 파랑·일요일 빨강), 마우스를 올리면 상태와 이사 건수.
 * 날짜를 누르면 작은 메뉴로 마감 / 여유를 바꾼다(본사는 전체, 지점은 자기 지점).
 * 오른쪽 위 아이콘은 마감 캘린더를 새 창으로.
 */
export function MiniCalendar() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const { unrestricted, ownOrgId } = useOrgScope();
  const [ym, setYm] = useState(thisMonth);
  const { data, reload } = useClosures(ym);
  const [menu, setMenu] = useState<{ date: string; x: number; y: number } | null>(null);
  const todayKey = today();
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
    return mine ? 'CLOSED' : 'OPEN';
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.changeFailed') });
    }
  };

  return (
    <section className={`${styles.card} ${styles.paneCard} ${styles.miniCal}`}>
      <div className={`${styles.paneHead} ${styles.miniHead}`}>
        <b>{t('cc.yearMonth', { v0: y, v1: m })}</b>
        <button
          type="button"
          aria-label={t('cc.prevMonth')}
          onClick={() => setYm(shiftMonth(ym, -1))}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          aria-label={t('cc.nextMonth')}
          onClick={() => setYm(shiftMonth(ym, 1))}
        >
          <ChevronRight size={15} />
        </button>
        <span className={styles.miniKeys}>
          <i className={styles.keyClosed} /> {t('cc.cal.CLOSED')}
        </span>
        <button
          type="button"
          className={styles.miniMore}
          aria-label={t('cc.openClosureAria')}
          title={t('cc.openClosure')}
          onClick={() => window.open('/calendar?only=closure', '_blank', 'noopener')}
        >
          <ExternalLink size={14} />
        </button>
      </div>
      <div className={styles.miniGrid}>
        {[
          t('cc.dow.0'),
          t('cc.dow.1'),
          t('cc.dow.2'),
          t('cc.dow.3'),
          t('cc.dow.4'),
          t('cc.dow.5'),
          t('cc.dow.6'),
        ].map((d, i) => (
          <span
            key={d}
            className={`${styles.miniDow} ${i === 0 ? styles.sun : i === 6 ? styles.sat : ''}`}
          >
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
            t('cc.dayTip', {
              v0: Number(c.date.slice(5, 7)),
              v1: Number(c.date.slice(8)),
              v2: c.date === todayKey ? t('cc.todaySuffix') : '',
              v3: status !== 'OPEN' ? ` · ${LABEL[status]}` : '',
            }),
            t('cc.movesN', { v0: leads }),
            ...others.map((x) => t('cc.closedOf', { v0: x.orgName ?? t('cc.all') })),
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
                c.dow === 0 && styles.sun,
                c.dow === 6 && styles.sat,
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
              <span className={c.date === todayKey ? styles.miniTodayNum : undefined}>
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
            {Number(menu.date.slice(5, 7))}
            {t('cc.dow.1')} {Number(menu.date.slice(8))}
            {t('cc.dow.0')}
            {target === null ? t('cc.allSep') : ''}
          </div>
          {(['CLOSED', 'OPEN'] as Status[]).map((s) => (
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
