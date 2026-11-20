import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Laptop,
  Phone,
  PhoneForwarded,
  Trash2,
  PhoneIncoming,
  PhoneOutgoing,
  Settings2,
  UserRound,
  PhoneOff,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { dial, enablePhone, getPhoneState, setRingable, usePhone } from '../lib/softphone';
import {
  Button,
  ConfirmModal,
  CopyText,
  Input,
  ListPage,
  SegmentedControl,
  useToast,
  Skeleton,
  SkeletonText,
  TableSkeleton,
} from '../components/ui';
import styles from './callcenter.module.css';
import { IntakePanel, type ReadOnlyInfo } from './callcenter/IntakePanel';
import { CallList, type CallRow } from './callcenter/CallList';
import { CallerHistory } from './callcenter/CallerHistory';
import { FollowupList } from './callcenter/FollowupList';
import { MiniCalendar } from './callcenter/MiniCalendar';
import { PhoneSettingsModal } from './callcenter/PhoneSettingsModal';
import { ScriptCard } from './callcenter/ScriptCard';
import { ExtensionList } from './callcenter/ExtensionList';

interface CallView {
  /** 콜 번호 CL+YYMMDD+일련 */
  callNo?: string | null;
  id: string;
  phone: string;
  status: string;
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
    /** 고객관리부 상담원 — PC 전화·상담 가능은 상담원 전용 */
    isAgent: boolean;
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
    /** 오늘 받은 콜·콜백·접수·통화 시간(초) */
    today: { received: number; callbacks: number; leads: number; talkSec: number };
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
  OFF: { label: '후처리', cls: 'off' },
};

/**
 * 상담 콘솔 — 고객관리부(콜센터) 전용.
 * 대표번호로 들어온 콜은 '상담 가능'인 상담원에게 자동으로 붙고, 모두 통화 중이면 아웃콜로 쌓인다.
 * 상담을 마치면 아웃콜을 눌러 콜백 → 그 번호가 들어간 접수 창(접수 화면 그대로)에서 바로 등록한다.
 */
