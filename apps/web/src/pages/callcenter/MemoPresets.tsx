import { useEffect, useState } from 'react';
import { Plus, Settings2, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { Button, ConfirmModal, Input, Modal, Textarea, useToast } from '../../components/ui';
import styles from '../callcenter.module.css';

export interface MemoPreset {
  id: string;
  title: string;
  body: string;
}

/** 상담 메모 프리셋 목록(한 번 읽어 화면 안에서 같이 쓴다) */
let cache: MemoPreset[] | null = null;
const listeners = new Set<(p: MemoPreset[]) => void>();
async function loadPresets(force = false) {
  if (cache && !force) return cache;
  cache = await api<MemoPreset[]>('/cs-memo-presets').catch(() => []);
  listeners.forEach((l) => l(cache!));
  return cache;
}
function usePresets() {
  const [list, setList] = useState<MemoPreset[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setList);
    void loadPresets().then(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}

/**
 * 상담 메모 머리의 프리셋 칩 — 누르면 상담 메모를 그 틀로 바꾼다(적어 둔 메모가 있으면 묻고).
 * 상담 관리자(상담 콘솔 전체 보기 권한)에게는 끝에 [⚙] 프리셋 관리.
 */
export function MemoPresetPicker({
  current,
  onApply,
}: {
  current: string;
  onApply: (body: string) => void;
}) {
  const { can } = useAuth();
  const presets = usePresets();
  const [ask, setAsk] = useState<MemoPreset | null>(null);
  const [manage, setManage] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  // 아무것도 안 골랐고 메모가 비어 있으면 '기본'(내용 없는 프리셋)이 골라진 것으로
  const active =
    applied ?? (current.trim() ? null : (presets.find((p) => !p.body.trim())?.id ?? null));

  const apply = (p: MemoPreset) => {
    setApplied(p.id);
    onApply(p.body);
  };
  const pick = (p: MemoPreset) => {
    if (current.trim() && current.trim() !== p.body.trim()) setAsk(p);
    else apply(p);
  };

  return (
    <span className={styles.presetChips} role="group" aria-label="상담 메모 프리셋">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`${styles.presetChip} ${active === p.id ? styles.presetChipOn : ''}`}
          title={p.body.trim() ? `${p.title} 틀 넣기` : '비우고 직접 적기'}
          onClick={() => pick(p)}
        >
          {p.title}
        </button>
      ))}
      {can('CS_CALL.ALL') && (
        <button
          type="button"
          className={`${styles.presetChip} ${styles.presetChipGear}`}
          aria-label="프리셋 관리"
          title="프리셋 관리"
          onClick={() => setManage(true)}
        >
          <Settings2 size={12} />
        </button>
      )}
      <ConfirmModal
        open={!!ask}
        title={ask ? `'${ask.title}' 프리셋으로 바꿀까요?` : ''}
        confirmLabel="바꾸기"
        onClose={() => setAsk(null)}
        onConfirm={() => {
          if (ask) apply(ask);
          setAsk(null);
        }}
      >
        지금 적어 둔 상담 메모는 지워지고 프리셋 내용으로 바뀝니다.
      </ConfirmModal>
      {manage && <PresetManager onClose={() => setManage(false)} />}
    </span>
  );
}

/** 프리셋 관리 — 왼쪽 목록(순서·추가·삭제), 오른쪽 이름·내용 고치기 */
function PresetManager({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const presets = usePresets();
  const [sel, setSel] = useState<string | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<MemoPreset | null>(null);

  useEffect(() => {
    if (sel === null && presets.length) setSel(presets[0].id);
  }, [sel, presets]);
  useEffect(() => {
    if (sel === 'new') {
      setTitle('');
      setBody('');
      return;
    }
    const p = presets.find((x) => x.id === sel);
    if (p) {
      setTitle(p.title);
      setBody(p.body);
    }
  }, [sel, presets]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ type: 'success', title: ok });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      const r = await api<MemoPreset>('/cs-memo-presets', {
        method: 'POST',
        body: JSON.stringify({
          ...(sel && sel !== 'new' ? { id: sel } : {}),
          title: title.trim(),
          body,
        }),
      });
      await loadPresets(true);
      setSel(r.id);
    }, '프리셋을 저장했습니다');
  const move = (id: string, d: -1 | 1) => {
    const ids = presets.map((p) => p.id);
    const i = ids.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run(async () => {
      await api('/cs-memo-presets/order', { method: 'POST', body: JSON.stringify({ ids }) });
      await loadPresets(true);
    }, '순서를 바꿨습니다');
  };
  const remove = (p: MemoPreset) =>
    run(async () => {
      await api(`/cs-memo-presets/${p.id}`, { method: 'DELETE' });
      await loadPresets(true);
      setSel(null);
    }, '프리셋을 지웠습니다');

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => !o && onClose()}
        title="상담 메모 프리셋 관리"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              닫기
            </Button>
            <Button
              variant="primary"
              disabled={busy || !title.trim() || sel === null}
              onClick={() => void save()}
            >
              {sel === 'new' ? '추가' : '저장'}
            </Button>
          </>
        }
      >
        <div className={`${styles.presetMgr} preset-mgr-wrap`}>
          <ul className={styles.presetList}>
            {presets.map((p, i) => (
              <li key={p.id} className={sel === p.id ? styles.presetOn : undefined}>
                <button type="button" className={styles.presetName} onClick={() => setSel(p.id)}>
                  {p.title}
                </button>
                <span className={styles.presetTools}>
                  <button
                    type="button"
                    aria-label={`${p.title} 위로`}
                    disabled={i === 0 || busy}
                    onClick={() => move(p.id, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.title} 아래로`}
                    disabled={i === presets.length - 1 || busy}
                    onClick={() => move(p.id, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.title} 지우기`}
                    disabled={busy}
                    onClick={() => setDel(p)}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            ))}
            <li className={sel === 'new' ? styles.presetOn : undefined}>
              <button type="button" className={styles.presetName} onClick={() => setSel('new')}>
                <Plus size={13} /> 새 프리셋
              </button>
            </li>
          </ul>
          <div className={styles.presetEdit}>
            <label className={styles.field}>
              <span>이름</span>
              <Input
                value={title}
                maxLength={30}
                placeholder="예: 클레임"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.presetBody}`}>
              <span>내용 — 비워 두면 상담원이 직접 적습니다</span>
              <Textarea
                value={body}
                maxLength={2000}
                placeholder={'예:\n[클레임]\n- 클레임 내용:\n- 고객 요청:'}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={!!del}
        danger
        title={del ? `'${del.title}' 프리셋을 지울까요?` : ''}
        confirmLabel="지우기"
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del) void remove(del);
          setDel(null);
        }}
      >
        상담원 화면의 프리셋 목록에서 빠집니다. 이미 적힌 상담 메모는 그대로입니다.
      </ConfirmModal>
    </>
  );
}
