import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../ui';
import styles from './clock.module.css';

interface Today {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  leave: string | null;
  status: string;
}

/** 오늘 출퇴근 상태와 기록하기 — 머리글 버튼·프로필 메뉴가 같이 쓴다 */
export function useClock() {
  const toast = useToast();
  const [today, setToday] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setToday(await api<Today>('/attendance/today'));
    } catch {
      setToday(null);
    }
  }, []);

  useEffect(() => {
    void load();
    // 날짜가 바뀌거나 다른 기기에서 눌렀을 때를 위해 가끔 다시 읽는다
    const t = setInterval(() => void load(), 5 * 60_000);
    const on = () => void load();
    window.addEventListener('attendance:changed', on);
    return () => {
      clearInterval(t);
      window.removeEventListener('attendance:changed', on);
    };
  }, [load]);

  const clock = async (type: 'IN' | 'OUT') => {
    if (type === 'OUT' && !window.confirm(i18n.t('att.outQ'))) return;
    setBusy(true);
    try {
      const res = await api<Today>('/attendance/clock', {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      setToday(res);
      toast({
        type: 'success',
        title:
          type === 'IN'
            ? i18n.t('att.inDone', { v0: res.clockIn ?? '' })
            : i18n.t('att.outDone', { v0: res.clockOut ?? '' }),
      });
      window.dispatchEvent(new Event('attendance:changed'));
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : i18n.t('att.recordFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return { today, busy, clock };
}

/**
 * 머리글 출퇴근 버튼 — 직원 연결 계정에만. 출근 전엔 [출근하기], 출근 뒤엔 출근 시각 + [퇴근하기],
 * 퇴근 뒤엔 두 시각만 보인다(잘못 눌렀으면 근태 정정 신청). 시각은 서버 시계로 기록한다.
 */
export function ClockButton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { today, busy, clock } = useClock();

  if (!today) return null;
  if (today.leave && !today.clockIn)
    return (
      <span className={styles.wrap} title={t('att.todayLeave')}>
        <Clock size={14} aria-hidden />
        {compact ? t('att.sum.leave') : t('att.todayOf', { v0: today.leave })}
      </span>
    );

  return (
    <span className={styles.wrap}>
      {today.clockIn && (
        <span className={styles.times}>
          <Clock size={14} aria-hidden />
          {t('att.in')} {today.clockIn}
          {today.clockOut && t('att.outAt', { v0: today.clockOut })}
        </span>
      )}
      {!today.clockIn ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.in}`}
          disabled={busy}
          onClick={() => void clock('IN')}
        >
          {t('att.clockIn')}
        </button>
      ) : (
        !today.clockOut && (
          <button
            type="button"
            className={styles.btn}
            disabled={busy}
            onClick={() => void clock('OUT')}
          >
            {t('att.clockOut')}
          </button>
        )
      )}
    </span>
  );
}
