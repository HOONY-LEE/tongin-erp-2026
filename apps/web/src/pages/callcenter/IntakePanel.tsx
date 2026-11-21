import i18n from '../../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDateTime } from '../../lib/dateFormat';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Phone, RotateCcw, MessageSquare, PhoneForwarded } from 'lucide-react';
import { Combobox } from '@sunghoon_lee/akron-ui';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError, cachedApi } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { SERVICE_LINES } from '../../lib/leadCodes';
import { useOrgScope } from '../../lib/useOrgScope';
import { dial, enablePhone, getPhoneState, hangup, usePhone } from '../../lib/softphone';
import {
  Button,
  ConfirmModal,
  FormModal,
  Input,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from '../../components/ui';
import { AddressField } from '../../components/ui/AddressField';
import { useLeadCreateForm } from '../../components/lead/useLeadCreateForm';
import styles from '../callcenter.module.css';
import { MemoPresetPicker } from './MemoPresets';
import { CallRecordButton } from './CallRecordModal';
import { SmsModal } from './SmsModal';
import { DatePicker } from '../../components/ui';

export interface IntakeCall {
  id: string;
  /** 콜 번호 CL+YYMMDD+일련 */
  callNo?: string | null;
  phone: string;
  status: string;
  channel: string | null;
  memo: string | null;
  request: string | null;
  customerId: string | null;
  customerName: string | null;
  receivedAt: string;
  assignedAt: string | null;
  /** 돌려주기 — 넘긴 곳(이름 · 번호) */
  transferTo?: string | null;
  /** 상담 중에 등록한 접수 */
  leadId?: string | null;
  leadNo?: string | null;
}
/** 끝난 콜을 읽기 모드로 — 통화 중 상담 화면과 같은 모양, 입력은 잠금 */
export interface ReadOnlyInfo {
  agentName: string | null;
  durationSec: number | null;
  hasRecording: boolean;
  hasTranscript?: boolean;
  /** 이 콜로 등록한 접수 내용(있으면 입력 칸을 그대로 채운다) */
  lead: {
    serviceLine: string | null;
    partnerId: string | null;
    moveKind: string;
    orgUnitId: string;
    moveDate: string | null;
    customerRequest: string | null;
    fromZipcode: string | null;
    fromAddr: string | null;
    fromAddrDetail: string | null;
    toZipcode: string | null;
    toAddr: string | null;
    toAddrDetail: string | null;
  } | null;
}
const CALL_STATUS: Record<string, string> = {
  DONE: i18n.t('cc.st.ENDED'),
  CANCELED: i18n.t('cc.canceled'),
  OUTCALL: i18n.t('cc.outboundWaiting'),
  ASSIGNED: i18n.t('cc.st.TALKING'),
  CALLBACK: i18n.t('cc.st.CALLBACK'),
};
const durText = (s: number | null) =>
  s == null
    ? '-'
    : s < 60
      ? i18n.t('cc.secN', { v0: s })
      : i18n.t('cc.msN', { v0: Math.floor(s / 60), v1: String(s % 60).padStart(2, '0') });
interface RecentLead {
  id: string;
  leadNo: string;
  status: string;
  createdAt: string;
  moveDate: string | null;
  orgUnit: { name: string } | null;
}
interface PartnerOption {
  id: string;
  name: string;
  type: string;
  benefit: string | null;
}

/** 본사(통인익스프레스) 조직 코드 — 상담 콘솔 접수의 기본 담당 */
const HQ_CODE = 'CO-MOVING';

/** 배정 후 지난 시간 — '방금' · '12분' · '2시간 19분' */
const elapsed = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 1
    ? i18n.t('cc.justNow')
    : m < 60
      ? i18n.t('cc.minN', { v0: m })
      : i18n.t('cc.hmN', { v0: Math.floor(m / 60), v1: m % 60 });
};

/**
 * 상담 화면(내 콜) — 통화하면서 상담 콘솔 안에서 바로 접수한다(화면 이동 없음).
 * 오른쪽 위 [상담 종료](접수 없이 끝) · [접수 등록](간편접수 창에서 확인 후 등록 → 콜 종료).
 * 전화번호는 콜에서, 고객명은 같은 번호로 전화한 적 있는 고객이면 자동으로 채운다.
 */
