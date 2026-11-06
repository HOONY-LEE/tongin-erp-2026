import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, PhoneCall, PhoneIncoming, PhoneOutgoing, UserRound } from 'lucide-react';
import { LEAD_STATUS_LABEL, type LeadStatus } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatPhone } from '../lib/phone';
import {
  Badge,
  Button,
  Input,
  ListPage,
  SegmentedControl,
  Textarea,
  useToast,
} from '../components/ui';
import styles from './callcenter.module.css';

interface CallView {
  id: string;
  phone: string;
  status: 'ASSIGNED' | 'OUTCALL' | 'CALLBACK';
  channel: string | null;
  attempts: number;
  memo: string | null;
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
  BUSY: { label: '통화 중', cls: 'busy' },
  READY: { label: '대기', cls: 'ready' },
  OFF: { label: '꺼짐', cls: 'off' },
};

/**
 * 상담 콘솔 — 고객관리부(콜센터) 전용.
 * 대표번호로 들어온 콜은 '상담 가능'인 상담원에게 자동으로 붙고, 모두 통화 중이면 아웃콜로 쌓인다.
 * 상담을 마치면 아웃콜을 눌러 콜백 → 그 번호가 들어간 접수 창(접수 화면 그대로)에서 바로 등록한다.
 */
export default function CallCenter() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [data, setData] = useState<Console | null>(null);
  const [now, setNow] = useState(Date.now());
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [simPhone, setSimPhone] = useState('');

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
  /** 콜의 번호를 넣은 새 접수 창으로(접수 화면을 그대로 쓴다). 접수를 등록하면 콜이 끝난다 */
  const openLeadForm = (c: CallView) => {
    const q = new URLSearchParams({ new: '1', phone: c.phone, call: c.id });
    if (c.customerName) q.set('name', c.customerName);
    navigate(`/leads?${q.toString()}`);
  };
  const callback = (c: CallView) =>
    act(async () => {
      const r = await api<CallView>(`/cs-calls/${c.id}/callback`, { method: 'POST' });
      openLeadForm({ ...c, ...r, customerName: c.customerName });
    });
  const finish = (c: CallView, result: 'DONE' | 'RETRY') =>
    act(
      () =>
        api(`/cs-calls/${c.id}/finish`, {
          method: 'POST',
          body: JSON.stringify({ result, memo: memo || undefined }),
        }).then(() => setMemo('')),
      result === 'RETRY' ? '아웃콜로 돌렸습니다' : '상담을 끝냈습니다',
    );

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
      fit
      title="상담 콘솔"
      subtitle="대표번호로 들어온 콜은 '상담 가능'인 상담원에게 자동으로 배분되고, 모두 통화 중이면 아웃콜로 쌓입니다. 상담을 마치면 아웃콜을 눌러 콜백하고, 번호가 들어간 접수 창에서 바로 등록하세요."
      onRefresh={load}
      actions={
        me ? (
          <SegmentedControl
            value={me.available ? 'on' : 'off'}
            onChange={(v) => void setAvailable(v === 'on')}
            options={[
              { value: 'on', label: '상담 가능' },
              { value: 'off', label: '자리 비움' },
            ]}
          />
        ) : undefined
      }
    >
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
            {data.agents.filter((a) => a.state === 'READY').length} /{' '}
            {data.agents.filter((a) => a.state !== 'OFF').length}
          </b>
        </div>
        <div>
          <span>오늘 끝낸 콜</span>
          <b>{data.today.done}</b>
        </div>
      </div>

      <div className={styles.grid}>
        {/* 내 콜 */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>
            <Headphones size={15} /> 내 콜
          </h3>
          {!me ? (
            <p className={styles.muted}>직원과 연결된 계정만 상담할 수 있습니다.</p>
          ) : mine ? (
            <div className={styles.myCall}>
              <div className={styles.callHead}>
                <Badge variant="subtle" color={mine.status === 'CALLBACK' ? 'warning' : 'success'}>
                  {mine.status === 'CALLBACK' ? (
                    <>
                      <PhoneOutgoing size={12} /> 콜백 중
                    </>
                  ) : (
                    <>
                      <PhoneIncoming size={12} /> 받은 콜
                    </>
                  )}
                </Badge>
                <span className={styles.muted}>
                  {mine.channel ?? '대표번호'} · {since(mine.assignedAt ?? mine.receivedAt, now)} 전
                </span>
              </div>
              <a className={styles.phone} href={`tel:${mine.phone}`}>
                {formatPhone(mine.phone)}
              </a>
              <div className={styles.customer}>
                <UserRound size={14} />
                {mine.customerName ? (
                  <span>
                    기존 고객 <b>{mine.customerName}</b>
                  </span>
                ) : (
                  <span className={styles.muted}>처음 전화한 번호(새 고객)</span>
                )}
              </div>
              {me.recentLeads.length > 0 && (
                <ul className={styles.leads}>
                  {me.recentLeads.map((l) => (
                    <li key={l.id}>
                      <button type="button" onClick={() => navigate(`/leads/${l.id}`)}>
                        <span>{l.leadNo}</span>
                        <span>{LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}</span>
                        <span className={styles.muted}>
                          {l.orgUnit?.name ?? ''} · 이사 {l.moveDate ?? '미정'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Textarea
                rows={2}
                value={memo}
                placeholder="상담 메모(선택) — 예: 견적 문의, 다음 주 다시 연락"
                onChange={(e) => setMemo(e.target.value)}
              />
              <div className={styles.actions}>
                {can('LEAD.CREATE') && (
                  <Button variant="primary" size="sm" onClick={() => openLeadForm(mine)}>
                    이 번호로 접수 등록
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void finish(mine, 'DONE')}
                >
                  접수 없이 상담 끝
                </Button>
                {mine.status === 'CALLBACK' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void finish(mine, 'RETRY')}
                  >
                    안 받음 — 다시 아웃콜로
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.idle}>
              <PhoneCall size={22} />
              {me.available ? (
                <p>
                  대기 중입니다. 콜이 들어오면 자동으로 여기에 붙습니다.
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

        {/* 아웃콜 대기 */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>
            <PhoneOutgoing size={15} /> 아웃콜 대기{' '}
            <span className={styles.count}>{data.outcalls.length}</span>
          </h3>
          <p className={styles.muted}>
            상담원이 모두 통화 중일 때 들어온 콜입니다. 먼저 들어온 순서 — 눌러서 콜백하면 번호가
            들어간 접수 창이 뜹니다.
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
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy || !me || !!mine}
                    title={mine ? '지금 콜을 먼저 끝내 주세요' : undefined}
                    onClick={() => void callback(c)}
                  >
                    콜백
                  </Button>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyQ}>아웃콜이 없습니다.</p>
          )}
        </section>

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
                </span>
                <span className={styles.aState}>
                  {STATE[a.state].label}
                  {a.call &&
                    ` · ${formatPhone(a.call.phone)} · ${since(a.call.assignedAt ?? a.call.receivedAt, now)}`}
                </span>
              </li>
            ))}
          </ul>
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
    </ListPage>
  );
}
