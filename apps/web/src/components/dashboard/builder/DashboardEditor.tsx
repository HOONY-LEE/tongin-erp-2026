import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  Copy,
  Filter,
  Gauge,
  GripVertical,
  Hash,
  LineChart,
  List,
  Map as MapIcon,
  PieChart,
  Plus,
  Search,
  Table2,
  Trash2,
  Type,
  Grid3x3,
  CircleDot,
  X,
} from 'lucide-react';
import {
  DASH_COLS,
  DASH_GROUPS,
  DASH_METRICS,
  DASH_METRIC_LABEL,
  DASH_PERIODS,
  DASH_PERIOD_LABEL,
  DASH_ROW_HEIGHT,
  DASH_VIZ_LABEL,
  DASH_WIDGETS,
  DASH_WIDGET_MAP,
  canUseWidget,
  compactDashLayout,
  makeDashItem,
  newDashItemId,
  type DashItem,
  type DashLayout,
  type DashMetric,
  type DashPeriod,
  type DashViz,
} from '@tongin/shared';
import { useDashData } from './useDashData';
import { WidgetFrame } from './WidgetFrame';
import styles from './builder.module.css';

const GAP = 12;
const DND_MIME = 'application/x-tongin-widget';

export const VIZ_ICON: Record<DashViz, typeof BarChart3> = {
  card: Hash,
  gauge: Gauge,
  bar: BarChart3,
  hbar: BarChartHorizontal,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  donut: CircleDot,
  funnel: Filter,
  table: Table2,
  list: List,
  map: MapIcon,
  heatmap: Grid3x3,
  text: Type,
};

type Drag = {
  mode: 'move' | 'resize';
  id: string;
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  orig: DashItem;
} | null;

/**
 * 대시보드 편집기(WYSIWYG) — 왼쪽 위젯 목록을 오른쪽 실제 화면에 끌어다 놓고,
 * 제목줄을 잡아 옮기고 오른쪽 아래 모서리로 크기를 바꾼다. 위젯을 누르면 오른쪽에서 보기 방식·기간을 고른다.
 * 겹치면 아래 위젯이 밀려 내려가고 빈 줄은 위로 당겨진다.
 */
