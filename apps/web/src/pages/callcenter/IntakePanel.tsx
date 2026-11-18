import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, PhoneIncoming, PhoneOff, PhoneOutgoing, UserRound } from 'lucide-react';
import { Combobox } from '@sunghoon_lee/akron-ui';
import {
  LEAD_STATUS_LABEL,
  PARTNER_TYPE_LABEL,
  type LeadStatus,
  type PartnerType,
} from '@tongin/shared';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { SERVICE_LINES } from '../../lib/leadCodes';
import { useOrgScope } from '../../lib/useOrgScope';
import { dial, hangup, toggleMute, usePhone } from '../../lib/softphone';
import {
  Badge,
  Button,
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

export interface IntakeCall {
  id: string;
  phone: string;
  status: 'ASSIGNED' | 'OUTCALL' | 'CALLBACK';
  channel: string | null;
  memo: string | null;
  request: string | null;
  customerId: string | null;
  customerName: string | null;
  receivedAt: string;
  assignedAt: string | null;
}
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
 * 인입콜 접수 패널 — 통화하면서 상담 콘솔 안에서 바로 접수한다(화면 이동 없음).
 * 전화번호는 콜에서, 고객명은 같은 번호로 전화한 적 있는 고객이면 자동으로 채운다.
 * [접수 등록] → 접수를 만들고 콜을 끝낸다(고객 요청사항은 콜과 접수에 모두 남긴다).
 */
export function IntakePanel({
  call,
  recentLeads,
  onDone,
}: {
  call: IntakeCall;
  recentLeads: RecentLead[];
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const phone = usePhone();
  const { options: orgs, ownOrgId } = useOrgScope();
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const initial = useMemo(
    () => ({
      customerName: call.customerName ?? '',
      serviceLine: 'MOVING',
      orgUnitId: ownOrgId || user?.employeeOrgUnitId || '',
      moveKind: 'GENERAL',
      partnerId: '',
      moveDate: '',
      request: call.request ?? '',
      memo: call.memo ?? '',
    }),
    // 콜이 바뀔 때만 새로 채운다(입력 중에 3초마다 새로 읽어도 지우지 않게)
    [call.id],
  );
  const [v, setV] = useState<Record<string, string>>(initial);
  useEffect(() => setV(initial), [initial]);
  // 기존 고객 이름이 나중에 붙으면(첫 응답엔 없을 수 있음) 비어 있을 때만 채운다
  useEffect(() => {
    if (call.customerName)
      setV((x) => (x.customerName ? x : { ...x, customerName: call.customerName! }));
  }, [call.customerName]);
  const setField = (name: string, value: string) => setV((x) => ({ ...x, [name]: value }));

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

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '처리하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  const finish = (result: 'DONE' | 'RETRY', leadId?: string) =>
    api(`/cs-calls/${call.id}/finish`, {
      method: 'POST',
      body: JSON.stringify({
        result,
        ...(leadId && { leadId }),
        memo: v.memo || undefined,
        request: v.request || undefined,
      }),
    });

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
      ...(v.orgUnitId && { orgUnitId: v.orgUnitId }),
      ...(v.partnerId && { partnerId: v.partnerId }),
      ...(v.moveDate && { moveDate: v.moveDate }),
      ...(v.request.trim() && { customerRequest: v.request.trim() }),
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
      const req = typeof values.customerRequest === 'string' ? values.customerRequest : v.request;
      await api(`/cs-calls/${call.id}/finish`, {
        method: 'POST',
        body: JSON.stringify({
          result: 'DONE',
          leadId: lead.id,
          memo: v.memo || undefined,
          request: req?.trim() || undefined,
        }),
      }).catch(() =>
        toast({
          type: 'warning',
          title: '접수는 등록했지만 콜을 끝내지 못했습니다 — 콜 목록에서 확인해 주세요',
        }),
      );
      toast({
        type: 'success',
        title: `접수를 등록했습니다${lead.leadNo ? ` (${lead.leadNo})` : ''}`,
      });
      setConfirmOpen(false);
      await onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '접수하지 못했습니다' });
      throw e;
    }
  };

  return (
    <div className={styles.intake}>
      <div className={styles.callHead}>
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
      </div>

      {/* 통화 상태 — 통화 중이면 계속 '통화 중'이 보이게, 음소거·통화 종료 */}
      {phone.call?.state === 'active' ? (
        <div className={`${styles.liveBar} ${styles.liveOn}`} role="status" aria-live="polite">
          <span className={styles.liveDot} aria-hidden />
          <b>통화 중</b>
          <span className={styles.liveTime}>{mmss(talking)}</span>
          {phone.call.muted && (
            <span className={styles.liveMuted}>음소거 — 고객에게 내 소리가 안 들립니다</span>
          )}
          <span className={styles.liveActions}>
            <button
              type="button"
              className={`${styles.liveBtn} ${phone.call.muted ? styles.liveBtnOn : ''}`}
              onClick={toggleMute}
              aria-pressed={phone.call.muted}
            >
              {phone.call.muted ? <MicOff size={15} /> : <Mic size={15} />}
              {phone.call.muted ? '음소거 해제' : '음소거'}
            </button>
            <button type="button" className={styles.liveHang} onClick={hangup}>
              <PhoneOff size={15} /> 통화 종료
            </button>
          </span>
        </div>
      ) : phone.call ? (
        <div className={styles.liveBar} role="status">
          <span className={styles.liveDot} aria-hidden />
          <b>{phone.call.state === 'ringing' ? '전화가 울리는 중' : '연결 중…'}</b>
          <span className={styles.liveActions}>
            <button type="button" className={styles.liveHang} onClick={hangup}>
              <PhoneOff size={15} /> 끊기
            </button>
          </span>
        </div>
      ) : (
        <div className={`${styles.liveBar} ${styles.liveOff}`}>
          <b>통화 연결 없음</b>
          <span className={styles.muted}>접수를 마무리하거나 다시 걸어 주세요</span>
          {phone.status === 'ready' && (
            <span className={styles.liveActions}>
              <Button variant="outline" size="sm" onClick={() => dial(call.phone, call.id)}>
                <PhoneOutgoing size={14} /> PC로 걸기
              </Button>
            </span>
          )}
        </div>
      )}

      {stale && (
        <div className={styles.staleWarn} role="alert">
          <b>끝나지 않은 콜이 있어 새 전화가 배정되지 않습니다.</b>
          <span>
            {elapsed(talking)} 전에 배정된 콜입니다. 접수할 콜이면 [접수 등록]을, 접수할 일이 없는
            콜(문의·잘못 건 전화)이면 여기서 마쳐 주세요.
          </span>
          <span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => finish('DONE').then(() => undefined))}
            >
              접수 없이 이 콜 마치기
            </Button>
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
          <dd>{user?.employeeName ?? '-'}</dd>
        </div>
        <div>
          <dt>통화시각</dt>
          <dd>{hhmm(startedAt)}</dd>
        </div>
        <div>
          <dt>{onPcCall ? '통화시간' : '배정 후'}</dt>
          <dd>{onPcCall ? mmss(talking) : elapsed(talking)}</dd>
        </div>
      </dl>
      <div className={styles.customer}>
        <UserRound size={14} />
        {call.customerId ? (
          <span>
            기존 고객 <b>{call.customerName}</b> — 이전 접수 {recentLeads.length}건
          </span>
        ) : (
          <span className={styles.muted}>처음 전화한 번호 — 고객명을 받아 적어 주세요</span>
        )}
      </div>
      {recentLeads.length > 0 && (
        <ul className={styles.leads}>
          {recentLeads.map((l) => (
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

      {/* 접수 입력 */}
      <div className={styles.form}>
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
        <div className={styles.full}>
          <AddressField addrPrefix="from" label="출발지" values={v} setField={setField} />
        </div>
        <div className={styles.full}>
          <AddressField addrPrefix="to" label="도착지" values={v} setField={setField} />
        </div>
        {/* 상품 종류 — 일반이면 일반 상품, 제휴·전속이면 그 업체(업체 자체가 상품)를 고른다 */}
        <div className={`${styles.field} ${styles.full}`}>
          <span>
            상품 종류 <i>*</i>
          </span>
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
        {partner && (
          <div className={`${styles.full} ${styles.partnerNote}`}>
            <b>
              [{PARTNER_TYPE_LABEL[partner.type as PartnerType] ?? partner.type}] {partner.name}
            </b>
            {partner.benefit && <p>{partner.benefit}</p>}
            <p className={styles.muted}>
              {exclusive
                ? '전속 이사는 본사에서만 진행합니다 — 담당을 본사 부서로 두세요(지점·가맹점은 고를 수 없습니다).'
                : '제휴 이사는 가맹점까지 배정할 수 있습니다.'}
            </p>
          </div>
        )}
        <label className={styles.field}>
          <span>
            담당 지점 <i>*</i>
          </span>
          <Select
            value={v.orgUnitId}
            onValueChange={(x) => setField('orgUnitId', x)}
            options={orgs}
            placeholder="담당 지점"
          />
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>고객 요청사항</span>
          <Textarea
            rows={2}
            value={v.request}
            placeholder="예: 피아노 있음, 오전 작업 희망, 에어컨 이전 설치"
            onChange={(e) => setField('request', e.target.value)}
          />
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>상담 메모</span>
          <Textarea
            rows={2}
            value={v.memo}
            placeholder="상담원만 보는 메모 — 예: 견적 비교 중, 다음 주 다시 연락"
            onChange={(e) => setField('memo', e.target.value)}
          />
        </label>
      </div>

      <div className={styles.intakeFooter}>
        {call.status === 'CALLBACK' && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => finish('RETRY').then(() => undefined))}
          >
            안 받음 — 다시 아웃콜로
          </Button>
        )}
        {can('LEAD.CREATE') && (
          <Button variant="primary" disabled={busy} onClick={openConfirm}>
            접수 등록
          </Button>
        )}
      </div>

      <FormModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="접수 등록 — 상담 콜"
        size="md"
        fields={leadForm.fields}
        initialValues={confirmOpen ? formInitial() : undefined}
        onSubmit={submitLead}
      />
    </div>
  );
}
