import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDateTime } from '../../lib/dateFormat';
import { Combobox } from '@sunghoon_lee/akron-ui';
import { ArrowRight, CircleDot, Forward, Plus, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useDirectory } from '../../lib/approvals';
import { Button, Modal, Textarea, useToast } from '../ui';
import styles from '../../pages/work.module.css';

interface Event {
  id: string;
  kind: 'CREATED' | 'ASSIGNED' | 'STATUS' | 'TEAM';
  from: string | null;
  to: string | null;
  note: string | null;
  actor: string | null;
  at: string;
}

const when = (iso: string) => fmtDateTime(iso);

/**
 * 작업관리 이력 — 만듦 · 담당 넘김(누가 누구에게 언제, 남긴 말) · 상태 · 팀 바뀜. 오래된 것부터.
 * reloadKey가 바뀌면 다시 읽는다(넘기기·상태 변경 뒤)
 */
export function TaskHistory({ taskId, reloadKey }: { taskId: string; reloadKey?: unknown }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Event[] | null>(null);
  const load = useCallback(() => {
    api<Event[]>(`/tasks/${taskId}/history`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [taskId]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (!rows) return null;
  return (
    <section className={styles.history}>
      <h3 className={styles.historyTitle}>{t('task.history')}</h3>
      {rows.length ? (
        <ol className={styles.timeline}>
          {rows.map((e) => (
            <li key={e.id}>
              <span className={`${styles.tlIcon} ${e.kind === 'ASSIGNED' ? styles.tlAssign : ''}`}>
                {e.kind === 'CREATED' ? (
                  <Plus size={12} />
                ) : e.kind === 'ASSIGNED' ? (
                  <Forward size={12} />
                ) : e.kind === 'TEAM' ? (
                  <Users size={12} />
                ) : (
                  <CircleDot size={12} />
                )}
              </span>
              <div className={styles.tlBody}>
                <span>
                  <b>{e.actor ?? t('task.unknown')}</b>
                  {e.kind === 'CREATED' ? (
                    <>
                      {t('task.h.created')}
                      {e.to && (
                        <>
                          {' '}
                          {t('task.h.owner')} <b>{e.to}</b>
                        </>
                      )}
                    </>
                  ) : e.kind === 'ASSIGNED' ? (
                    <>
                      {t('task.h.handed')} {e.from ? <b>{e.from}</b> : t('task.h.none')}
                      <ArrowRight
                        size={12}
                        className={styles.tlArrow}
                        aria-label={t('task.h.from')}
                      />
                      {e.to ? <b>{e.to}</b> : t('task.h.none')}
                      {t('task.h.handedTo')}
                    </>
                  ) : e.kind === 'TEAM' ? (
                    <>
                      {t('task.h.team')} {e.from ?? t('task.none')} → {e.to ?? t('task.none')}
                      {t('task.h.changedTo')}
                    </>
                  ) : (
                    <>
                      {t('task.h.status')} {e.from} → <b>{e.to}</b>
                      {t('task.h.changedTo')}
                    </>
                  )}
                </span>
                {e.note && <span className={styles.tlNote}>“{e.note}”</span>}
                <time className={styles.tlTime}>{when(e.at)}</time>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.tlTime}>{t('task.h.empty')}</p>
      )}
    </section>
  );
}

/** 담당 넘기기 — 사람을 찾아 고르고 한마디 남긴다 */
export function AssignModal({
  taskId,
  currentEmpId,
  onClose,
  onDone,
}: {
  taskId: string;
  currentEmpId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { people } = useDirectory();
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const options = useMemo(
    () =>
      people
        .filter((p) => p.id !== currentEmpId)
        .map((p) => ({
          value: p.id,
          label: `${p.name}${p.positionName ? ` ${p.positionName}` : ''}`,
          group: p.orgUnitName ?? t('task.noOrg'),
        })),
    [people, currentEmpId],
  );
  const save = async () => {
    if (!to) return;
    setBusy(true);
    try {
      await api(`/tasks/${taskId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assigneeEmpId: to, note: note.trim() || null }),
      });
      toast({ type: 'success', title: t('task.handedOff') });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('task.handOffFailed') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('task.handOff')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('task.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!to} onClick={() => void save()}>
            {t('task.handOffBtn')}
          </Button>
        </>
      }
    >
      <div className={styles.assignForm}>
        <label className={styles.assignField}>
          {t('task.receiver')}
          <Combobox
            value={to}
            onChange={setTo}
            options={options}
            placeholder={t('task.findByName')}
            searchPlaceholder={t('task.find')}
            emptyMessage={t('task.noPerson')}
          />
        </label>
        <label className={styles.assignField}>
          {t('task.note')}
          <Textarea
            rows={3}
            value={note}
            maxLength={500}
            placeholder={t('task.notePh')}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <p className={styles.tlTime}>{t('task.handOffHint')}</p>
      </div>
    </Modal>
  );
}