export function IntakePanel({
  call,
  pending = false,
  onDone,
  onSaved,
  readOnly,
}: {
  call: IntakeCall;
  /** (예전) 이전 접수 — 지금은 아래 고객 이력이 대신한다 */
  recentLeads?: RecentLead[];
  /** 서버가 콜을 만들기 전(받기 직후 잠깐) — 입력은 되고 접수 등록·상담 종료만 잠시 막는다 */
  pending?: boolean;
  onDone: () => Promise<void> | void;
  /** (예전) 목록으로 — 지금은 화면 제목 '<'가 맡는다 */
  onBack?: () => void;
  /** 접수 등록처럼 콜은 그대로 두고 내용만 바뀌었을 때 — 상담 화면에 머문다 */
  onSaved?: () => Promise<void> | void;
  /** 끝난 콜 — 같은 모양의 읽기 화면(버튼·입력 잠금, 녹취 듣기) */
  readOnly?: ReadOnlyInfo;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const phone = usePhone();
  const { options: orgs, ownOrgId } = useOrgScope();
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [hqId, setHqId] = useState('');
  const [busy, setBusy] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  /** 끝난 상담에서 다시 걸기 — 확인 창 */
  const { t } = useTranslation();
  const [recallOpen, setRecallOpen] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
  /** 문자 보내기 창 */
  const [smsOpen, setSmsOpen] = useState(false);
  const recall = async () => {
    setBusy(true);
    try {
      // PC 전화가 꺼져 있으면 먼저 켠다(마이크 허용)
      if (getPhoneState().status !== 'ready') {
        await enablePhone();
        if (getPhoneState().status === 'error') return;
      }
      const next = await api<{ id: string }>(`/cs-calls/${call.id}/recall`, { method: 'POST' });
      dial(call.phone, next.id);
      setRecallOpen(false);
      // 콘솔이 새 콜을 읽으면 그 상담 화면으로 넘어간다
      window.dispatchEvent(new CustomEvent('tongin:cs-call-changed'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.dialFailed') });
    } finally {
      setBusy(false);
    }
  };
  const [, tick] = useState(0);

  const initial = useMemo(
    () => ({
      customerName: call.customerName ?? '',
      serviceLine: 'MOVING',
      orgUnitId: '',
      moveKind: 'GENERAL',
      partnerId: '',
      moveDate: '',
      // 메모는 하나 — 고객 요청사항과 상담 메모를 함께 적는다(콜·접수의 요청사항으로 남는다)
      // 고객 요청사항(접수의 요청사항으로 남는다)과 상담 메모(콜에만 남는다)를 따로
      request: call.request ?? readOnly?.lead?.customerRequest ?? '',
      memo: call.memo ?? '',
      // 읽기 모드 — 이 콜로 등록한 접수 내용으로 채운다
      ...(readOnly?.lead && {
        serviceLine: readOnly.lead.serviceLine ?? 'MOVING',
        moveKind: readOnly.lead.moveKind,
        partnerId: readOnly.lead.partnerId ?? '',
        orgUnitId: readOnly.lead.orgUnitId,
        moveDate: readOnly.lead.moveDate ?? '',
        ...Object.fromEntries(
          (
            [
              'fromZipcode',
              'fromAddr',
              'fromAddrDetail',
              'toZipcode',
              'toAddr',
              'toAddrDetail',
            ] as const
          ).map((k) => [k, readOnly.lead![k] ?? '']),
        ),
      }),
    }),
    // 콜이 바뀔 때만 새로 채운다(입력 중에 3초마다 새로 읽어도, 받기 직후 임시 콜 → 실제 콜로 바뀌어도 지우지 않게)
    [call.phone, call.receivedAt.slice(0, 16)],
  );
  /** 적던 내용이 바뀌었는지 — 바뀐 것만 서버에 초안으로 남긴다(빈 화면이 앞 콜 초안을 덮지 않게) */
  const dirty = useRef(false);
  const [v, setV] = useState<Record<string, string>>(initial);
  useEffect(() => {
    dirty.current = false;
    setV(initial);
  }, [initial]);
  // 기존 고객 이름이 나중에 붙으면(첫 응답엔 없을 수 있음) 비어 있을 때만 채운다
  useEffect(() => {
    if (call.customerName)
      setV((x) => (x.customerName ? x : { ...x, customerName: call.customerName! }));
  }, [call.customerName]);
  const setField = (name: string, value: string) => {
    dirty.current = true;
    setV((x) => ({ ...x, [name]: value }));
  };

  // 같은 고객의 앞 콜에 적던 내용(고객명·상품·주소·메모 등)을 이어받는다 — 콜 번호는 새것이어도
  // 끝난 콜(읽기)은 이 콜에 적던 것만, 접수로 채운 끝난 콜은 접수 내용 그대로
  const draftCallId = pending || readOnly?.lead ? null : call.id;
  useEffect(() => {
    if (!draftCallId) return;
    let alive = true;
    void api<{ draft: Record<string, string> | null; fromCallNo: string | null }>(
      `/cs-calls/${draftCallId}/draft${readOnly ? '?own=1' : ''}`,
    )
      .then((r) => {
        if (!alive || !r.draft) return;
        const d = r.draft;
        // 그사이 직접 고친 칸은 두고, 아직 처음 그대로인 칸만 채운다
        setV((x) => {
          const out = { ...x };
          for (const [k, val] of Object.entries(d))
            if (val && (x[k] ?? '') === ((initial as Record<string, string>)[k] ?? ''))
              out[k] = val;
          return out;
        });
        if (r.fromCallNo) {
          dirty.current = true;
          toast({ type: 'info', title: t('cc.draftLoaded', { v0: r.fromCallNo }) });
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // 콜이 바뀔 때만(받기 직후 임시 콜 → 실제 콜로 바뀔 때 포함)
  }, [draftCallId]);
  // 적는 대로 잠깐 모아 서버에 초안으로(새로고침·다음 콜에도 남게)
  useEffect(() => {
    if (!draftCallId || readOnly || !dirty.current) return;
    const timer = setTimeout(() => {
      void api(`/cs-calls/${draftCallId}/draft`, { method: 'PUT', body: JSON.stringify(v) }).catch(
        () => undefined,
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [v, draftCallId, readOnly]);

  // 담당 지점 기본값 — 본사(고를 수 있으면), 아니면 내 조직
  useEffect(() => {
    void cachedApi<{ id: string; code: string }[]>('/org-units')
      .then((rows) => setHqId(rows.find((r) => r.code === HQ_CODE)?.id ?? ''))
      .catch(() => setHqId(''));
  }, []);
  const hqAllowed = !!hqId && orgs.some((o) => o.value === hqId && !o.disabled);
  const defaultOrg = hqAllowed ? hqId : ownOrgId || user?.employeeOrgUnitId || '';
  useEffect(() => {
    if (defaultOrg) setV((x) => (x.orgUnitId ? x : { ...x, orgUnitId: defaultOrg }));
  }, [defaultOrg, call.phone]);

  useEffect(() => {
    void api<PartnerOption[]>('/partners/options')
      .then((r) => setPartners(r.filter((p) => p.type === 'AFFILIATE' || p.type === 'EXCLUSIVE')))
      .catch(() => setPartners([]));
  }, []);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const partner = partners.find((p) => p.id === v.partnerId) ?? null;
  const startedAt = call.assignedAt ?? call.receivedAt;
  // PC 전화로 통화 중일 때만 '통화시간'(실제 통화). 아니면 '배정 후' 지난 시간
  const onPcCall = phone.call?.state === 'active' && !!phone.call.startedAt;
  const talking = onPcCall
    ? Date.now() - phone.call!.startedAt!
    : Date.now() - Date.parse(startedAt);
  // 30분 넘게 끝나지 않은 콜 — 이 콜이 열려 있으면 새 전화가 배정되지 않는다
  const stale = !onPcCall && talking > 30 * 60_000;

  const finish = (result: 'DONE' | 'RETRY', leadId?: string) =>
    api(`/cs-calls/${call.id}/finish`, {
      method: 'POST',
      body: JSON.stringify({
        result,
        ...(leadId && { leadId }),
        request: v.request?.trim() || undefined,
        memo: v.memo?.trim() || undefined,
      }),
    });
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast({ type: 'success', title: ok });
      await onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.processFailed') });
    } finally {
      setBusy(false);
    }
  };
  /** 상담 종료 — 접수 없이 이 콜을 끝낸다(PC로 통화 중이면 전화도 끊는다) */
  const endConsult = () =>
    run(async () => {
      if (phone.call) hangup();
      await finish('DONE');
      setEndOpen(false);
    }, t('cc.ended'));

  // [접수 등록] → 간편접수 창(접수 화면과 같은 창)에 입력한 값을 넘겨 한 번 더 확인 후 등록
  const leadForm = useLeadCreateForm({ withCallFields: true });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formInitial = (): Record<string, string> => {
    const addr: Record<string, string> = {};
    for (const [k, val] of Object.entries(v))
      if (/^(from|to)(Zipcode|Addr|AddrDetail|Sido|Sigungu|Lat|Lng)$/.test(k) && val) addr[k] = val;
    return {
      ...leadForm.defaults,
      customerName: v.customerName.trim(),
      customerPhone: call.phone,
      source: 'PHONE',
      moveKind: v.moveKind,
      serviceLine: v.serviceLine,
      orgUnitId: v.orgUnitId || defaultOrg,
      ...(v.partnerId && { partnerId: v.partnerId }),
      ...(v.moveDate && { moveDate: v.moveDate }),
      ...(v.request.trim() && { customerRequest: v.request.trim() }),
      // 고른 제휴·전속 상품의 혜택·조건을 접수에 함께 남긴다
      ...(partner?.benefit?.trim() && { productNote: partner.benefit.trim() }),
      ...addr,
    };
  };
  const openConfirm = () => {
    if (v.moveKind !== 'GENERAL' && !v.partnerId) {
      toast({
        type: 'error',
        title: t('cc.pickProduct', {
          v0: v.moveKind === 'AFFILIATE' ? t('cc.kind.AFFILIATE') : t('cc.kind.EXCLUSIVE'),
        }),
      });
      return;
    }
    setConfirmOpen(true);
  };
  /** 확인 창에서 [저장] — 접수를 만들고 콜을 끝낸다(실패하면 창이 열린 채로 남는다) */
  const submitLead = async (values: Record<string, unknown>) => {
    try {
      const lead = await api<{ id: string; leadNo?: string }>('/leads', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          // 같은 번호의 기존 고객이면 그 고객에 잇는다
          ...(call.customerId && { customerId: call.customerId }),
        }),
      });
      const request =
        typeof values.customerRequest === 'string' ? values.customerRequest : v.request;
      // 콜은 끝내지 않고 접수만 잇는다 — 상담 화면에 그대로 남고, [상담 종료]로 마친다
      await api(`/cs-calls/${call.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          leadId: lead.id,
          request: request?.trim() || null,
          memo: v.memo?.trim() || null,
        }),
      }).catch(() =>
        toast({
          type: 'warning',
          title: t('cc.leadNotLinked'),
        }),
      );
      toast({
        type: 'success',
        title: t('cc.leadCreated', { v0: lead.leadNo ? ` (${lead.leadNo})` : '' }),
      });
      setConfirmOpen(false);
      await onSaved?.();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.leadFailed') });
      throw e;
    }
  };

  return (
    <div className={styles.intake}>
      {/* 머리 — 왼쪽 들어온 번호·돌려준 곳(끝난 콜이면 상태·상담원·시각), 오른쪽 [전화하기] [문자] [상담 종료] [접수 등록] */}
      <div className={styles.intakeHead}>
        <span className={styles.channel}>{call.channel ?? t('cc.mainNumber')}</span>
        {call.transferTo && (
          <span className={styles.transferTag} title={t('cc.transferredFrom')}>
            <PhoneForwarded size={12} /> {call.transferTo}
          </span>
        )}
        {readOnly && (
          <>
            <span className={styles.statePill}>{CALL_STATUS[call.status] ?? call.status}</span>
            <span className={styles.headInfo}>
              {readOnly.agentName ?? '-'} · {fmtDateTime(startedAt)} {t('cc.talkSep')}{' '}
              {durText(readOnly.durationSec)}
            </span>
          </>
        )}
        {readOnly ? (
          <span className={styles.headActions}>
            {call.leadId ? (
              <button
                type="button"
                className={styles.leadDone}
                onClick={() => navigate(`/leads/${call.leadId}`)}
                title={t('cc.openLead')}
              >
                {t('cc.leadDone')}
                {call.leadNo ? ` · ${call.leadNo}` : ''}
              </button>
            ) : (
              <span className={styles.noLead}>{t('cc.noLead')}</span>
            )}
            {can('LEAD.CREATE') && !phone.call && (
              <Button variant="outline" size="sm" onClick={() => setRecallOpen(true)}>
                <Phone size={14} /> {t('cc.call')}
              </Button>
            )}
            {call.id && (
              <CallRecordButton
                callId={call.id}
                callNo={call.callNo}
                hasRecording={readOnly.hasRecording}
                hasTranscript={!!readOnly.hasTranscript}
              />
            )}
            {can('LEAD.CREATE') && (
              <Button variant="outline" size="sm" onClick={() => setSmsOpen(true)}>
                <MessageSquare size={14} /> {t('cc.sms')}
              </Button>
            )}
          </span>
        ) : (
          <span className={styles.headActions}>
            {call.status === 'CALLBACK' && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                title={t('cc.requeueTip')}
                onClick={() => void run(() => finish('RETRY'), t('cc.requeued'))}
              >
                <RotateCcw size={14} /> {t('cc.requeue')}
              </Button>
            )}
            {pending && <span className={styles.muted}>{t('cc.connecting')}</span>}
            {/* 전화가 끊겨 있으면 — 다시 걸기(통화 중 표시·음소거·끊기는 화면 아래 통화 막대에) */}
            {!pending && !phone.call && phone.status === 'ready' && (
              <Button variant="outline" size="sm" onClick={() => setDialOpen(true)}>
                <Phone size={14} /> {t('cc.call')}
              </Button>
            )}
            {!pending && (
              <Button variant="outline" size="sm" onClick={() => setSmsOpen(true)}>
                <MessageSquare size={14} /> {t('cc.sms')}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              className={styles.completeBtn}
              disabled={busy || pending}
              onClick={() => setEndOpen(true)}
            >
              {t('call.complete')}
            </Button>
            {call.leadId ? (
              <button
                type="button"
                className={styles.leadDone}
                onClick={() => navigate(`/leads/${call.leadId}`)}
                title={t('cc.openLead')}
              >
                {t('cc.leadDone')}
                {call.leadNo ? ` · ${call.leadNo}` : ''}
              </button>
            ) : (
              can('LEAD.CREATE') && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || pending}
                  onClick={openConfirm}
                >
                  {t('cc.registerLead')}
                </Button>
              )
            )}
          </span>
        )}
      </div>

      {stale && !readOnly && (
        <div className={styles.staleWarn} role="alert">
          <b>{t('cc.unfinishedWarn')}</b>
          <span>
            {elapsed(talking)} {t('cc.oldCall1')}
            {t('cc.oldCall2')}
          </span>
        </div>
      )}

      {/* 접수 입력 — 읽기 모드면 통째로 잠근다 */}
      <fieldset className={`${styles.form} ${styles.formSet}`} disabled={!!readOnly}>
        <label className={styles.field}>
          <span>
            {t('cc.customerName')} <i>*</i>
          </span>
          <Input
            value={v.customerName}
            placeholder="홍길동"
            onChange={(e) => setField('customerName', e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>{t('cc.phone')}</span>
          {/* 콜의 번호 — 고칠 수 없다 */}
          <Input value={formatPhone(call.phone)} readOnly className={styles.readOnlyInput} />
        </label>
        {/* 상품 종류 — 일반이면 일반 상품, 제휴·전속이면 그 업체(업체 자체가 상품) */}
        <div className={styles.field}>
          <span>
            {t('cc.productKind')} <i>*</i>
          </span>
          <div className={styles.kindRow}>
            <SegmentedControl
              value={v.moveKind}
              onChange={(x) => {
                dirty.current = true;
                setV((cur) => ({ ...cur, moveKind: x, partnerId: '', serviceLine: 'MOVING' }));
              }}
              options={[
                { value: 'GENERAL', label: t('cc.kind.GENERAL') },
                { value: 'AFFILIATE', label: t('cc.kind.AFFILIATE') },
                { value: 'EXCLUSIVE', label: t('cc.kind.EXCLUSIVE') },
              ]}
            />
            <div className={styles.kindPick}>
              {v.moveKind === 'GENERAL' ? (
                <Select
                  value={v.serviceLine}
                  onValueChange={(x) => setField('serviceLine', x)}
                  options={SERVICE_LINES}
                  aria-label={t('cc.generalProduct')}
                />
              ) : (
                <Combobox
                  key={v.moveKind}
                  value={v.partnerId || null}
                  onChange={(x) => setField('partnerId', x ?? '')}
                  options={partners
                    .filter((p) => p.type === v.moveKind)
                    .map((p) => ({ value: p.id, label: p.name }))}
                  placeholder={t('cc.pickProductOf', {
                    v0:
                      v.moveKind === 'AFFILIATE' ? t('cc.kind.AFFILIATE') : t('cc.kind.EXCLUSIVE'),
                  })}
                  searchPlaceholder={t('cc.partnerSearch')}
                  emptyMessage={t('cc.noProduct')}
                  clearable
                />
              )}
            </div>
          </div>
        </div>
        <label className={styles.field}>
          <span>{t('cc.serviceDate')}</span>
          <DatePicker value={v.moveDate} onChange={(v) => setField('moveDate', v)} />
        </label>
        {/* 주소 — 출발지 왼쪽, 도착지 오른쪽 */}
        <div className={styles.field}>
          <AddressField addrPrefix="from" label={t('cc.origin')} values={v} setField={setField} />
        </div>
        <div className={styles.field}>
          <AddressField
            addrPrefix="to"
            label={t('cc.destination')}
            values={v}
            setField={setField}
          />
        </div>
        {/* 왼쪽 고객 요청사항(접수에도 남음) · 오른쪽 상담 메모(콜에만, 머리에 프리셋 칩) — 남는 높이를 다 쓴다 */}
        <div className={`${styles.full} ${styles.memoRow}`}>
          <label className={styles.field}>
            <span>{t('cc.customerRequest')}</span>
            <Textarea
              className={styles.memoBox}
              value={v.request}
              placeholder={t('cc.requestPh')}
              onChange={(e) => setField('request', e.target.value)}
            />
          </label>
          <div className={styles.field}>
            <span className={styles.memoHead}>
              {readOnly ? (
                <label htmlFor="cs-memo">{t('cc.memo')}</label>
              ) : (
                <MemoPresetPicker current={v.memo} onApply={(b) => setField('memo', b)} />
              )}
            </span>
            <Textarea
              id="cs-memo"
              className={styles.memoBox}
              value={v.memo}
              aria-label={t('cc.memo')}
              placeholder={t('cc.memoPh')}
              onChange={(e) => setField('memo', e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <FormModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('cc.registerLeadTitle')}
        size="md"
        fields={leadForm.fields}
        initialValues={confirmOpen ? formInitial() : undefined}
        onSubmit={submitLead}
      />
      <SmsModal
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        phone={call.phone}
        customerName={v.customerName || call.customerName}
        leadNo={call.leadNo}
        moveDate={v.moveDate || readOnly?.lead?.moveDate}
        callId={call.id || undefined}
      />
      {/* 통화 중 화면의 [전화하기] — 바로 걸지 않고 한 번 묻는다 */}
      <ConfirmModal
        open={dialOpen}
        title={t('call.dialTitle')}
        confirmLabel={t('call.dialConfirm')}
        onClose={() => setDialOpen(false)}
        onConfirm={() => {
          setDialOpen(false);
          dial(call.phone, call.id);
        }}
        message={t('call.dialBody', {
          who: `${formatPhone(call.phone)}${call.customerName ? ` (${call.customerName})` : ''}`,
        })}
      />
      <ConfirmModal
        open={recallOpen}
        title={t('cc.callCustomer')}
        confirmLabel={phone.status === 'ready' ? t('cc.dialBtn') : t('cc.enableAndDial')}
        busy={busy}
        onClose={() => setRecallOpen(false)}
        onConfirm={() => void recall()}
        message={
          <>
            <b>{formatPhone(call.phone)}</b>
            {call.customerName ? ` (${call.customerName})` : ''}
            {t('cc.callQ')}
          </>
        }
      />
      <ConfirmModal
        open={endOpen}
        title={t('call.complete')}
        confirmLabel={t('call.complete')}
        busy={busy}
        onClose={() => setEndOpen(false)}
        onConfirm={() => void endConsult()}
        message={
          (call.leadId
            ? t('cc.endWithLead', { v0: call.leadNo ?? t('cc.registered') })
            : t('cc.endNoLead')) + (phone.call ? t('cc.endHangup') : '')
        }
      />
    </div>
  );
}
