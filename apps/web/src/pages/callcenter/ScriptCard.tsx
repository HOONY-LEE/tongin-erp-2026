import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { ConfirmModal, Input, SegmentedControl, useToast } from '../../components/ui';
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

/**
 * 상담 메모(대본) — 공유 메모(상담 콘솔 모든 직원이 보고 고침)와 개인 메모.
 * 보기: 메모 칩(공유는 파란 테두리·공유 아이콘)을 눌러 바꿔 본다.
 * 고치기·새 메모: 칩 자리에 제목과 개인/공유 선택. 메모장은 보기와 같은 크기·위치·글꼴·배경.
 */
export function ScriptCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Script[] | null>(null);
  // 처음엔 목록 — 메모를 고르면 그 메모를 펼친다
  const [active, setActive] = useState<string | null>(null);
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
        title: e instanceof ApiError ? e.message : t('cc.memosFailed'),
      });
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const pick = (id: string) => {
    setActive(id);
    setEdit(null);
  };
  const current = items?.find((x) => x.id === active) ?? null;

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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.saveFailed') });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.deleteFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${styles.card} ${styles.paneCard} ${styles.scriptCard}`}>
      <div className={`${styles.paneHead} ${styles.sideHead}`}>
        <b>{t('cc.memo')}</b>
        <span className={styles.scriptTools}>
          <button
            type="button"
            className={styles.headIconBtn}
            // 고치기 모드에서도 자리는 그대로(보이지만 않게)
            style={edit ? { visibility: 'hidden' } : undefined}
            disabled={!!edit}
            tabIndex={edit ? -1 : undefined}
            aria-label={t('cc.newMemo')}
            title={t('cc.newMemo')}
            onClick={() => setEdit({ id: null, title: '', body: '', shared: false })}
          >
            <Plus size={18} />
          </button>
        </span>
      </div>

      <div className={styles.scriptPaneBody}>
        {items === null ? (
          <p className={styles.muted}>{t('cc.loading')}</p>
        ) : edit ? (
          <>
            {/* 칩 자리 — 제목과 개인/공유 */}
            <div className={styles.scriptHead}>
              <Input
                value={edit.title}
                placeholder={t('cc.memoTitlePh')}
                maxLength={40}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                aria-label={t('cc.memoTitle')}
              />
              <SegmentedControl
                className={styles.scriptKind}
                value={edit.shared ? 'shared' : 'mine'}
                onChange={(v) => setEdit({ ...edit, shared: v === 'shared' })}
                options={[
                  { value: 'mine', label: t('cc.personal') },
                  { value: 'shared', label: t('cc.shared') },
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
                    <Trash2 size={13} /> {t('cc.delete')}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.scriptEditBtn}
                  disabled={busy}
                  onClick={() => setEdit(null)}
                >
                  {t('cc.canceled')}
                </button>
                <button
                  type="button"
                  className={`${styles.scriptEditBtn} ${styles.scriptSaveBtn}`}
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {t('cc.save')}
                </button>
              </span>
              <textarea
                className={`${styles.scriptPaper} ${styles.scriptPaperEdit}`}
                value={edit.body}
                placeholder={t('cc.memoBodyPh')}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                aria-label={t('cc.memoBody')}
              />
            </div>
          </>
        ) : (
          <>
            {current ? (
              <>
                {/* 고른 메모 — < 제목 ……… 수정 / 아래 내용 */}
                <div className={styles.scriptViewHead}>
                  <button
                    type="button"
                    className={styles.scriptBack}
                    onClick={() => setActive(null)}
                    aria-label={t('cc.toMemos')}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <b className={styles.scriptTitle}>{current.title}</b>
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
                    <Pencil size={13} /> {t('cc.edit')}
                  </button>
                </div>
                <div className={styles.scriptBody}>
                  <div className={`${styles.scriptPaper} ${styles.scriptPaperView}`}>
                    {current.body || <span className={styles.muted}>{t('cc.noContent')}</span>}
                  </div>
                </div>
              </>
            ) : items.length ? (
              /* 메모 목록 — 눌러서 펼친다 */
              <ul className={styles.scriptList}>
                {items.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => pick(s.id)}>
                      <span className={styles.scriptListTitle}>
                        <b>{s.title}</b>
                        <span
                          className={s.shared ? styles.scriptKindShared : styles.scriptKindMine}
                        >
                          {s.shared ? t('cc.shared') : t('cc.personal')}
                        </span>
                      </span>
                      <span className={styles.scriptListBody}>
                        {s.body.replace(/\s+/g, ' ').slice(0, 60) || t('cc.noContentShort')}
                      </span>
                      <ChevronRight size={15} className={styles.scriptListGo} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>{t('cc.noMemos')}</p>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        open={!!delTarget}
        title={t('cc.deleteMemo')}
        confirmLabel={t('cc.delete')}
        danger
        busy={busy}
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && void remove(delTarget)}
        message={`'${delTarget?.title ?? ''}${t('cc.deleteMemoQ')}${delTarget?.shared ? t('cc.sharedMemoNote') : ''}`}
      />
    </section>
  );
}
