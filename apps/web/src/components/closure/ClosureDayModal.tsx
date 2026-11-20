import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useOrgScope } from '../../lib/useOrgScope';
import { useAuth } from '../../auth/AuthContext';
import { Button, Input, Modal, Select, useToast } from '../ui';
import type { Closure } from './useClosures';
import styles from './closureDayModal.module.css';

/**
 * 하루의 이사일 마감 — 지점별 마감을 보고, 걸고, 푼다(캘린더 '이사일 마감'에서 날짜·마감을 누르면).
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
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const { options, ownOrgId, unrestricted } = useOrgScope();
  const [orgId, setOrgId] = useState('ALL');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const editable = can('LEAD.UPDATE');

  useEffect(() => {
    if (!date) return;
    setOrgId(unrestricted ? 'ALL' : ownOrgId);
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
          kind: 'CLOSED',
        }),
      });
      setMemo('');
      await onChanged();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('misc2.closeFailed') });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('misc2.reopenFailed') });
    } finally {
      setBusy(false);
    }
  };
  const orgOptions = [
    ...(unrestricted ? [{ value: 'ALL', label: t('misc2.allBranches') }] : []),
    ...options.filter((o) => !o.disabled),
  ];

  return (
    <Modal
      open={!!date}
      onOpenChange={(o) => !o && onClose()}
      title={
        date
          ? t('misc2.closureTitle', {
              v0: Number(date.slice(5, 7)),
              v1: Number(date.slice(8)),
              v2: leads,
            })
          : ''
      }
    >
      {date && (
        <div className={styles.body}>
          {closures.length ? (
            <ul className={styles.list}>
              {closures.map((c) => (
                <li key={c.id}>
                  <b>{c.orgName ?? t('misc2.allBranches')}</b>
                  <span className={styles.closed}>{t('misc2.closure')}</span>
                  {c.memo && <span className={styles.memo}>{c.memo}</span>}
                  {editable && (
                    <button
                      type="button"
                      aria-label={t('misc2.reopenTip')}
                      disabled={busy}
                      onClick={() => void remove(c)}
                    >
                      <X size={14} /> {t('misc2.reopen')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>{t('misc2.noClosed')}</p>
          )}
          {editable && (
            <div className={styles.addRow}>
              <Select
                value={orgId}
                onValueChange={setOrgId}
                options={orgOptions}
                placeholder={t('misc2.branch')}
                aria-label={t('misc2.branchToClose')}
              />
              <Input
                value={memo}
                placeholder={t('misc2.closureMemoPh')}
                maxLength={300}
                onChange={(e) => setMemo(e.target.value)}
              />
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void add()}>
                {t('misc2.add')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
