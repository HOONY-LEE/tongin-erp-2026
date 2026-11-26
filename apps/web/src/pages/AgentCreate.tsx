import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUp, FileSpreadsheet, Paperclip, Sparkles, X } from 'lucide-react';
import type { AgentGraph } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { Button, PopoutButton, useToast } from '../components/ui';
import { Markdown } from '../components/ai/Markdown';
import styles from './agentBuilder.module.css';
import ai from './aiAgent.module.css';

const EXAMPLES = [
  i18n.t('ai.create.ex1'),
  i18n.t('ai.create.ex2'),
  i18n.t('ai.create.ex3'),
  i18n.t('ai.create.ex4'),
];

interface RefFile {
  id: string;
  name: string;
  size: number;
}
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  file?: RefFile;
}
interface DesignReply {
  reply: string;
  status: 'ask' | 'ready';
  askForFile: boolean;
  options?: string[];
  recommended?: number;
  name: string;
  description: string;
  spec: string;
}

const readBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error(i18n.t('ai.fileFailed')));
    r.readAsDataURL(f);
  });

/**
 * 새 에이전트 만들기 — AI와 대화하며 만든다. 빠진 정보는 AI가 되묻고, 보고서 일이면 양식 파일을 받는다.
 * 정리가 끝나면 노드 블루프린트로 설계해 저장하고 편집 화면(노드로 세부 수정)으로 간다.
 */
