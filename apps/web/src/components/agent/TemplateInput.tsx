import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AgentVar } from '@tongin/shared';
import styles from '../../pages/agentBuilder.module.css';

interface Props {
  value: string;
  onChange: (v: string) => void;
  vars: AgentVar[];
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  mono?: boolean;
  /** 조건식처럼 {{ }} 없이 경로만 넣을 때 */
  bare?: boolean;
}

/**
 * {{변수}} 템플릿 입력 — "{{"를 치면 위쪽 노드가 만든 변수 목록이 뜨고, 고르면 끼워 넣는다.
 * bare 모드(조건식·목록 경로)는 낱말을 치는 대로 변수 이름을 제안한다.
 */
export function TemplateInput({
  value,
  onChange,
  vars,
  placeholder,
  multiline,
  rows = 3,
  mono,
  bare,
}: Props) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return vars.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 12);
  }, [query, vars]);

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = bare ? /([A-Za-z_][\w.[\]*]*)$/.exec(before) : /\{\{\s*([\w.[\]*]*)$/.exec(before);
    setQuery(m ? m[1] : null);
    setActive(0);
  };

  const insert = (name: string) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const re = bare ? /([A-Za-z_][\w.[\]*]*)$/ : /\{\{\s*([\w.[\]*]*)$/;
    const m = re.exec(before);
    const head = m ? before.slice(0, m.index) : before;
    const token = bare ? name : `{{${name}}}`;
    const tail = !bare && after.startsWith('}}') ? after.slice(2) : after;
    const next = head + token + tail;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = (head + token).length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const onKey = (e: KeyboardEvent) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insert(matches[active].name);
    } else if (e.key === 'Escape') {
      setQuery(null);
    }
  };

  const common = {
    ref,
    value,
    placeholder,
    className: `${multiline ? styles.textarea : styles.input} ${mono ? styles.mono : ''}`,
    onChange: (e: { target: { value: string; selectionStart: number | null } }) => {
      onChange(e.target.value);
      detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    onKeyDown: onKey,
    onBlur: () => setTimeout(() => setQuery(null), 150),
  };

  return (
    <div className={styles.tplWrap}>
      {multiline ? <textarea rows={rows} {...common} /> : <input {...common} />}
      {matches.length > 0 && (
        <div className={styles.suggest}>
          {matches.map((v, i) => (
            <button
              type="button"
              key={v.name}
              className={`${styles.suggestItem} ${i === active ? styles.suggestActive : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(v.name);
              }}
            >
              <code>{v.name}</code>
              <span>
                {v.type} · {v.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 쓸 수 있는 변수 칩 — 누르면 해당 입력 끝에 {{변수}}를 붙인다 */
export function VarChips({ vars, onPick }: { vars: AgentVar[]; onPick: (name: string) => void }) {
  const roots = vars.filter((v) => !v.name.startsWith('run.') && !v.name.startsWith('user.'));
  if (!roots.length) return null;
  return (
    <div className={styles.varChips}>
      {roots.slice(0, 16).map((v) => (
        <button
          key={v.name}
          type="button"
          className={styles.varChip}
          title={v.description}
          onClick={() => onPick(v.name)}
        >
          {v.name}
        </button>
      ))}
    </div>
  );
}
