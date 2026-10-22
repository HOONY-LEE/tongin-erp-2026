import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bot, Plus, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Button, PageHeader, Spinner, useToast } from '../components/ui';
import { Markdown } from '../components/ai/Markdown';
import { ApprovalCard, ToolRow } from '../components/ai/ChatParts';
import type {
  AiStatus,
  AiToolInfo,
  ChatItem,
  Conversation,
  ConversationRow,
  Decision,
} from '../components/ai/types';
import styles from '../components/ai/ai.module.css';

const SUGGESTIONS = [
  '이번 주 미계약 고객들에게 계약 안내 문자 한 번 더 보내줘',
  '다음 주 이사 예정인 건 지점별로 정리해줘',
  '견적만 받고 계약 안 한 고객이 몇 명이야?',
  '이번 달 미수금이 많은 고객 5명 알려줘',
];

/**
 * AI 비서 — 시킨 일을 AI가 ERP 도구(조회·등록·발송)로 나눠서 처리한다.
 * 조회는 바로 실행되고, 등록·수정·발송은 승인 카드에서 확인해야 실행된다.
 */
export default function AiAssistant() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [tools, setTools] = useState<Map<string, AiToolInfo>>(new Map());
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  /** 응답을 기다리는 동안 화면에 먼저 보여 줄 사용자 글 */
  const [echo, setEcho] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadList = useCallback(() => {
    api<ConversationRow[]>('/ai/conversations')
      .then(setRows)
      .catch(() => setRows([]));
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

  // 새 내용이 오면 맨 아래로
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv, echo, busy]);

  const select = (id: string | null) => {
    setEcho(null);
    setParams(id ? { c: id } : {});
    if (!id) setConv(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const run = async (fn: () => Promise<Conversation>) => {
    setBusy(true);
    try {
      const next = await fn();
      setConv(next);
      if (next.id !== activeId) setParams({ c: next.id }, { replace: true });
      loadList();
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

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft('');
    setEcho(t);
    await run(async () => {
      const id = conv?.id ?? (await api<Conversation>('/ai/conversations', { method: 'POST' })).id;
      return api<Conversation>(`/ai/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: t }),
      });
    });
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const items: ChatItem[] = useMemo(
    () => [...(conv?.items ?? []), ...(echo ? [{ kind: 'user' as const, text: echo }] : [])],
    [conv, echo],
  );
  const awaiting = conv?.status === 'AWAITING_APPROVAL' && conv.pending.length > 0;
  const notReady = status !== null && !status.configured;
  const readCount = useMemo(
    () => [...tools.values()].filter((t) => t.mode === 'READ').length,
    [tools],
  );

  return (
    <>
      <PageHeader title="AI 비서" />
      <div className={styles.layout}>
        <aside className={styles.side} aria-label="대화 목록">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => select(null)}
          >
            새 대화
          </Button>
          <div className={styles.convList}>
            {rows.length === 0 && <div className={styles.sub}>아직 대화가 없습니다.</div>}
            {rows.map((r) => (
              <div
                key={r.id}
                className={[styles.convRow, r.id === activeId ? styles.convActive : ''].join(' ')}
              >
                <button type="button" className={styles.convBtn} onClick={() => select(r.id)}>
                  <span className={styles.convTitle}>{r.title}</span>
                  {r.status === 'AWAITING_APPROVAL' && (
                    <span className={styles.dot} title="승인 대기" />
                  )}
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`${r.title} 삭제`}
                  onClick={() => void remove(r.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className={styles.chat}>
          {notReady && (
            <div className={styles.banner} role="status">
              <AlertTriangle size={16} aria-hidden />
              <span>
                AI 비서가 아직 연결되지 않았습니다. 서버 <code>apps/api/.env</code>에{' '}
                <code>ANTHROPIC_API_KEY</code>를 넣고 API를 다시 시작하면 사용할 수 있습니다.
              </span>
            </div>
          )}

          <div className={styles.scroll} ref={scrollRef}>
            {items.length === 0 ? (
              <div className={styles.empty}>
                <Bot size={36} className={styles.emptyIcon} aria-hidden />
                <div className={styles.emptyTitle}>무엇을 도와드릴까요?</div>
                <div className={styles.sub}>
                  조회·통계는 바로 처리하고, 등록·수정·문자 발송은 실행 전에 확인을 받습니다.
                  {tools.size > 0 &&
                    ` 지금 권한으로 쓸 수 있는 기능 ${tools.size}개(조회 ${readCount} · 처리 ${tools.size - readCount}).`}
                </div>
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={styles.suggestion}
                      disabled={busy || notReady}
                      onClick={() => void send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.thread}>
                {items.map((it, i) =>
                  it.kind === 'user' ? (
                    <div key={i} className={styles.userMsg}>
                      {it.text}
                    </div>
                  ) : it.kind === 'assistant' ? (
                    <div key={i} className={styles.aiMsg}>
                      <Markdown text={it.text} />
                    </div>
                  ) : it.kind === 'search' ? (
                    <div key={i} className={styles.searchRow}>
                      <Search size={12} aria-hidden /> 기능 찾는 중 · “{it.query}”
                    </div>
                  ) : (
                    <ToolRow key={i} item={it} tools={tools} />
                  ),
                )}

                {busy && (
                  <div className={styles.working} role="status">
                    <Spinner size="sm" /> AI가 처리하고 있습니다…
                  </div>
                )}

                {!busy && awaiting && conv && (
                  <ApprovalCard
                    key={conv.pending.map((p) => p.toolUseId).join()}
                    pending={conv.pending}
                    tools={tools}
                    busy={busy}
                    onDecide={(d) => void decide(d)}
                  />
                )}

                {!busy && conv?.status === 'ERROR' && (
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
            )}
          </div>

          <div className={styles.composer}>
            <textarea
              ref={inputRef}
              className={styles.input}
              value={draft}
              rows={2}
              placeholder={
                busy
                  ? 'AI가 처리하는 중입니다…'
                  : awaiting
                    ? '위 작업을 승인·거절하거나, 다른 요청을 입력하면 대기 중인 작업은 취소됩니다'
                    : '예) 이번 주 미계약 고객에게 계약 안내 문자 보내줘'
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              disabled={notReady}
              aria-label="AI에게 보낼 메시지"
            />
            <Button
              variant="primary"
              size="md"
              leftIcon={<Send size={15} />}
              aria-label="보내기"
              disabled={!draft.trim() || busy || notReady}
              onClick={() => void send(draft)}
            >
              <span className={styles.sendLabel}>보내기</span>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