export function DashboardEditor({
  layout,
  onChange,
  permissions,
}: {
  layout: DashLayout;
  onChange: (l: DashLayout) => void;
  /** 이 권한으로 쓸 수 있는 위젯만 목록에 보인다 */
  permissions: string[];
}) {
  const items = layout.items;
  const set = useCallback((next: DashItem[]) => onChange({ version: 1, items: next }), [onChange]);
  const { results, loading } = useDashData(items);

  // ── 캔버스 크기 ──
  const canvasRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const colW = Math.max(10, (cw - GAP * (DASH_COLS - 1)) / DASH_COLS);
  const px = (it: Pick<DashItem, 'x' | 'y' | 'w' | 'h'>) => ({
    left: it.x * (colW + GAP),
    top: it.y * (DASH_ROW_HEIGHT + GAP),
    width: it.w * colW + (it.w - 1) * GAP,
    height: it.h * DASH_ROW_HEIGHT + (it.h - 1) * GAP,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  // ── 옮기기·크기 바꾸기 ──
  const [drag, setDrag] = useState<Drag>(null);
  const preview = useMemo(() => {
    if (!drag) return null;
    const { orig, dx, dy } = drag;
    const cx = colW + GAP;
    const cy = DASH_ROW_HEIGHT + GAP;
    const moved: DashItem =
      drag.mode === 'move'
        ? {
            ...orig,
            x: Math.max(0, Math.min(DASH_COLS - orig.w, Math.round(orig.x + dx / cx))),
            y: Math.max(0, Math.round(orig.y + dy / cy)),
          }
        : {
            ...orig,
            w: Math.max(2, Math.min(DASH_COLS - orig.x, Math.round(orig.w + dx / cx))),
            h: Math.max(2, Math.min(12, Math.round(orig.h + dy / cy))),
          };
    return compactDashLayout(
      items.map((i) => (i.id === orig.id ? moved : i)),
      orig.id,
    );
  }, [drag, items, colW]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) =>
      setDrag((d) => (d ? { ...d, dx: e.clientX - d.sx, dy: e.clientY - d.sy } : d));
    const up = () => {
      if (preview) set(preview);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, preview, set]);

  const startDrag = (e: React.PointerEvent, it: DashItem, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(it.id);
    setDrag({ mode, id: it.id, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, orig: it });
  };

  // ── 목록에서 끌어다 놓기 ──
  const [ghost, setGhost] = useState<DashItem | null>(null);
  const dropPreview = useMemo(
    () => (ghost ? compactDashLayout([...items, ghost], ghost.id) : null),
    [ghost, items],
  );
  const cellAt = (e: DragEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - r.left) / (colW + GAP)),
      y: Math.max(0, Math.floor((e.clientY - r.top) / (DASH_ROW_HEIGHT + GAP))),
    };
  };
  const onDragOver = (e: DragEvent) => {
    const key = [...e.dataTransfer.types].includes(DND_MIME) ? dragKey.current : null;
    if (!key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const def = DASH_WIDGET_MAP.get(key);
    if (!def) return;
    const c = cellAt(e);
    const x = Math.max(0, Math.min(DASH_COLS - def.size.w, c.x - Math.floor(def.size.w / 2) + 1));
    setGhost((g) =>
      g && g.widget === key && g.x === x && g.y === c.y
        ? g
        : { ...makeDashItem(def, x, c.y), id: '__ghost__' },
    );
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (!ghost || !dropPreview) return;
    const id = newDashItemId();
    set(dropPreview.map((i) => (i.id === '__ghost__' ? { ...i, id } : i)));
    setSelectedId(id);
    setGhost(null);
    dragKey.current = null;
  };
  const dragKey = useRef<string | null>(null);

  const addToBottom = (key: string) => {
    const def = DASH_WIDGET_MAP.get(key);
    if (!def) return;
    const bottom = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
    const it = makeDashItem(def, 0, bottom);
    set(compactDashLayout([...items, it], it.id));
    setSelectedId(it.id);
    requestAnimationFrame(() =>
      canvasRef.current
        ?.querySelector(`[data-id="${it.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    );
  };

  const update = (id: string, patch: Partial<DashItem>) =>
    set(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => {
    set(compactDashLayout(items.filter((i) => i.id !== id)));
    setSelectedId(null);
  };
  const duplicate = (it: DashItem) => {
    const copy = { ...it, id: newDashItemId(), y: it.y + it.h };
    set(compactDashLayout([...items, copy], copy.id));
    setSelectedId(copy.id);
  };

  // 키보드: 고른 위젯을 화살표로 옮기기, Delete로 빼기
  useEffect(() => {
    if (!selected) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        e.key
      ];
      if (d) {
        e.preventDefault();
        const moved = {
          ...selected,
          x: Math.max(0, Math.min(DASH_COLS - selected.w, selected.x + d[0])),
          y: Math.max(0, selected.y + d[1]),
        };
        set(
          compactDashLayout(
            items.map((i) => (i.id === selected.id ? moved : i)),
            selected.id,
          ),
        );
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(selected.id);
      } else if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // ── 위젯 목록 ──
  const [q, setQ] = useState('');
  const usable = useMemo(
    () => DASH_WIDGETS.filter((w) => canUseWidget(w, permissions)),
    [permissions],
  );
  const shown = usable.filter((w) => {
    const k = q.trim();
    return !k || w.title.includes(k) || w.description.includes(k) || w.group.includes(k);
  });
  const hidden = DASH_WIDGETS.length - usable.length;

  const view = dropPreview ?? preview ?? items;
  const rows = Math.max(8, view.reduce((m, i) => Math.max(m, i.y + i.h), 0) + 3);

  return (
    <div className={styles.editor}>
      {/* 왼쪽: 위젯 목록 */}
      <aside className={styles.palette}>
        <div className={styles.paletteHead}>
          <b>위젯</b>
          <span className={styles.meta}>{usable.length}개</span>
        </div>
        <label className={styles.searchBox}>
          <Search size={14} aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="위젯 찾기"
            aria-label="위젯 찾기"
          />
        </label>
        <div className={styles.paletteList}>
          {DASH_GROUPS.map((g) => {
            const list = shown.filter((w) => w.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className={styles.paletteGroup}>
                <div className={styles.paletteGroupTitle}>{g}</div>
                {list.map((w) => (
                  <div
                    key={w.key}
                    className={styles.paletteItem}
                    draggable
                    onDragStart={(e) => {
                      dragKey.current = w.key;
                      e.dataTransfer.setData(DND_MIME, w.key);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={() => {
                      setGhost(null);
                      dragKey.current = null;
                    }}
                    title={`${w.description}\n끌어다 놓거나 +를 누르세요`}
                  >
                    <GripVertical size={14} className={styles.grip} aria-hidden />
                    <span className={styles.paletteText}>
                      <span className={styles.paletteName}>{w.title}</span>
                      <span className={styles.vizIcons}>
                        {w.viz.map((v) => {
                          const I = VIZ_ICON[v];
                          return <I key={v} size={12} aria-label={DASH_VIZ_LABEL[v]} />;
                        })}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={styles.addBtn}
                      aria-label={`${w.title} 추가`}
                      onClick={() => addToBottom(w.key)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {hidden > 0 && (
            <div className={styles.paletteNote}>
              권한이 없는 데이터의 위젯 {hidden}개는 보이지 않습니다.
            </div>
          )}
        </div>
      </aside>

      {/* 가운데: 실제 화면 */}
      <div
        className={styles.canvasScroll}
        onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}
      >
        <div
          ref={canvasRef}
          className={`${styles.canvas} ${drag || ghost ? styles.canvasActive : ''}`}
          style={{
            height: rows * (DASH_ROW_HEIGHT + GAP),
            ['--col' as string]: `${colW + GAP}px`,
            ['--row' as string]: `${DASH_ROW_HEIGHT + GAP}px`,
          }}
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setGhost(null);
          }}
          onDrop={onDrop}
          onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}
        >
          {!items.length && !ghost && (
            <div className={styles.canvasEmpty}>왼쪽에서 위젯을 끌어다 여기에 놓으세요</div>
          )}
          {/* 놓일 자리 */}
          {(ghost || drag) &&
            (() => {
              const target = view.find((i) => i.id === (ghost ? '__ghost__' : drag!.id));
              return target ? <div className={styles.placeholder} style={px(target)} /> : null;
            })()}
          {/* 폭을 재기 전에는 그리지 않는다(좁은 폭에서 늘어나는 움직임이 보이지 않게) */}
          {cw > 0 &&
            view
              .filter((i) => i.id !== '__ghost__')
              .map((it) => {
                const dragging = drag?.id === it.id;
                const base = dragging ? drag!.orig : it;
                const p = px(base);
                const style = dragging
                  ? drag!.mode === 'move'
                    ? { ...p, left: p.left + drag!.dx, top: p.top + drag!.dy, zIndex: 20 }
                    : {
                        ...p,
                        width: Math.max(colW * 2, p.width + drag!.dx),
                        height: Math.max(DASH_ROW_HEIGHT * 2, p.height + drag!.dy),
                        zIndex: 20,
                      }
                  : px(it);
                return (
                  <div
                    key={it.id}
                    data-id={it.id}
                    className={`${styles.item} ${dragging ? styles.itemDragging : ''}`}
                    style={style}
                    onPointerDown={() => setSelectedId(it.id)}
                  >
                    <WidgetFrame
                      item={it}
                      result={results[it.id]}
                      loading={loading.has(it.id)}
                      selected={selectedId === it.id}
                      dragHandleProps={{
                        onPointerDown: (e) => startDrag(e, it, 'move'),
                        style: { cursor: dragging ? 'grabbing' : 'grab' },
                        title: '끌어서 옮기기',
                      }}
                      actions={
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="빼기"
                          title="빼기"
                          onClick={() => remove(it.id)}
                        >
                          <X size={14} />
                        </button>
                      }
                    />
                    <div
                      className={styles.resize}
                      onPointerDown={(e) => startDrag(e, it, 'resize')}
                      title="끌어서 크기 바꾸기"
                      aria-hidden
                    />
                  </div>
                );
              })}
        </div>
      </div>

      {/* 오른쪽: 고른 위젯 설정 */}
      {selected && (
        <Inspector
          key={selected.id}
          item={selected}
          onChange={(patch) => update(selected.id, patch)}
          onRemove={() => remove(selected.id)}
          onDuplicate={() => duplicate(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function Inspector({
  item,
  onChange,
  onRemove,
  onDuplicate,
  onClose,
}: {
  item: DashItem;
  onChange: (p: Partial<DashItem>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const def = DASH_WIDGET_MAP.get(item.widget)!;
  return (
    <aside className={styles.inspector} aria-label="위젯 설정">
      <div className={styles.paletteHead}>
        <b>위젯 설정</b>
        <span className={styles.spacer} />
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="닫기">
          <X size={14} />
        </button>
      </div>
      <div className={styles.inspectorBody}>
        <div>
          <div className={styles.inspectorTitle}>{def.title}</div>
          <div className={styles.meta}>{def.description}</div>
        </div>
        <label className={styles.field}>
          제목
          <input
            className={styles.input}
            value={item.title ?? ''}
            placeholder={def.title}
            maxLength={60}
            onChange={(e) => onChange({ title: e.target.value || undefined })}
          />
        </label>
        {def.viz.length > 1 && (
          <div className={styles.field}>
            보기 방식
            <div className={styles.vizGrid}>
              {def.viz.map((v) => {
                const I = VIZ_ICON[v];
                return (
                  <button
                    key={v}
                    type="button"
                    className={`${styles.vizOpt} ${item.viz === v ? styles.vizOptOn : ''}`}
                    aria-pressed={item.viz === v}
                    onClick={() => onChange({ viz: v })}
                  >
                    <I size={16} aria-hidden />
                    {DASH_VIZ_LABEL[v]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {def.period && (
          <label className={styles.field}>
            기간
            <select
              className={styles.input}
              value={item.period ?? def.period}
              onChange={(e) => onChange({ period: e.target.value as DashPeriod })}
            >
              {DASH_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {DASH_PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        )}
        {def.metric && (
          <label className={styles.field}>
            지표
            <select
              className={styles.input}
              value={item.metric ?? def.metric}
              onChange={(e) => onChange({ metric: e.target.value as DashMetric })}
            >
              {DASH_METRICS.map((m) => (
                <option key={m} value={m}>
                  {DASH_METRIC_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        )}
        {def.shape === 'text' && (
          <label className={styles.field}>
            내용
            <textarea
              className={styles.input}
              rows={6}
              maxLength={2000}
              value={item.text ?? ''}
              placeholder="예: 이번 달 목표 — 계약 120건"
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </label>
        )}
        <div className={styles.field}>
          크기(칸)
          <div className={styles.sizeRow}>
            <label>
              가로
              <input
                className={styles.input}
                type="number"
                min={2}
                max={DASH_COLS - item.x}
                value={item.w}
                onChange={(e) =>
                  onChange({
                    w: Math.max(2, Math.min(DASH_COLS - item.x, Number(e.target.value) || 2)),
                  })
                }
              />
            </label>
            <label>
              세로
              <input
                className={styles.input}
                type="number"
                min={2}
                max={12}
                value={item.h}
                onChange={(e) =>
                  onChange({ h: Math.max(2, Math.min(12, Number(e.target.value) || 2)) })
                }
              />
            </label>
          </div>
          <span className={styles.meta}>
            가로 12칸이 화면 전체 폭입니다. 모서리를 끌어도 됩니다.
          </span>
        </div>
        <div className={styles.inspectorActions}>
          <button type="button" className={styles.textBtn} onClick={onDuplicate}>
            <Copy size={14} /> 복제
          </button>
          <button type="button" className={`${styles.textBtn} ${styles.danger}`} onClick={onRemove}>
            <Trash2 size={14} /> 빼기
          </button>
        </div>
        <span className={styles.meta}>화살표 키로 옮기고 Delete로 뺄 수 있습니다.</span>
      </div>
    </aside>
  );
}
