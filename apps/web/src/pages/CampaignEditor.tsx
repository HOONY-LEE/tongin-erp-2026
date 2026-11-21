import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { SearchInput } from '../components/ui/SearchInput';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  LEAD_STATUS,
  SMS_MAX_BYTES,
  smsBytes,
  type CampaignAudienceFilter,
  type CampaignChannel,
  type LeadStatus,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Input,
  Modal,
  PageHeader,
  SegmentedControl,
  Select,
  Spinner,
  StatusBadge,
  useToast,
  PageSkeleton,
  type Row,
} from '../components/ui';
import { CAMPAIGN_STATUS_MAP } from './Campaigns';
import { PickedList, type OtherRecipient } from '../components/campaign/PickedList';
import {
  StaffPicker,
  phoneKey,
  type ExtraPick,
  type StaffPick,
} from '../components/campaign/StaffPicker';
import { PhonePreview } from '../components/PhonePreview';
import { FilterMenu, FilterPopover } from '../components/campaign/FilterMenu';
import fstyles from '../components/campaign/filterMenu.module.css';
import styles from './campaign.module.css';
import { formatPhone } from '../lib/phone';
import { CAMPAIGN_CHANNEL_LABEL, LEAD_STATUS_LABEL } from '../i18n/codes';
import { DatePicker } from '../components/ui';

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
/** 알림톡은 카카오 채널·템플릿 연동 전 — 저장·발송을 막고 안내만 보인다(서버도 같은 문구로 막는다) */
const ALIMTALK_NOT_READY = i18n.t('camp.notConnected.KAKAO');
/** 화면에서 고르는 채널 — 이메일·인스타그램은 아직 연결 전(미리보기만) */
type UiChannel = CampaignChannel | 'EMAIL' | 'INSTAGRAM';
const CHANNEL_OPTIONS: { value: UiChannel; label: string }[] = [
  { value: 'SMS', label: i18n.t('camp.ch.SMS') },
  { value: 'ALIMTALK', label: i18n.t('camp.ch.KAKAO') },
  { value: 'EMAIL', label: i18n.t('camp.ch.EMAIL') },
  { value: 'INSTAGRAM', label: i18n.t('camp.ch.INSTAGRAM') },
];
/** 아직 연결 안 된 채널의 안내(null = 보낼 수 있음) */
const NOT_CONNECTED: Record<UiChannel, string | null> = {
  SMS: null,
  ALIMTALK: ALIMTALK_NOT_READY,
  EMAIL: i18n.t('camp.notConnected.EMAIL'),
  INSTAGRAM: i18n.t('camp.notConnected.INSTAGRAM'),
};
/** 문자 발신번호(고객 휴대폰에 보이는 번호) */
const SENDER_NO = '1899-0123';
/** 링크 — http(s)로 시작하지 않으면 https://를 붙인다 */
const normalizeUrl = (u: string) =>
  /^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`;
type RecipientKind = 'CUSTOMER' | 'EMPLOYEE' | 'EXTRA';
const KIND_LABEL: Record<RecipientKind, { label: string; color: 'neutral' | 'info' | 'primary' }> =
  {
    CUSTOMER: { label: i18n.t('camp.kind.CUSTOMER'), color: 'neutral' },
    EMPLOYEE: { label: i18n.t('camp.kind.EMPLOYEE'), color: 'info' },
    EXTRA: { label: i18n.t('camp.kind.EXTRA'), color: 'primary' },
  };

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
  periodStart: string | null;
  periodEnd: string | null;
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
    customerId: string | null;
    employeeId: string | null;
    kind: RecipientKind;
    orgUnit: string | null;
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
const dt = (v: string | null) => fmtDateTime(v) || '-';

/**
 * 캠페인 작성 — 채널별 설정(문자: 광고 표기·장문 제목 / 알림톡: 템플릿·버튼·대체발송),
 * 발송 시점(즉시·예약), 받는 사람(주소·이사일·접수상태 등 조건으로 찾아 골라 담기).
 * 보냈거나 예약된 캠페인은 결과 화면으로 보인다.
 */
/** 캠페인 발송 잠시 막음 — 운영 실발송을 켰지만 아직 시연 고객 데이터가 섞여 있어 고객에게 일괄 발송은 막는다
 * (상담 콘솔의 1:1 문자는 보낼 수 있다). 풀 때 false로 */
const CAMPAIGN_SEND_BLOCKED = true;
const CAMPAIGN_BLOCK_MSG = i18n.t('camp.blocked');

export default function CampaignEditor() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const orgs = useOptions('/org-units', 'name');
  const grades = useOptions('/customers/grades', 'name', 'code');

  const [loaded, setLoaded] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // ── 설정 ──
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<UiChannel>('SMS');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
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
  /** 받는 사람 탭 — 고객 | 직원·시연 번호 */
  const [recipientTab, setRecipientTab] = useState<'CUSTOMER' | 'STAFF'>('CUSTOMER');
  /** 고른 직원 id → 이름·번호 */
  const [pickedStaff, setPickedStaff] = useState<Map<string, StaffPick>>(new Map());
  /** 직접 입력한 번호(숫자만) → 이름·번호 */
  const [extras, setExtras] = useState<Map<string, ExtraPick>>(new Map());
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const readOnly = !!loaded && loaded.status !== 'DRAFT';

  const fill = useCallback((c: CampaignData) => {
    setLoaded(c);
    setName(c.name);
    setChannel(c.channel);
    setPeriodStart(c.periodStart?.slice(0, 10) ?? '');
    setPeriodEnd(c.periodEnd?.slice(0, 10) ?? '');
    setMessage(c.message);
    setTitle(c.title ?? '');
    setIsAd(c.isAd);
    setOptOut(c.optOutText ?? DEFAULT_OPT_OUT);
    setTemplateCode(c.templateCode ?? '');
    setButtons(c.buttons ?? []);
    setFallbackSms(c.fallbackSms);
    setWhen(c.scheduledAt ? 'LATER' : 'NOW');
    setScheduledAt(toLocalInput(c.scheduledAt));
    // 예전 '주소 키워드' 조건은 화면에서 없앴다 — 보이지 않는 조건으로 남지 않게 버린다
    const f = { ...(c.filters ?? {}) };
    delete f.addressKeyword;
    setFilter(f);
    setApplied(f);
    setPicked(
      new Map(c.recipients.filter((r) => r.customerId).map((r) => [r.customerId!, r.name])),
    );
    setPickedStaff(
      new Map(
        c.recipients
          .filter((r) => r.employeeId)
          .map((r) => [r.employeeId!, { name: r.name, phone: r.phone, orgUnit: r.orgUnit }]),
      ),
    );
    setExtras(
      new Map(
        c.recipients
          .filter((r) => r.kind === 'EXTRA')
          .map((r) => [phoneKey(r.phone), { name: r.name, phone: r.phone }]),
      ),
    );
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      fill(await api<CampaignData>(`/campaigns/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.loadFailed') });
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
          title: e instanceof ApiError ? e.message : t('camp.customerSearchFailed'),
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

  // 이름·전화번호는 입력하는 대로 바로 찾는다(다른 조건은 '검색' 버튼으로)
  useEffect(() => {
    const kw = filter.keyword ?? '';
    if ((applied.keyword ?? '') === kw) return;
    const t = setTimeout(() => {
      setPage(1);
      setApplied((a) => ({ ...a, keyword: kw || undefined }));
    }, 300);
    return () => clearTimeout(t);
  }, [filter.keyword, applied.keyword]);

  /** 드롭다운 필터는 고르는 즉시 적용(검색 버튼 없음). 이름·전화번호는 입력을 잠깐 기다렸다 적용 */
  const applyF = <K extends keyof CampaignAudienceFilter>(k: K, v: CampaignAudienceFilter[K]) => {
    setFilter((f) => ({ ...f, [k]: v }));
    setApplied((a) => ({ ...a, [k]: v }));
    setPage(1);
  };
  const hasFilter = !!(
    filter.sido?.length ||
    filter.leadStatuses?.length ||
    filter.grades?.length ||
    filter.orgUnitId ||
    filter.moveDateFrom ||
    filter.moveDateTo ||
    filter.receivedFrom ||
    filter.receivedTo ||
    filter.excludeRecentDays
  );
  const periodCount = [
    filter.moveDateFrom || filter.moveDateTo,
    filter.receivedFrom || filter.receivedTo,
  ].filter(Boolean).length;
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
  const pickedIds = useMemo(() => [...picked.keys()], [picked]);
  const others = useMemo<OtherRecipient[]>(
    () => [
      ...[...pickedStaff].map(([key, v]) => ({ kind: 'EMPLOYEE' as const, key, ...v })),
      ...[...extras].map(([key, v]) => ({ kind: 'EXTRA' as const, key, ...v, orgUnit: null })),
    ],
    [pickedStaff, extras],
  );
  const totalPicked = picked.size + others.length;
  const toggleStaff = (sid: string, pick: StaffPick | null) =>
    setPickedStaff((m) => {
      const n = new Map(m);
      if (pick) n.set(sid, pick);
      else n.delete(sid);
      return n;
    });
  const toggleExtra = (x: ExtraPick, on: boolean) =>
    setExtras((m) => {
      const n = new Map(m);
      if (on) n.set(phoneKey(x.phone), x);
      else n.delete(phoneKey(x.phone));
      return n;
    });
  const removeOther = (o: OtherRecipient) =>
    o.kind === 'EMPLOYEE' ? toggleStaff(o.key, null) : toggleExtra(o, false);
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
      toast({ type: 'success', title: t('camp.addedAll', { v0: ids.length }) });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.addFailed') });
    }
  };

  // ── 본문 ──
  const insertName = () => {
    const el = msgRef.current;
    const at = el ? el.selectionStart : message.length;
    setMessage((m) => m.slice(0, at) + NAME_TOKEN + m.slice(at));
    setTimeout(() => el?.focus(), 0);
  };
  /** 링크 넣기 — 커서 자리에 주소를 넣는다(미리보기·휴대폰에서 밑줄 링크로 보인다) */
  const insertLink = () => {
    if (!linkUrl.trim()) return;
    const url = normalizeUrl(linkUrl);
    const el = msgRef.current;
    const at = el ? el.selectionStart : message.length;
    setMessage((m) => {
      const before = m.slice(0, at);
      const sep = before && !/\s$/.test(before) ? ' ' : '';
      return `${before}${sep}${url} ${m.slice(at)}`;
    });
    setLinkUrl('');
    setLinkOpen(false);
    setTimeout(() => el?.focus(), 0);
  };
  const notReady = NOT_CONNECTED[channel];
  const pickChannel = (v: UiChannel) => {
    setChannel(v);
    if (NOT_CONNECTED[v]) toast({ type: 'warning', title: NOT_CONNECTED[v]! });
  };
  const sampleName = useMemo(
    () => [...picked.values()].find((v) => !!v) ?? others[0]?.name ?? '홍길동',
    [picked, others],
  );
  const composed = useMemo(() => {
    let t = message.split(NAME_TOKEN).join(sampleName);
    if (isAd) t = `(광고)${t}\n${optOut || DEFAULT_OPT_OUT}`;
    return t;
  }, [message, sampleName, isAd, channel, optOut]);
  const bytes = smsBytes(composed);
  const isLms = bytes > SMS_MAX_BYTES;

  const payload = () => ({
    name: name.trim(),
    channel: channel as CampaignChannel,
    periodStart: periodStart || null,
    periodEnd: periodEnd || null,
    message,
    title: title.trim() || undefined,
    isAd,
    optOutText: isAd ? optOut : undefined,
    templateCode: channel === 'ALIMTALK' ? templateCode.trim() : undefined,
    buttons: channel === 'ALIMTALK' ? buttons.filter((b) => b.name.trim() && b.url.trim()) : [],
    fallbackSms,
    filters: applied as Record<string, unknown>,
    customerIds: [...picked.keys()],
    employeeIds: [...pickedStaff.keys()],
    extraRecipients: [...extras.values()].map((x) => ({ name: x.name, phone: x.phone })),
    scheduledAt: when === 'LATER' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
  });

  /** 작성 단계 — 1) 메시지 작성 2) 받는 사람·발송 */
  const [step, setStep] = useState<1 | 2>(1);
  /** 1단계에서 넘어갈 때는 이름·본문만 본다(예약 시각은 2단계에서) */
  const goStep2 = () => {
    const err = notReady
      ? notReady
      : !name.trim()
        ? t('camp.nameReq')
        : !message.trim()
          ? t('camp.bodyReq')
          : null;
    if (err) toast({ type: 'warning', title: err });
    else setStep(2);
  };

  const check = () => {
    if (notReady) return notReady;
    if (periodStart && periodEnd && periodEnd < periodStart) return t('camp.periodInvalid');
    if (!name.trim()) return t('camp.nameReq');
    if (!message.trim()) return t('camp.bodyReq');
    if (when === 'LATER' && !scheduledAt) return t('camp.scheduleReq');
    if (when === 'LATER' && new Date(scheduledAt).getTime() < Date.now())
      return t('camp.schedulePast');
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
      if (!silent) toast({ type: 'success', title: t('camp.drafted') });
      return c;
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.saveFailed') });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (CAMPAIGN_SEND_BLOCKED) {
      toast({ type: 'warning', title: CAMPAIGN_BLOCK_MSG });
      return;
    }
    const c = await save(true);
    if (!c) return;
    setSaving(true);
    try {
      const next = await api<CampaignData>(`/campaigns/${c.id}/send`, { method: 'POST' });
      fill(next);
      setConfirm(false);
      toast({
        type: 'success',
        title: next.status === 'SCHEDULED' ? t('camp.scheduled') : t('camp.sending'),
      });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.sendFailed') });
    } finally {
      setSaving(false);
    }
  };

  const cancelSchedule = async () => {
    if (!loaded) return;
    try {
      fill(await api<CampaignData>(`/campaigns/${loaded.id}/cancel`, { method: 'POST' }));
      toast({ type: 'success', title: t('camp.unscheduled') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.cancelFailed') });
    }
  };

  const remove = async () => {
    if (!loaded || !window.confirm(t('camp.deleteQ'))) return;
    try {
      await api(`/campaigns/${loaded.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('camp.deleted') });
      navigate('/campaigns');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.deleteFailed') });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 4 }}>
        <PageSkeleton />
      </div>
    );
  }

  const header = (
    <PageHeader
      title={isNew ? t('camp.createTitle') : name || t('camp.campaign')}
      breadcrumbs={[{ label: t('camp.marketing'), onClick: () => navigate('/campaigns') }]}
      tags={loaded ? <StatusBadge value={loaded.status} map={CAMPAIGN_STATUS_MAP} /> : undefined}
      actions={
        // 목록 행 끝에 있던 삭제 — 발송 중이 아닌 기존 캠페인만, 삭제 권한(MARKETING.DELETE)
        loaded && loaded.status !== 'SENDING' && can('MARKETING.DELETE') ? (
          <Button variant="ghost" size="sm" onClick={() => void remove()}>
            {t('camp.delete')}
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
                {t('camp.recipients')}{' '}
                <span className={styles.sub}>
                  {loaded.recipients.length}
                  {t('camp.peopleSuffix')}
                </span>
              </h3>
              <div className={styles.tableWrap}>
                <DataTable
                  bare
                  pageSize={20}
                  columns={[
                    {
                      title: t('camp.col.kind'),
                      dataIndex: 'kind',
                      width: 80,
                      render: (r) => (
                        <Badge
                          variant="subtle"
                          color={KIND_LABEL[r.kind as RecipientKind]?.color ?? 'neutral'}
                        >
                          {KIND_LABEL[r.kind as RecipientKind]?.label ?? t('camp.kind.CUSTOMER')}
                        </Badge>
                      ),
                    },
                    { title: t('camp.col.name'), dataIndex: 'name' },
                    {
                      title: t('camp.col.phone'),
                      dataIndex: 'phone',
                      render: (r) => formatPhone(String(r.phone ?? '')),
                    },
                    {
                      title: t('camp.col.result'),
                      dataIndex: 'status',
                      render: (r) => (
                        <StatusBadge
                          value={String(r.status)}
                          map={{
                            PENDING: { label: t('camp.st.PENDING'), color: 'neutral' },
                            SENT: { label: t('camp.st.SENT'), color: 'success' },
                            FAILED: { label: t('camp.st.FAILED'), color: 'error' },
                          }}
                        />
                      ),
                    },
                    {
                      title: t('camp.col.sentAt'),
                      dataIndex: 'sentAt',
                      width: 170,
                      render: (r) => dt((r.sentAt as string | null) ?? null),
                    },
                    {
                      title: t('camp.col.reason'),
                      dataIndex: 'reason',
                      flex: 1,
                      render: (r) => String(r.reason ?? '-'),
                    },
                  ]}
                  rows={loaded.recipients as unknown as Row[]}
                />
              </div>
            </div>
          </div>
          <div className={styles.sticky}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>{t('camp.summary')}</h3>
              <div className={styles.summary}>
                <div>
                  <span>{t('camp.col.channel')}</span>
                  <span>{CAMPAIGN_CHANNEL_LABEL[loaded.channel]}</span>
                </div>
                <div>
                  <span>{t('camp.recipients')}</span>
                  <b>
                    {loaded.recipientCount}
                    {t('camp.peopleSuffix')}
                  </b>
                </div>
                {loaded.status === 'SCHEDULED' && (
                  <div>
                    <span>{t('camp.scheduledAt')}</span>
                    <span>{dt(loaded.scheduledAt)}</span>
                  </div>
                )}
                {loaded.status !== 'SCHEDULED' && (
                  <>
                    <div>
                      <span>{t('camp.successFail')}</span>
                      <span>
                        {loaded.sentCount} / {loaded.failedCount}
                      </span>
                    </div>
                    <div>
                      <span>{t('camp.sentAt')}</span>
                      <span>{dt(loaded.sentAt)}</span>
                    </div>
                  </>
                )}
              </div>
              {loaded.status === 'SENDING' && (
                <div className={styles.inline}>
                  <Spinner size="sm" /> {t('camp.sendingNow')}
                </div>
              )}
              {loaded.status === 'SCHEDULED' && (
                <Button variant="outline" onClick={() => void cancelSchedule()}>
                  {t('camp.unscheduleEdit')}
                </Button>
              )}
            </div>
            <PhonePreview
              channel={channel}
              sender="통인익스프레스"
              senderNo={SENDER_NO}
              lms={channel === 'SMS' && isLms}
              title={title}
              body={composed}
              to={sampleName}
              at={loaded.scheduledAt ? new Date(loaded.scheduledAt) : undefined}
              compact
            />
          </div>
        </div>
      </div>
    );
  }

  // ── 작성 화면 — 1) 메시지 작성(기본·메시지) 2) 받는 사람·발송 ──
  return (
    <div className={styles.col}>
      {header}
      <ol className={styles.steps}>
        {([t('camp.step.compose'), t('camp.step.send')] as const).map((label, i) => (
          <li key={label}>
            <button
              type="button"
              className={`${styles.stepItem} ${step === i + 1 ? styles.stepOn : ''} ${step > i + 1 ? styles.stepDone : ''}`}
              onClick={() => (i === 0 ? setStep(1) : goStep2())}
              aria-current={step === i + 1 ? 'step' : undefined}
            >
              <span className={styles.stepNo}>{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <div className={`${styles.layoutEditor} ${step === 1 ? styles.layoutEditorStretch : ''}`}>
        <div className={styles.col}>
          {step === 1 ? (
            // 캠페인 기본 정보 + 메시지 — 한 카드(경계선으로 나눔), 높이는 미리보기 카드와 같게
            <section className={`${styles.panel} ${styles.composeCard}`}>
              <h3 className={styles.panelTitle}>{t('camp.basic')}</h3>
              <div className={styles.row2}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('camp.name')} <span className={styles.req}>*</span>
                  </span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('camp.namePh')}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.label}>{t('camp.period')}</span>
                  <div className={styles.period}>
                    <DatePicker
                      className={styles.dateInput}
                      value={periodStart}
                      onChange={(v) => setPeriodStart(v)}
                      aria-label={t('camp.periodStart')}
                    />
                    <span className={styles.sub}>~</span>
                    <DatePicker
                      className={styles.dateInput}
                      value={periodEnd}
                      min={periodStart || undefined}
                      onChange={(v) => setPeriodEnd(v)}
                      aria-label={t('camp.periodEnd')}
                    />
                  </div>
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>
                  {t('camp.col.channel')} <span className={styles.req}>*</span>
                </span>
                <SegmentedControl
                  className={styles.fitSeg}
                  value={channel}
                  onChange={(v) => pickChannel(v as UiChannel)}
                  options={CHANNEL_OPTIONS}
                />
              </div>

              <hr className={styles.divider} />

              <h3 className={styles.panelTitle}>
                {t('camp.message')}{' '}
                {channel === 'SMS' && <span className={styles.sub}>{t('camp.lmsHint')}</span>}
              </h3>
              {notReady && (
                <div className={styles.warn} role="status">
                  {notReady} {t('camp.notConnectedHint')}
                </div>
              )}

              {/* 제목 · 무료수신거부(광고일 때만 켜짐, 자리는 늘 차지) · 광고성 체크 — 한 줄 */}
              <div className={styles.titleRow}>
                {channel !== 'INSTAGRAM' && (
                  <label className={styles.field}>
                    <span className={styles.label}>
                      {channel === 'SMS'
                        ? t('camp.subjectLms')
                        : channel === 'ALIMTALK'
                          ? t('camp.subjectKakao')
                          : t('camp.subjectEmail')}
                    </span>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={40}
                      placeholder={t('camp.subjectPh')}
                    />
                  </label>
                )}
                <label className={styles.field}>
                  <span className={styles.label}>{t('camp.optOut')}</span>
                  <Input
                    value={optOut}
                    onChange={(e) => setOptOut(e.target.value)}
                    placeholder={DEFAULT_OPT_OUT}
                    disabled={!isAd}
                    aria-label={t('camp.optOutAria')}
                  />
                </label>
                <div className={styles.adCheck}>
                  <Checkbox
                    checked={isAd}
                    onCheckedChange={(v) => setIsAd(v === true)}
                    label={t('camp.adMessage')}
                  />
                </div>
              </div>

              <div className={`${styles.field} ${styles.bodyField}`}>
                <div className={styles.counter}>
                  <span className={styles.label}>
                    {t('camp.body')} <span className={styles.req}>*</span>
                  </span>
                  <span className={styles.inline}>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Plus size={13} />}
                      onClick={insertName}
                    >
                      {t('camp.insertName')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Plus size={13} />}
                      onClick={() => setLinkOpen(true)}
                    >
                      {t('camp.insertLink')}
                    </Button>
                  </span>
                </div>
                <textarea
                  ref={msgRef}
                  className={`${styles.textarea} ${styles.bodyArea}`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`[통인익스프레스] ${NAME_TOKEN}님, 안녕하세요.`}
                  aria-label={t('camp.body')}
                />
                <div className={styles.counter}>
                  <span>
                    {NAME_TOKEN}
                    {t('camp.nameTokenHint')}
                  </span>
                  {channel === 'SMS' && (
                    <span>
                      {bytes} byte · <b>{isLms ? t('camp.lms') : t('camp.sms')}</b>
                    </span>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className={styles.panel}>
                <h3 className={styles.panelTitle}>
                  {t('camp.recipients')}{' '}
                  <span className={styles.sub}>
                    {totalPicked}
                    {t('camp.addedN')}
                  </span>
                </h3>

                {/* 세그먼트는 영역 전체가 아니라 내용 폭만큼 */}
                <SegmentedControl
                  className={styles.fitSeg}
                  value={recipientTab}
                  onChange={(v) => setRecipientTab(v as 'CUSTOMER' | 'STAFF')}
                  options={[
                    {
                      value: 'CUSTOMER',
                      label: t('camp.tab.customers', {
                        v0: picked.size ? ` (${picked.size})` : '',
                      }),
                    },
                    {
                      value: 'STAFF',
                      label: t('camp.tab.staff', {
                        v0: others.length ? ` (${others.length})` : '',
                      }),
                    },
                  ]}
                />

                {recipientTab === 'STAFF' && (
                  <StaffPicker
                    pickedStaff={pickedStaff}
                    onToggleStaff={toggleStaff}
                    extras={extras}
                    onToggleExtra={toggleExtra}
                  />
                )}

                {recipientTab === 'CUSTOMER' && (
                  <>
                    {/* 이름·전화번호 검색 + 작은 드롭다운 필터들 — 고르는 즉시 목록이 바뀐다 */}
                    <div className={styles.filterBar}>
                      <SearchInput
                        value={filter.keyword ?? ''}
                        onChange={(v) => setF('keyword', v)}
                        placeholder={t('camp.searchPh')}
                        width={260}
                      />
                      <FilterMenu
                        label={t('camp.region')}
                        columns={3}
                        options={SIDO.map((v) => ({ value: v, label: v }))}
                        value={filter.sido ?? []}
                        onChange={(v) => applyF('sido', v.length ? v : undefined)}
                      />
                      <FilterMenu
                        label={t('camp.leadStatus')}
                        options={LEAD_STATUS.map((v) => ({
                          value: v,
                          label: LEAD_STATUS_LABEL[v],
                        }))}
                        value={(filter.leadStatuses ?? []) as LeadStatus[]}
                        onChange={(v) => applyF('leadStatuses', v.length ? v : undefined)}
                      />
                      <FilterMenu
                        label={t('camp.grade')}
                        options={grades}
                        value={filter.grades ?? []}
                        onChange={(v) => applyF('grades', v.length ? v : undefined)}
                      />
                      <FilterPopover
                        label={t('camp.dateRange')}
                        summary={periodCount ? String(periodCount) : undefined}
                        active={periodCount > 0}
                        width={280}
                      >
                        <div className={fstyles.dateRow}>
                          {t('camp.moveDate')}
                          <div>
                            <DatePicker
                              className={fstyles.date}
                              value={filter.moveDateFrom ?? ''}
                              onChange={(v) => applyF('moveDateFrom', v || undefined)}
                              aria-label={t('camp.moveFrom')}
                            />
                            ~
                            <DatePicker
                              className={fstyles.date}
                              value={filter.moveDateTo ?? ''}
                              onChange={(v) => applyF('moveDateTo', v || undefined)}
                              aria-label={t('camp.moveTo')}
                            />
                          </div>
                        </div>
                        <div className={fstyles.dateRow}>
                          {t('camp.receivedDate')}
                          <div>
                            <DatePicker
                              className={fstyles.date}
                              value={filter.receivedFrom ?? ''}
                              onChange={(v) => applyF('receivedFrom', v || undefined)}
                              aria-label={t('camp.receivedFrom')}
                            />
                            ~
                            <DatePicker
                              className={fstyles.date}
                              value={filter.receivedTo ?? ''}
                              onChange={(v) => applyF('receivedTo', v || undefined)}
                              aria-label={t('camp.receivedTo')}
                            />
                          </div>
                        </div>
                      </FilterPopover>
                      <div className={styles.filterSelect}>
                        <Select
                          value={filter.orgUnitId ?? ALL}
                          onValueChange={(v) => applyF('orgUnitId', v === ALL ? undefined : v)}
                          options={[{ value: ALL, label: t('camp.allBranches') }, ...orgs]}
                          aria-label={t('camp.ownerBranch')}
                        />
                      </div>
                      <div className={styles.filterSelectWide}>
                        <Select
                          value={String(filter.excludeRecentDays ?? 0)}
                          onValueChange={(v) => applyF('excludeRecentDays', Number(v) || undefined)}
                          options={[
                            { value: '0', label: t('camp.recent.include') },
                            { value: '7', label: t('camp.recent.7') },
                            { value: '14', label: t('camp.recent.14') },
                            { value: '30', label: t('camp.recent.30') },
                          ]}
                          aria-label={t('camp.recentAria')}
                        />
                      </div>
                      {hasFilter && (
                        <Button variant="ghost" size="sm" onClick={resetFilter}>
                          {t('camp.reset')}
                        </Button>
                      )}
                    </div>

                    <div className={styles.inline}>
                      {pageRows.length > 0 && (
                        <label className={styles.inline}>
                          <Checkbox
                            checked={pageAllOn}
                            onCheckedChange={(v) => togglePage(v === true)}
                            aria-label={t('camp.selectPage')}
                          />
                          <span className={styles.sub}>{t('camp.selectPage')}</span>
                        </label>
                      )}
                      <span className={styles.sub}>
                        {searching
                          ? t('camp.searching')
                          : result
                            ? t('camp.peopleN', { v0: result.total.toLocaleString() })
                            : ''}
                      </span>
                      <span style={{ flex: 1 }} />
                      {result && result.total > 0 && (
                        <Button variant="outline" size="sm" onClick={() => void pickAllResults()}>
                          {t('camp.addAll1')}
                          {result.total.toLocaleString()}
                          {t('camp.addAll2')}
                        </Button>
                      )}
                      {picked.size > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setPicked(new Map())}>
                          {t('camp.clearPicked')}
                        </Button>
                      )}
                    </div>

                    <div className={styles.tableWrap}>
                      <DataTable
                        bare
                        pageSize={0}
                        loading={searching && !pageRows.length}
                        columns={[
                          {
                            title: '',
                            width: 48,
                            mask: false,
                            render: (r) => {
                              const row = r as unknown as (typeof pageRows)[number];
                              return (
                                <Checkbox
                                  checked={picked.has(row.id)}
                                  onCheckedChange={(v) => togglePick(row, v === true)}
                                  aria-label={t('camp.selectOf', { v0: row.name })}
                                />
                              );
                            },
                          },
                          { title: t('camp.col.name'), dataIndex: 'name' },
                          {
                            title: t('camp.col.phone'),
                            dataIndex: 'phone',
                            render: (r) => formatPhone(String(r.phone ?? '')),
                          },
                          {
                            title: t('camp.col.address'),
                            dataIndex: 'addr',
                            flex: 1,
                            minWidth: 160,
                            render: (r) => String(r.addr ?? '-'),
                          },
                          {
                            title: t('camp.col.recentLead'),
                            dataIndex: 'lead',
                            render: (r) => {
                              const l = r.lead as {
                                status: string;
                                receivedAt: string;
                              } | null;
                              return l
                                ? `${LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status} · ${l.receivedAt}`
                                : '-';
                            },
                          },
                          {
                            title: t('camp.moveDate'),
                            dataIndex: 'moveDate',
                            render: (r) =>
                              (r.lead as { moveDate?: string | null } | null)?.moveDate ?? '-',
                          },
                          {
                            title: t('camp.col.branch'),
                            dataIndex: 'orgUnit',
                            render: (r) => String(r.orgUnit ?? '-'),
                          },
                        ]}
                        rows={pageRows as unknown as Row[]}
                      />
                    </div>
                    {result && result.total > PAGE_SIZE && (
                      <div className={styles.pager}>
                        <span>
                          {result.total}
                          {t('camp.ofPeople')} {(page - 1) * PAGE_SIZE + 1}–
                          {Math.min(page * PAGE_SIZE, result.total)}
                        </span>
                        <div className={styles.inline}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                          >
                            {t('camp.prev')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page * PAGE_SIZE >= result.total}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            {t('camp.next')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* 발송 — 받는 사람 아래 맨 끝. 최종 명단은 보내기를 누르면 확인 창에서 한 번 더 보여 준다 */}
              <section className={styles.panel}>
                <h3 className={styles.panelTitle}>{t('camp.send')}</h3>
                {notReady && <div className={styles.warn}>{notReady}</div>}
                <div className={styles.sendRow}>
                  <SegmentedControl
                    className={styles.fitSeg}
                    value={when}
                    onChange={(v) => setWhen(v as 'NOW' | 'LATER')}
                    options={[
                      { value: 'NOW', label: t('camp.sendNow') },
                      { value: 'LATER', label: t('camp.sendLater') },
                    ]}
                  />
                  {when === 'LATER' && (
                    <>
                      {/* 예약 시각 — 날짜(공통 달력) + 시각 */}
                      <DatePicker
                        size="sm"
                        clearable={false}
                        style={{ width: 150 }}
                        aria-label={t('camp.scheduledAt')}
                        value={scheduledAt.slice(0, 10)}
                        onChange={(d) =>
                          setScheduledAt(d ? `${d}T${scheduledAt.slice(11, 16) || '09:00'}` : '')
                        }
                      />
                      <input
                        type="time"
                        className={styles.dateInput}
                        value={scheduledAt.slice(11, 16)}
                        onChange={(e) =>
                          setScheduledAt(
                            `${scheduledAt.slice(0, 10) || toLocalInput(new Date().toISOString()).slice(0, 10)}T${e.target.value}`,
                          )
                        }
                        aria-label={t('camp.scheduledAt')}
                      />
                    </>
                  )}
                  <span className={styles.sendSummary}>
                    {t('camp.recipients')}{' '}
                    <b>
                      {totalPicked.toLocaleString()}
                      {t('camp.peopleSuffix')}
                    </b>
                    {' · '}
                    {channel === 'SMS'
                      ? isLms
                        ? t('camp.smsLms')
                        : t('camp.smsSms')
                      : CHANNEL_OPTIONS.find((o) => o.value === channel)?.label}
                  </span>
                </div>
                {channel === 'SMS' && isLms && !title && (
                  <div className={styles.warn}>{t('camp.lmsTitleHint')}</div>
                )}
                <div className={styles.stepNav}>
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    {t('camp.backToCompose')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void save()}
                    disabled={saving || !!notReady}
                  >
                    {t('camp.saveDraft')}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={CAMPAIGN_SEND_BLOCKED || saving || totalPicked === 0 || !!notReady}
                    title={CAMPAIGN_SEND_BLOCKED ? CAMPAIGN_BLOCK_MSG : undefined}
                    onClick={() => {
                      const err = check();
                      if (err) toast({ type: 'warning', title: err });
                      else setConfirm(true);
                    }}
                  >
                    {when === 'LATER' ? t('camp.schedule') : t('camp.sendBtn')}
                  </Button>
                  {CAMPAIGN_SEND_BLOCKED && (
                    <span style={{ color: 'var(--ark-color-text-secondary)', fontSize: 12.5 }}>
                      {CAMPAIGN_BLOCK_MSG}
                    </span>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* 오른쪽 — 미리보기(아이폰 문자 화면). 두 단계 모두 같은 폭이라 왼쪽 영역 폭도 같다 */}
        <div className={styles.sticky}>
          <PhonePreview
            channel={channel}
            sender="통인익스프레스"
            senderNo={SENDER_NO}
            lms={channel === 'SMS' && isLms}
            title={title}
            body={composed}
            placeholder={t('camp.bodyPh')}
            to={sampleName}
            at={when === 'LATER' && scheduledAt ? new Date(scheduledAt) : undefined}
            width={286}
          />
        </div>
        {step === 1 && (
          <div className={`${styles.stepNav} ${styles.stepNavSpan}`}>
            <Button variant="outline" onClick={() => void save()} disabled={saving || !!notReady}>
              {t('camp.saveDraft')}
            </Button>
            <Button variant="primary" onClick={goStep2} disabled={!!notReady}>
              {t('camp.nextStep')}
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title={t('camp.insertLink')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>
              {t('camp.cancel')}
            </Button>
            <Button variant="primary" disabled={!linkUrl.trim()} onClick={insertLink}>
              {t('camp.insert')}
            </Button>
          </>
        }
      >
        <label className={styles.field}>
          <span className={styles.label}>{t('camp.col.address')}</span>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && insertLink()}
            placeholder={t('camp.linkPh')}
            autoFocus
          />
          <span className={styles.sub}>{t('camp.linkHint')}</span>
        </label>
      </Modal>

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        size="lg"
        title={when === 'LATER' ? t('camp.scheduleQ') : t('camp.sendQ')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t('camp.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={totalPicked === 0}
              onClick={() => void send()}
            >
              {when === 'LATER' ? t('camp.schedule') : t('camp.sendBtn')} (
              {totalPicked.toLocaleString()}
              {t('camp.addAll2')}
            </Button>
          </>
        }
      >
        <div className={styles.summary}>
          <div>
            <span>{t('camp.campaign')}</span>
            <span>{name}</span>
          </div>
          <div>
            <span>{t('camp.col.channel')}</span>
            <span>{CAMPAIGN_CHANNEL_LABEL[channel as CampaignChannel]}</span>
          </div>
          <div>
            <span>{t('camp.recipients')}</span>
            <b>
              {totalPicked}
              {t('camp.peopleSuffix')}
            </b>
          </div>
          <div>
            <span>{t('camp.time')}</span>
            <span>
              {when === 'LATER' ? dt(new Date(scheduledAt).toISOString()) : t('camp.now')}
            </span>
          </div>
          <div className={styles.warn}>{t('camp.sendWarn')}</div>
        </div>
        {/* 최종 발송 명단 — 여기서 이름·번호로 찾아 뺄 수 있다 */}
        <PickedList
          ids={pickedIds}
          onRemove={(cid) =>
            setPicked((m) => {
              const n = new Map(m);
              n.delete(cid);
              return n;
            })
          }
          others={others}
          onRemoveOther={removeOther}
        />
      </Modal>
    </div>
  );
}
