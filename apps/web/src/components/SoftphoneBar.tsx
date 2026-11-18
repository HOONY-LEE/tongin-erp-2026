import { useEffect, useState } from 'react';
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { formatPhone } from '../lib/phone';
import { answer, hangup, resumePhoneIfEnabled, toggleMute, usePhone } from '../lib/softphone';
import styles from './SoftphoneBar.module.css';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * PC 전화 통화 막대 — 화면 아래에 떠서 어느 화면에서든 울림·통화 중을 보여 준다.
 * (상담원이 통화하면서 접수 화면으로 옮겨 가도 통화는 이어진다)
 */
export function SoftphoneBar() {
  const { can } = useAuth();
  const phone = usePhone();
  const [, tick] = useState(0);
  const allowed = can('LEAD.CREATE');

  // 새로고침·재로그인 뒤에도 켜 두었던 PC 전화를 다시 켠다
  useEffect(() => {
    if (allowed) resumePhoneIfEnabled();
  }, [allowed]);
  // 통화 시간 표시
  useEffect(() => {
    if (phone.call?.state !== 'active') return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phone.call?.state]);

  const call = phone.call;
  if (!call) return null;
  const who = call.number ? formatPhone(call.number) : '알 수 없는 번호';
  const label =
    call.state === 'ringing'
      ? '전화가 왔습니다'
      : call.state === 'connecting'
        ? call.direction === 'out'
          ? '거는 중…'
          : '연결 중…'
        : `통화 중 ${mmss(Date.now() - (call.startedAt ?? Date.now()))}`;

  return (
    <div
      className={`${styles.bar} ${call.state === 'ringing' ? styles.ringing : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.icon}>
        {call.direction === 'in' ? <PhoneIncoming size={18} /> : <PhoneOutgoing size={18} />}
      </span>
      <span className={styles.text}>
        <b>{who}</b>
        <small>{label}</small>
      </span>
      {call.state === 'ringing' ? (
        <>
          <button type="button" className={styles.answer} onClick={answer}>
            <Phone size={16} /> 받기
          </button>
          <button type="button" className={styles.hang} onClick={hangup} aria-label="거절">
            <PhoneOff size={16} />
          </button>
        </>
      ) : (
        <>
          {call.state === 'active' && (
            <button
              type="button"
              className={styles.ghost}
              onClick={toggleMute}
              aria-label={call.muted ? '음소거 해제' : '음소거'}
              aria-pressed={call.muted}
            >
              {call.muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
          <button type="button" className={styles.hang} onClick={hangup}>
            <PhoneOff size={16} /> 끊기
          </button>
        </>
      )}
    </div>
  );
}
