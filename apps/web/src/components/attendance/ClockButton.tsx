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

/**
 * 머리글 출퇴근 버튼 — 직원 연결 계정에만. 출근 전엔 [출근하기], 출근 뒤엔 출근 시각 + [퇴근하기],
 * 퇴근 뒤엔 두 시각만 보인다(잘못 눌렀으면 근태 정정 신청). 시각은 서버 시계로 기록한다.
 */
export function ClockButton({ compact = false }: { compact?: boolean }) {
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
    return () => clearInterval(t);
  }, [load]);

  const clock = async (type: 'IN' | 'OUT') => {
    if (type === 'OUT' && !window.confirm('퇴근을 기록할까요?')) return;
    setBusy(true);
    try {
      const t = await api<Today>('/attendance/clock', {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      setToday(t);
      toast({
        type: 'success',
        title: type === 'IN' ? `출근 ${t.clockIn} 기록했습니다` : `퇴근 ${t.clockOut} 기록했습니다`,
      });
      window.dispatchEvent(new Event('attendance:changed'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '기록하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  if (!today) return null;
  if (today.leave && !today.clockIn)
    return (
      <span className={styles.wrap} title="오늘 휴가">
        <Clock size={14} aria-hidden />
        {compact ? '휴가' : `오늘 ${today.leave}`}
      </span>
    );

  return (
    <span className={styles.wrap}>
      {today.clockIn && (
        <span className={styles.times}>
          <Clock size={14} aria-hidden />
          출근 {today.clockIn}
          {today.clockOut && ` · 퇴근 ${today.clockOut}`}
        </span>
      )}
      {!today.clockIn ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.in}`}
          disabled={busy}
          onClick={() => void clock('IN')}
        >
          출근하기
        </button>
      ) : (
        !today.clockOut && (
          <button
            type="button"
            className={styles.btn}
            disabled={busy}
            onClick={() => void clock('OUT')}
          >
            퇴근하기
          </button>
        )
      )}
    </span>
  );
}
