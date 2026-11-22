import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@sunghoon_lee/akron-ui';
import { formatPhone } from '@tongin/shared';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/dateFormat';
import { LEAD_STATUS, LEAD_STATUS_COLOR } from '../../lib/leadCodes';
import { Button } from '../ui';
import { StatusChip } from '../ui/StatusChip';
import styles from './LeadDuplicateGate.module.css';

/** 같은 출발지·서비스 요청일로 먼저 들어온 접수 */
export interface DupLead {
  id: string;
  leadNo: string;
  status: string;
  rejected: boolean;
  createdAt: string;
  fromAddrDetail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orgName: string | null;
  ownerName: string | null;
  replaceable: boolean;
}

/**
 * 중복 접수 확인 고르기
 * - existing: 먼저 접수된 건으로 진행(새로 만들지 않는다)
 * - replace: 지금 받은 내용으로 새로 접수하고 먼저 건은 '중복 접수'로 취소
 * - separate: 다른 집이라 따로 접수(같은 건물 다른 호수 등)
 */
export type DupPick =
  | { kind: 'existing'; lead: DupLead }
  | { kind: 'replace'; lead: DupLead }
  | { kind: 'separate' };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * 접수 등록 전 중복 확인 — 부부가 따로 전화하는 경우처럼 같은 출발지 주소·같은 서비스 요청일의
 * 접수가 이미 있으면 창을 띄워 하나로 진행하게 한다. 접수 화면·상담 화면이 같이 쓴다.
 *
 *   const dup = useLeadDuplicateGate();
 *   const pick = await dup.ask(values);   // 중복이 없으면 { kind: 'separate' }, 창을 닫으면 null
 *   ...
 *   {dup.modal}
 */
export function useLeadDuplicateGate() {
  const { t } = useTranslation();
  const [dups, setDups] = useState<DupLead[] | null>(null);
  const [sel, setSel] = useState(0);
  const resolver = useRef<((p: DupPick | null) => void) | null>(null);

  const ask = async (values: Record<string, unknown>): Promise<DupPick | null> => {
    const fromAddr = str(values.fromAddr);
    const moveDate = str(values.moveDate).slice(0, 10);
    if (!fromAddr || !moveDate) return { kind: 'separate' };
    const qs = new URLSearchParams({ fromAddr, moveDate });
    // 확인이 안 되면 막지 않고 그대로 접수한다
    const found = await api<DupLead[]>(`/leads/duplicates?${qs}`).catch(() => []);
    if (!found.length) return { kind: 'separate' };
    setSel(0);
    setDups(found);
    return new Promise((res) => {
      resolver.current = res;
    });
  };
  const done = (p: DupPick | null) => {
    resolver.current?.(p);
    resolver.current = null;
    setDups(null);
  };

  const target = dups?.[sel];
  const name = target?.customerName || t('leadDup.customer');
  const statusLabel = (d: DupLead) => {
    const key = d.rejected ? 'REJECTED' : d.status === 'QUOTED' ? 'CONTRACT_PENDING' : d.status;
    return (
      <StatusChip color={LEAD_STATUS_COLOR[key] ?? LEAD_STATUS_COLOR.CANCELED}>
        {key === 'REJECTED' ? t('leads.st.REJECTED') : (LEAD_STATUS[key]?.label ?? key)}
      </StatusChip>
    );
  };

  const modal = (
    <Modal
      open={!!dups}
      onOpenChange={(o) => !o && done(null)}
      title={t('leadDup.title')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => done({ kind: 'separate' })}>
            {t('leadDup.separate')}
          </Button>
          <Button
            variant="outline"
            disabled={!target?.replaceable}
            onClick={() => target && done({ kind: 'replace', lead: target })}
          >
            {t('leadDup.replace')}
          </Button>
          <Button
            variant="primary"
            onClick={() => target && done({ kind: 'existing', lead: target })}
          >
            {t('leadDup.existing')}
          </Button>
        </>
      }
    >
      <p className={styles.lead}>{t('leadDup.found', { n: dups?.length ?? 0 })}</p>
      <ul className={styles.list} role="radiogroup">
        {dups?.map((d, i) => (
          <li key={d.id}>
            <button
              type="button"
              role="radio"
              aria-checked={i === sel}
              className={`${styles.item} ${i === sel ? styles.on : ''}`}
              onClick={() => setSel(i)}
            >
              <span className={styles.row}>
                <b>{d.customerName || t('leadDup.customer')}</b>
                {d.customerPhone && <span>{formatPhone(d.customerPhone)}</span>}
                {statusLabel(d)}
              </span>
              <span className={styles.sub}>
                {d.leadNo} · {fmtDateTime(d.createdAt)}
                {d.orgName && ` · ${d.orgName}`}
                {d.ownerName && ` · ${d.ownerName}`}
                {d.fromAddrDetail && ` · ${d.fromAddrDetail}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.script}>
        <b>{t('leadDup.scriptTitle')}</b>
        <p>{t('leadDup.script', { name })}</p>
      </div>
    </Modal>
  );

  return { ask, modal };
}
