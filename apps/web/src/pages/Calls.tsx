import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPhone } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { CALL_STATUS, newLeadPath, useCallStream, type CallContext } from '../lib/calls';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  CopyText,
  DataTable,
  Input,
  ListPage,
  Modal,
  SegmentedControl,
  StatusBadge,
  Textarea,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { CallInfo } from '../components/call/CallInfo';
import styles from './calls.module.css';

const TABS = [
  { value: '', label: '전체' },
  { value: 'MISSED', label: '부재중' },
  { value: 'ENDED', label: '응대함' },
];

/** 11-05 19:43 */
const when = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 전화 수신 — 수신 기록(부재중 다시 걸기), 통화 메모, 회선·연동 설정(CALL.MANAGE) */
export default function Calls() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [notiPerm, setNotiPerm] = useState(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>(`/telephony/calls?days=30${tab ? `&status=${tab}` : ''}`));
      touch();
    } finally {
      setLoading(false);
    }
  }, [tab, touch]);

  useEffect(() => {
    void load();
  }, [load]);

  // 새 전화·상태 변화가 오면 목록도 다시
  useCallStream(can('CALL.READ'), () => void load());

  const columns: Column[] = [
    { title: '시각', width: 110, render: (r) => when(String(r.startedAt)) },
    {
      title: '건 사람',
      width: 140,
      render: (r) => (r.fromNumber ? formatPhone(String(r.fromNumber)) : '표시 제한'),
      exportValue: (r) => String(r.fromNumber ?? ''),
    },
    {
      title: '고객',
      flex: 1,
      minWidth: 120,
      render: (r) => (r.customerName as string) ?? <span className={styles.dim}>신규</span>,
      exportValue: (r) => (r.customerName as string) ?? '신규',
    },
    {
      title: '상태',
      width: 100,
      render: (r) => <StatusBadge value={String(r.status)} map={CALL_STATUS} />,
      exportValue: (r) => CALL_STATUS[String(r.status)]?.label ?? String(r.status),
    },
    { title: '응대', width: 100, dataIndex: 'answeredBy' },
    { title: '회선', width: 120, dataIndex: 'lineName' },
    { title: '메모', flex: 2, minWidth: 160, dataIndex: 'memo' },
    {
      title: '접수',
      width: 80,
      render: (r) => (r.leadId ? '등록' : ''),
    },
  ];

  const missed = rows.filter((r) => r.status === 'MISSED').length;

  return (
    <ListPage fit title={t('nav.calls')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        tabs={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={TABS.map((x) => ({
              value: x.value,
              label: x.value === 'MISSED' && tab === '' && missed ? `부재중 ${missed}` : x.label,
            }))}
          />
        }
        fit
        pageSize={20}
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => openDetail(String(r.id))}
        exportable
        exportFileName="calls"
        toolbarActions={
          <>
            {notiPerm === 'default' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void Notification.requestPermission().then(setNotiPerm)}
              >
                PC 알림 켜기
              </Button>
            )}
            {can('CALL.MANAGE') && (
              <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)}>
                회선·연동 설정
              </Button>
            )}
          </>
        }
      />
      {detailId && (
        <CallDetail
          id={detailId}
          onClose={closeDetail}
          onChanged={() => void load()}
          onNewLead={(path) => navigate(path)}
        />
      )}
      {setupOpen && <TelephonySetup onClose={() => setSetupOpen(false)} />}
    </ListPage>
  );
}

