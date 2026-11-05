import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneIncoming, X } from 'lucide-react';
import { formatPhone } from '@tongin/shared';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError } from '../../lib/api';
import { newLeadPath, useCallStream, type CallContext, type CallSignal } from '../../lib/calls';
import { Button, useToast } from '../ui';
import { CallInfo } from './CallInfo';
import styles from './call.module.css';

/** 동시에 띄우는 팝업 수 — 넘치면 가장 오래된 것부터 닫는다(수신 기록에는 남는다) */
const MAX = 3;
/** 다른 사람이 받았거나 끊긴 전화는 잠깐 보여 주고 닫는다 */
const LINGER_MS = 6000;

/**
 * 콜팝업 — 전화가 오면 화면 오른쪽 아래에 건 사람·고객 정보를 띄운다(CALL.READ 권한).
 * 앱 화면 어디에 있든 보이도록 AppLayout에 한 번 붙인다.
 */
export function CallPopup() {
  const { user, can } = useAuth();
  const enabled = !!user && can('CALL.READ');
  const navigate = useNavigate();
  const toast = useToast();
  const [calls, setCalls] = useState<CallContext[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const close = useCallback((id: string) => {
    setCalls((cs) => cs.filter((c) => c.call.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const closeLater = useCallback(
    (id: string) => {
      if (timers.current.has(id)) return;
      timers.current.set(
        id,
        setTimeout(() => close(id), LINGER_MS),
      );
    },
    [close],
  );

  const upsert = useCallback(
    (ctx: CallContext) => {
      setCalls((cs) => {
        const i = cs.findIndex((c) => c.call.id === ctx.call.id);
        if (i >= 0) return cs.map((c, k) => (k === i ? ctx : c));
        return [...cs, ctx].slice(-MAX);
      });
      const mine = ctx.call.answeredByUserId === user?.userId;
      const takenByOther = !!ctx.call.answeredByUserId && !mine;
      const over = ctx.call.status === 'MISSED' || ctx.call.status === 'ENDED';
      // 내가 받은 전화는 접수 등록까지 할 수 있게 내가 닫을 때까지 둔다
      if (takenByOther || (over && !mine)) closeLater(ctx.call.id);
    },
    [closeLater, user?.userId],
  );

  const onSignal = useCallback(
    async (s: CallSignal) => {
      if (!s.callId) return;
      const known = calls.some((c) => c.call.id === s.callId);
      if (s.type !== 'ringing' && !known) return;
      try {
        const ctx = await api<CallContext>(`/telephony/calls/${s.callId}`);
        upsert(ctx);
        if (s.type === 'ringing') notify(ctx);
      } catch {
        // 통화를 못 읽으면 띄우지 않는다(수신 기록에는 남아 있다)
      }
    },
    [calls, upsert],
  );

  useCallStream(enabled, (s) => void onSignal(s));

  useEffect(() => {
    const ts = timers.current;
    return () => ts.forEach((t) => clearTimeout(t));
  }, []);

  const answer = async (id: string) => {
    try {
      upsert(await api<CallContext>(`/telephony/calls/${id}/answer`, { method: 'POST' }));
      return true;
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '응대 표시를 못 했습니다',
      });
      return false;
    }
  };

  const newLead = async (ctx: CallContext) => {
    if (!ctx.call.answeredByUserId && !(await answer(ctx.call.id))) return;
    navigate(
      newLeadPath({
        phone: ctx.call.fromNumber,
        name: ctx.customers[0]?.name,
        callId: ctx.call.id,
      }),
    );
  };

  if (!enabled || !calls.length) return null;

  return (
    <div className={styles.stack} role="region" aria-label="걸려 온 전화">
      {calls.map((ctx) => {
        const mine = ctx.call.answeredByUserId === user?.userId;
        const other = !!ctx.call.answeredByUserId && !mine;
        const ringing = ctx.call.status === 'RINGING' && !ctx.call.answeredByUserId;
        return (
          <div
            key={ctx.call.id}
            className={`${styles.popup} ${ringing ? styles.ringing : ''} ${other ? styles.faded : ''}`}
          >
            <div className={styles.popHead}>
              <PhoneIncoming size={16} aria-hidden />
              <span>{ringing ? '전화가 왔습니다' : mine ? '응대 중인 전화' : '걸려 온 전화'}</span>
              <button
                type="button"
                className={styles.close}
                onClick={() => close(ctx.call.id)}
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>
            <CallInfo ctx={ctx} />
            <div className={styles.actions}>
              {other ? (
                <span className={styles.dim}>{ctx.call.answeredBy}님이 응대 중입니다</span>
              ) : (
                <>
                  {!mine && (
                    <Button size="sm" variant="outline" onClick={() => void answer(ctx.call.id)}>
                      내가 응대
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigate(`/calls?detail=${ctx.call.id}`);
                      close(ctx.call.id);
                    }}
                  >
                    메모
                  </Button>
                  {ctx.call.leadId ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(`/leads/${ctx.call.leadId}`)}
                    >
                      등록한 접수
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => void newLead(ctx)}>
                      + 접수 등록
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 다른 창을 보고 있을 때 — OS 알림(데스크톱 앱은 기본 허용, 브라우저는 수신 기록 화면에서 켠다) */
function notify(ctx: CallContext) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  const c = ctx.customers[0];
  const num = ctx.call.fromNumber ? formatPhone(ctx.call.fromNumber) : '발신번호 표시 제한';
  try {
    const n = new Notification(c ? `${c.name} 고객 전화` : '신규 번호 전화', {
      body: c ? `${num}${c.gradeName ? ` · ${c.gradeName}` : ''}` : num,
      tag: ctx.call.id,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // 알림을 못 띄우는 환경(일부 모바일 브라우저)
  }
}
