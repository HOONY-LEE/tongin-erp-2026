import { useCallback, useEffect, useState } from 'react';
import { NotebookPen, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Button, ConfirmModal, Input, SegmentedControl, useToast } from '../../components/ui';
import styles from '../callcenter.module.css';

interface Script {
  id: string;
  title: string;
  body: string;
  /** 공유 메모(상담 콘솔 모든 직원) — false면 내 개인 메모 */
  shared: boolean;
}
interface Draft {
  id: string | null;
  title: string;
  body: string;
  shared: boolean;
}
const LAST_KEY = 'tongin_cs_script_last';

/**
 * 상담 메모(대본) — 공유 메모(상담 콘솔 모든 직원이 보고 고침)와 개인 메모.
 * 보기: 메모 칩(공유는 파란 테두리·공유 아이콘)을 눌러 바꿔 본다.
 * 고치기·새 메모: 칩 자리에 제목과 개인/공유 선택. 메모장은 보기와 같은 크기·위치·글꼴·배경.
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
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<Script | null>(null);

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
      const body = JSON.stringify({ title: edit.title, body: edit.body, shared: edit.shared });
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
          {!edit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEdit({ id: null, title: '', body: '', shared: false })}
            >
              <Plus size={14} /> 새 메모
            </Button>
          )}
        </span>
      </h3>

      {items === null ? (
        <p className={styles.muted}>불러오는 중…</p>
      ) : edit ? (
        <>
          {/* 칩 자리 — 제목과 개인/공유 */}
          <div className={styles.scriptHead}>
            <Input
              value={edit.title}
              placeholder="메모 제목 — 예: 첫 인사, 견적 안내"
              maxLength={40}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              aria-label="메모 제목"
            />
            <SegmentedControl
              size="sm"
              value={edit.shared ? 'shared' : 'mine'}
              onChange={(v) => setEdit({ ...edit, shared: v === 'shared' })}
              options={[
                { value: 'mine', label: '개인' },
                { value: 'shared', label: '공유' },
              ]}
            />
          </div>
          {/* 메모장 — 보기와 같은 크기·위치·글꼴·배경 */}
          <div className={styles.scriptBody}>
            <span className={styles.scriptBtns}>
              {edit.id && (
                <button
                  type="button"
                  className={styles.scriptEditBtn}
                  disabled={busy}
                  onClick={() => {
                    const s = items.find((x) => x.id === edit.id);
                    if (s) setDelTarget(s);
                  }}
                >
                  <Trash2 size={13} /> 지우기
                </button>
              )}
              <button
                type="button"
                className={styles.scriptEditBtn}
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={`${styles.scriptEditBtn} ${styles.scriptSaveBtn}`}
                disabled={busy}
                onClick={() => void save()}
              >
                저장
              </button>
            </span>
            <textarea
              className={`${styles.scriptPaper} ${styles.scriptPaperEdit}`}
              value={edit.body}
              placeholder="상담할 때 읽을 대본이나 확인할 내용을 적어 두세요"
              onChange={(e) => setEdit({ ...edit, body: e.target.value })}
              aria-label="메모 내용"
            />
          </div>
        </>
      ) : (
        <>
          {items.length > 0 && (
            <div className={styles.scriptTabs} role="tablist" aria-label="상담 메모">
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={current?.id === s.id}
                  className={[
                    s.shared ? styles.scriptTabShared : '',
                    current?.id === s.id ? styles.scriptTabOn : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={s.shared ? '공유 메모 — 상담 콘솔 모든 직원이 봅니다' : '내 개인 메모'}
                  onClick={() => pick(s.id)}
                >
                  {s.shared && <Users size={11} aria-label="공유" />}
                  {s.title}
                </button>
              ))}
            </div>
          )}
          {current ? (
            <div className={styles.scriptBody}>
              <span className={styles.scriptBtns}>
                <button
                  type="button"
                  className={styles.scriptEditBtn}
                  onClick={() =>
                    setEdit({
                      id: current.id,
                      title: current.title,
                      body: current.body,
                      shared: current.shared,
                    })
                  }
                >
                  <Pencil size={13} /> 수정
                </button>
              </span>
              <div className={styles.scriptPaper}>
                {current.body || <span className={styles.muted}>내용이 없습니다.</span>}
              </div>
            </div>
          ) : (
            <p className={styles.muted}>메모가 없습니다. [새 메모]를 눌러 대본을 적어 두세요.</p>
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
          &apos;{delTarget?.title}&apos; 메모를 지울까요?
          {delTarget?.shared ? ' 공유 메모라 모든 상담 직원 화면에서 사라집니다.' : ''} 지운 메모는
          되돌릴 수 없습니다.
        </p>
      </ConfirmModal>
    </section>
  );
}
