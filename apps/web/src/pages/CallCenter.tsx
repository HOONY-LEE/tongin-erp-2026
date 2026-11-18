import { useCallback, useEffect, useRef, useState } from 'react';
import { Laptop, Trash2, PhoneOutgoing, Settings2, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { dial, disablePhone, enablePhone, setRingable, usePhone } from '../lib/softphone';
import {
  Badge,
  Button,
  ConfirmModal,
  CopyText,
  Input,
  ListPage,
  SegmentedControl,
  useToast,
} from '../components/ui';
import styles from './callcenter.module.css';
import { IntakePanel } from './callcenter/IntakePanel';
import { CallList } from './callcenter/CallList';
import { PhoneSettingsModal } from './callcenter/PhoneSettingsModal';
import { ScriptCard } from './callcenter/ScriptCard';

interface CallView {
  id: string;
  phone: string;
  status: 'ASSIGNED' | 'OUTCALL' | 'CALLBACK';
  channel: string | null;
  attempts: number;
  memo: string | null;
  request: string | null;
  leadId?: string | null;
  leadNo?: string | null;
  customerId: string | null;
  customerName: string | null;
  agentEmpId: string | null;
  receivedAt: string;
  assignedAt: string | null;
}
interface Console {
  me: {
    employeeId: string;
    available: boolean;
    /** 착신 연결 번호 — 대표번호 전화가 이 전화로 바로 울린다 */
    ringTo: string | null;
    call: CallView | null;
    recentLeads: {
      id: string;
      leadNo: string;
      status: string;
      createdAt: string;
      moveDate: string | null;
      orgUnit: { name: string } | null;
    }[];
  } | null;
  agents: {
    employeeId: string;
    name: string;
    position: string | null;
    state: 'BUSY' | 'READY' | 'OFF';
    call: CallView | null;
    forwarding: boolean;
    /** PC 전화(브라우저)를 켜 둠 */
    pcPhone: boolean;
  }[];
  outcalls: CallView[];
  today: { received: number; active: number; outcall: number; done: number };
}

const POLL_MS = 3000;
const since = (iso: string, now: number) => {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  return m < 1 ? '방금' : m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
};
const STATE: Record<Console['agents'][number]['state'], { label: string; cls: string }> = {
  BUSY: { label: '상담 중', cls: 'busy' },
  READY: { label: '상담 가능', cls: 'ready' },
  OFF: { label: '자리 비움', cls: 'off' },
};

/**
 * 상담 콘솔 — 고객관리부(콜센터) 전용.
 * 대표번호로 들어온 콜은 '상담 가능'인 상담원에게 자동으로 붙고, 모두 통화 중이면 아웃콜로 쌓인다.
 * 상담을 마치면 아웃콜을 눌러 콜백 → 그 번호가 들어간 접수 창(접수 화면 그대로)에서 바로 등록한다.
 */
export default function CallCenter() {
  const toast = useToast();
  const { can, user } = useAuth();
  const isSysAdmin = !!user?.permissions.includes('*');
  const [data, setData] = useState<Console | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [simPhone, setSimPhone] = useState('');
  /** 상담 가능 상태를 저장하는 중 — 그 사이 폴링이 화면을 되돌리지 않게 */
  const pendingAvail = useRef<boolean | null>(null);
  const phone = usePhone();
  const pcReady = phone.status === 'ready';

  const load = useCallback(async () => {
    try {
      const r = await api<Console>('/cs-calls/console');
      // 상태를 바꾸는 중이면(서버 저장 전) 화면에 먼저 바꾼 값을 그대로 둔다 — 폴링이 되돌리지 않게
      const pending = pendingAvail.current;
      setData(pending !== null && r.me ? { ...r, me: { ...r.me, available: pending } } : r);
      setNow(Date.now());
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    }
  }, [toast]);
  // PC로 전화를 받으면 — 서버를 기다리지 않고 상담 화면을 바로 연다(pending),
  // 서버가 만든 콜이 오면 콘솔을 다시 읽지 않고 그대로 끼운다
  const [pending, setPending] = useState<{
    phone: string;
    name?: string | null;
    existing?: boolean;
    at: string;
  } | null>(null);
  useEffect(() => {
    const onAnswering = (e: Event) => {
      const d = (e as CustomEvent<{ phone: string; name?: string | null; existing?: boolean }>)
        .detail;
      if (d?.phone) setPending({ ...d, at: new Date().toISOString() });
    };
    const onChanged = (e: Event) => {
      const d = (
        e as CustomEvent<
          { call: CallView; recentLeads: NonNullable<Console['me']>['recentLeads'] } | undefined
        >
      ).detail;
      setPending(null);
      if (d?.call)
        setData((cur) =>
          cur?.me
            ? {
                ...cur,
                me: { ...cur.me, available: false, call: d.call, recentLeads: d.recentLeads },
              }
            : cur,
        );
      else void load();
    };
    window.addEventListener('tongin:cs-call-answering', onAnswering);
    window.addEventListener('tongin:cs-call-changed', onChanged);
    return () => {
      window.removeEventListener('tongin:cs-call-answering', onAnswering);
      window.removeEventListener('tongin:cs-call-changed', onChanged);
    };
  }, [load]);
  // 서버가 끝내 답하지 않으면(오류) 15초 뒤 임시 화면을 접는다
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 15_000);
    return () => clearTimeout(t);
  }, [pending]);
  // 새 콜·배분이 바로 보이게 몇 초마다 다시 읽는다(창이 안 보일 때는 쉰다)
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast({ type: 'success', title: ok });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '처리하지 못했습니다' });
      await load();
    } finally {
      setBusy(false);
    }
  };
  /**
   * 상담 가능/자리 비움 — 누르는 즉시 화면을 바꾸고(낙관적 갱신) 서버 저장은 뒤에서.
   * 실패하면 되돌리고 알린다.
   */
  const setAvailable = async (available: boolean) => {
    pendingAvail.current = available;
    setData((d) => (d?.me ? { ...d, me: { ...d.me, available } } : d));
    try {
      await api('/cs-calls/agent', { method: 'POST', body: JSON.stringify({ available }) });
    } catch (e) {
      setData((d) => (d?.me ? { ...d, me: { ...d.me, available: !available } } : d));
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '상태를 바꾸지 못했습니다',
      });
    } finally {
      pendingAvail.current = null;
      void load();
    }
  };
  const saveRingTo = (ringTo: string) =>
    act(
      () =>
        api('/cs-calls/agent/ring-to', {
          method: 'POST',
          body: JSON.stringify({ ringTo: ringTo.trim() || null }),
        }),
      ringTo.trim() ? '착신 번호를 저장했습니다' : '착신 연결을 껐습니다',
    );
  /** 아웃콜을 눌러 콜백 — 콘솔에서 바로 접수 패널이 열린다(화면 이동 없음). PC 전화가 켜져 있으면 바로 건다 */
  const callback = (c: CallView) =>
    act(async () => {
      await api<CallView>(`/cs-calls/${c.id}/callback`, { method: 'POST' });
      if (pcReady) dial(c.phone, c.id);
    });
  /** 아웃콜 정리 확인 창 */
  const [cancelTarget, setCancelTarget] = useState<CallView | null>(null);
  /** 콜이 끝나면 콜 목록도 다시 읽는다 */
  const [listKey, setListKey] = useState(0);
  const afterIntake = async () => {
    await load();
    setListKey((k) => k + 1);
  };

  // 동시 울림 — 상담 가능이고 열린 콜이 없을 때만 이 PC가 울리게(등록) 바로 반영
  const ringOk = !!data?.me?.available && !data?.me?.call;
  useEffect(() => {
    if (data) setRingable(ringOk);
  }, [data, ringOk]);
  // PC가 울리는 동안(아직 [받기] 전)은 상담 화면으로 넘어가지 않는다 — 받으면 그때 연다
  const ringingIn = phone.call?.state === 'ringing' && phone.call.direction === 'in';
  const activeId = ringingIn ? null : (data?.me?.call?.id ?? null);
  // 상담 화면 주소 — 상담 중이면 /callcenter/<콜 id>, 끝나면 /callcenter (새로고침해도 같은 상담).
  // 라우터로 옮기면 화면이 통째로 다시 그려지므로(탭이 주소별로 화면을 새로 만든다) 주소창만 바꾼다.
  useEffect(() => {
    if (!data) return;
    const want = activeId ? `/callcenter/${activeId}` : '/callcenter';
    if (window.location.pathname !== want)
      window.history.replaceState(window.history.state, '', want);
  }, [data, activeId]);

  if (!data)
    return (
      <ListPage title="상담 콘솔">
        <div className={styles.empty}>불러오는 중…</div>
      </ListPage>
    );
  const me = data.me;
  // 서버 콜이 오기 전 잠깐은 임시 콜로 상담 화면을 연다(접수 등록·상담 종료는 잠시 막힘)
  const pendingCall: CallView | null =
    pending && !me?.call
      ? {
          id: '',
          phone: pending.phone,
          status: 'ASSIGNED',
          channel: '대표번호',
          attempts: 0,
          memo: null,
          request: null,
          customerId: null,
          customerName: pending.name ?? null,
          agentEmpId: me?.employeeId ?? null,
          receivedAt: pending.at,
          assignedAt: pending.at,
        }
      : null;
  const mine = ringingIn ? null : (me?.call ?? pendingCall);

  return (
    <ListPage
      fit
      title="상담 콘솔"
      subtitle="대표번호로 들어온 콜은 '상담 가능'인 상담원에게 자동으로 배분되고, 모두 통화 중이면 아웃콜로 쌓입니다. 전화를 받으면 '내 콜'에서 통화하면서 바로 접수하세요."
      onRefresh={load}
      actions={
        me ? (
          <div className={styles.actions}>
            <PcPhone />
            <RingTo value={me.ringTo} busy={busy} onSave={saveRingTo} />
            {/* 기본은 자리 비움. 콜이 배정되면 자동으로 '상담 중'이 되고, 통화가 끝나도 후처리를 마치고
                직접 [상담 가능]을 눌러야 다음 전화가 온다 */}
            <SegmentedControl
              value={me.available && !mine ? 'on' : 'off'}
              onChange={(v) => {
                if (v === 'on' && mine) {
                  toast({
                    type: 'warning',
                    title: '상담 중인 콜을 먼저 마무리(접수 등록)한 뒤 상담 가능으로 바꿔 주세요.',
                  });
                  return;
                }
                void setAvailable(v === 'on');
              }}
              options={[
                {
                  value: 'on',
                  label: (
                    <span className={styles.availLabel}>
                      {me.available && !mine && <i className={styles.availDot} aria-hidden />}
                      상담 가능
                    </span>
                  ),
                  disabled: !!mine,
                },
                { value: 'off', label: mine ? '상담 중' : '자리 비움' },
              ]}
            />
          </div>
        ) : undefined
      }
    >
      <div className={styles.grid}>
        {/* 왼쪽 — 통화 중이면 접수 패널, 아니면 상담 콜 목록 */}
        {me && mine ? (
          <section className={`${styles.card} ${styles.intakeCard}`}>
            <IntakePanel
              call={mine}
              recentLeads={me.call ? me.recentLeads : []}
              pending={!mine.id}
              onDone={afterIntake}
            />
          </section>
        ) : (
          <div className={styles.mainCol}>
            <CallList refreshKey={listKey} />
          </div>
        )}

        {/* 오른쪽 — 상담 메모(대본) 위, 아웃콜 대기 아래 */}
        <div className={styles.sideCol}>
          <ScriptCard />
          {/* 아웃콜 대기 */}
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              <PhoneOutgoing size={15} /> 아웃콜 대기{' '}
              <span className={styles.count}>{data.outcalls.length}</span>
            </h3>
            {data.outcalls.length ? (
              <ol className={styles.ocList}>
                {data.outcalls.map((c, i) => (
                  <li key={c.id} className={styles.ocItem}>
                    <span className={styles.ocNo}>{i + 1}</span>
                    <span className={styles.ocMain}>
                      <b className={styles.ocPhone}>{formatPhone(c.phone)}</b>
                      <span className={styles.ocInfo}>
                        {c.customerName ?? '새 번호'} · {since(c.receivedAt, now)} 대기
                        {c.attempts > 0 && ` · 콜백 ${c.attempts}번 안 받음`}
                        {c.channel?.includes('부재중') && ' · 부재중'}
                      </span>
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy || !me || !!mine}
                      title={
                        mine
                          ? '지금 콜을 먼저 끝내 주세요'
                          : '이 번호로 전화하고 상담 화면을 엽니다'
                      }
                      onClick={() => void callback(c)}
                    >
                      <PhoneOutgoing size={14} /> 콜백
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      title="콜백하지 않고 목록에서 뺍니다(잘못 들어온 콜·시험 콜)"
                      onClick={() => setCancelTarget(c)}
                    >
                      <Trash2 size={14} /> 정리
                    </Button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.emptyQ}>아웃콜이 없습니다.</p>
            )}
          </section>
        </div>
      </div>

      {/* 아래 — 오늘 숫자와 상담원 현황(상담 중에는 화면을 꽉 채우게 숨긴다) */}
      {!(me && mine) && (
        <>
          <div className={styles.stats}>
            <div>
              <span>오늘 들어온 콜</span>
              <b>{data.today.received}</b>
            </div>
            <div>
              <span>상담 중</span>
              <b>{data.agents.filter((a) => a.state === 'BUSY').length}</b>
            </div>
            <div className={data.outcalls.length ? styles.warnStat : ''}>
              <span>아웃콜 대기</span>
              <b>{data.outcalls.length}</b>
            </div>
            <div>
              <span>상담 가능 상담원</span>
              <b>
                {data.agents.filter((a) => a.state === 'READY').length} / {data.agents.length}
              </b>
            </div>
            <div>
              <span>오늘 끝낸 콜</span>
              <b>{data.today.done}</b>
            </div>
          </div>

          <div className={styles.bottomGrid}>
            {/* 상담원 현황 */}
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>
                <UserRound size={15} /> 상담원
              </h3>
              <ul className={styles.agents}>
                {data.agents.map((a) => (
                  <li key={a.employeeId}>
                    <i className={styles[STATE[a.state].cls]} />
                    <span className={styles.aName}>
                      {a.name}
                      {a.position ? ` ${a.position}` : ''}
                      {a.employeeId === me?.employeeId && (
                        <span className={styles.muted}> (나)</span>
                      )}
                      {a.pcPhone ? (
                        <span className={styles.muted}> · PC 전화</span>
                      ) : (
                        a.forwarding && <span className={styles.muted}> · 착신</span>
                      )}
                    </span>
                    <span className={styles.aState}>
                      {STATE[a.state].label}
                      {a.call &&
                        ` · ${formatPhone(a.call.phone)} · ${since(a.call.assignedAt ?? a.call.receivedAt, now)}`}
                    </span>
                  </li>
                ))}
              </ul>
              {isSysAdmin && <Integration />}
              {can('LEAD.CREATE') && (
                <div className={styles.sim}>
                  <span className={styles.muted}>
                    전화 시스템 연동 전 시험 — 대표번호로 콜이 들어온 것처럼 만듭니다.
                  </span>
                  <div className={styles.actions}>
                    <Input
                      value={simPhone}
                      placeholder="번호(비우면 아무 번호)"
                      onChange={(e) => setSimPhone(e.target.value)}
                      style={{ width: 170 }}
                      aria-label="시험 콜 번호"
                    />
                  </div>
                  <div className={styles.actions}>
                    {[1, 5, 10].map((n) => (
                      <Button
                        key={n}
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const r = await api<{ assigned: number; outcall: number }>(
                              '/cs-calls/simulate',
                              {
                                method: 'POST',
                                body: JSON.stringify({
                                  count: n,
                                  ...(simPhone.trim() && { phone: simPhone.trim() }),
                                }),
                              },
                            );
                            toast({
                              type: 'success',
                              title: `시험 콜 ${n}건 — 배분 ${r.assigned} · 아웃콜 ${r.outcall}`,
                            });
                          })
                        }
                      >
                        시험 콜 {n}건
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <ConfirmModal
        open={!!cancelTarget}
        title="아웃콜 정리"
        confirmLabel="정리"
        danger
        busy={busy}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          const c = cancelTarget;
          if (!c) return;
          void act(
            () => api(`/cs-calls/${c.id}/cancel`, { method: 'POST' }),
            '아웃콜을 정리했습니다',
          ).then(() => setCancelTarget(null));
        }}
      >
        {cancelTarget && (
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            <b>{formatPhone(cancelTarget.phone)}</b>
            {cancelTarget.customerName ? ` (${cancelTarget.customerName})` : ''} 아웃콜을 콜백하지
            않고 목록에서 정리할까요?
            <br />
            <span className={styles.muted}>
              잘못 들어온 전화나 시험 콜일 때 씁니다. 정리한 콜은 콜 목록에 &apos;취소&apos;로
              남습니다.
            </span>
          </p>
        )}
      </ConfirmModal>
    </ListPage>
  );
}

/**
 * 전화 연동(시스템 관리자) — 한국AI통신 번호 설정의 '웹훅 URL'에 넣을 주소.
 * 키가 들어 있으니 다른 곳에 공유하지 않는다.
 */
function Integration() {
  const [info, setInfo] = useState<{ voiceWebhook: string | null; path: string } | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!show || info) return;
    void api<{ voiceWebhook: string | null; path: string }>('/cs-calls/integration')
      .then(setInfo)
      .catch(() => undefined);
  }, [show, info]);
  const url = info ? (info.voiceWebhook ?? `${window.location.origin}${info.path}`) : '';
  return (
    <div className={styles.sim}>
      <span className={styles.muted}>
        전화 연동 — 한국AI통신 번호 설정의 웹훅 URL(POST)에 이 주소를 넣으면, 그 번호로 온 전화가
        여기 뜹니다. 키가 들어 있어 관리자만 봅니다.
      </span>
      {show ? (
        url ? (
          <CopyText value={url} />
        ) : (
          <span className={styles.muted}>불러오는 중…</span>
        )
      ) : (
        <div className={styles.actions}>
          <Button variant="outline" size="sm" onClick={() => setShow(true)}>
            웹훅 주소 보기
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * PC 전화 — 전화기 없이 이 브라우저(헤드셋)로 받고 건다. 켜 두면 배분된 전화가 이 PC로 울린다.
 * 화면을 옮겨도 켜진 채로 있고, 새로고침해도 다시 켜진다.
 */
function PcPhone() {
  const phone = usePhone();
  const toast = useToast();
  const [working, setWorking] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const soundButton = (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSoundOpen(true)}
        aria-label="PC 전화 소리 설정"
        title="소리 설정"
      >
        <Settings2 size={14} />
      </Button>
      {soundOpen && <PhoneSettingsModal onClose={() => setSoundOpen(false)} />}
    </>
  );
  // 켜지 못한 이유(마이크 권한·연결 실패)는 알림으로
  useEffect(() => {
    if (phone.status === 'error' && phone.error) toast({ type: 'error', title: phone.error });
  }, [phone.status, phone.error, toast]);
  const run = async (fn: () => Promise<void>) => {
    setWorking(true);
    try {
      await fn();
    } finally {
      setWorking(false);
    }
  };
  if (phone.status === 'ready')
    return (
      <span className={styles.pcPhone}>
        <Badge variant="subtle" color="success">
          <Laptop size={12} /> PC 전화 켜짐{phone.ringable ? ' · 울림 대기' : ''}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          disabled={working || !!phone.call}
          onClick={() => void run(disablePhone)}
        >
          끄기
        </Button>
        {soundButton}
      </span>
    );
  return (
    <span className={styles.pcPhone}>
      <Button
        variant="outline"
        size="sm"
        disabled={working || phone.status === 'connecting'}
        onClick={() => void run(enablePhone)}
        title="전화기 없이 이 PC(헤드셋)로 전화를 받고 겁니다"
      >
        <Laptop size={14} />{' '}
        {phone.status === 'connecting'
          ? '연결 중…'
          : phone.status === 'error'
            ? 'PC 전화 다시 켜기'
            : 'PC 전화 켜기'}
      </Button>
      {soundButton}
    </span>
  );
}

/** 착신 번호 — 내 휴대폰이나 자리 전화의 직통번호. 비우고 저장하면 착신 연결을 끈다 */
function RingTo({
  value,
  busy,
  onSave,
}: {
  value: string | null;
  busy: boolean;
  onSave: (v: string) => Promise<unknown> | void;
}) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const changed = v.replace(/\D/g, '') !== (value ?? '');
  return (
    <div
      className={styles.actions}
      title="대표번호로 온 전화를 이 번호로 바로 울립니다(착신 연결). 비우면 콘솔에서 콜백합니다."
    >
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="받을 전화번호(착신)"
        inputMode="tel"
        style={{ width: 170 }}
      />
      {changed && (
        <Button size="sm" disabled={busy} onClick={() => void onSave(v)}>
          {v.trim() ? '저장' : '착신 끄기'}
        </Button>
      )}
    </div>
  );
}
