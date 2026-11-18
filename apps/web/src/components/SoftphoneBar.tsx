import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // 울리는 전화의 고객 — 서버가 이미 이 상담원에게 배분해 둔 콜에서 이름을 찾는다
  const [caller, setCaller] = useState<{ name: string | null; leads: number } | null>(null);
  const answerRef = useRef<HTMLButtonElement>(null);
  const ringing = call?.state === 'ringing' && call.direction === 'in';
  useEffect(() => {
    if (!ringing) {
      setCaller(null);
      return;
    }
    answerRef.current?.focus();
    let alive = true;
    void api<{
      me: { call: { customerName: string | null } | null; recentLeads: unknown[] } | null;
    }>('/cs-calls/console')
      .then(
        (r) =>
          alive &&
          setCaller({
            name: r.me?.call?.customerName ?? null,
            leads: r.me?.recentLeads.length ?? 0,
          }),
      )
      .catch(() => undefined);
    // 다른 창을 보고 있어도 알아차리게 탭 제목을 깜박인다
    const title = document.title;
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? '📞 전화가 왔습니다' : title;
    }, 900);
    return () => {
      alive = false;
      clearInterval(t);
      document.title = title;
    };
  }, [ringing]);

  /** 받기 → 통화 연결 + 상담 콘솔(접수 패널)로 */
  const take = () => {
    answer();
    if (pathname !== '/callcenter') navigate('/callcenter');
  };

  if (!call) return null;
  const who = call.number ? formatPhone(call.number) : '알 수 없는 번호';

  if (ringing)
    return (
      <div className={styles.overlay}>
        <div
          className={styles.incoming}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="incoming-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') hangup();
          }}
        >
          <span className={styles.ringIcon}>
            <PhoneIncoming size={28} />
          </span>
          <h2 id="incoming-title">전화가 왔습니다</h2>
          <b className={styles.inNumber}>{who}</b>
          <p className={styles.inWho}>
            {caller === null
              ? '고객 정보를 찾는 중…'
              : caller.name
                ? `기존 고객 ${caller.name}${caller.leads ? ` · 이전 접수 ${caller.leads}건` : ''}`
                : '처음 전화한 번호'}
          </p>
          <div className={styles.inActions}>
            <button type="button" className={styles.hangBig} onClick={hangup}>
              <PhoneOff size={18} /> 거절
            </button>
            <button ref={answerRef} type="button" className={styles.answerBig} onClick={take}>
              <Phone size={18} /> 받기
            </button>
          </div>
          <small className={styles.inHint}>20초 안에 받지 않으면 다음 상담원에게 넘어갑니다</small>
        </div>
      </div>
    );
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