/** 통화 한 건 — 고객 정보 + 메모 + 접수 등록 */
function CallDetail({
  id,
  onClose,
  onChanged,
  onNewLead,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onNewLead: (path: string) => void;
}) {
  const toast = useToast();
  const [ctx, setCtx] = useState<CallContext | null>(null);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<CallContext>(`/telephony/calls/${id}`)
      .then((c) => {
        setCtx(c);
        setMemo(c.call.memo ?? '');
      })
      .catch(() => toast({ type: 'error', title: '통화를 찾을 수 없습니다' }));
  }, [id, toast]);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/telephony/calls/${id}`, { method: 'PATCH', body: JSON.stringify({ memo }) });
      toast({ type: 'success', title: '메모를 저장했습니다' });
      onChanged();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="통화"
      footer={
        <>
          {ctx &&
            (ctx.call.leadId ? (
              <Button
                variant="outline"
                style={{ marginRight: 'auto' }}
                onClick={() => onNewLead(`/leads/${ctx.call.leadId}`)}
              >
                등록한 접수
              </Button>
            ) : (
              <Button
                variant="outline"
                style={{ marginRight: 'auto' }}
                onClick={() =>
                  onNewLead(
                    newLeadPath({
                      phone: ctx.call.fromNumber,
                      name: ctx.customers[0]?.name,
                      callId: ctx.call.id,
                    }),
                  )
                }
              >
                + 접수 등록
              </Button>
            ))}
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || !ctx}>
            메모 저장
          </Button>
        </>
      }
    >
      {ctx ? (
        <div className={styles.detail}>
          <CallInfo ctx={ctx} onNavigate={onClose} />
          <label className={styles.field}>
            <span>통화 메모</span>
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              placeholder="상담 내용, 다시 걸 시간 등"
            />
          </label>
        </div>
      ) : (
        <div className={styles.dim}>불러오는 중…</div>
      )}
    </Modal>
  );
}

interface Line {
  id: string;
  name: string;
  number: string | null;
  token: string;
  isActive: boolean;
  callCount: number;
  lastCallAt: string | null;
}

/** 회선·연동 설정 — 웹훅 주소, 가상 수신 시험, 연결 방법 안내 */
function TelephonySetup({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [name, setName] = useState('');
  const [testFrom, setTestFrom] = useState('');
  const [testLine, setTestLine] = useState('');
  const [lastTest, setLastTest] = useState<{ callId: string; externalId: string } | null>(null);

  const load = useCallback(async () => {
    setLines(await api<Line[]>('/telephony/lines'));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast({ type: 'success', title: ok });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '처리하지 못했습니다' });
    }
  };

  const hookUrl = (l: Line) => `${window.location.origin}/api/telephony/hook/${l.token}`;

  const test = async (event: 'ringing' | 'answered' | 'ended') => {
    try {
      const r = await api<{ id: string; externalId: string }>('/telephony/test', {
        method: 'POST',
        body: JSON.stringify({
          from: testFrom,
          event,
          lineId: testLine || undefined,
          callId: event === 'ringing' ? undefined : lastTest?.externalId,
        }),
      });
      setLastTest(event === 'ended' ? null : { callId: r.id, externalId: r.externalId });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '시험하지 못했습니다' });
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" title="회선·연동 설정">
      <div className={styles.setup}>
        <section>
          <h4>회선</h4>
          <p className={styles.dim}>
            회선마다 수신 알림을 받을 주소가 있습니다. 통신사 CTI·교환기·안드로이드 앱·Twilio에 이
            주소를 넣으면 전화가 올 때 콜팝업이 뜹니다. 주소는 비밀번호처럼 다뤄 주세요.
          </p>
          {lines.map((l) => (
            <div key={l.id} className={styles.lineRow}>
              <div className={styles.lineHead}>
                <strong>{l.name}</strong>
                {l.number && <span className={styles.dim}>{formatPhone(l.number)}</span>}
                {!l.isActive && <span className={styles.off}>꺼짐</span>}
                <span className={styles.dim}>
                  수신 {l.callCount}건{l.lastCallAt ? ` · 마지막 ${when(l.lastCallAt)}` : ''}
                </span>
              </div>
              <div className={styles.url}>
                <CopyText value={hookUrl(l)}>
                  <code>{hookUrl(l)}</code>
                </CopyText>
              </div>
              <div className={styles.lineActions}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void run(
                      () =>
                        api(`/telephony/lines/${l.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ isActive: !l.isActive }),
                        }),
                      l.isActive ? '회선을 껐습니다' : '회선을 켰습니다',
                    )
                  }
                >
                  {l.isActive ? '끄기' : '켜기'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    window.confirm(
                      '주소를 새로 만들까요? 예전 주소는 바로 막혀서, 연동처에 새 주소를 다시 넣어야 합니다.',
                    ) &&
                    void run(
                      () =>
                        api(`/telephony/lines/${l.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ rotate: true }),
                        }),
                      '주소를 새로 만들었습니다',
                    )
                  }
                >
                  주소 새로 만들기
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    window.confirm(`'${l.name}' 회선을 지울까요? 수신 기록은 남습니다.`) &&
                    void run(
                      () => api(`/telephony/lines/${l.id}`, { method: 'DELETE' }),
                      '지웠습니다',
                    )
                  }
                >
                  삭제
                </Button>
              </div>
            </div>
          ))}
          <div className={styles.inline}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="회선 이름(예: 대표번호, 테스트 폰)"
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!name.trim()}
              onClick={() =>
                void run(async () => {
                  await api('/telephony/lines', {
                    method: 'POST',
                    body: JSON.stringify({ name }),
                  });
                  setName('');
                }, '회선을 만들었습니다')
              }
            >
              회선 추가
            </Button>
          </div>
        </section>

        <section>
          <h4>가상 수신 시험</h4>
          <p className={styles.dim}>
            전화 연결 없이 콜팝업을 확인합니다. 고객관리에 있는 번호를 넣으면 기존 고객으로, 없는
            번호면 신규로 뜹니다.
          </p>
          <div className={styles.inline}>
            <Input
              value={testFrom}
              onChange={(e) => setTestFrom(e.target.value)}
              placeholder="건 사람 번호(010-1234-5678)"
            />
            <select
              className={styles.select}
              value={testLine}
              onChange={(e) => setTestLine(e.target.value)}
            >
              <option value="">회선 없음</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="primary"
              disabled={!testFrom.trim()}
              onClick={() => void test('ringing')}
            >
              전화 걸기
            </Button>
            {lastTest && (
              <>
                <Button size="sm" variant="outline" onClick={() => void test('answered')}>
                  받음
                </Button>
                <Button size="sm" variant="outline" onClick={() => void test('ended')}>
                  끊음
                </Button>
              </>
            )}
          </div>
        </section>

        <section>
          <h4>연결 방법</h4>
          <ol className={styles.guide}>
            <li>
              <strong>안드로이드 폰(무료 시험)</strong> — MacroDroid 같은 자동화 앱에서 트리거 ‘전화
              수신’, 동작 ‘HTTP 요청’으로 위 주소에 POST, 본문{' '}
              <code>{'{"from":"[call_number]"}'}</code>(앱의 발신번호 변수). 다른 폰으로 이 폰에
              걸면 팝업이 뜹니다. 아이폰은 수신 번호를 앱에 넘겨주지 않아 안 됩니다.
            </li>
            <li>
              <strong>Twilio 무료 체험</strong> — 체험 크레딧으로 번호를 받고, 번호 설정의 ‘A call
              comes in’ 웹훅에 위 주소(POST)를 넣습니다. 해외 번호라 걸 때 국제전화 요금이 나올 수
              있습니다.
            </li>
            <li>
              <strong>통신사 CTI·사무실 교환기</strong> — 수신 이벤트를 보내는 주소에 위 주소를
              넣습니다. 받는 값: <code>from</code>(건 번호), <code>event</code>
              (ringing·answered·ended·missed), <code>callId</code>(같은 통화를 잇는 ID),{' '}
              <code>to</code>, <code>extension</code>. JSON·폼·주소 뒤 <code>?from=</code> 모두
              됩니다.
            </li>
          </ol>
          <p className={styles.dim}>
            주소는 인터넷에서 열려야 합니다 — 운영 서버 주소를 쓰고, 내 PC에서 시험할 때는 터널
            (cloudflared 등)로 이 화면 주소를 열어 둡니다.
          </p>
        </section>
      </div>
    </Modal>
  );
}
