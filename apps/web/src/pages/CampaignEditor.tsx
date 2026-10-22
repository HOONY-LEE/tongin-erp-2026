import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import {
  CAMPAIGN_CHANNEL_LABEL,
  LEAD_STATUS,
  LEAD_STATUS_LABEL,
  SMS_MAX_BYTES,
  smsBytes,
  type CampaignAudienceFilter,
  type CampaignChannel,
  type LeadStatus,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  PageHeader,
  SegmentedControl,
  Select,
  Spinner,
  StatusBadge,
  useToast,
} from '../components/ui';
import { CAMPAIGN_STATUS_MAP } from './Campaigns';
import styles from './campaign.module.css';

const SIDO = [
  '서울',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '경기',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
];
const NAME_TOKEN = '{고객명}';
const DEFAULT_OPT_OUT = '무료수신거부 080-000-0000';
const PAGE_SIZE = 50;
/** Select는 빈 값을 못 받아서 '전체'를 따로 표시한다 */
const ALL = '__ALL__';

interface Button2 {
  name: string;
  url: string;
}
interface CampaignData {
  id: string;
  name: string;
  channel: CampaignChannel;
  message: string;
  title: string | null;
  isAd: boolean;
  optOutText: string | null;
  templateCode: string | null;
  buttons: Button2[] | null;
  fallbackSms: boolean;
  filters: CampaignAudienceFilter | null;
  status: string;
  scheduledAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  recipients: {
    id: string;
    customerId: string;
    name: string;
    phone: string;
    status: string;
    reason: string | null;
    sentAt: string | null;
  }[];
}
interface AudienceRow {
  id: string;
  name: string;
  phone: string;
  grade: string | null;
  addr: string | null;
  orgUnit: string | null;
  lead: { leadNo: string; status: string; moveDate: string | null; receivedAt: string } | null;
}

/** 'YYYY-MM-DDTHH:mm' (datetime-local) ↔ ISO */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className={styles.chips}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            className={[styles.chip, on ? styles.chipOn : ''].join(' ')}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 캠페인 작성 — 채널별 설정(문자: 광고 표기·장문 제목 / 알림톡: 템플릿·버튼·대체발송),
 * 발송 시점(즉시·예약), 받는 사람(주소·이사일·접수상태 등 조건으로 찾아 골라 담기).
 * 보냈거나 예약된 캠페인은 결과 화면으로 보인다.
 */
