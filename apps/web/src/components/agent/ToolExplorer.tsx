import { useMemo, useState, type DragEvent } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
// 좁은 패널용 작은 세그먼트 — 공용 래퍼(components/ui)는 큰 크기로 고정돼 있어 원본을 쓴다
import { SegmentedControl } from '@sunghoon_lee/akron-ui';
import type { AgentJsonSchema, AgentToolInfo } from '@tongin/shared';
import styles from '../../pages/agentBuilder.module.css';

export const DND_MIME = 'application/x-agent-node';

export function ModeBadge({ mode }: { mode: 'READ' | 'WRITE' }) {
  return (
    <span
      className={`${styles.modeBadge} ${mode === 'WRITE' ? styles.modeWrite : styles.modeRead}`}
    >
      {mode === 'WRITE' ? '쓰기' : '읽기'}
    </span>
  );
}

const typeOf = (s: AgentJsonSchema) =>
  s.enum
    ? `enum(${s.enum.slice(0, 4).join('|')}${s.enum.length > 4 ? '…' : ''})`
    : String(s.type ?? 'any');

export function SchemaPreview({ schema }: { schema: AgentJsonSchema }) {
  const req = new Set(schema.required ?? []);
  const props = Object.entries(schema.properties ?? {});
  if (!props.length) return <div className={styles.schema}>인자 없음</div>;
  return (
    <div className={styles.schema}>
      {props.map(([k, v]) => (
        <div key={k}>
          <div className={styles.schemaRow}>
            <code>
              {k}
              {req.has(k) && <span className={styles.req}>*</span>}
            </code>
            <span>{typeOf(v)}</span>
          </div>
          {v.properties && (
            <div style={{ paddingLeft: 10 }}>
              {Object.entries(v.properties)
                .slice(0, 14)
                .map(([p, ps]) => (
                  <div key={p} className={styles.schemaRow}>
                    <code>
                      .{p}
                      {(v.required ?? []).includes(p) && <span className={styles.req}>*</span>}
                    </code>
                    <span>{typeOf(ps)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface Props {
  tools: AgentToolInfo[];
  /** 누르면 이 도구로(선택 모달) / 캔버스에 추가(탐색기) */
  onPick: (tool: AgentToolInfo) => void;
  pickLabel?: string;
  draggable?: boolean;
  autoFocus?: boolean;
}

/** 도구 탐색기 — 업무별로 묶은 실제 호출 가능 도구. 끌어다 캔버스에 놓으면 도구 노드가 된다 */
export function ToolExplorer({
  tools,
  onPick,
  pickLabel = '캔버스에 추가',
  draggable = true,
  autoFocus,
}: Props) {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('ALL');
  const [open, setOpen] = useState<string | null>(null);
  // 처음엔 업무 도구 묶음만 펼친다(ERP API 도구는 180개 가까이 된다). 검색 중에는 모두 펼친다
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['AI 업무 도구']));

  const groups = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = tools.filter((t) => {
      if (mode !== 'ALL' && t.mode !== mode) return false;
      const hay = `${t.name} ${t.description} ${t.keywords ?? ''} ${t.group}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const m = new Map<string, AgentToolInfo[]>();
    for (const t of list) {
      if (!m.has(t.group)) m.set(t.group, []);
      m.get(t.group)!.push(t);
    }
    // 업무 도구를 맨 위에
    return [...m.entries()].sort(([a], [b]) =>
      a === 'AI 업무 도구' ? -1 : b === 'AI 업무 도구' ? 1 : a.localeCompare(b, 'ko'),
    );
  }, [tools, q, mode]);

  const onDragStart = (e: DragEvent, t: AgentToolInfo) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify({ type: 'tool', tool: t.name }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const total = groups.reduce((n, [, l]) => n + l.length, 0);
  const searching = q.trim().length > 0;

  return (
    <>
      <div className={styles.searchBox}>
        <div style={{ position: 'relative' }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 8,
              top: 9,
              color: 'var(--ark-color-text-tertiary)',
            }}
          />
          <input
            className={styles.input}
            style={{ paddingLeft: 26 }}
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`도구 ${tools.length}개 검색 (예: 미수금, 문자, 견적)`}
          />
        </div>
        <SegmentedControl
          size="sm"
          fullWidth
          value={mode}
          onChange={setMode}
          options={[
            { value: 'ALL', label: '전체' },
            { value: 'READ', label: '읽기' },
            { value: 'WRITE', label: '쓰기' },
          ]}
        />
      </div>
      <div className={styles.toolList}>
        {!total && (
          <div className={styles.note} style={{ padding: 8 }}>
            맞는 도구가 없습니다.
          </div>
        )}
        {groups.map(([g, list]) => {
          const closed = !searching && !openGroups.has(g);
          return (
            <div key={g}>
              <button
                type="button"
                className={styles.groupHead}
                onClick={() =>
                  setOpenGroups((s) => {
                    const n = new Set(s);
                    if (n.has(g)) n.delete(g);
                    else n.add(g);
                    return n;
                  })
                }
              >
                {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                {g}
                <span>{list.length}</span>
              </button>
              {!closed &&
                list.map((t) => (
                  <div
                    key={t.name}
                    className={`${styles.toolItem} ${open === t.name ? styles.toolItemOpen : ''}`}
                    draggable={draggable}
                    onDragStart={(e) => onDragStart(e, t)}
                    onClick={() => setOpen(open === t.name ? null : t.name)}
                    title={draggable ? '끌어다 캔버스에 놓으세요' : undefined}
                  >
                    <div className={styles.toolName}>
                      <ModeBadge mode={t.mode} />
                      {t.name}
                    </div>
                    <div className={styles.toolDesc}>
                      {t.description.replace(/^\[[^\]]*\]\s*/, '')}
                    </div>
                    {open === t.name && (
                      <>
                        <SchemaPreview schema={t.inputSchema} />
                        <button
                          type="button"
                          className={`${styles.smallBtn} ${styles.addTool}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPick(t);
                          }}
                        >
                          {pickLabel}
                        </button>
                      </>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
