import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneIncoming, PhoneOutgoing, UserRound } from 'lucide-react';
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
import { dial, usePhone } from '../../lib/softphone';
import { Badge, Button, Input, Select, Textarea, useToast } from '../../components/ui';
import { AddressField } from '../../components/ui/AddressField';
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
  // PC 전화로 통화 중이면 실제 통화 시간, 아니면 배분된 뒤 지난 시간
  const talking =
    phone.call?.state === 'active' && phone.call.startedAt
      ? Date.now() - phone.call.startedAt
      : Date.now() - Date.parse(startedAt);

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

  const register = () =>
    run(async () => {
      if (!v.customerName.trim()) throw new ApiError(400, '고객명을 입력해 주세요.', 'VALIDATION');
      if (!v.orgUnitId) throw new ApiError(400, '담당 지점을 골라 주세요.', 'VALIDATION');
      const addr: Record<string, string> = {};
      for (const [k, val] of Object.entries(v))
        if (/^(from|to)(Zipcode|Addr|AddrDetail|Sido|Sigungu|Lat|Lng)$/.test(k) && val)
          addr[k] = val;
      const lead = await api<{ id: string; leadNo?: string }>('/leads', {
        method: 'POST',
        body: JSON.stringify({
          customerName: v.customerName.trim(),
          ...(call.customerId && { customerId: call.customerId }),
          customerPhone: call.phone,
          orgUnitId: v.orgUnitId,
          ...(user?.employeeId && { ownerEmpId: user.employeeId }),
          source: 'PHONE',
          serviceLine: v.serviceLine,
          ...(v.partnerId && { partnerId: v.partnerId }),
          ...(v.moveDate && { moveDate: v.moveDate }),
          ...(v.request.trim() && { customerRequest: v.request.trim() }),
          ...addr,
        }),
      });
      await finish('DONE', lead.id).catch(() =>
        toast({
          type: 'warning',
          title: '접수는 등록했지만 콜을 끝내지 못했습니다 — 다시 눌러 주세요',
        }),
      );
      toast({
        type: 'success',
        title: `접수를 등록했습니다${lead.leadNo ? ` (${lead.leadNo})` : ''}`,
      });
    });

  return (
    <div className={styles.intake}>
      <div className={styles.callHead}>
        <Badge variant="subtle" color={call.status === 'CALLBACK' ? 'warning' : 'success'}>
          {call.status === 'CALLBACK' ? (
            <>
              <PhoneOutgoing size={12} /> 콜백 중
            </>
          ) : (
            <>
              <PhoneIncoming size={12} /> 받은 콜
            </>
          )}
        </Badge>
        <span className={styles.muted}>{call.channel ?? '대표번호'}</span>
        {phone.status === 'ready' && !phone.call && (
          <Button variant="outline" size="sm" onClick={() => dial(call.phone, call.id)}>
            <PhoneOutgoing size={14} /> PC로 걸기
          </Button>
        )}
      </div>

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
          <dt>통화시간</dt>
          <dd>{mmss(talking)}</dd>
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
          <span>상품</span>
          <Select
            value={v.serviceLine}
            onValueChange={(x) => setField('serviceLine', x)}
            options={SERVICE_LINES}
          />
        </label>
        <div className={styles.full}>
          <AddressField addrPrefix="from" label="출발지" values={v} setField={setField} />
        </div>
        <div className={styles.full}>
          <AddressField addrPrefix="to" label="도착지" values={v} setField={setField} />
        </div>
        <label className={styles.field}>
          <span>제휴 · 전속</span>
          <Combobox
            value={v.partnerId || null}
            onChange={(x) => setField('partnerId', x ?? '')}
            options={partners.map((p) => ({
              value: p.id,
              label: p.name,
              group: PARTNER_TYPE_LABEL[p.type as PartnerType] ?? p.type,
            }))}
            placeholder="없음(일반)"
            searchPlaceholder="업체명으로 찾기"
            emptyMessage="찾는 업체가 없습니다"
            clearable
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

      <div className={styles.actions}>
        {can('LEAD.CREATE') && (
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void register()}>
            접수 등록
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void run(() => finish('DONE').then(() => undefined))}
        >
          접수 없이 상담 끝
        </Button>
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
      </div>
    </div>
  );
}
