import { useNavigate } from 'react-router-dom';
import { formatPhone } from '@tongin/shared';
import { StatusBadge } from '../ui';
import { CALL_STATUS, timeOf, type CallContext } from '../../lib/calls';
import { LEAD_STATUS, SERVICE_LINES, codeLabel } from '../../lib/leadCodes';
import styles from './call.module.css';

const TICKET_KIND: Record<string, string> = { CS: 'CS상담', AS: 'A/S' };
const TICKET_STATUS: Record<string, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '처리중',
  RESOLVED: '해결',
  CLOSED: '종료',
  CANCELED: '취소',
};
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** 콜팝업·수신 기록 상세가 같이 쓰는 본문 — 건 번호, 찾은 고객, 최근 접수·A/S, 이 번호의 지난 통화 */
export function CallInfo({ ctx, onNavigate }: { ctx: CallContext; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };
  const { call, customers, hiddenMatches, previousCalls } = ctx;

  return (
    <div className={styles.info}>
      <div className={styles.numberRow}>
        <span className={styles.number}>
          {call.fromNumber ? formatPhone(call.fromNumber) : '발신번호 표시 제한'}
        </span>
        <StatusBadge value={call.status} map={CALL_STATUS} />
      </div>
      <div className={styles.meta}>
        {[call.lineName, timeOf(call.startedAt), call.answeredBy && `응대 ${call.answeredBy}`]
          .filter(Boolean)
          .join(' · ')}
      </div>

      {customers.length === 0 && (
        <div className={styles.newCustomer}>
          {hiddenMatches > 0
            ? '다른 지점에 등록된 고객입니다 — 내 데이터 범위 밖이라 정보를 보여 줄 수 없습니다.'
            : '신규 고객 — 이 번호로 등록된 고객이 없습니다.'}
        </div>
      )}

      {customers.map((c) => (
        <div key={c.id} className={styles.customer}>
          <div className={styles.custHead}>
            <span className={styles.custName}>{c.name}</span>
            {c.gradeName && <span className={styles.grade}>{c.gradeName}</span>}
            {c.ownerOrgName && <span className={styles.dim}>{c.ownerOrgName}</span>}
          </div>
          {c.addr && (
            <div className={styles.line}>
              {c.addr}
              {c.addrDetail ? ` ${c.addrDetail}` : ''}
              {c.zipcode ? `(${c.zipcode})` : ''}
            </div>
          )}
          <div className={styles.dim}>
            접수 {c.leadCount}건 · 계약 {c.contractCount}건 · 등록 {day(c.createdAt)}
          </div>
          {c.recentLeads.length > 0 && (
            <ul className={styles.list}>
              {c.recentLeads.slice(0, 3).map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => go(`/leads/${l.id}`)}>
                    <span className={styles.mono}>{l.leadNo}</span>
                    <StatusBadge value={l.status} map={LEAD_STATUS} />
                    <span className={styles.dim}>
                      {[
                        codeLabel(SERVICE_LINES, l.serviceLine),
                        l.moveDate ? `이사 ${day(l.moveDate)}` : day(l.createdAt),
                        l.orgUnitName,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {c.tickets.length > 0 && (
            <ul className={styles.list}>
              {c.tickets.slice(0, 2).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => go(`/support?detail=${t.id}`)}>
                    <span className={styles.tag}>{TICKET_KIND[t.kind] ?? t.kind}</span>
                    <span className={styles.ellipsis}>{t.subject}</span>
                    <span className={styles.dim}>
                      {TICKET_STATUS[t.status] ?? t.status} · {day(t.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {previousCalls.length > 0 && (
        <div className={styles.dim}>
          이 번호 지난 통화 {previousCalls.length}건 — 마지막 {day(previousCalls[0].startedAt)}{' '}
          {CALL_STATUS[previousCalls[0].status]?.label ?? ''}
          {previousCalls[0].memo ? ` · ${previousCalls[0].memo}` : ''}
        </div>
      )}
    </div>
  );
}
