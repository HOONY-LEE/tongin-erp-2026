import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Grid3x3, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { formatPhone } from '../lib/phone';
import {
  answer,
  hangup,
  resumeAudio,
  resumePhoneIfEnabled,
  sendDtmf,
  toggleMute,
  usePhone,
} from '../lib/softphone';
import styles from './SoftphoneBar.module.css';
import { TransferButton } from './TransferButton';

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
  // 통화 중 키패드(ARS 인증번호·자동 응답 메뉴) — 누른 숫자를 옆에 보여 준다
  const [padOpen, setPadOpen] = useState(false);
  const [pressed, setPressed] = useState('');
  useEffect(() => {
    if (call?.state === 'active') return;
    setPadOpen(false);
    setPressed('');
  }, [call?.state]);
  const press = (k: string) => {
    sendDtmf(k);
    setPressed((p) => (p + k).slice(-20));
  };
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
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? t('cc.incomingNotice') : title;
    }, 900);
    return () => {
      clearInterval(timer);
      document.title = title;
    };
  }, [ringing]);

  // 통화가 끝나면 막대를 바로 없애지 않고 '통화가 종료되었습니다'를 잠깐 보여 준다(울리기만 하고 끊긴 전화는 빼고)
  const { t } = useTranslation();
  const [ended, setEnded] = useState<{ who: string } | null>(null);
  const prevCall = useRef(call);
  useEffect(() => {
    const prev = prevCall.current;
    prevCall.current = call;
    if (call || !prev || (prev.state === 'ringing' && prev.direction === 'in')) return;
    setEnded({ who: prev.number ? formatPhone(prev.number) : '' });
    const tm = setTimeout(() => setEnded(null), 2500);
    return () => clearTimeout(tm);
  }, [call]);

  /** 받기 → 통화 연결 + 상담 콘솔(접수 패널)로 */
  const take = () => {
    answer(caller ? { existing: caller.existing, name: caller.name } : null);
    if (!pathname.startsWith('/callcenter')) navigate('/callcenter');
  };

  if (!call)
    return ended ? (
      <div className={`${styles.bar} ${styles.ended}`} role="status" aria-live="polite">
        <span className={styles.icon}>
          <PhoneOff size={20} />
        </span>
        <span className={styles.text}>
          <span className={styles.line1}>
            <b>{t('call.ended')}</b>
          </span>
          {ended.who && (
            <span className={styles.line2}>
              <span className={styles.num}>{ended.who}</span>
            </span>
          )}
        </span>
      </div>
    ) : null;
  const who = call.number ? formatPhone(call.number) : t('cc.unknownNumber');

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
          <h2 id="incoming-title">{t('cc.incoming')}</h2>
          <b className={styles.inNumber}>{who}</b>
          {caller === null ? (
            <p className={styles.inWho}>{t('cc.findingCustomer')}</p>
          ) : caller.existing ? (
            <p className={styles.inWho}>
              <span className={`${styles.custTag} ${styles.custOld}`}>{t('cc.existing')}</span>
              <b>{caller.name}</b>
            </p>
          ) : (
            <p className={styles.inWho}>
              <span className={`${styles.custTag} ${styles.custNew}`}>{t('cc.newCustomer')}</span>
              {t('cc.firstCall')}
            </p>
          )}
          <div className={styles.inActions}>
            <button type="button" className={styles.hangBig} onClick={hangup}>
              <PhoneOff size={18} /> {t('cc.decline')}
            </button>
            <button ref={answerRef} type="button" className={styles.answerBig} onClick={take}>
              <Phone size={18} /> {t('cc.answer')}
            </button>
          </div>
          <small className={styles.inHint}>{t('cc.ringTimeout')}</small>
        </div>
      </div>
    );
  const active = call.state === 'active';
  const status =
    call.state === 'connecting'
      ? call.direction === 'out'
        ? t('cc.dialing')
        : t('cc.connecting')
      : t('cc.inCall');
  const custTag =
    caller === null ? null : caller.existing ? (
      <span className={`${styles.custTag} ${styles.custOld}`}>{t('cc.existing')}</span>
    ) : (
      <span className={`${styles.custTag} ${styles.custNew}`}>{t('cc.newCustomer')}</span>
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
          {call.muted && <span className={styles.mutedTag}>{t('cc.muted')}</span>}
        </span>
        <span className={styles.line2}>
          <span className={styles.num}>{who}</span>
          {custTag}
          {caller?.name && <span>{caller.name}</span>}
        </span>
        {call.reconnecting ? (
          <small className={styles.warn}>{t('cc.callReconnecting')}</small>
        ) : (
          call.audioIssue === 'no-media' && <small className={styles.warn}>{t('cc.noAudio')}</small>
        )}
      </span>
      {call.audioIssue === 'blocked' && (
        <button type="button" className={styles.answer} onClick={resumeAudio}>
          {t('cc.unmuteAudio')}
        </button>
      )}
      {active && (
        <span className={styles.padWrap}>
          <button
            type="button"
            className={`${styles.ghost} ${padOpen ? styles.ghostOn : ''}`}
            onClick={() => setPadOpen((o) => !o)}
            aria-expanded={padOpen}
          >
            <Grid3x3 size={16} /> {t('cc.keypad')}
          </button>
          {padOpen && (
            <div
              className={styles.pad}
              role="group"
              aria-label={t('cc.keypad')}
              tabIndex={-1}
              onKeyDown={(e) => {
                if (/^[0-9*#]$/.test(e.key)) press(e.key);
                if (e.key === 'Escape') setPadOpen(false);
              }}
            >
              <output className={styles.padShow}>{pressed || t('cc.pressKeys')}</output>
              <div className={styles.padKeys}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
                  <button key={k} type="button" onClick={() => press(k)}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </span>
      )}
      {active && <TransferButton customerPhone={call.number} />}
      {active && (
        <button
          type="button"
          className={`${styles.ghost} ${call.muted ? styles.ghostOn : ''}`}
          onClick={toggleMute}
          aria-pressed={call.muted}
        >
          {call.muted ? <MicOff size={16} /> : <Mic size={16} />}
          {call.muted ? t('cc.unmute') : t('cc.mute')}
        </button>
      )}
      <button type="button" className={styles.hang} onClick={hangup}>
        <PhoneOff size={16} /> {active ? t('cc.hangupTip') : t('cc.hangup')}
      </button>
    </div>
  );
}
