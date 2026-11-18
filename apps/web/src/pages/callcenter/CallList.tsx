import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, Play } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError, getToken } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { Button, Input, Modal, SegmentedControl, Textarea, useToast } from '../../components/ui';
import styles from '../callcenter.module.css';

interface CallRow {
  id: string;
  phone: string;
  status: string;
  channel: string | null;
  customerId: string | null;
  customerName: string | null;
  agentEmpId: string | null;
  agentName: string | null;
  leadId: string | null;
  leadNo: string | null;
  receivedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  hasRecording: boolean;
  memo: string | null;
  request: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: '상담 중',
  CALLBACK: '콜백 중',
  OUTCALL: '아웃콜 대기',
  DONE: '끝',
  CANCELED: '취소',
};
const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
const dur = (s: number | null) =>
  s == null
    ? '-'
    : s < 60
      ? `${s}초`
      : `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
/** 콜 ID — 목록에서 읽기 쉽게 앞 8자리 */
const shortId = (id: string) => id.slice(0, 8).toUpperCase();

/**
 * 상담 콜 목록 — 전화번호·고객명 검색, 내 전화/전체 전화. 행을 누르면 상세(녹취 듣기·메모·요청사항).
 * refreshKey가 바뀌면(콜이 끝나면) 다시 읽는다.
 */
export function CallList({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; rows: CallRow[] } | null>(null);
  const [open, setOpen] = useState<CallRow | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (query: string, sc: 'mine' | 'all', pg: number) => {
      try {
        const p = new URLSearchParams({ scope: sc, page: String(pg) });
        if (query.trim()) p.set('q', query.trim());
        setData(await api(`/cs-calls?${p.toString()}`));
      } catch (e) {
        toast({
          type: 'error',
          title: e instanceof ApiError ? e.message : '콜 목록을 불러오지 못했습니다',
        });
      }
    },
    [toast],
  );
  // 검색어는 잠깐 멈췄을 때 찾는다
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(q, scope, page), q ? 300 : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, scope, page, refreshKey, load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <section className={`${styles.card} ${styles.listCard}`}>
      <div className={styles.listHead}>
        <h3 className={styles.cardTitle}>
          <List size={15} /> 상담 콜 목록 <span className={styles.count}>{data?.total ?? 0}</span>
        </h3>
        <div className={styles.actions}>
          <Input
            value={q}
            placeholder="전화번호·고객명으로 찾기"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            style={{ width: 220 }}
            aria-label="콜 검색"
          />
          <SegmentedControl
            value={scope}
            onChange={(x) => {
              setScope(x as 'mine' | 'all');
              setPage(0);
            }}
            options={[
              { value: 'mine', label: '내 전화' },
              { value: 'all', label: '전체 전화' },
            ]}
          />
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>콜ID</th>
              <th>고객명</th>
              <th>전화번호</th>
              <th>상담원</th>
              <th>통화시각</th>
              <th>통화시간</th>
              <th>녹취</th>
              <th>고객 요청사항</th>
              <th>통화 메모</th>
              <th>접수</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpen(r)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}
              >
                <td className={styles.mono}>{shortId(r.id)}</td>
                <td>{r.customerName ?? <span className={styles.muted}>새 번호</span>}</td>
                <td className={styles.mono}>{formatPhone(r.phone)}</td>
                <td>
                  {r.agentName ?? (
                    <span className={styles.muted}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  )}
                </td>
                <td className={styles.mono}>{when(r.receivedAt)}</td>
                <td className={styles.mono}>{dur(r.durationSec)}</td>
                <td>
                  {r.hasRecording ? (
                    <Play size={14} aria-label="녹취 있음" />
                  ) : (
                    <span className={styles.muted}>-</span>
                  )}
                </td>
                <td className={styles.clip}>{r.request ?? ''}</td>
                <td className={styles.clip}>{r.memo ?? ''}</td>
                <td>{r.leadNo ?? ''}</td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={10} className={styles.emptyQ}>
                  {q ? '찾는 콜이 없습니다.' : '아직 콜이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className={styles.pager}>
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            이전
          </Button>
          <span className={styles.muted}>
            {page + 1} / {pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            다음
          </Button>
        </div>
      )}
      {open && (
        <CallDetail
          call={open}
          onClose={() => setOpen(null)}
          onSaved={() => void load(q, scope, page)}
        />
      )}
    </section>
  );
}

/** 콜 상세 — 정보, 녹취 듣기, 메모·요청사항 고치기 */
function CallDetail({
  call,
  onClose,
  onSaved,
}: {
  call: CallRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [memo, setMemo] = useState(call.memo ?? '');
  const [request, setRequest] = useState(call.request ?? '');
  const [busy, setBusy] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const canEdit = call.agentEmpId === user?.employeeId || !!user?.permissions.includes('*');

  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );

  // 녹취는 인증이 필요해 <audio src>로 바로 못 연다 — 받아서 재생
  const listen = async () => {
    setLoadingAudio(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/cs-calls/${call.id}/recording`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? '녹취를 불러오지 못했습니다');
      }
      setAudio(URL.createObjectURL(await res.blob()));
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof Error ? e.message : '녹취를 불러오지 못했습니다',
      });
    } finally {
      setLoadingAudio(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api(`/cs-calls/${call.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ memo: memo || null, request: request || null }),
      });
      toast({ type: 'success', title: '저장했습니다' });
      onSaved();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`콜 ${shortId(call.id)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          {canEdit && (
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              저장
            </Button>
          )}
        </>
      }
    >
      <dl className={styles.detail}>
        <dt>고객</dt>
        <dd>
          {call.customerName ?? '새 번호'} · {formatPhone(call.phone)}
        </dd>
        <dt>상담원</dt>
        <dd>{call.agentName ?? '-'}</dd>
        <dt>통화시각</dt>
        <dd>
          {new Date(call.receivedAt).toLocaleString('ko-KR')} · {call.channel ?? '대표번호'}
        </dd>
        <dt>통화시간</dt>
        <dd>{dur(call.durationSec)}</dd>
        <dt>상태</dt>
        <dd>{STATUS_LABEL[call.status] ?? call.status}</dd>
        <dt>접수</dt>
        <dd>
          {call.leadId ? (
            <button
              type="button"
              className={styles.link}
              onClick={() => navigate(`/leads/${call.leadId}`)}
            >
              {call.leadNo ?? '접수 열기'}
            </button>
          ) : (
            '-'
          )}
        </dd>
        <dt>녹취</dt>
        <dd>
          {audio ? (
            <audio controls autoPlay src={audio} style={{ width: '100%' }} />
          ) : call.hasRecording ? (
            <Button
              variant="outline"
              size="sm"
              disabled={loadingAudio}
              onClick={() => void listen()}
            >
              <Play size={14} /> {loadingAudio ? '불러오는 중…' : '녹취 듣기'}
            </Button>
          ) : (
            <span className={styles.muted}>없음(연결되지 않은 통화이거나 90일이 지났습니다)</span>
          )}
        </dd>
      </dl>
      <div className={styles.form}>
        <label className={`${styles.field} ${styles.full}`}>
          <span>고객 요청사항</span>
          <Textarea
            rows={3}
            value={request}
            disabled={!canEdit}
            onChange={(e) => setRequest(e.target.value)}
          />
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>통화 메모</span>
          <Textarea
            rows={3}
            value={memo}
            disabled={!canEdit}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
