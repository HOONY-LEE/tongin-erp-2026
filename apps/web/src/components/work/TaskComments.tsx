import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useDirectory, type DirectoryPerson } from '../../lib/approvals';
import { Button, useToast } from '../ui';
import styles from './taskComments.module.css';

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  mine: boolean;
  mentions: { id: string; name: string }[];
}

const when = (v: string) =>
  new Date(v).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });

/** 본문의 '@이름'을 멘션 색으로 */
function Body({ text, names }: { text: string; names: string[] }) {
  if (!names.length) return <>{text}</>;
  const re = new RegExp(
    `(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`,
    'g',
  );
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className={styles.mention}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * 팀 업무 댓글 — '@'를 치면 직원을 골라 부를 수 있다(멘션). 부른 사람과 담당자·요청자에게 알림이 간다.
 */
export function TaskComments({ taskId }: { taskId: string }) {
  const toast = useToast();
  const { people } = useDirectory();
  const [rows, setRows] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<DirectoryPerson[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<Comment[]>(`/tasks/${taskId}/comments`));
    } catch {
      setRows([]);
    }
  }, [taskId]);
  useEffect(() => {
    void load();
  }, [load]);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.trim();
    return people
      .filter((p) => !q || p.name.includes(q))
      .sort((a, b) => Number(!a.name.startsWith(q)) - Number(!b.name.startsWith(q)))
      .slice(0, 6);
  }, [people, query]);

  /** 커서 앞이 '@글자'면 고르기 목록을 연다 */
  const onChange = (v: string) => {
    setText(v);
    const caret = ref.current?.selectionStart ?? v.length;
    const m = /@([가-힣A-Za-z]{0,10})$/.exec(v.slice(0, caret));
    setQuery(m ? m[1] : null);
    setActive(0);
  };

  const pick = (p: DirectoryPerson) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([가-힣A-Za-z]{0,10})$/, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, p]));
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // 본문에서 지운 멘션은 빼고 보낸다
      const mentionEmpIds = picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
      await api(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body, mentionEmpIds }),
      });
      setText('');
      setPicked([]);
      await load();
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '댓글을 남기지 못했습니다',
      });
    } finally {
      setSending(false);
    }
  };

  const remove = async (c: Comment) => {
    try {
      await api(`/tasks/${taskId}/comments/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[active]);
        return;
      }
      if (e.key === 'Escape') {
        setQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section className="rd-card">
      <h3 className="rd-title">댓글 {rows.length > 0 && rows.length}</h3>
      {rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((c) => (
            <li key={c.id} className={styles.item}>
              <div className={styles.head}>
                <b>{c.authorName}</b>
                <span className={styles.meta}>{when(c.createdAt)}</span>
                {c.mine && (
                  <button
                    type="button"
                    className={styles.del}
                    title="댓글 지우기"
                    aria-label="댓글 지우기"
                    onClick={() => void remove(c)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <p className={styles.body}>
                <Body text={c.body} names={c.mentions.map((m) => m.name).filter(Boolean)} />
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.compose}>
        <textarea
          ref={ref}
          className={styles.input}
          value={text}
          rows={3}
          maxLength={2000}
          placeholder="댓글을 남기세요. @이름으로 동료를 부르면 알림이 갑니다 (⌘/Ctrl+Enter로 등록)"
          aria-label="댓글"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
        />
        {matches.length > 0 && (
          <ul className={styles.picker} role="listbox" aria-label="부를 사람">
            {matches.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? styles.pickActive : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(p);
                  }}
                >
                  <b>{p.name}</b>
                  <span className={styles.meta}>
                    {[p.positionName, p.orgUnitName].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!text.trim()}
            onClick={() => void send()}
          >
            댓글 등록
          </Button>
        </div>
      </div>
    </section>
  );
}
