import { useCallback, useEffect, useState } from 'react';
import { NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Button, ConfirmModal, Input, Textarea, useToast } from '../../components/ui';
import styles from '../callcenter.module.css';

interface Script {
  id: string;
  title: string;
  body: string;
}
const LAST_KEY = 'tongin_cs_script_last';

/**
 * 상담 메모(대본) — 상담원마다 여러 개를 적어 두고, 상담 중에 눌러서 바꿔 본다.
 * 처음 열면 기본 대본(첫 인사·견적 안내·제휴·전속 확인·마무리)이 만들어지고, 각자 고쳐 쓴다.
 */
export function ScriptCard() {
  const toast = useToast();
  const [items, setItems] = useState<Script[] | null>(null);
  const [active, setActive] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_KEY);
    } catch {
      return null;
    }
  });
  const [edit, setEdit] = useState<{ id: string | null; title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<Script[]>('/cs-calls/scripts'));
    } catch (e) {
      setItems([]);
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '메모를 불러오지 못했습니다',
      });
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const pick = (id: string) => {
    setActive(id);
    setEdit(null);
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      /* 무시 */
    }
  };
  const current = items?.find((x) => x.id === active) ?? items?.[0] ?? null;

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const body = JSON.stringify({ title: edit.title, body: edit.body });
      const saved = edit.id
        ? await api<Script>(`/cs-calls/scripts/${edit.id}`, { method: 'PATCH', body })
        : await api<Script>('/cs-calls/scripts', { method: 'POST', body });
      await load();
      pick(saved.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  const [delTarget, setDelTarget] = useState<Script | null>(null);
  const remove = async (s: Script) => {
    setBusy(true);
    try {
      await api(`/cs-calls/scripts/${s.id}`, { method: 'DELETE' });
      setEdit(null);
      setActive(null);
      setDelTarget(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${styles.card} ${styles.scriptCard}`}>
      <h3 className={styles.cardTitle}>
        <NotebookPen size={15} /> 상담 메모
        <span className={styles.scriptTools}>
          <Button
            variant="ghost"
            size="sm"
            aria-label="새 메모"
            title="새 메모"
            onClick={() => setEdit({ id: null, title: '', body: '' })}
          >
            <Plus size={14} />
          </Button>
        </span>
      </h3>

      {items === null ? (
        <p className={styles.muted}>불러오는 중…</p>
      ) : (
        <>
          {items.length > 0 && (
            <div className={styles.scriptTabs} role="tablist" aria-label="상담 메모">
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={!edit && current?.id === s.id}
                  className={!edit && current?.id === s.id ? styles.scriptTabOn : undefined}
                  onClick={() => pick(s.id)}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}

          {edit ? (
            <div className={styles.scriptEdit}>
              <Input
                value={edit.title}
                placeholder="제목 — 예: 첫 인사, 견적 안내"
                maxLength={40}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                aria-label="메모 제목"
              />
              <Textarea
                rows={8}
                value={edit.body}
                placeholder="상담할 때 읽을 대본이나 확인할 내용을 적어 두세요"
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                aria-label="메모 내용"
              />
              <div className={styles.scriptActions}>
                {edit.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      const s = items.find((x) => x.id === edit.id);
                      if (s) setDelTarget(s);
                    }}
                  >
                    <Trash2 size={14} /> 지우기
                  </Button>
                )}
                <span style={{ flex: 1 }} />
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEdit(null)}>
                  취소
                </Button>
                <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
                  저장
                </Button>
              </div>
            </div>
          ) : current ? (
            <div className={styles.scriptBody}>
              <p>{current.body || <span className={styles.muted}>내용이 없습니다.</span>}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setEdit({ id: current.id, title: current.title, body: current.body })
                }
              >
                <Pencil size={13} /> 고치기
              </Button>
            </div>
          ) : (
            <p className={styles.muted}>메모가 없습니다. + 를 눌러 대본을 적어 두세요.</p>
          )}
        </>
      )}
      <ConfirmModal
        open={!!delTarget}
        title="메모 지우기"
        confirmLabel="지우기"
        danger
        busy={busy}
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && void remove(delTarget)}
      >
        <p style={{ margin: 0 }}>
          &apos;{delTarget?.title}&apos; 메모를 지울까요? 지운 메모는 되돌릴 수 없습니다.
        </p>
      </ConfirmModal>
    </section>
  );
}
