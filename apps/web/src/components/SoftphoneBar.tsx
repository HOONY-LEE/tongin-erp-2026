import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { formatPhone } from '../lib/phone';
import {
  answer,
  hangup,
  resumeAudio,
  resumePhoneIfEnabled,
  toggleMute,
  usePhone,
} from '../lib/softphone';
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
  const [caller, setCaller] = useState<{
    existing: boolean;
    name: string | null;
    leads: number;
  } | null>(null);
  const answerRef = useRef<HTMLButtonElement>(null);
  const ringing = call?.state === 'ringing' && call.direction === 'in';
  // 통화 상대 고객 — 울릴 때 번호로 찾아 두고 통화가 끝날 때까지 통화 막대에 보여 준다
  const number = call?.number ?? '';
  useEffect(() => {
    if (!number) {
      setCaller(null);
      return;
    }
    let alive = true;
    void api<{ existing: boolean; name: string | null; leads: number }>(
      `/cs-calls/caller?phone=${encodeURIComponent(number)}`,
    )
      .then((r) => alive && setCaller(r))
      .catch(() => alive && setCaller({ existing: false, name: null, leads: 0 }));
    return () => {
      alive = false;
    };
  }, [number]);
  // 울리는 동안 — [받기]에 초점, 다른 창을 보고 있어도 알아차리게 탭 제목을 깜박인다
  useEffect(() => {
    if (!ringing) return;
    answerRef.current?.focus();
    const title = document.title;
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? '📞 전화가 왔습니다' : title;
    }, 900);
    return () => {
      clearInterval(t);
      document.title = title;
    };
  }, [ringing]);

  /** 받기 → 통화 연결 + 상담 콘솔(접수 패널)로 */
  const take = () => {
    answer(caller ? { existing: caller.existing, name: caller.name } : null);
    if (!pathname.startsWith('/callcenter')) navigate('/callcenter');
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
          {caller === null ? (
            <p className={styles.inWho}>고객 정보를 찾는 중…</p>
          ) : caller.existing ? (
            <p className={styles.inWho}>
              <span className={`${styles.custTag} ${styles.custOld}`}>기존 고객</span>
              <b>{caller.name}</b>
              {caller.leads ? ` · 이전 접수 ${caller.leads}건` : ''}
            </p>
          ) : (
            <p className={styles.inWho}>
              <span className={`${styles.custTag} ${styles.custNew}`}>신규 고객</span>
              처음 전화한 번호입니다
            </p>
          )}
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
  const active = call.state === 'active';
  const status =
    call.state === 'connecting' ? (call.direction === 'out' ? '거는 중…' : '연결 중…') : '통화 중';
  const custTag =
    caller === null ? null : caller.existing ? (
      <span className={`${styles.custTag} ${styles.custOld}`}>기존 고객</span>
    ) : (
      <span className={`${styles.custTag} ${styles.custNew}`}>신규 고객</span>
    );

  return (
    <div className={`${styles.bar} ${active ? styles.live : ''}`} role="status" aria-live="polite">
      <span className={`${styles.icon} ${active ? styles.iconLive : ''}`}>
        {call.direction === 'in' ? <PhoneIncoming size={20} /> : <PhoneOutgoing size={20} />}
      </span>
      <span className={styles.text}>
        <span className={styles.line1}>
          {active && <span className={styles.liveDot} aria-hidden />}
          <b>{status}</b>
          {active && (
            <span className={styles.timer}>
              {mmss(Date.now() - (call.startedAt ?? Date.now()))}
            </span>
          )}
          {call.muted && <span className={styles.mutedTag}>음소거 중</span>}
        </span>
        <span className={styles.line2}>
          <span className={styles.num}>{who}</span>
          {custTag}
          {caller?.name && <span>{caller.name}</span>}
          {caller?.existing && caller.leads > 0 && (
            <span className={styles.dim}>· 이전 접수 {caller.leads}건</span>
          )}
        </span>
        {call.audioIssue === 'no-media' && (
          <small className={styles.warn}>
            고객 음성이 PC로 들어오지 않습니다 — 네트워크(방화벽) 문제일 수 있습니다
          </small>
        )}
      </span>
      {call.audioIssue === 'blocked' && (
        <button type="button" className={styles.answer} onClick={resumeAudio}>
          소리 켜기
        </button>
      )}
      {active && (
        <button
          type="button"
          className={`${styles.ghost} ${call.muted ? styles.ghostOn : ''}`}
          onClick={toggleMute}
          aria-pressed={call.muted}
        >
          {call.muted ? <MicOff size={16} /> : <Mic size={16} />}
          {call.muted ? '음소거 해제' : '음소거'}
        </button>
      )}
      <button type="button" className={styles.hang} onClick={hangup}>
        <PhoneOff size={16} /> {active ? '통화 종료' : '끊기'}
      </button>
    </div>
  );
}