export default function CampaignEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const orgs = useOptions('/org-units', 'name');
  const grades = useOptions('/customers/grades', 'name', 'code');

  const [loaded, setLoaded] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // ── 설정 ──
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CampaignChannel>('SMS');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [isAd, setIsAd] = useState(false);
  const [optOut, setOptOut] = useState(DEFAULT_OPT_OUT);
  const [templateCode, setTemplateCode] = useState('');
  const [buttons, setButtons] = useState<Button2[]>([]);
  const [fallbackSms, setFallbackSms] = useState(true);
  const [when, setWhen] = useState<'NOW' | 'LATER'>('NOW');
  const [scheduledAt, setScheduledAt] = useState('');

  // ── 받는 사람 ──
  const [filter, setFilter] = useState<CampaignAudienceFilter>({});
  const [applied, setApplied] = useState<CampaignAudienceFilter>({});
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ total: number; rows: AudienceRow[] } | null>(null);
  const [searching, setSearching] = useState(false);
  /** 고른 고객 id → 이름(검색 결과 전체 선택으로 넣은 사람은 이름을 모를 수 있다) */
  const [picked, setPicked] = useState<Map<string, string | null>>(new Map());
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const readOnly = !!loaded && loaded.status !== 'DRAFT';

  const fill = useCallback((c: CampaignData) => {
    setLoaded(c);
    setName(c.name);
    setChannel(c.channel);
    setMessage(c.message);
    setTitle(c.title ?? '');
    setIsAd(c.isAd);
    setOptOut(c.optOutText ?? DEFAULT_OPT_OUT);
    setTemplateCode(c.templateCode ?? '');
    setButtons(c.buttons ?? []);
    setFallbackSms(c.fallbackSms);
    setWhen(c.scheduledAt ? 'LATER' : 'NOW');
    setScheduledAt(toLocalInput(c.scheduledAt));
    setFilter(c.filters ?? {});
    setApplied(c.filters ?? {});
    setPicked(new Map(c.recipients.map((r) => [r.customerId, r.name])));
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      fill(await api<CampaignData>(`/campaigns/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [id, isNew, fill, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // 발송 중이면 결과를 따라 읽는다
  useEffect(() => {
    if (loaded?.status !== 'SENDING') return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [loaded?.status, load]);

  const search = useCallback(
    async (f: CampaignAudienceFilter, p: number) => {
      setSearching(true);
      try {
        const r = await api<{ total: number; rows: AudienceRow[] }>('/campaigns/audience', {
          method: 'POST',
          body: JSON.stringify({ ...f, page: p, pageSize: PAGE_SIZE }),
        });
        setResult(r);
      } catch (e) {
        toast({
          type: 'error',
          title: e instanceof ApiError ? e.message : '고객을 찾지 못했습니다',
        });
      } finally {
        setSearching(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!readOnly && (isNew || loaded)) void search(applied, page);
  }, [applied, page, search, readOnly, isNew, loaded]);

  const runSearch = () => {
    setPage(1);
    setApplied({ ...filter });
  };
  const resetFilter = () => {
    setFilter({});
    setPage(1);
    setApplied({});
  };
  const setF = <K extends keyof CampaignAudienceFilter>(k: K, v: CampaignAudienceFilter[K]) =>
    setFilter((f) => ({ ...f, [k]: v }));

  const togglePick = (r: AudienceRow, on: boolean) =>
    setPicked((m) => {
      const n = new Map(m);
      if (on) n.set(r.id, r.name);
      else n.delete(r.id);
      return n;
    });
  const pageRows = result?.rows ?? [];
  const pageAllOn = pageRows.length > 0 && pageRows.every((r) => picked.has(r.id));
  const togglePage = (on: boolean) =>
    setPicked((m) => {
      const n = new Map(m);
      for (const r of pageRows) {
        if (on) n.set(r.id, r.name);
        else n.delete(r.id);
      }
      return n;
    });
  const pickAllResults = async () => {
    try {
      const { ids } = await api<{ ids: string[] }>('/campaigns/audience/ids', {
        method: 'POST',
        body: JSON.stringify(applied),
      });
      setPicked((m) => {
        const n = new Map(m);
        for (const i of ids) if (!n.has(i)) n.set(i, null);
        return n;
      });
      toast({ type: 'success', title: `검색 결과 ${ids.length}명을 담았습니다` });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '담지 못했습니다' });
    }
  };

  // ── 본문 ──
  const insertName = () => {
    const el = msgRef.current;
    const at = el ? el.selectionStart : message.length;
    setMessage((m) => m.slice(0, at) + NAME_TOKEN + m.slice(at));
    setTimeout(() => el?.focus(), 0);
  };
  const sampleName = useMemo(() => [...picked.values()].find((v) => !!v) ?? '홍길동', [picked]);
  const composed = useMemo(() => {
    let t = message.split(NAME_TOKEN).join(sampleName);
    if (isAd && channel === 'SMS') t = `(광고)${t}\n${optOut || DEFAULT_OPT_OUT}`;
    return t;
  }, [message, sampleName, isAd, channel, optOut]);
  const bytes = smsBytes(composed);
  const isLms = bytes > SMS_MAX_BYTES;

  const payload = () => ({
    name: name.trim(),
    channel,
    message,
    title: title.trim() || undefined,
    isAd,
    optOutText: isAd ? optOut : undefined,
    templateCode: channel === 'ALIMTALK' ? templateCode.trim() : undefined,
    buttons: channel === 'ALIMTALK' ? buttons.filter((b) => b.name.trim() && b.url.trim()) : [],
    fallbackSms,
    filters: applied as Record<string, unknown>,
    customerIds: [...picked.keys()],
    scheduledAt: when === 'LATER' && scheduledAt ? new Date(scheduledAt).toISOString() : '',
  });

  const check = () => {
    if (!name.trim()) return '캠페인 이름을 입력하세요.';
    if (!message.trim()) return '본문을 입력하세요.';
    if (channel === 'ALIMTALK' && !templateCode.trim()) return '알림톡 템플릿 코드를 입력하세요.';
    if (when === 'LATER' && !scheduledAt) return '예약 시각을 고르세요.';
    if (when === 'LATER' && new Date(scheduledAt).getTime() < Date.now())
      return '예약 시각이 지났습니다.';
    return null;
  };

  /** 저장(새로 만들거나 고친다). 저장된 캠페인을 돌려준다 */
  const save = async (silent = false): Promise<CampaignData | null> => {
    const err = check();
    if (err) {
      toast({ type: 'warning', title: err });
      return null;
    }
    setSaving(true);
    try {
      const body = JSON.stringify(payload());
      const c = loaded
        ? await api<CampaignData>(`/campaigns/${loaded.id}`, { method: 'PATCH', body })
        : await api<CampaignData>('/campaigns', { method: 'POST', body });
      fill(c);
      if (isNew) navigate(`/campaigns/${c.id}`, { replace: true });
      if (!silent) toast({ type: 'success', title: '임시저장했습니다' });
      return c;
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    const c = await save(true);
    if (!c) return;
    setSaving(true);
    try {
      const next = await api<CampaignData>(`/campaigns/${c.id}/send`, { method: 'POST' });
      fill(next);
      setConfirm(false);
      toast({
        type: 'success',
        title: next.status === 'SCHEDULED' ? '예약했습니다' : '발송을 시작했습니다',
      });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '보내지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const cancelSchedule = async () => {
    if (!loaded) return;
    try {
      fill(await api<CampaignData>(`/campaigns/${loaded.id}/cancel`, { method: 'POST' }));
      toast({ type: 'success', title: '예약을 취소했습니다(작성 중으로)' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '취소하지 못했습니다' });
    }
  };

  const remove = async () => {
    if (!loaded || !window.confirm('이 캠페인을 삭제할까요?')) return;
    try {
      await api(`/campaigns/${loaded.id}`, { method: 'DELETE' });
      navigate('/campaigns');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const header = (
    <PageHeader
      title={isNew ? '캠페인 등록' : name || '캠페인'}
      breadcrumbs={[{ label: '마케팅', onClick: () => navigate('/campaigns') }]}
      tags={loaded ? <StatusBadge value={loaded.status} map={CAMPAIGN_STATUS_MAP} /> : undefined}
      actions={
        loaded && (loaded.status === 'DRAFT' || loaded.status === 'SCHEDULED') ? (
          <Button variant="ghost" size="sm" onClick={() => void remove()}>
            삭제
          </Button>
        ) : undefined
      }
    />
  );

  // ── 결과 화면(예약·발송 중·발송 완료) ──
  if (readOnly && loaded) {
    return (
      <div className={styles.col}>
        {header}
        <div className={styles.layout}>
          <div className={styles.col}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>
                받는 사람 <span className={styles.sub}>{loaded.recipients.length}명</span>
              </h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>연락처</th>
                      <th>결과</th>
                      <th>보낸 시각</th>
                      <th>사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loaded.recipients.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.phone}</td>
                        <td>
                          <StatusBadge
                            value={r.status}
                            map={{
                              PENDING: { label: '대기', color: 'neutral' },
                              SENT: { label: '성공', color: 'success' },
                              FAILED: { label: '실패', color: 'error' },
                            }}
                          />
                        </td>
                        <td>{dt(r.sentAt)}</td>
                        <td>{r.reason ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className={styles.sticky}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>요약</h3>
              <div className={styles.summary}>
                <div>
                  <span>채널</span>
                  <span>{CAMPAIGN_CHANNEL_LABEL[loaded.channel]}</span>
                </div>
                <div>
                  <span>받는 사람</span>
                  <b>{loaded.recipientCount}명</b>
                </div>
                {loaded.status === 'SCHEDULED' && (
                  <div>
                    <span>예약 시각</span>
                    <span>{dt(loaded.scheduledAt)}</span>
                  </div>
                )}
                {loaded.status !== 'SCHEDULED' && (
                  <>
                    <div>
                      <span>성공 / 실패</span>
                      <span>
                        {loaded.sentCount} / {loaded.failedCount}
                      </span>
                    </div>
                    <div>
                      <span>발송 시각</span>
                      <span>{dt(loaded.sentAt)}</span>
                    </div>
                  </>
                )}
              </div>
              {loaded.status === 'SENDING' && (
                <div className={styles.inline}>
                  <Spinner size="sm" /> 보내는 중입니다…
                </div>
              )}
              {loaded.status === 'SCHEDULED' && (
                <Button variant="outline" onClick={() => void cancelSchedule()}>
                  예약 취소하고 고치기
                </Button>
              )}
            </div>
            <div className={styles.phone}>
              <div className={styles.bubble}>{loaded.message}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 작성 화면 ──
  return (
    <div className={styles.col}>
      {header}
      <div className={styles.layout}>
        <div className={styles.col}>
          {/* 1. 기본 */}
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>1. 기본</h3>
            <div className={styles.row2}>
              <label className={styles.field}>
                <span className={styles.label}>캠페인 이름</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 11월 이사 예정 고객 사다리차 할인"
                />
              </label>
              <div className={styles.field}>
                <span className={styles.label}>채널</span>
                <SegmentedControl
                  value={channel}
                  onChange={(v) => setChannel(v as CampaignChannel)}
                  options={[
                    { value: 'SMS', label: '문자 (SMS·LMS)' },
                    { value: 'ALIMTALK', label: '카카오 알림톡' },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* 2. 메시지 */}
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>
              2. 메시지{' '}
              <span className={styles.sub}>
                {channel === 'SMS'
                  ? '90바이트(한글 45자)를 넘으면 장문(LMS)으로 보냅니다'
                  : '카카오에서 승인받은 템플릿과 같은 내용이어야 합니다'}
              </span>
            </h3>

            {channel === 'ALIMTALK' && (
              <div className={styles.row2}>
                <label className={styles.field}>
                  <span className={styles.label}>템플릿 코드</span>
                  <Input
                    value={templateCode}
                    onChange={(e) => setTemplateCode(e.target.value)}
                    placeholder="예: TI_1234"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>강조 제목 (선택)</span>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
                </label>
              </div>
            )}
            {channel === 'SMS' && (
              <label className={styles.field}>
                <span className={styles.label}>장문 제목 (LMS일 때)</span>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={40}
                  placeholder="예: [통인익스프레스] 가을 이사 할인"
                />
              </label>
            )}

            <div className={styles.field}>
              <div className={styles.counter}>
                <span className={styles.label}>본문</span>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus size={13} />}
                  onClick={insertName}
                >
                  고객명 넣기
                </Button>
              </div>
              <textarea
                ref={msgRef}
                className={styles.textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`[통인익스프레스] ${NAME_TOKEN}님, 안녕하세요.`}
                aria-label="본문"
              />
              {channel === 'SMS' && (
                <div className={styles.counter}>
                  <span>
                    {NAME_TOKEN}는 받는 사람마다 이름으로 바뀝니다.
                    {isAd ? ' (광고)·수신거부 문구는 자동으로 붙습니다.' : ''}
                  </span>
                  <span>
                    {bytes} byte · <b>{isLms ? 'LMS(장문)' : 'SMS(단문)'}</b>
                  </span>
                </div>
              )}
            </div>

            {channel === 'SMS' && (
              <div className={styles.field}>
                <Checkbox
                  checked={isAd}
                  onCheckedChange={(v) => setIsAd(v === true)}
                  label="광고성 문자"
                  description="할인·이벤트 안내는 광고입니다 — 앞에 (광고), 끝에 무료수신거부 번호가 필요합니다(정보통신망법)."
                />
                {isAd && (
                  <Input
                    value={optOut}
                    onChange={(e) => setOptOut(e.target.value)}
                    placeholder={DEFAULT_OPT_OUT}
                    aria-label="수신거부 문구"
                  />
                )}
              </div>
            )}

            {channel === 'ALIMTALK' && (
              <>
                <div className={styles.field}>
                  <span className={styles.label}>버튼 (최대 5개)</span>
                  {buttons.map((b, i) => (
                    <div key={i} className={styles.inline}>
                      <div style={{ width: 160 }}>
                        <Input
                          value={b.name}
                          placeholder="버튼 이름"
                          maxLength={14}
                          onChange={(e) =>
                            setButtons((bs) =>
                              bs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <Input
                          value={b.url}
                          placeholder="https://"
                          onChange={(e) =>
                            setButtons((bs) =>
                              bs.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)),
                            )
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="버튼 빼기"
                        onClick={() => setButtons((bs) => bs.filter((_, k) => k !== i))}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                  {buttons.length < 5 && (
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Plus size={13} />}
                        onClick={() => setButtons((bs) => [...bs, { name: '', url: '' }])}
                      >
                        버튼 추가
                      </Button>
                    </div>
                  )}
                </div>
                <Checkbox
                  checked={fallbackSms}
                  onCheckedChange={(v) => setFallbackSms(v === true)}
                  label="알림톡 실패 시 문자로 대신 보내기"
                  description="카카오톡을 쓰지 않는 고객 등"
                />
              </>
            )}
          </section>

          {/* 3. 받는 사람 */}
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>
              3. 받는 사람{' '}
              <span className={styles.sub}>
                조건으로 찾고, 골라 담으세요 · {picked.size}명 담음
              </span>
            </h3>

            <div className={styles.row3}>
              <label className={styles.field}>
                <span className={styles.label}>이름·전화번호</span>
                <Input
                  value={filter.keyword ?? ''}
                  onChange={(e) => setF('keyword', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="일부만 입력해도 됩니다"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>주소 키워드</span>
                <Input
                  value={filter.addressKeyword ?? ''}
                  onChange={(e) => setF('addressKeyword', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="구·동·아파트명 (출발·도착지 포함)"
                />
              </label>
              <div className={styles.field}>
                <span className={styles.label}>담당 지점</span>
                <Select
                  value={filter.orgUnitId ?? ALL}
                  onValueChange={(v) => setF('orgUnitId', v === ALL ? undefined : v)}
                  options={[{ value: ALL, label: '전체' }, ...orgs]}
                />
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>지역 (고객 주소·출발지·도착지 중 하나라도)</span>
              <Chips
                options={SIDO.map((s) => ({ value: s, label: s }))}
                value={filter.sido ?? []}
                onChange={(v) => setF('sido', v)}
              />
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <span className={styles.label}>이사일</span>
                <div className={styles.inline}>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={filter.moveDateFrom ?? ''}
                    onChange={(e) => setF('moveDateFrom', e.target.value || undefined)}
                    aria-label="이사일 시작"
                  />
                  ~
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={filter.moveDateTo ?? ''}
                    onChange={(e) => setF('moveDateTo', e.target.value || undefined)}
                    aria-label="이사일 끝"
                  />
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>접수일</span>
                <div className={styles.inline}>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={filter.receivedFrom ?? ''}
                    onChange={(e) => setF('receivedFrom', e.target.value || undefined)}
                    aria-label="접수일 시작"
                  />
                  ~
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={filter.receivedTo ?? ''}
                    onChange={(e) => setF('receivedTo', e.target.value || undefined)}
                    aria-label="접수일 끝"
                  />
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>접수 진행상태 (이사일·접수일과 같은 접수 기준)</span>
              <Chips
                options={LEAD_STATUS.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))}
                value={(filter.leadStatuses ?? []) as LeadStatus[]}
                onChange={(v) => setF('leadStatuses', v)}
              />
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <span className={styles.label}>고객 등급</span>
                <Chips
                  options={grades}
                  value={filter.grades ?? []}
                  onChange={(v) => setF('grades', v)}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>최근 캠페인 받은 고객 제외</span>
                <Select
                  value={String(filter.excludeRecentDays ?? 0)}
                  onValueChange={(v) => setF('excludeRecentDays', Number(v) || undefined)}
                  options={[
                    { value: '0', label: '제외 안 함' },
                    { value: '7', label: '최근 7일' },
                    { value: '14', label: '최근 14일' },
                    { value: '30', label: '최근 30일' },
                  ]}
                />
              </div>
            </div>

            <div className={styles.inline}>
              <Button variant="primary" size="sm" onClick={runSearch} loading={searching}>
                검색
              </Button>
              <Button variant="ghost" size="sm" onClick={resetFilter}>
                조건 초기화
              </Button>
              <span style={{ flex: 1 }} />
              {result && result.total > 0 && (
                <Button variant="outline" size="sm" onClick={() => void pickAllResults()}>
                  검색 결과 전체 담기 ({result.total}명)
                </Button>
              )}
              {picked.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Map())}>
                  담은 사람 모두 비우기
                </Button>
              )}
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <Checkbox
                        checked={pageAllOn}
                        onCheckedChange={(v) => togglePage(v === true)}
                        aria-label="이 페이지 전체 선택"
                      />
                    </th>
                    <th>이름</th>
                    <th>연락처</th>
                    <th>주소</th>
                    <th>최근 접수</th>
                    <th>이사일</th>
                    <th>지점</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const on = picked.has(r.id);
                    return (
                      <tr key={r.id} className={on ? styles.rowOn : ''}>
                        <td>
                          <Checkbox
                            checked={on}
                            onCheckedChange={(v) => togglePick(r, v === true)}
                            aria-label={`${r.name} 선택`}
                          />
                        </td>
                        <td>{r.name}</td>
                        <td>{r.phone}</td>
                        <td className={styles.addr} title={r.addr ?? ''}>
                          {r.addr ?? '-'}
                        </td>
                        <td>
                          {r.lead
                            ? `${LEAD_STATUS_LABEL[r.lead.status as LeadStatus] ?? r.lead.status} · ${r.lead.receivedAt}`
                            : '-'}
                        </td>
                        <td>{r.lead?.moveDate ?? '-'}</td>
                        <td>{r.orgUnit ?? '-'}</td>
                      </tr>
                    );
                  })}
                  {!pageRows.length && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>
                        {searching ? '찾는 중…' : '조건에 맞는 고객이 없습니다.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {result && result.total > PAGE_SIZE && (
              <div className={styles.pager}>
                <span>
                  {result.total}명 중 {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, result.total)}
                </span>
                <div className={styles.inline}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * PAGE_SIZE >= result.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    다음
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* 오른쪽 — 미리보기 · 발송 */}
        <div className={styles.sticky}>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>
              미리보기 <span className={styles.sub}>{sampleName} 님에게</span>
            </h3>
            <div className={styles.phone}>
              <div className={styles.bubble}>
                {channel === 'ALIMTALK' && <div className={styles.kakaoHead}>알림톡 도착</div>}
                {title && (channel === 'ALIMTALK' || isLms) && (
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
                )}
                {composed || <span className={styles.sub}>본문을 입력하세요</span>}
                {channel === 'ALIMTALK' &&
                  buttons
                    .filter((b) => b.name)
                    .map((b, i) => (
                      <div key={i} className={styles.kakaoBtn}>
                        {b.name}
                      </div>
                    ))}
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>4. 발송</h3>
            <SegmentedControl
              value={when}
              onChange={(v) => setWhen(v as 'NOW' | 'LATER')}
              options={[
                { value: 'NOW', label: '바로 보내기' },
                { value: 'LATER', label: '예약 발송' },
              ]}
            />
            {when === 'LATER' && (
              <input
                type="datetime-local"
                className={styles.dateInput}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                aria-label="예약 시각"
              />
            )}
            <div className={styles.summary}>
              <div>
                <span>받는 사람</span>
                <b>{picked.size}명</b>
              </div>
              <div>
                <span>유형</span>
                <span>
                  {channel === 'SMS' ? (isLms ? '문자 · 장문(LMS)' : '문자 · 단문(SMS)') : '알림톡'}
                </span>
              </div>
            </div>
            {channel === 'SMS' && isLms && !title && (
              <div className={styles.warn}>장문이라 제목을 넣는 게 좋습니다.</div>
            )}
            <div className={styles.inline}>
              <Button variant="outline" onClick={() => void save()} disabled={saving}>
                임시저장
              </Button>
              <Button
                variant="primary"
                disabled={saving || picked.size === 0}
                onClick={() => {
                  const err = check();
                  if (err) toast({ type: 'warning', title: err });
                  else setConfirm(true);
                }}
              >
                {when === 'LATER' ? '예약하기' : '보내기'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={when === 'LATER' ? '예약할까요?' : '지금 보낼까요?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              취소
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void send()}>
              {when === 'LATER' ? '예약하기' : '보내기'}
            </Button>
          </>
        }
      >
        <div className={styles.summary}>
          <div>
            <span>캠페인</span>
            <span>{name}</span>
          </div>
          <div>
            <span>채널</span>
            <span>{CAMPAIGN_CHANNEL_LABEL[channel]}</span>
          </div>
          <div>
            <span>받는 사람</span>
            <b>{picked.size}명</b>
          </div>
          <div>
            <span>시각</span>
            <span>{when === 'LATER' ? dt(new Date(scheduledAt).toISOString()) : '지금'}</span>
          </div>
          <div className={styles.warn}>
            보낸 뒤에는 되돌릴 수 없습니다. 번호가 없는 고객은 빠집니다.
          </div>
        </div>
      </Modal>
    </div>
  );
}
