import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  FileText,
  Paperclip,
  Pencil,
  RotateCcw,
  Search,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { pokeAiActivity, reportAiRows } from '../lib/aiActivity';
import { Button, useToast } from '../components/ui';
import { Markdown } from '../components/ai/Markdown';
import { ApprovalCard, CodeRow, FileCard, ToolRow } from '../components/ai/ChatParts';
import { AgentCallPanel, type CallableAgent } from '../components/ai/AgentCallPanel';
import { useAuth } from '../auth/AuthContext';
import type {
  AiStatus,
  AiToolInfo,
  ChatAttachment,
  ChatItem,
  Conversation,
  ConversationRow,
  Decision,
} from '../components/ai/types';
import styles from './aiAgent.module.css';

const SUGGESTIONS = [
  '이번 주 미계약 고객들에게 계약 안내 문자 한 번 더 보내줘',
  '다음 주 이사 예정인 건 지점별로 정리해줘',
  '견적만 받고 계약 안 한 고객이 몇 명이야?',
  '이번 달 미수금이 많은 고객 5명 알려줘',
  '접수건수 대비 미계약 처리가 많은 의심되는 지점들 리스트 뽑아줘',
];

/** 올릴 수 있는 파일 — 서버 ATTACHMENT_TYPES와 맞춘다 */
const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.md,.json';
const BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
};
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
/** 첫 질문 뒤 요약 제목(서버가 따로 만든다)을 목록에 반영하려고 다시 읽는 시점 */
const TITLE_REFRESH_MS = 2500;
/** 대화 제목 최대 길이 — 서버 검증과 같게 */
const TITLE_MAX = 60;
/** 입력칸이 이 높이까지 늘어나고, 넘으면 안에서 스크롤 */
const MAX_INPUT_PX = 220;

interface Draft {
  name: string;
  mediaType: string;
  data: string; // base64
  preview?: string; // 이미지 미리보기 data URL
}

