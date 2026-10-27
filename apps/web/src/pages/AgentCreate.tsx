import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, Paperclip, SendHorizontal, Sparkles, X } from 'lucide-react';
import type { AgentGraph } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { Button, useToast } from '../components/ui';
import styles from './agentBuilder.module.css';

const EXAMPLES = [
  '매주 월요일 아침에 지점별 지난주 실적을 우리 주간 보고 양식으로 만들어 줘',
  '이번 주 미계약 고객에게 재안내 문자를 보내는 에이전트. 보내기 전에 꼭 내가 승인하게 해 줘',
  '어제 들어온 접수 중 담당자가 없는 건을 찾아 지점별로 요약해 줘',
  '새 CS 티켓이 들어오면 긴급도를 분류해서 긴급이면 담당자 배정 전에 승인을 받아',
];

const GREETING =
  '안녕하세요! 어떤 일을 하는 에이전트를 만들까요?\n' +
  '하고 싶은 일을 편하게 말씀해 주시면, 만드는 데 필요한 내용(대상·조건·언제 실행할지·결과물)을 제가 여쭤보면서 함께 완성할게요.\n' +
  '보고서처럼 파일을 만드는 일이라면 실제로 쓰시는 양식(엑셀·CSV)을 올려 주세요 — 그 양식 그대로 채워서 만들어 드려요.';

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
  name: string;
  description: string;
  spec: string;
}

const readBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('파일을 읽지 못했습니다'));
    r.readAsDataURL(f);
  });

/**
 * 새 에이전트 만들기 — AI와 대화하며 만든다. 빠진 정보는 AI가 되묻고, 보고서 일이면 양식 파일을 받는다.
 * 정리가 끝나면 노드 블루프린트로 설계해 저장하고 편집 화면(노드로 세부 수정)으로 간다.
 */
export default function AgentCreate() {
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : 'AI가 답하지 못했습니다' });
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
          text: `참고 양식 파일을 올렸어요: ${ref.name}${typed ? `\n${typed}` : ''}`,
          file: { id: ref.id, name: ref.name, size: ref.size },
        },
      ];
      setMsgs(next);
      setDraft('');
      void ask(next, files);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '올리지 못했습니다' });
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
        }),
      });
      toast({
        type: 'success',
        title: '에이전트를 만들었습니다 — 노드에서 세부 내용을 다듬어 보세요',
      });
      navigate(`/agent-builder/${b.id}`, { replace: true });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
      setBuilding(false);
    }
  };

  const startBlank = async () => {
    try {
      const b = await api<{ id: string }>('/agent-blueprints', {
        method: 'POST',
        body: JSON.stringify({ name: '새 에이전트', visibility: 'PRIVATE' }),
      });
      navigate(`/agent-builder/${b.id}`, { replace: true });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
    }
  };

  const busy = thinking || uploading || building;
  const ready = last?.status === 'ready' && !thinking;

  return (
    <div className={styles.chatPage}>
      <div className={styles.chatHead}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => navigate('/agent-builder')}
          title="목록으로"
          aria-label="목록으로"
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 className={styles.createTitle}>새 에이전트 만들기</h1>
          <p className={styles.note}>
            AI와 대화로 만들고, 만든 뒤에는 편집 화면에서 노드로 세부 내용을 고칠 수 있습니다.
          </p>
        </div>
      </div>

      {aiConfigured === false ? (
        <div className={styles.createSection}>
          <div className={styles.warnNote}>
            서버에 ANTHROPIC_API_KEY가 없어 대화로 만들 수 없습니다. 빈 캔버스에서 노드를 직접 이어
            만들 수는 있습니다.
          </div>
          <div>
            <Button variant="outline" onClick={() => void startBlank()}>
              빈 캔버스로 시작
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.chatLog} aria-live="polite">
            <div className={`${styles.bubbleRow}`}>
              <span className={styles.botIcon}>
                <Sparkles size={14} />
              </span>
              <div className={styles.bubbleBot}>{GREETING}</div>
            </div>
            {msgs.length === 0 && (
              <div className={styles.examples} style={{ paddingLeft: 36 }}>
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className={styles.chip} onClick={() => send(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className={`${styles.bubbleRow} ${styles.bubbleRowMe}`}>
                  <div className={styles.bubbleMe}>
                    {m.file ? (
                      <span className={styles.fileChip}>
                        <FileSpreadsheet size={14} /> {m.file.name}
                      </span>
                    ) : (
                      m.text
                    )}
                    {m.file && m.text.includes('\n') && (
                      <div style={{ marginTop: 6 }}>{m.text.split('\n').slice(1).join('\n')}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={i} className={styles.bubbleRow}>
                  <span className={styles.botIcon}>
                    <Sparkles size={14} />
                  </span>
                  <div className={styles.bubbleBot}>{m.text}</div>
                </div>
              ),
            )}
            {thinking && (
              <div className={styles.bubbleRow}>
                <span className={styles.botIcon}>
                  <Sparkles size={14} />
                </span>
                <div className={`${styles.bubbleBot} ${styles.typing}`}>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            {last?.askForFile && !thinking && !building && (
              <div className={styles.askFile}>
                <FileSpreadsheet size={16} />
                <span>실제로 쓰는 양식 파일(엑셀 .xlsx · CSV)을 올려 주세요.</span>
                <Button
                  variant="outline"
                  size="sm"
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  양식 올리기
                </Button>
              </div>
            )}
            {ready && (
              <div className={styles.readyCard}>
                <div className={styles.readyHead}>
                  <b>{last.name || '새 에이전트'}</b>
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
                    {building
                      ? 'AI가 노드·분기·승인을 설계하고 있어요(30초~1분)…'
                      : '바꿀 점이 있으면 아래에 말씀해 주세요. 만든 뒤에도 노드에서 고칠 수 있어요.'}
                  </span>
                  <Button
                    variant="primary"
                    loading={building}
                    leftIcon={<Sparkles size={14} />}
                    onClick={() => void build()}
                  >
                    이대로 만들기
                  </Button>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className={styles.composer}>
            {refs.length > 0 && (
              <div className={styles.composerFiles}>
                {refs.map((r) => (
                  <span key={r.id} className={styles.fileChip}>
                    <FileSpreadsheet size={13} /> {r.name}
                    <button
                      type="button"
                      aria-label={`${r.name} 빼기`}
                      onClick={() => setRefs((p) => p.filter((x) => x.id !== r.id))}
                      disabled={busy}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={styles.composerRow}>
              <button
                type="button"
                className={styles.composerBtn}
                onClick={() => fileRef.current?.click()}
                disabled={busy || aiConfigured === null}
                title="참고 양식 올리기(엑셀·CSV)"
                aria-label="참고 양식 올리기"
              >
                <Paperclip size={16} />
              </button>
              <textarea
                ref={inputRef}
                className={styles.composerInput}
                rows={1}
                value={draft}
                autoFocus
                placeholder={
                  msgs.length
                    ? '답하거나 바꿀 점을 말씀해 주세요'
                    : '어떤 일을 하는 에이전트인가요?'
                }
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={building}
              />
              <button
                type="button"
                className={`${styles.composerBtn} ${styles.composerSend}`}
                onClick={() => send()}
                disabled={!draft.trim() || busy}
                aria-label="보내기"
              >
                <SendHorizontal size={16} />
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
        </>
      )}
    </div>
  );
}