export default function AgentCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [refs, setRefs] = useState<RefFile[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [last, setLast] = useState<DesignReply | null>(null);
  const [building, setBuilding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<{ aiConfigured: boolean }>('/agent-blueprints/status')
      .then((st) => setAiConfigured(st.aiConfigured))
      .catch(() => setAiConfigured(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, thinking, last]);

  const ask = async (next: Msg[], files: RefFile[]) => {
    setThinking(true);
    try {
      const r = await api<DesignReply>('/agent-blueprints/design-chat', {
        method: 'POST',
        body: JSON.stringify({
          // 파일 메시지는 AI에게 "양식을 올렸다"는 말로 전한다
          messages: next.map((m) => ({ role: m.role, text: m.text })),
          referenceFileIds: files.map((f) => f.id),
        }),
      });
      setLast(r);
      setMsgs((p) => [...p, { role: 'assistant', text: r.reply }]);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ai.noAnswer') });
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  const send = (text = draft) => {
    const t = text.trim();
    if (!t || thinking || building) return;
    const next = [...msgs, { role: 'user' as const, text: t }];
    setMsgs(next);
    setDraft('');
    void ask(next, refs);
  };

  // 반복 작업 제안에서 왔으면 그 내용을 첫 요청으로 바로 보낸다(한 번만)
  const location = useLocation();
  const seeded = useRef(false);
  useEffect(() => {
    const prompt = (location.state as { prompt?: string } | null)?.prompt;
    if (!prompt || seeded.current || aiConfigured === null) return;
    seeded.current = true;
    navigate('.', { replace: true, state: null });
    // AI가 꺼져 있으면 입력칸에만 채워 둔다
    if (aiConfigured) send(prompt);
    else setDraft(prompt);
  }, [aiConfigured]);

  const upload = async (f: File) => {
    setUploading(true);
    try {
      const ref = await api<RefFile & { summary: string }>('/agent-blueprints/reference-files', {
        method: 'POST',
        body: JSON.stringify({
          name: f.name,
          mediaType: f.type || 'application/octet-stream',
          dataBase64: await readBase64(f),
        }),
      });
      const files = [...refs, { id: ref.id, name: ref.name, size: ref.size }];
      setRefs(files);
      const typed = draft.trim();
      const next = [
        ...msgs,
        {
          role: 'user' as const,
          text: t('ai.templateUploaded', { v0: ref.name, v1: typed ? `\n${typed}` : '' }),
          file: { id: ref.id, name: ref.name, size: ref.size },
        },
      ];
      setMsgs(next);
      setDraft('');
      void ask(next, files);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ai.uploadFailed') });
    } finally {
      setUploading(false);
    }
  };

  /** 정리된 내용으로 노드 블루프린트를 설계·저장하고 편집 화면으로 */
  const build = async () => {
    if (!last) return;
    setBuilding(true);
    try {
      const spec =
        last.spec.trim() ||
        msgs
          .filter((m) => m.role === 'user')
          .map((m) => m.text)
          .join('\n');
      const g = await api<{ name: string; description: string; graph: AgentGraph }>(
        '/agent-blueprints/generate',
        {
          method: 'POST',
          body: JSON.stringify({ prompt: spec, referenceFileIds: refs.map((r) => r.id) }),
        },
      );
      const b = await api<{ id: string }>('/agent-blueprints', {
        method: 'POST',
        body: JSON.stringify({
          name: last.name.trim() || g.name,
          description: last.description.trim() || g.description,
          graph: g.graph,
          prompt: spec,
          visibility: 'PRIVATE',
          referenceFileIds: refs.map((r) => r.id),
          // 만들면서 나눈 대화 — 편집 화면 AI 대화에 그대로 이어진다
          chat: msgs.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      // 편집 화면(흐름도)에서 시험 실행 → 오류면 AI가 스스로 고쳐 저장까지 한다
      navigate(`/agent-builder/${b.id}?mode=blueprint`, {
        replace: true,
        state: { autoTest: true },
      });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ai.createFailed') });
      setBuilding(false);
    }
  };

  const startBlank = async () => {
    try {
      const b = await api<{ id: string }>('/agent-blueprints', {
        method: 'POST',
        body: JSON.stringify({ name: t('ai.newAgent'), visibility: 'PRIVATE' }),
      });
      navigate(`/agent-builder/${b.id}`, { replace: true });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ai.createFailed') });
    }
  };

  const busy = thinking || uploading || building;
  const ready = last?.status === 'ready' && !thinking;
  // 지금 질문의 선택지 — 답하면(새 질문이 오면) 바뀐다
  const choices = last?.status === 'ask' && !thinking && !building ? (last.options ?? []) : [];
  const showChoices = choices.length > 0 || (!!last?.askForFile && !thinking && !building);
  const pick = (i: number) => {
    if (busy) return;
    if (i < choices.length) send(choices[i]);
    else send(t('ai.choice.autoText'));
  };

  return (
    // AI 비서 대화 화면과 같은 틀 — 왼쪽 대화 목록만 없다
    <section className={`${ai.main} ${styles.chatShell}`}>
      <PopoutButton floating />
      <div className={`${ai.topbar} ${styles.createTop}`}>
        <button
          type="button"
          className={ai.iconBtn}
          onClick={() => navigate('/agent-builder')}
          title={t('ai.toList')}
          aria-label={t('ai.toList')}
        >
          <ArrowLeft size={16} />
        </button>
        <span className={styles.createTopTitle}>{last?.name?.trim() || t('ai.createTitle')}</span>
      </div>

      {aiConfigured === false ? (
        <div className={ai.welcome}>
          <div className={styles.warnNote}>
            {t('ai.createNoKey1')}
            {t('ai.createNoKey2')}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="outline" onClick={() => void startBlank()}>
              {t('ai.blankStart')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {msgs.length === 0 && !thinking ? (
            <div className={ai.welcome}>
              <h1 className={ai.greeting}>{t('ai.whatAgent')}</h1>
              <div className={ai.suggestions}>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className={ai.suggestion}
                    disabled={busy}
                    onClick={() => send(ex)}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={ai.scroll} aria-live="polite">
              <div className={ai.thread}>
                {msgs.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={i} className={ai.userTurn}>
                      {m.file && (
                        <div className={ai.userFiles}>
                          <span className={ai.userFile}>
                            <FileSpreadsheet size={14} /> {m.file.name}
                          </span>
                        </div>
                      )}
                      {(m.file ? m.text.split('\n').slice(1).join('\n') : m.text) && (
                        <div className={ai.userMsg}>
                          {m.file ? m.text.split('\n').slice(1).join('\n') : m.text}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={i} className={ai.aiMsg}>
                      <Markdown text={m.text} />
                    </div>
                  ),
                )}
                {thinking && (
                  <div className={ai.working} role="status">
                    <span className={ai.spark} aria-hidden />
                    {t('ai.thinking')}
                  </div>
                )}
                {/* 선택지 — AI 비서의 이어서 물어보기 목록과 같은 모양 */}
                {showChoices && last && (
                  <div className={ai.nextList} role="list" aria-label={t('ai.choice.group')}>
                    {choices.map((c, i) => (
                      <button
                        key={`${i}-${c}`}
                        type="button"
                        role="listitem"
                        className={ai.nextItem}
                        disabled={busy}
                        onClick={() => pick(i)}
                      >
                        <span className={ai.nextNo}>{i + 1}</span>
                        <span className={styles.choiceText}>{c}</span>
                        {last.recommended === i && (
                          <span className={styles.choiceBadge}>{t('ai.choice.recommended')}</span>
                        )}
                      </button>
                    ))}
                    {last.askForFile && (
                      <button
                        type="button"
                        role="listitem"
                        className={ai.nextItem}
                        disabled={busy}
                        onClick={() => fileRef.current?.click()}
                      >
                        <span className={ai.nextNo}>
                          <Paperclip size={13} />
                        </span>
                        <span className={styles.choiceText}>
                          {uploading ? t('ai.choice.uploading') : t('ai.uploadTemplateHint')}
                        </span>
                      </button>
                    )}
                    {choices.length > 0 && (
                      <button
                        type="button"
                        role="listitem"
                        className={ai.nextItem}
                        disabled={busy}
                        onClick={() => pick(choices.length)}
                      >
                        <span className={`${ai.nextNo} ${styles.choiceAuto}`}>
                          <Sparkles size={13} />
                        </span>
                        <span className={styles.choiceText}>{t('ai.choice.auto')}</span>
                      </button>
                    )}
                  </div>
                )}
                {ready && (
                  <div className={styles.readyCard}>
                    <div className={styles.readyHead}>
                      <b>{last.name || t('ai.newAgent')}</b>
                      {last.description && <span className={styles.note}>{last.description}</span>}
                    </div>
                    {refs.length > 0 && (
                      <div className={styles.examples}>
                        {refs.map((r) => (
                          <span key={r.id} className={styles.fileChip}>
                            <FileSpreadsheet size={13} /> {r.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className={styles.readyActions}>
                      <span className={styles.note}>
                        {building ? t('ai.designing') : t('ai.changeHint')}
                      </span>
                      <Button
                        variant="primary"
                        loading={building}
                        leftIcon={<Sparkles size={14} />}
                        onClick={() => void build()}
                      >
                        {t('ai.buildAsIs')}
                      </Button>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>
          )}

          <div className={ai.composerWrap}>
            <div className={ai.composer}>
              {refs.length > 0 && (
                <div className={ai.files}>
                  {refs.map((r) => (
                    <div key={r.id} className={ai.fileChip}>
                      <span className={ai.fileIcon}>
                        <FileSpreadsheet size={16} />
                      </span>
                      <span className={ai.fileName}>{r.name}</span>
                      <button
                        type="button"
                        className={ai.fileRemove}
                        aria-label={t('ai.removeOf', { v0: r.name })}
                        onClick={() => setRefs((p) => p.filter((x) => x.id !== r.id))}
                        disabled={busy}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                className={ai.input}
                rows={1}
                value={draft}
                autoFocus
                placeholder={msgs.length ? t('ai.replyPh') : t('ai.whatDoPh')}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  const n = Number(e.key);
                  if (
                    !draft &&
                    choices.length > 0 &&
                    Number.isInteger(n) &&
                    n >= 1 &&
                    n <= choices.length + 1 &&
                    !e.metaKey &&
                    !e.ctrlKey &&
                    !e.altKey
                  ) {
                    e.preventDefault();
                    pick(n - 1);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={building}
                aria-label={t('ai.createChat')}
              />
              <div className={ai.composerBar}>
                <span className={ai.barLeft}>
                  <button
                    type="button"
                    className={ai.iconBtn}
                    onClick={() => fileRef.current?.click()}
                    disabled={busy || aiConfigured === null}
                    title={t('ai.uploadRefTip')}
                    aria-label={t('ai.uploadRef')}
                  >
                    <Paperclip size={18} />
                  </button>
                </span>
                <button
                  type="button"
                  className={ai.sendBtn}
                  onClick={() => send()}
                  disabled={!draft.trim() || busy}
                  aria-label={t('ai.send')}
                >
                  <ArrowUp size={20} strokeWidth={2.4} />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }}
              />
            </div>
            <div className={ai.footnote}>{t('ai.createFooter')}</div>
          </div>
        </>
      )}
    </section>
  );
}