const readFile = (f: File) =>
  new Promise<Draft>((resolve, reject) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const mediaType = BY_EXT[ext] ?? f.type;
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      resolve({
        name: f.name,
        mediaType,
        data: url.slice(url.indexOf(',') + 1),
        preview: mediaType.startsWith('image/') ? url : undefined,
      });
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/**
 * AI 에이전트 — 시킨 일을 AI가 ERP 도구(조회·등록·발송)로 나눠서 처리한다.
 * 조회는 바로 실행되고, 등록·수정·발송은 승인 카드에서 확인해야 실행된다.
 * 화면은 Claude 대화 화면처럼: 왼쪽 대화 목록, 가운데 대화, 아래 늘어나는 입력칸(첨부·보내기 포함).
 */
export default function AiAssistant() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  /** Agent Builder로 만든 에이전트를 부르는 중이면 그 id(대화 대신 실행 화면을 보여 준다) */
  const agentId = params.get('agent');
  const { can } = useAuth();
  const [agents, setAgents] = useState<CallableAgent[] | null>(null);
  const activeAgent = agents?.find((a) => a.id === agentId) ?? null;
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [tools, setTools] = useState<Map<string, AiToolInfo>>(new Map());
  const [rows, setRows] = useState<ConversationRow[]>([]);
  /** 대화 목록을 한 번이라도 받았나 — 받기 전엔 '없음' 대신 '불러오는 중' */
  const [listLoaded, setListLoaded] = useState(false);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  /** 응답을 기다리는 동안 화면에 먼저 보여 줄 사용자 글 */
  const [echo, setEcho] = useState<{ text: string; attachments: ChatAttachment[] } | null>(null);
  /** 제목 바꾸는 중인 대화 */
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  /** Enter·Esc로 끝낸 뒤 입력칸이 사라지며 생기는 blur가 한 번 더 저장하지 않게 */
  const editDone = useRef(false);
  const startEdit = (id: string, title: string) => {
    editDone.current = false;
    setEditing({ id, title });
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(() => {
    api<ConversationRow[]>('/ai/conversations')
      .then((rs) => {
        setRows(rs);
        reportAiRows(rs);
      })
      .catch(() => setRows([]))
      .finally(() => setListLoaded(true));
  }, []);

  useEffect(() => {
    api<AiStatus>('/ai/status')
      .then(setStatus)
      .catch(() => setStatus({ configured: false, model: '' }));
    api<AiToolInfo[]>('/ai/tools')
      .then((t) => setTools(new Map(t.map((x) => [x.name, x]))))
      .catch(() => undefined);
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!activeId) {
      setConv(null);
      return;
    }
    if (conv?.id === activeId) return;
    api<Conversation>(`/ai/conversations/${activeId}`)
      .then(setConv)
      .catch(() => setParams({}, { replace: true }));
    // conv는 일부러 뺀다 — 주소의 대화 id가 바뀔 때만 다시 읽는다
  }, [activeId, setParams]);

  // 에이전트가 일하는 동안 대화를 다시 읽어 진행(도구 실행·답변)을 따라간다
  const convId = conv?.id;
  const convRunning = conv?.status === 'RUNNING';
  useEffect(() => {
    if (!convId || !convRunning) return;
    let alive = true;
    const t = setInterval(() => {
      api<Conversation>(`/ai/conversations/${convId}`)
        .then((c) => {
          if (!alive) return;
          setConv((cur) => (cur && cur.id === c.id ? c : cur));
          if (c.status !== 'RUNNING') loadList();
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [convId, convRunning, loadList]);

  // 새 내용이 오면 맨 아래로
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv, echo, busy, conv?.status]);

  // 입력칸 — 한 줄에서 시작해 내용만큼 늘어난다
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_PX)}px`;
  }, [draft]);

  // 부를 수 있는 에이전트 — 사용중이고 내 것·전체 공개·나에게 공유된 것
  useEffect(() => {
    api<CallableAgent[]>('/agents')
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);
  const openAgent = (id: string) => {
    setEcho(null);
    setParams({ agent: id });
  };

  const select = (id: string | null) => {
    setEcho(null);
    setParams(id ? { c: id } : {});
    if (!id) setConv(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  /**
   * 요청은 서버가 일을 받아 두면 바로 돌아온다(상태 RUNNING) — 이후 진행은 아래 폴링이 따라간다.
   * 그래서 다른 화면으로 가도 에이전트는 계속 일하고, 돌아오면 이어서 보인다.
   */
  const run = async (fn: () => Promise<Conversation>) => {
    setBusy(true);
    try {
      const next = await fn();
      setConv(next);
      if (next.id !== activeId) setParams({ c: next.id }, { replace: true });
      loadList();
      pokeAiActivity();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : 'AI 요청에 실패했습니다' });
      // 서버에 남은 상태(오류·대기)를 다시 읽어 화면을 맞춘다
      const id = conv?.id ?? activeId;
      if (id)
        api<Conversation>(`/ai/conversations/${id}`)
          .then(setConv)
          .catch(() => undefined);
    } finally {
      setBusy(false);
      setEcho(null);
    }
  };

  const pickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    const room = MAX_FILES - files.length;
    if (list.length > room)
      toast({ type: 'warning', title: `파일은 ${MAX_FILES}개까지 올릴 수 있습니다` });
    const ok: Draft[] = [];
    for (const f of list.slice(0, Math.max(0, room))) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!BY_EXT[ext]) {
        toast({
          type: 'warning',
          title: `${f.name}: 이미지·PDF·텍스트(csv·md·json)만 올릴 수 있습니다`,
        });
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast({ type: 'warning', title: `${f.name}: 10MB까지 올릴 수 있습니다` });
        continue;
      }
      try {
        ok.push(await readFile(f));
      } catch {
        toast({ type: 'error', title: `${f.name}을(를) 읽지 못했습니다` });
      }
    }
    setFiles((cur) => [...cur, ...ok]);
    inputRef.current?.focus();
  };

  const send = async (text: string) => {
    const t = text.trim();
    if ((!t && !files.length) || working) return;
    const attachments = files;
    setDraft('');
    setFiles([]);
    setEcho({
      text: t,
      attachments: attachments.map((a) => ({
        name: a.name,
        kind: a.preview ? 'image' : 'file',
        src: a.preview,
      })),
    });
    // 첫 질문이면 서버가 요약 제목을 따로 만든다 — 답을 기다리는 동안·끝난 뒤 목록을 다시 읽어 반영
    const first = !conv || conv.items.length === 0;
    await run(async () => {
      const id = conv?.id ?? (await api<Conversation>('/ai/conversations', { method: 'POST' })).id;
      if (first) setTimeout(loadList, TITLE_REFRESH_MS);
      return api<Conversation>(`/ai/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          text: t,
          attachments: attachments.map(({ name, mediaType, data }) => ({ name, mediaType, data })),
        }),
      });
    });
    if (first) setTimeout(loadList, TITLE_REFRESH_MS);
  };

  const decide = (decisions: Decision[]) =>
    conv &&
    run(() =>
      api<Conversation>(`/ai/conversations/${conv.id}/decisions`, {
        method: 'POST',
        body: JSON.stringify({ decisions }),
      }),
    );

  const retry = () =>
    conv && run(() => api<Conversation>(`/ai/conversations/${conv.id}/retry`, { method: 'POST' }));

  /** 제목 바꾸기 저장 — 빈 제목·그대로면 취소 */
  const saveTitle = async () => {
    if (!editing || editDone.current) return;
    editDone.current = true;
    const { id, title } = editing;
    setEditing(null);
    const t = title.trim();
    const before = rows.find((r) => r.id === id)?.title;
    if (!t || t === before) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, title: t } : r)));
    try {
      await api(`/ai/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title: t }) });
      setConv((c) => (c && c.id === id ? { ...c, title: t } : c));
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '제목을 바꾸지 못했습니다',
      });
    }
    loadList();
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editDone.current = true;
      setEditing(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/ai/conversations/${id}`, { method: 'DELETE' });
      if (id === activeId) select(null);
      loadList();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    // 빈 입력칸에서 Tab — 미리보기로 보이던 이어지는 요청을 입력칸에 넣는다
    if (e.key === 'Tab' && !draft && nextUp.length) {
      e.preventDefault();
      setDraft(nextUp[0]);
      return;
    }
    // 빈 입력칸에서 숫자 — 그 번호의 제안을 바로 보낸다(Claude처럼 1·2·3 고르기)
    if (!draft && /^[1-9]$/.test(e.key) && nextUp[Number(e.key) - 1]) {
      e.preventDefault();
      void send(nextUp[Number(e.key) - 1]);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  };

  const items: ChatItem[] = useMemo(
    () => [
      ...(conv?.items ?? []),
      ...(echo ? [{ kind: 'user' as const, text: echo.text, attachments: echo.attachments }] : []),
    ],
    [conv, echo],
  );
  const awaiting = conv?.status === 'AWAITING_APPROVAL' && conv.pending.length > 0;
  /** 요청을 보내는 중이거나, 서버에서 에이전트가 일하는 중 */
  const working = busy || conv?.status === 'RUNNING';
  const nextUp = !working && !echo ? (conv?.suggestions ?? []) : [];
  const notReady = status !== null && !status.configured;
  /** 주소의 대화를 아직 받아 오는 중(새로고침·목록에서 고른 직후) */
  const convLoading = !!activeId && conv?.id !== activeId && !echo;
  const empty = items.length === 0 && !convLoading;
  const canSend = (!!draft.trim() || files.length > 0) && !working && !notReady;

  const composer = (
    <div className={styles.composerWrap}>
      <div className={[styles.composer, notReady ? styles.composerOff : ''].join(' ')}>
        {files.length > 0 && (
          <div className={styles.files}>
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className={styles.fileChip}>
                {f.preview ? (
                  <img src={f.preview} alt="" className={styles.fileThumb} />
                ) : (
                  <span className={styles.fileIcon}>
                    <FileText size={16} />
                  </span>
                )}
                <span className={styles.fileName}>{f.name}</span>
                <button
                  type="button"
                  className={styles.fileRemove}
                  aria-label={`${f.name} 빼기`}
                  onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          className={styles.input}
          value={draft}
          rows={1}
          placeholder={
            working
              ? 'AI가 처리하는 중입니다… 다른 화면으로 가도 계속 진행됩니다'
              : awaiting
                ? '위 작업을 승인·거절하거나, 새 요청을 입력하세요(대기 중인 작업은 취소됩니다)'
                : nextUp.length
                  ? `${nextUp[0]}   ⇥ Tab`
                  : 'AI 에이전트에게 일을 시켜 보세요'
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          disabled={notReady}
          aria-label="AI에게 보낼 메시지"
        />
        <div className={styles.composerBar}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="파일 첨부"
            title="파일 첨부 (이미지·PDF·텍스트)"
            onClick={() => fileRef.current?.click()}
            disabled={notReady || files.length >= MAX_FILES}
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => void pickFiles(e)}
          />
          <button
            type="button"
            className={styles.sendBtn}
            aria-label="보내기"
            disabled={!canSend}
            onClick={() => void send(draft)}
          >
            <ArrowUp size={20} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <div className={styles.footnote}>
        AI는 실수할 수 있습니다. 등록·수정·문자 발송은 실행 전에 확인을 받습니다.
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <aside className={styles.side} aria-label="대화 목록">
        <button type="button" className={styles.newChat} onClick={() => select(null)}>
          <SquarePen size={16} /> 새 채팅
        </button>
        <div className={styles.sideLabel}>
          에이전트
          {can('AI.MANAGE') && (
            <Link className={styles.sideLink} to="/agent-builder/new">
              + 만들기
            </Link>
          )}
        </div>
        <nav className={styles.agentList} aria-label="에이전트">
          {agents === null ? (
            <div className={styles.sideEmpty}>불러오는 중…</div>
          ) : agents.length === 0 ? (
            <div className={styles.sideEmpty}>쓸 수 있는 에이전트가 없습니다</div>
          ) : (
            agents.map((a) => (
              <div
                key={a.id}
                className={[styles.convRow, a.id === agentId ? styles.convActive : ''].join(' ')}
              >
                <button
                  type="button"
                  className={styles.convBtn}
                  onClick={() => openAgent(a.id)}
                  title={a.description || a.name}
                >
                  <Bot size={14} className={styles.agentIcon} aria-hidden />
                  <span className={styles.convTitle}>{a.name}</span>
                </button>
              </div>
            ))
          )}
        </nav>
        <div className={styles.sideLabel}>최근</div>
        <nav className={styles.convList}>
          {!listLoaded ? (
            <div className={styles.sideEmpty} role="status">
              <span className={styles.spark} aria-hidden /> 대화 목록을 불러오는 중…
            </div>
          ) : (
            rows.length === 0 && <div className={styles.sideEmpty}>아직 대화가 없습니다</div>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className={[styles.convRow, r.id === activeId ? styles.convActive : ''].join(' ')}
            >
              {editing?.id === r.id ? (
                <input
                  className={styles.convInput}
                  value={editing.title}
                  maxLength={TITLE_MAX}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setEditing({ id: r.id, title: e.target.value })}
                  onKeyDown={onTitleKey}
                  onBlur={() => void saveTitle()}
                  aria-label="대화 제목"
                />
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.convBtn}
                    onClick={() => select(r.id)}
                    onDoubleClick={() => startEdit(r.id, r.title)}
                  >
                    <span className={styles.convTitle}>{r.title}</span>
                    {r.status === 'RUNNING' && (
                      <span className={styles.runDot} title="진행 중" aria-label="진행 중" />
                    )}
                    {r.status === 'AWAITING_APPROVAL' && (
                      <span className={styles.dot} title="승인 대기" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.convDel}
                    aria-label={`${r.title} 제목 바꾸기`}
                    title="제목 바꾸기"
                    onClick={() => startEdit(r.id, r.title)}
                  >
                    <Pencil size={14} />
                  </button>
                </>
              )}
              <button
                type="button"
                className={styles.convDel}
                aria-label={`${r.title} 삭제`}
                title="삭제"
                onClick={() => void remove(r.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <section className={styles.main}>
        {/* 좁은 화면 — 왼쪽 목록 대신 위에 새 채팅·최근 대화 고르기 */}
        <div className={styles.mobileBar}>
          <select
            className={styles.mobileSelect}
            value={agentId ? `agent:${agentId}` : (activeId ?? '')}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith('agent:')) openAgent(v.slice(6));
              else select(v || null);
            }}
            aria-label="최근 대화·에이전트"
          >
            <option value="">새 채팅</option>
            {!!agents?.length && (
              <optgroup label="에이전트">
                {agents.map((a) => (
                  <option key={a.id} value={`agent:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="최근 대화">
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </optgroup>
          </select>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="새 채팅"
            onClick={() => select(null)}
          >
            <SquarePen size={18} />
          </button>
        </div>
        {notReady && (
          <div className={styles.banner} role="status">
            <AlertTriangle size={16} aria-hidden />
            <span>
              AI 에이전트가 아직 연결되지 않았습니다. 서버에 <code>ANTHROPIC_API_KEY</code>를 넣고
              다시 시작하면 사용할 수 있습니다.
            </span>
          </div>
        )}

        {agentId ? (
          activeAgent ? (
            <AgentCallPanel agent={activeAgent} onClose={() => select(null)} />
          ) : (
            <div className={styles.welcome} role="status">
              <div className={styles.working}>
                {agents === null ? (
                  <>
                    <span className={styles.spark} aria-hidden /> 에이전트를 불러오는 중…
                  </>
                ) : (
                  '이 에이전트를 쓸 수 없습니다 — 사용중이 아니거나 공유가 해제되었습니다.'
                )}
              </div>
            </div>
          )
        ) : convLoading ? (
          <div className={styles.welcome} role="status">
            <div className={styles.working}>
              <span className={styles.spark} aria-hidden />
              대화를 불러오는 중…
            </div>
          </div>
        ) : empty ? (
          <>
            <div className={styles.welcome}>
              <h1 className={styles.greeting}>무엇을 도와드릴까요?</h1>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestion}
                    disabled={working || notReady}
                    onClick={() => void send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {/* 대화가 없어도 입력칸은 아래에 고정 — 대화가 시작돼도 같은 자리 */}
            {composer}
          </>
        ) : (
          <>
            {conv && (
              <div className={styles.topbar}>
                {rows.find((r) => r.id === conv.id)?.title ?? conv.title}
              </div>
            )}
            <div className={styles.scroll} ref={scrollRef}>
              <div className={styles.thread}>
                {items.map((it, i) =>
                  it.kind === 'user' ? (
                    <div key={i} className={styles.userTurn}>
                      {!!it.attachments?.length && (
                        <div className={styles.userFiles}>
                          {it.attachments.map((a, k) =>
                            a.kind === 'image' && a.src ? (
                              <img
                                key={k}
                                src={a.src}
                                alt="첨부 이미지"
                                className={styles.userImg}
                              />
                            ) : (
                              <span key={k} className={styles.userFile}>
                                <FileText size={14} /> {a.name}
                              </span>
                            ),
                          )}
                        </div>
                      )}
                      {it.text && <div className={styles.userMsg}>{it.text}</div>}
                    </div>
                  ) : it.kind === 'assistant' ? (
                    <div key={i} className={styles.aiMsg}>
                      <Markdown text={it.text} />
                    </div>
                  ) : it.kind === 'search' ? (
                    <div key={i} className={styles.searchRow}>
                      <Search size={12} aria-hidden /> 기능 찾는 중 · “{it.query}”
                    </div>
                  ) : it.kind === 'code' ? (
                    <CodeRow key={i} item={it} />
                  ) : it.kind === 'file' ? (
                    <FileCard key={it.id} item={it} />
                  ) : (
                    <ToolRow key={i} item={it} tools={tools} />
                  ),
                )}

                {working && (
                  <div className={styles.working} role="status">
                    <span className={styles.spark} aria-hidden />
                    생각하는 중…
                  </div>
                )}

                {nextUp.length > 0 && (
                  <div className={styles.nextList} role="list" aria-label="이어서 할 일">
                    {nextUp.map((q, i) => (
                      <button
                        key={q}
                        type="button"
                        role="listitem"
                        className={styles.nextItem}
                        onClick={() => void send(q)}
                        disabled={notReady}
                      >
                        <span className={styles.nextNo}>{i + 1}</span>
                        <span>{q}</span>
                      </button>
                    ))}
                  </div>
                )}

                {!working && awaiting && conv && (
                  <ApprovalCard
                    key={conv.pending.map((p) => p.toolUseId).join()}
                    pending={conv.pending}
                    tools={tools}
                    busy={busy}
                    onDecide={(d) => void decide(d)}
                  />
                )}

                {!working && conv?.status === 'ERROR' && (
                  <div className={styles.errorBox} role="alert">
                    <AlertTriangle size={16} aria-hidden />
                    <span>{conv.lastError ?? '처리 중 오류가 났습니다.'}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<RotateCcw size={14} />}
                      onClick={() => void retry()}
                    >
                      다시 시도
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {composer}
          </>
        )}
      </section>
    </div>
  );
}
