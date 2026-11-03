import { useCallback, useEffect, useMemo, useState } from 'react';
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

const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/**
 * 작업관리 이력 — 만듦 · 담당 넘김(누가 누구에게 언제, 남긴 말) · 상태 · 팀 바뀜. 오래된 것부터.
 * reloadKey가 바뀌면 다시 읽는다(넘기기·상태 변경 뒤)
 */
export function TaskHistory({ taskId, reloadKey }: { taskId: string; reloadKey?: unknown }) {
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
      <h3 className={styles.historyTitle}>이력</h3>
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
                  <b>{e.actor ?? '알 수 없음'}</b>
                  {e.kind === 'CREATED' ? (
                    <>
                      님이 업무를 만들었습니다
                      {e.to && (
                        <>
                          {' '}
                          · 담당 <b>{e.to}</b>
                        </>
                      )}
                    </>
                  ) : e.kind === 'ASSIGNED' ? (
                    <>
                      님이 {e.from ? <b>{e.from}</b> : '담당 없음'}
                      <ArrowRight size={12} className={styles.tlArrow} aria-label="에서" />
                      {e.to ? <b>{e.to}</b> : '담당 없음'}에게 넘겼습니다
                    </>
                  ) : e.kind === 'TEAM' ? (
                    <>
                      님이 팀을 {e.from ?? '없음'} → {e.to ?? '없음'}(으)로 바꿨습니다
                    </>
                  ) : (
                    <>
                      님이 상태를 {e.from} → <b>{e.to}</b>(으)로 바꿨습니다
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
        <p className={styles.tlTime}>기록이 없습니다.</p>
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
          group: p.orgUnitName ?? '소속 없음',
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
      toast({ type: 'success', title: '업무를 넘겼습니다' });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '넘기지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="담당 넘기기"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} disabled={!to} onClick={() => void save()}>
            넘기기
          </Button>
        </>
      }
    >
      <div className={styles.assignForm}>
        <label className={styles.assignField}>
          받을 사람
          <Combobox
            value={to}
            onChange={setTo}
            options={options}
            placeholder="이름으로 찾기"
            searchPlaceholder="찾기"
            emptyMessage="찾는 사람이 없습니다"
          />
        </label>
        <label className={styles.assignField}>
          남길 말(선택)
          <Textarea
            rows={3}
            value={note}
            maxLength={500}
            placeholder="예: 견적 확인까지 마쳤습니다. 계약서만 부탁드려요."
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <p className={styles.tlTime}>받는 사람에게 알림이 가고, 업무 이력에 남습니다.</p>
      </div>
    </Modal>
  );
}