export default function CallCenter() {
  const toast = useToast();
  const { user } = useAuth();
  const isSysAdmin = !!user?.permissions.includes('*');
  const [data, setData] = useState<Console | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
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
   * 상담 가능/후처리 — 누르는 즉시 화면을 바꾸고(낙관적 갱신) 서버 저장은 뒤에서.
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
  /** 아웃콜을 눌러 콜백 — 콘솔에서 바로 접수 패널이 열린다(화면 이동 없음). PC 전화가 켜져 있으면 바로 건다 */
  const callback = (c: CallView) =>
    act(async () => {
      await api<CallView>(`/cs-calls/${c.id}/callback`, { method: 'POST' });
      if (pcReady) dial(c.phone, c.id);
    });
  /** 상담 가능을 눌렀는데 PC 전화가 꺼져 있을 때 — 켜면서 바로 상담 가능으로(처음엔 마이크 허용을 묻는다) */
  const [turningOn, setTurningOn] = useState(false);
  const turnOnAndAvailable = async () => {
    setTurningOn(true);
    try {
      await enablePhone();
      if (getPhoneState().status === 'error') return; // 이유는 PC 전화 버튼이 알림으로 띄운다
      await setAvailable(true);
    } finally {
      setTurningOn(false);
    }
  };
  /** 왼쪽 목록 — 상담 콜 / 이사 확인콜 / 해피콜 */
  const [view, setView] = useState<'calls' | 'CONFIRM' | 'HAPPY'>('calls');
  const [fuCounts, setFuCounts] = useState<{ confirm: number; happy: number } | null>(null);
  const loadFuCounts = useCallback(() => {
    void api<{ confirm: number; happy: number }>('/cs-followups/counts')
      .then(setFuCounts)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadFuCounts();
    const t = setInterval(() => !document.hidden && loadFuCounts(), 60_000);
    return () => clearInterval(t);
  }, [loadFuCounts]);
  /** 아웃콜 정리 확인 창 */
  const [cancelTarget, setCancelTarget] = useState<CallView | null>(null);
  /** 콜이 끝나면 콜 목록도 다시 읽는다 */
  const [listKey, setListKey] = useState(0);
  const afterIntake = async () => {
    go(null);
    await load();
    setListKey((k) => k + 1);
  };

  // 동시 울림 — 상담 가능이면 울린다(상담 화면이 열려 있어도). 통화 중에는 울리지 않는다
  const ringOk = !!data?.me?.available && !phone.call;
  useEffect(() => {
    if (data) setRingable(ringOk);
  }, [data, ringOk]);

  // 왼쪽에 보이는 상담 — /callcenter/<콜 id>. 라우터로 옮기면 화면이 통째로 다시 그려지므로
  // (탭이 주소별로 화면을 새로 만든다) 주소창만 바꾸고 뒤로 가기는 popstate로 받는다
  const idFromPath = () =>
    /^\/callcenter\/([0-9a-f-]{36})/.exec(window.location.pathname)?.[1] ?? null;
  const [viewId, setViewId] = useState<string | null>(idFromPath);
  const go = useCallback((id: string | null) => {
    const want = id ? `/callcenter/${id}` : '/callcenter';
    if (window.location.pathname !== want) window.history.pushState(window.history.state, '', want);
    setViewId(id);
  }, []);
  useEffect(() => {
    const onPop = () => setViewId(idFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // 새로 받은 콜(받기·콜백)이 생기면 그 상담 화면을 연다. 처음 열 때는 방금(1분 안) 받은 콜만
  const seenCall = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!data?.me) return;
    const c = data.me.call;
    const id = c?.id ?? null;
    if (seenCall.current === undefined) {
      if (c && !viewId && Date.now() - Date.parse(c.assignedAt ?? c.receivedAt) < 60_000) go(c.id);
    } else if (id && id !== seenCall.current) go(id);
    seenCall.current = id;
  }, [data, viewId, go]);
  const backToList = () => go(null);

  // 다른 콜 상세의 종류(받은 콜/콜백) — 제목 옆 표시용
  const [pageStatus, setPageStatus] = useState<Record<string, string>>({});
  const [pageNo, setPageNo] = useState<Record<string, string | null>>({});
  // 오른쪽 아래 카드 — 통화가 이어지면 내선(돌려주기), 끝나면 아웃콜로
  const live = !!phone.call && phone.call.state !== 'ringing';
  const [sideTab, setSideTab] = useState<'outcall' | 'ext'>('outcall');
  useEffect(() => {
    setSideTab(live ? 'ext' : 'outcall');
  }, [live]);
  if (!data)
    return (
      <ListPage fit title="상담 콘솔">
        <ConsoleSkeleton />
      </ListPage>
    );
  const me = data.me;
  // 서버 콜이 오기 전 잠깐은 임시 콜로 상담 화면을 연다(접수 등록·상담 종료는 잠시 막힘)
  const pendingCall: CallView | null = pending
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
  const onCall = !!phone.call && phone.call.state !== 'ringing';
  /** 목록 화면(상담 화면이 아닐 때) */
  const listView = !pendingCall && !viewId;
  /** 상담 화면 콜의 종류(받은 콜/콜백) — 제목 옆 표시 */
  const detailStatus = pendingCall
    ? 'ASSIGNED'
    : me?.call && me.call.id === viewId
      ? me.call.status
      : (pageStatus[viewId ?? ''] ?? null);
  /** 오늘 숫자 — 상담 콜·확인콜·해피콜 목록 위에 똑같이 */
  const statsEl = (
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
        <span>오늘 끝낸 콜</span>
        <b>{data.today.done}</b>
      </div>
    </div>
  );
  /** 검색 줄 오른쪽 끝 — 상담 콜 / 이사 확인콜(2일 전) / 해피콜(다음 날) */
  const viewTabs = (
    <SegmentedControl
      value={view}
      onChange={(v) => setView(v as typeof view)}
      options={[
        { value: 'calls', label: '상담 콜' },
        {
          value: 'CONFIRM',
          label: `이사 확인콜${fuCounts?.confirm ? ` ${fuCounts.confirm}` : ''}`,
        },
        { value: 'HAPPY', label: `해피콜${fuCounts?.happy ? ` ${fuCounts.happy}` : ''}` },
      ]}
    />
  );

  return (
    <ListPage
      fit
      // 상담 화면이면 제목이 '< 콜 ID [받은 콜]' — '<'는 콘솔 목록으로
      title={
        listView
          ? '상담 콘솔'
          : pendingCall
            ? '새 콜'
            : `콜 ${
                (me?.call?.id === viewId ? me.call.callNo : pageNo[viewId ?? '']) ??
                (viewId ?? '').slice(0, 8).toUpperCase()
              }`
      }
      breadcrumbs={
        listView || pendingCall ? undefined : [{ label: '상담 콘솔', onClick: backToList }]
      }
      hideBreadcrumbs={!listView}
      tags={
        listView ? undefined : (
          <span
            className={`${styles.kindPill} ${detailStatus === 'CALLBACK' ? styles.kindOut : styles.kindIn}`}
          >
            {detailStatus === 'CALLBACK' ? (
              <PhoneOutgoing size={13} />
            ) : (
              <PhoneIncoming size={13} />
            )}
            {detailStatus === 'CALLBACK' ? '콜백' : '받은 콜'}
          </span>
        )
      }
      subtitle={
        listView
          ? "대표번호(임시): 070-5236-9711 — 대표번호로 들어온 전화는 '상담 가능'인 상담원 PC가 함께 울리고, 받을 사람이 없으면 아웃콜로 쌓입니다. 전화를 받으면 상담 화면에서 통화하면서 바로 접수하세요."
          : undefined
      }
      actions={
        me && !me.isAgent ? (
          <span className={styles.agentOnly}>PC 전화·상담 가능은 고객관리부 상담원 전용입니다</span>
        ) : me ? (
          <div className={styles.actions}>
            <PcPhone />
            {/* 기본은 후처리. 콜이 배정되면 자동으로 '상담 중'이 되고, 통화가 끝나도 후처리를 마치고
                직접 [상담 가능]을 눌러야 다음 전화가 온다 */}
            {/* 상담 가능/후처리는 상담 화면과 따로 — 통화가 끝나면 상담 화면을 연 채로도 바꿀 수 있다.
                전화를 받으면 자동으로 후처리(다음 전화가 오지 않게), 준비되면 직접 [상담 가능] */}
            <SegmentedControl
              value={me.available ? 'on' : 'off'}
              onChange={(v) => {
                // PC 전화가 꺼져 있으면 상담 가능을 누를 때 함께 켠다(켜짐·꺼짐 버튼은 따로 두지 않는다)
                if (v === 'on' && (phone.status === 'off' || phone.status === 'error')) {
                  void turnOnAndAvailable();
                  return;
                }
                void setAvailable(v === 'on');
              }}
              options={[
                {
                  value: 'on',
                  label: (
                    <span className={styles.availLabel}>
                      {me.available && <i className={styles.availDot} aria-hidden />}
                      {turningOn ? '연결 중…' : '상담 가능'}
                    </span>
                  ),
                },
                { value: 'off', label: onCall ? '상담 중' : '후처리' },
              ]}
            />
          </div>
        ) : undefined
      }
    >
      <div className={styles.grid}>
        {/* 왼쪽 — 통화 중이면 접수 패널, 아니면 상담 콜 목록 */}
        {me && pendingCall ? (
          <section className={`${styles.card} ${styles.intakeCard}`}>
            <IntakePanel call={pendingCall} recentLeads={[]} pending onDone={afterIntake} />
          </section>
        ) : me && viewId && me.call?.id === viewId ? (
          <CallColumn call={me.call}>
            <IntakePanel
              call={me.call}
              recentLeads={me.recentLeads}
              onDone={afterIntake}
              onBack={backToList}
              onSaved={load}
            />
          </CallColumn>
        ) : viewId ? (
          <CallPage
            key={viewId}
            id={viewId}
            onStatus={(st, no) => {
              setPageStatus((m) => ({ ...m, [viewId]: st }));
              setPageNo((m) => ({ ...m, [viewId]: no }));
            }}
            myId={me?.employeeId ?? null}
            isAdmin={isSysAdmin}
            onBack={backToList}
            onDone={afterIntake}
          />
        ) : (
          <div className={styles.mainCol}>
            {view === 'calls' ? (
              <CallList head={viewTabs} refreshKey={listKey} onOpen={go} stats={statsEl} />
            ) : (
              <section className={`${styles.card} ${styles.listCard}`}>
                {statsEl}
                <FollowupList
                  key={view}
                  kind={view}
                  onChanged={loadFuCounts}
                  viewSwitch={viewTabs}
                />
              </section>
            )}
          </div>
        )}

        {/* 오른쪽 — 상담 메모(대본) 위, 아웃콜 대기 아래 */}
        <div className={`${styles.sideCol} ${listView ? '' : styles.sideDetail}`}>
          {/* 상담원 현황 — 지금 상태와 오늘 받은 콜·콜백·접수 */}
          {/* 콘솔(목록)에서는 마감 달력 + 상담원 현황, 상담 화면에서는 상담 메모 */}
          <MiniCalendar />
          {listView ? (
            <section className={`${styles.card} ${styles.paneCard} ${styles.agentsCard}`}>
              <h3 className={`${styles.cardTitle} ${styles.paneHead}`}>
                <UserRound size={15} /> 상담원 현황
                <span className={styles.count}>
                  상담 가능 {data.agents.filter((a) => a.state === 'READY').length} /{' '}
                  {data.agents.length}
                </span>
              </h3>
              <div className={styles.paneBody}>
                <ul className={styles.agents}>
                  {data.agents.map((a) => (
                    <li key={a.employeeId}>
                      <span className={styles.aMain}>
                        <span className={styles.aName}>
                          <b>{a.name}</b>
                          {a.position ? ` ${a.position}` : ''}
                          {a.employeeId === me?.employeeId && (
                            <span className={styles.muted}> (나)</span>
                          )}
                          {a.pcPhone && <span className={styles.muted}> · PC 전화</span>}
                        </span>
                        <span className={styles.aToday}>
                          오늘 받음 {a.today.received} · 콜백 {a.today.callbacks} · 접수{' '}
                          {a.today.leads}
                          {a.today.talkSec > 0 && ` · 통화 ${Math.round(a.today.talkSec / 60)}분`}
                        </span>
                      </span>
                      <span className={`${styles.stateChip} ${styles[`st_${a.state}`]}`}>
                        <i />
                        {STATE[a.state].label}
                        {a.state === 'BUSY' &&
                          a.call &&
                          ` · ${since(a.call.assignedAt ?? a.call.receivedAt, now)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {isSysAdmin && <Integration />}
              </div>
            </section>
          ) : (
            <ScriptCard />
          )}
          {/* 아웃콜 대기 · 내선(통화 중이면 자동으로 내선 — 이름 옆 [돌려주기]) */}
          <section className={`${styles.card} ${styles.paneCard}`}>
            <h3 className={`${styles.cardTitle} ${styles.paneHead} ${styles.paneTabs}`}>
              <SegmentedControl
                size="sm"
                value={sideTab}
                onChange={(v) => setSideTab(v as 'outcall' | 'ext')}
                options={[
                  {
                    value: 'outcall',
                    label: (
                      <span className={styles.tabLabel}>
                        <PhoneOutgoing size={13} /> 아웃콜 {data.outcalls.length}
                      </span>
                    ),
                  },
                  {
                    value: 'ext',
                    label: (
                      <span className={styles.tabLabel}>
                        <PhoneForwarded size={13} /> 내선
                      </span>
                    ),
                  },
                ]}
              />
            </h3>
            <div className={styles.paneBody}>
              {sideTab === 'ext' ? (
                <ExtensionList />
              ) : data.outcalls.length ? (
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
                        disabled={busy || !me || onCall}
                        title={
                          onCall
                            ? '지금 통화를 먼저 끝내 주세요'
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
                <div className={styles.emptyBox}>
                  <PhoneOff size={22} />
                  <span>대기 중인 아웃콜이 없습니다</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

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
  const [soundOpen, setSoundOpen] = useState(false);
  // 번호로 직접 걸기(대표번호로 발신 — 발신번호 인증 ARS 등)
  const [dialOpen, setDialOpen] = useState(false);
  const [dialNo, setDialNo] = useState('');
  const dialOk = dialNo.replace(/\D/g, '').length >= 7;
  const soundButton = (
    <>
      {phone.status === 'ready' && !phone.call && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDialNo('');
            setDialOpen(true);
          }}
          aria-label="번호로 전화 걸기"
          title="번호로 전화 걸기"
        >
          <Phone size={14} />
        </Button>
      )}
      <ConfirmModal
        open={dialOpen}
        title="번호로 전화 걸기"
        confirmLabel="걸기"
        onClose={() => setDialOpen(false)}
        onConfirm={() => {
          if (!dialOk) return;
          setDialOpen(false);
          dial(dialNo);
        }}
      >
        <Input
          autoFocus
          inputMode="tel"
          value={dialNo}
          placeholder="걸 번호 — 예: 070-5276-7222"
          onChange={(e) => setDialNo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dialOk) {
              setDialOpen(false);
              dial(dialNo);
            }
          }}
        />
      </ConfirmModal>
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
  // 켜짐·꺼짐 버튼은 없다 — [상담 가능]을 누르면 켜지고, 켜진 채로 둔다(후처리 중엔 배분이 안 와 울리지 않는다)
  return (
    <span className={styles.pcPhone}>
      {phone.status === 'connecting' && (
        <span className={styles.muted}>
          <Laptop size={14} /> PC 전화 연결 중…
        </span>
      )}
      {soundButton}
    </span>
  );
}

/**
 * 상담 화면(/callcenter/<콜 id>) — 상담 콜 목록에서 누른 콜.
 * 마무리하지 않은 내 상담이면 접수 화면 그대로, 끝난 콜이면 상세(녹취·메모).
 */
function CallPage({
  id,
  myId,
  isAdmin,
  onBack,
  onDone,
  onStatus,
}: {
  id: string;
  /** 콜 종류를 화면 제목에 알린다 */
  onStatus?: (status: string, callNo: string | null) => void;
  myId: string | null;
  isAdmin: boolean;
  onBack: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [d, setD] = useState<{
    call: CallRow & CallView;
    recentLeads: NonNullable<Console['me']>['recentLeads'];
    lead: ReadOnlyInfo['lead'];
  } | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api<NonNullable<typeof d>>(`/cs-calls/${id}`);
      setD(r);
      onStatus?.(r.call.status, r.call.callNo ?? null);
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '콜을 불러오지 못했습니다',
      });
      onBack();
    }
  }, [id, toast, onBack]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!d)
    return (
      <section className={`${styles.card} ${styles.intakeCard}`}>
        <div role="status" aria-label="불러오는 중" className={styles.skelCol}>
          <Skeleton width={220} height={22} />
          <div className={styles.skelRow4}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={46} radius={8} />
            ))}
          </div>
          <SkeletonText lines={6} gap={14} />
        </div>
      </section>
    );
  const open = ['ASSIGNED', 'CALLBACK'].includes(d.call.status);
  return (
    <CallColumn call={d.call}>
      {/* 마무리하지 않은 내 상담이면 이어서 입력, 아니면 같은 모양의 읽기 화면 */}
      <IntakePanel
        call={d.call}
        recentLeads={d.recentLeads}
        onDone={onDone}
        onBack={onBack}
        onSaved={load}
        readOnly={
          open && (d.call.agentEmpId === myId || isAdmin)
            ? undefined
            : {
                agentName: d.call.agentName,
                durationSec: d.call.durationSec,
                hasRecording: d.call.hasRecording,
                hasTranscript: d.call.hasTranscript,
                lead: d.lead,
              }
        }
      />
    </CallColumn>
  );
}

/** 상담 화면 왼쪽 — 위 상담 카드 + 아래 고객 이력 카드 */
function CallColumn({
  call,
  children,
}: {
  call: { id: string; customerId: string | null };
  children: ReactNode;
}) {
  return (
    <div className={styles.leftCol}>
      <section className={`${styles.card} ${styles.intakeCard}`}>{children}</section>
      {call.customerId && call.id && (
        <CallerHistory customerId={call.customerId} callId={call.id} />
      )}
    </div>
  );
}

/** 상담 콘솔 첫 화면을 불러오는 동안 — 실제 배치(왼쪽 숫자·표, 오른쪽 달력·상담원·아웃콜) 그대로 */
function ConsoleSkeleton() {
  return (
    <div className={styles.grid} role="status" aria-label="불러오는 중">
      <section className={`${styles.card} ${styles.listCard}`}>
        <div className={styles.skelRow4}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={58} radius={12} />
          ))}
        </div>
        <Skeleton height={38} radius={10} />
        <TableSkeleton rows={10} cols={7} />
      </section>
      <div className={styles.sideCol}>
        <section className={styles.card}>
          <Skeleton width={140} height={18} />
          <Skeleton height={150} radius={8} />
        </section>
        <section className={styles.card}>
          <Skeleton width={110} height={18} />
          <SkeletonText lines={4} gap={12} />
        </section>
        <section className={styles.card}>
          <Skeleton width={100} height={18} />
          <SkeletonText lines={2} gap={12} />
        </section>
      </div>
    </div>
  );
}
