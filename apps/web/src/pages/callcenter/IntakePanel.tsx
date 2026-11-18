import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Headphones,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  UserRound,
} from 'lucide-react';
import { Combobox } from '@sunghoon_lee/akron-ui';
import {
  LEAD_STATUS_LABEL,
  PARTNER_TYPE_LABEL,
  type LeadStatus,
  type PartnerType,
} from '@tongin/shared';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError, cachedApi } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { SERVICE_LINES } from '../../lib/leadCodes';
import { useOrgScope } from '../../lib/useOrgScope';
import { dial, hangup, usePhone } from '../../lib/softphone';
import {
  Badge,
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
import { Recording } from './Recording';

export interface IntakeCall {
  id: string;
  phone: string;
  status: string;
  channel: string | null;
  memo: string | null;
  request: string | null;
  customerId: string | null;
  customerName: string | null;
  receivedAt: string;
  assignedAt: string | null;
  /** 상담 중에 등록한 접수 */
  leadId?: string | null;
  leadNo?: string | null;
}
/** 끝난 콜을 읽기 모드로 — 통화 중 상담 화면과 같은 모양, 입력은 잠금 */
export interface ReadOnlyInfo {
  agentName: string | null;
  durationSec: number | null;
  hasRecording: boolean;
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
  DONE: '상담 끝',
  CANCELED: '취소',
  OUTCALL: '아웃콜 대기',
  ASSIGNED: '상담 중',
  CALLBACK: '콜백 중',
};
const durText = (s: number | null) =>
  s == null
    ? '-'
    : s < 60
      ? `${s}초`
      : `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
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

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
/** 배정 후 지난 시간 — '방금' · '12분' · '2시간 19분' */
const elapsed = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 1 ? '방금' : m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
};
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
};

/**
 * 상담 화면(내 콜) — 통화하면서 상담 콘솔 안에서 바로 접수한다(화면 이동 없음).
 * 오른쪽 위 [상담 종료](접수 없이 끝) · [접수 등록](간편접수 창에서 확인 후 등록 → 콜 종료).
 * 전화번호는 콜에서, 고객명은 같은 번호로 전화한 적 있는 고객이면 자동으로 채운다.
 */
export function IntakePanel({
  call,
  recentLeads,
  pending = false,
  onDone,
  onBack,
  onSaved,
  readOnly,
}: {
  call: IntakeCall;
  recentLeads: RecentLead[];
  /** 서버가 콜을 만들기 전(받기 직후 잠깐) — 입력은 되고 접수 등록·상담 종료만 잠시 막는다 */
  pending?: boolean;
  onDone: () => Promise<void> | void;
  /** 목록으로 — 상담을 마무리하지 않고 나가도 콜은 그대로 남는다 */
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
      memo: call.request ?? readOnly?.lead?.customerRequest ?? call.memo ?? '',
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
  const [v, setV] = useState<Record<string, string>>(initial);
  useEffect(() => setV(initial), [initial]);
  // 기존 고객 이름이 나중에 붙으면(첫 응답엔 없을 수 있음) 비어 있을 때만 채운다
  useEffect(() => {
    if (call.customerName)
      setV((x) => (x.customerName ? x : { ...x, customerName: call.customerName! }));
  }, [call.customerName]);
  const setField = (name: string, value: string) => setV((x) => ({ ...x, [name]: value }));

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
  const exclusive = partner?.type === 'EXCLUSIVE';
  const startedAt = call.assignedAt ?? call.receivedAt;
  // PC 전화로 통화 중일 때만 '통화시간'(실제 통화). 아니면 '배정 후' 지난 시간
  const onPcCall = phone.call?.state === 'active' && !!phone.call.startedAt;
  const talking = onPcCall
    ? Date.now() - phone.call!.startedAt!
    : Date.now() - Date.parse(startedAt);
  // 30분 넘게 끝나지 않은 콜 — 이 콜이 열려 있으면 새 전화가 배정되지 않는다
  const stale = !onPcCall && talking > 30 * 60_000;

  const finish = (result: 'DONE' | 'RETRY', leadId?: string, memo = v.memo) =>
    api(`/cs-calls/${call.id}/finish`, {
      method: 'POST',
      body: JSON.stringify({
        result,
        ...(leadId && { leadId }),
        request: memo?.trim() || undefined,
      }),
    });
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast({ type: 'success', title: ok });
      await onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '처리하지 못했습니다' });
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
    }, '상담을 종료했습니다');

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
      serviceLine: v.serviceLine,
      orgUnitId: v.orgUnitId || defaultOrg,
      ...(v.partnerId && { partnerId: v.partnerId }),
      ...(v.moveDate && { moveDate: v.moveDate }),
      ...(v.memo.trim() && { customerRequest: v.memo.trim() }),
      ...addr,
    };
  };
  const openConfirm = () => {
    if (v.moveKind !== 'GENERAL' && !v.partnerId) {
      toast({
        type: 'error',
        title: `${v.moveKind === 'AFFILIATE' ? '제휴' : '전속'} 상품을 골라 주세요.`,
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
      const memo = typeof values.customerRequest === 'string' ? values.customerRequest : v.memo;
      // 콜은 끝내지 않고 접수만 잇는다 — 상담 화면에 그대로 남고, [상담 종료]로 마친다
      await api(`/cs-calls/${call.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ leadId: lead.id, request: memo?.trim() || null }),
      }).catch(() =>
        toast({
          type: 'warning',
          title: '접수는 등록했지만 콜에 잇지 못했습니다 — 콜 목록에서 확인해 주세요',
        }),
      );
      toast({
        type: 'success',
        title: `접수를 등록했습니다${lead.leadNo ? ` (${lead.leadNo})` : ''} — 상담을 마치면 [상담 종료]를 눌러 주세요`,
      });
      setConfirmOpen(false);
      await onSaved?.();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '접수하지 못했습니다' });
      throw e;
    }
  };

  return (
    <div className={styles.intake}>
      {/* 머리 — 제목·콜 종류 · 오른쪽 위 [상담 종료] [접수 등록] */}
      <div className={styles.intakeHead}>
        {onBack && (
          <button type="button" className={styles.backBtn} onClick={onBack} aria-label="목록으로">
            <ArrowLeft size={16} />
          </button>
        )}
        <h3 className={styles.cardTitle}>
          <Headphones size={15} />{' '}
          {call.id ? `콜 ${call.id.slice(0, 8).toUpperCase()}` : '콜 만드는 중…'}
        </h3>
        <Badge variant="subtle" color={call.status === 'CALLBACK' ? 'warning' : 'success'}>
          {call.status === 'CALLBACK' ? (
            <>
              <PhoneOutgoing size={12} /> 콜백
            </>
          ) : (
            <>
              <PhoneIncoming size={12} /> 받은 콜
            </>
          )}
        </Badge>
        <span className={styles.muted}>{call.channel ?? '대표번호'}</span>
        {readOnly ? (
          <span className={styles.headActions}>
            <span className={styles.muted}>{CALL_STATUS[call.status] ?? call.status}</span>
            {call.leadId ? (
              <button
                type="button"
                className={styles.leadDone}
                onClick={() => navigate(`/leads/${call.leadId}`)}
                title="등록한 접수 열기"
              >
                접수 완료{call.leadNo ? ` · ${call.leadNo}` : ''}
              </button>
            ) : (
              <span className={styles.noLead}>접수 없음</span>
            )}
          </span>
        ) : (
          <span className={styles.headActions}>
            {call.status === 'CALLBACK' && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => finish('RETRY'), '아웃콜로 돌렸습니다')}
              >
                안 받음 — 다시 아웃콜로
              </Button>
            )}
            {pending && <span className={styles.muted}>연결 중…</span>}
            {/* 전화가 끊겨 있으면 — 다시 걸기(통화 중 표시·음소거·끊기는 화면 아래 통화 막대에) */}
            {!pending && !phone.call && phone.status === 'ready' && (
              <Button variant="outline" size="sm" onClick={() => dial(call.phone, call.id)}>
                <Phone size={14} /> 전화하기
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy || pending}
              onClick={() => setEndOpen(true)}
            >
              상담 종료
            </Button>
            {call.leadId ? (
              <button
                type="button"
                className={styles.leadDone}
                onClick={() => navigate(`/leads/${call.leadId}`)}
                title="등록한 접수 열기"
              >
                접수 완료{call.leadNo ? ` · ${call.leadNo}` : ''}
              </button>
            ) : (
              can('LEAD.CREATE') && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || pending}
                  onClick={openConfirm}
                >
                  접수 등록
                </Button>
              )
            )}
          </span>
        )}
      </div>

      {stale && !readOnly && (
        <div className={styles.staleWarn} role="alert">
          <b>끝나지 않은 콜이 있어 새 전화가 배정되지 않습니다.</b>
          <span>
            {elapsed(talking)} 전에 배정된 콜입니다. 접수할 콜이면 [접수 등록]을, 아니면 [상담
            종료]를 눌러 마무리해 주세요.
          </span>
        </div>
      )}

      {/* 통화 정보 — 자동 */}
      <dl className={styles.callInfo}>
        <div>
          <dt>전화번호</dt>
          <dd className={styles.phone}>{formatPhone(call.phone)}</dd>
        </div>
        <div>
          <dt>상담원</dt>
          <dd>{readOnly ? (readOnly.agentName ?? '-') : (user?.employeeName ?? '-')}</dd>
        </div>
        <div>
          <dt>통화시각</dt>
          <dd>
            {readOnly
              ? new Date(startedAt).toLocaleString('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : hhmm(startedAt)}
          </dd>
        </div>
        <div>
          <dt>{readOnly || onPcCall ? '통화시간' : '배정 후'}</dt>
          <dd>
            {readOnly ? durText(readOnly.durationSec) : onPcCall ? mmss(talking) : elapsed(talking)}
          </dd>
        </div>
      </dl>
      {readOnly && call.id && <Recording callId={call.id} available={readOnly.hasRecording} />}
      {call.customerId && (
        <div className={styles.customer}>
          <UserRound size={14} />
          <span>
            기존 고객 <b>{call.customerName}</b> — 이전 접수 {recentLeads.length}건
          </span>
          {recentLeads.slice(0, 3).map((l) => (
            <button
              key={l.id}
              type="button"
              className={styles.leadChip}
              onClick={() => navigate(`/leads/${l.id}`)}
              title={`${l.orgUnit?.name ?? ''} · 이사 ${l.moveDate ?? '미정'}`}
            >
              {l.leadNo} · {LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}
            </button>
          ))}
        </div>
      )}

      {/* 접수 입력 — 읽기 모드면 통째로 잠근다 */}
      <fieldset className={`${styles.form} ${styles.formSet}`} disabled={!!readOnly}>
        <label className={styles.field}>
          <span>
            고객명 <i>*</i>
          </span>
          <Input
            value={v.customerName}
            placeholder="홍길동"
            onChange={(e) => setField('customerName', e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>이사 희망일</span>
          <Input
            type="date"
            value={v.moveDate}
            onChange={(e) => setField('moveDate', e.target.value)}
          />
        </label>
        {/* 주소 — 출발지 왼쪽, 도착지 오른쪽 */}
        <div className={styles.field}>
          <AddressField addrPrefix="from" label="출발지" values={v} setField={setField} />
        </div>
        <div className={styles.field}>
          <AddressField addrPrefix="to" label="도착지" values={v} setField={setField} />
        </div>
        {/* 상품 종류 — 일반이면 일반 상품, 제휴·전속이면 그 업체(업체 자체가 상품) · 같은 줄에 담당 지점 */}
        <div className={styles.field}>
          <span>
            상품 종류 <i>*</i>
          </span>
          <div className={styles.kindRow}>
            <SegmentedControl
              value={v.moveKind}
              onChange={(x) =>
                setV((cur) => ({ ...cur, moveKind: x, partnerId: '', serviceLine: 'MOVING' }))
              }
              options={[
                { value: 'GENERAL', label: '일반' },
                { value: 'AFFILIATE', label: '제휴' },
                { value: 'EXCLUSIVE', label: '전속' },
              ]}
            />
            <div className={styles.kindPick}>
              {v.moveKind === 'GENERAL' ? (
                <Select
                  value={v.serviceLine}
                  onValueChange={(x) => setField('serviceLine', x)}
                  options={SERVICE_LINES}
                  aria-label="일반 상품"
                />
              ) : (
                <Combobox
                  key={v.moveKind}
                  value={v.partnerId || null}
                  onChange={(x) => setField('partnerId', x ?? '')}
                  options={partners
                    .filter((p) => p.type === v.moveKind)
                    .map((p) => ({ value: p.id, label: p.name }))}
                  placeholder={`${v.moveKind === 'AFFILIATE' ? '제휴' : '전속'} 상품 고르기`}
                  searchPlaceholder="업체명으로 찾기"
                  emptyMessage="찾는 상품이 없습니다"
                  clearable
                />
              )}
            </div>
          </div>
        </div>
        <label className={styles.field}>
          <span>담당 지점</span>
          <Select
            value={v.orgUnitId || defaultOrg}
            onValueChange={(x) => setField('orgUnitId', x)}
            options={orgs}
            placeholder="본사"
          />
        </label>
        {partner && (
          <div className={`${styles.full} ${styles.partnerNote}`}>
            <b>
              [{PARTNER_TYPE_LABEL[partner.type as PartnerType] ?? partner.type}] {partner.name}
            </b>
            {partner.benefit && <p>{partner.benefit}</p>}
            <p className={styles.muted}>
              {exclusive
                ? '전속 이사는 본사에서만 진행합니다(지점·가맹점은 고를 수 없습니다).'
                : '제휴 이사는 가맹점까지 배정할 수 있습니다.'}
            </p>
          </div>
        )}
        <label className={`${styles.field} ${styles.full}`}>
          <span>메모</span>
          <Textarea
            rows={3}
            value={v.memo}
            placeholder="고객 요청사항과 상담 내용 — 예: 피아노 있음, 오전 작업 희망, 견적 비교 중"
            onChange={(e) => setField('memo', e.target.value)}
          />
        </label>
      </fieldset>

      <FormModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="접수 등록 — 상담 콜"
        size="md"
        fields={leadForm.fields}
        initialValues={confirmOpen ? formInitial() : undefined}
        onSubmit={submitLead}
      />
      <ConfirmModal
        open={endOpen}
        title="상담 종료"
        confirmLabel="상담 종료"
        busy={busy}
        onClose={() => setEndOpen(false)}
        onConfirm={() => void endConsult()}
      >
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          {call.leadId
            ? `접수(${call.leadNo ?? '등록됨'})가 연결된 이 상담을 끝낼까요?`
            : '접수 없이 이 상담을 끝낼까요?'}
          {phone.call ? ' 지금 통화도 함께 끊깁니다.' : ''}
          <br />
          <span className={styles.muted}>
            적어 둔 메모는 콜 기록에 남습니다. 끝낸 뒤에는 자리 비움 상태이니, 준비가 되면 [상담
            가능]을 눌러 주세요.
          </span>
        </p>
      </ConfirmModal>
    </div>
  );
}
