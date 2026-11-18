import { useCallback, useEffect, useState } from 'react';
import { Headphones, Laptop, PhoneCall, PhoneOutgoing, Settings2, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { dial, disablePhone, enablePhone, usePhone } from '../lib/softphone';
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
  const phone = usePhone();
  const pcReady = phone.status === 'ready';

  const load = useCallback(async () => {
    try {
      setData(await api<Console>('/cs-calls/console'));
      setNow(Date.now());
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    }
  }, [toast]);
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
  const setAvailable = (available: boolean) =>
    act(() => api('/cs-calls/agent', { method: 'POST', body: JSON.stringify({ available }) }));
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

  if (!data)
    return (
      <ListPage title="상담 콘솔">
        <div className={styles.empty}>불러오는 중…</div>
      </ListPage>
    );
  const me = data.me;
  const mine = me?.call ?? null;

  return (
    <ListPage
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
                { value: 'on', label: '상담 가능', disabled: !!mine },
                { value: 'off', label: mine ? '상담 중' : '자리 비움' },
              ]}
            />
          </div>
        ) : undefined
      }
    >
      <div className={styles.grid}>
        {/* 내 콜 — 통화하면서 바로 접수 */}
        <section className={`${styles.card} ${mine ? styles.intakeCard : ''}`}>
          <h3 className={styles.cardTitle}>
            <Headphones size={15} /> 내 콜
          </h3>
          {!me ? (
            <p className={styles.muted}>직원과 연결된 계정만 상담할 수 있습니다.</p>
          ) : mine ? (
            <IntakePanel call={mine} recentLeads={me.recentLeads} onDone={afterIntake} />
          ) : (
            <div className={styles.idle}>
              <PhoneCall size={22} />
              {me.available ? (
                <p>
                  대기 중입니다.{' '}
                  {pcReady
                    ? '콜이 들어오면 이 PC가 울립니다. 화면 아래 [받기]를 누르고 헤드셋으로 통화하세요. 20초 안에 안 받으면 다음 상담원에게 넘어가고 자리 비움으로 바뀝니다.'
                    : me.ringTo
                      ? `콜이 들어오면 ${formatPhone(me.ringTo)} 전화가 바로 울립니다. 20초 안에 안 받으면 다음 상담원에게 넘어가고 자리 비움으로 바뀝니다.`
                      : '콜이 들어오면 자동으로 여기에 붙습니다. PC 전화를 켜면 이 PC가 바로 울립니다.'}
                  {data.outcalls.length > 0 && ' 지금은 아웃콜부터 콜백하세요.'}
                </p>
              ) : (
                <p>
                  자리 비움 상태입니다. 위에서 <b>상담 가능</b>으로 바꾸면 콜을 받습니다.
                </p>
              )}
            </div>
          )}
        </section>

        {/* 오른쪽 — 상담 메모(대본) 위, 아웃콜 대기 아래 */}
        <div className={styles.sideCol}>
          <ScriptCard />
          {/* 아웃콜 대기 */}
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              <PhoneOutgoing size={15} /> 아웃콜 대기{' '}
              <span className={styles.count}>{data.outcalls.length}</span>
            </h3>
            <p className={styles.muted}>
              상담원이 모두 통화 중일 때 들어온 콜입니다. 먼저 들어온 순서 — 콜백을 누르면 '내 콜'에
              접수 패널이 열립니다.
            </p>
            {data.outcalls.length ? (
              <ol className={styles.queue}>
                {data.outcalls.map((c, i) => (
                  <li key={c.id}>
                    <span className={styles.qNo}>{i + 1}</span>
                    <span className={styles.qPhone}>{formatPhone(c.phone)}</span>
                    <span className={styles.qInfo}>
                      {c.customerName ? `기존 고객 ${c.customerName}` : '새 번호'} ·{' '}
                      {since(c.receivedAt, now)} 대기
                      {c.attempts > 0 && ` · 콜백 ${c.attempts}번 안 받음`}
                      {c.memo && ` · ${c.memo}`}
                    </span>
                    <span className={styles.qActions}>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy || !me || !!mine}
                        title={mine ? '지금 콜을 먼저 끝내 주세요' : undefined}
                        onClick={() => void callback(c)}
                      >
                        콜백
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        title="콜백하지 않고 목록에서 뺍니다(잘못 들어온 콜·시험 콜)"
                        onClick={() => setCancelTarget(c)}
                      >
                        정리
                      </Button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.emptyQ}>아웃콜이 없습니다.</p>
            )}
          </section>
        </div>

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
                  {a.employeeId === me?.employeeId && <span className={styles.muted}> (나)</span>}
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

      <CallList refreshKey={listKey} />

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
          <Laptop size={12} /> PC 전화 켜짐
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
