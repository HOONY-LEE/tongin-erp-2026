import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useOrgScope } from '../../lib/useOrgScope';
import { useAuth } from '../../auth/AuthContext';
import { Button, Input, Modal, Select, useToast } from '../ui';
import type { Closure } from './useClosures';
import styles from './closureDayModal.module.css';

/**
 * 하루의 이사일 마감 — 지점별 마감·마감 예정을 보고, 걸고, 푼다(캘린더 '이사일 마감'에서 날짜·마감을 누르면).
 */
export function ClosureDayModal({
  date,
  closures,
  leads,
  onClose,
  onChanged,
}: {
  date: string | null;
  closures: Closure[];
  leads: number;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const { options, ownOrgId, unrestricted } = useOrgScope();
  const [orgId, setOrgId] = useState('ALL');
  const [kind, setKind] = useState<'CLOSED' | 'SOON'>('CLOSED');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const editable = can('LEAD.UPDATE');

  useEffect(() => {
    if (!date) return;
    setOrgId(unrestricted ? 'ALL' : ownOrgId);
    setKind('CLOSED');
    setMemo('');
  }, [date, unrestricted, ownOrgId]);

  const add = async () => {
    if (!date) return;
    setBusy(true);
    try {
      await api('/move-closures', {
        method: 'POST',
        body: JSON.stringify({
          date,
          orgUnitId: orgId && orgId !== 'ALL' ? orgId : null,
          memo: memo || undefined,
          kind,
        }),
      });
      setMemo('');
      await onChanged();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '마감하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: Closure) => {
    setBusy(true);
    try {
      await api(`/move-closures/${c.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '마감을 풀지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  const orgOptions = [
    ...(unrestricted ? [{ value: 'ALL', label: '전체(모든 지점)' }] : []),
    ...options.filter((o) => !o.disabled),
  ];

  return (
    <Modal
      open={!!date}
      onOpenChange={(o) => !o && onClose()}
      title={
        date
          ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 이사일 마감 · 이사 ${leads}건`
          : ''
      }
    >
      {date && (
        <div className={styles.body}>
          {closures.length ? (
            <ul className={styles.list}>
              {closures.map((c) => (
                <li key={c.id}>
                  <b>{c.orgName ?? '전체(모든 지점)'}</b>
                  <span className={c.kind === 'SOON' ? styles.soon : styles.closed}>
                    {c.kind === 'SOON' ? '마감 예정' : '마감'}
                  </span>
                  {c.memo && <span className={styles.memo}>{c.memo}</span>}
                  {editable && (
                    <button
                      type="button"
                      aria-label="마감 풀기"
                      disabled={busy}
                      onClick={() => void remove(c)}
                    >
                      <X size={14} /> 풀기
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>마감한 지점이 없습니다.</p>
          )}
          {editable && (
            <div className={styles.addRow}>
              <Select
                value={orgId}
                onValueChange={setOrgId}
                options={orgOptions}
                placeholder="지점"
                aria-label="마감할 지점"
              />
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as 'CLOSED' | 'SOON')}
                options={[
                  { value: 'CLOSED', label: '마감' },
                  { value: 'SOON', label: '마감 예정' },
                ]}
                aria-label="상태"
              />
              <Input
                value={memo}
                placeholder="메모(선택) — 예: 차량 마감"
                maxLength={300}
                onChange={(e) => setMemo(e.target.value)}
              />
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void add()}>
                추가
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
