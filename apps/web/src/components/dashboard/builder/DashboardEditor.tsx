import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
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
  dashFlowOrder,
  flowDashLayout,
  makeDashItem,
  newDashItemId,
  placeDashItem,
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
// 실제 화면(AppLayout)과 같은 값 — 사이드바 폭, 콘텐츠 좌우 여백
const SIDEBAR_W = 240;
const SIDEBAR_COLLAPSED_W = 64;
const CONTENT_PAD_X = 36 * 2;

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
 * 대시보드 편집기(WYSIWYG, 전체 화면) — 앱 사이드바 자리에 위젯 목록, 상단 바에 경로·보기 크기·저장 버튼,
 * 콘텐츠 자리에는 실제 대시보드 화면과 같은 폭·같은 머리(heading)로 그린다.
 * 왼쪽 위젯 목록을 오른쪽 실제 화면에 끌어다 놓고,
 * 제목줄을 잡아 옮기고 오른쪽 아래 모서리로 크기를 바꾼다. 위젯을 우클릭하면 그 자리에 설정 메뉴가 뜬다.
 * 위젯은 왼쪽 위부터 순서대로 흐르듯 채워진다(옮기면 순서가 바뀌고 빈칸 없이 다시 정렬).
 */
export function DashboardEditor({
  layout,
  onChange,
  permissions,
  crumbs,
  actions,
  heading,
  onBack,
}: {
  layout: DashLayout;
  onChange: (l: DashLayout) => void;
  /** 이 권한으로 쓸 수 있는 위젯만 목록에 보인다 */
  permissions: string[];
  /** 상단 바 왼쪽 — 경로(브레드크럼) */
  crumbs: ReactNode;
  /** 상단 바 오른쪽 — 저장 등 */
  actions: ReactNode;
  /** 실제 대시보드 화면의 머리(제목줄) — 위젯이 놓이는 높이까지 같게 */
  heading?: ReactNode;
  onBack: () => void;
}) {
  const items = layout.items;
  const set = useCallback((next: DashItem[]) => onChange({ version: 1, items: next }), [onChange]);
  const { results, loading } = useDashData(items);

  // ── 캔버스 크기 ──
  // 위젯 목록이 사이드바(240px) 자리를 그대로 쓰므로, 콘텐츠 칸 폭 = 실제 대시보드 콘텐츠 폭.
  // 사이드바를 접어 쓰는 사람이면 실제 화면이 그만큼 넓다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0); // 실제 대시보드 폭
  const [aw, setAw] = useState(0); // 지금 쓸 수 있는 폭
  const [ah, setAh] = useState(0); // 지금 보이는 높이
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let collapsed = false;
    try {
      collapsed = localStorage.getItem('tongin_sidebar_collapsed') === '1';
    } catch {
      /* 저장소를 못 쓰면 펼친 사이드바 기준 */
    }
    const extra = collapsed ? SIDEBAR_W - SIDEBAR_COLLAPSED_W : 0;
    const measure = () => {
      const w = Math.floor(box.clientWidth - CONTENT_PAD_X);
      setAw(w);
      setCw(w + extra);
      setAh(box.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  // 실제 크기(100%) ↔ 화면 맞춤(전체 배치를 한 화면에)
  const [fit, setFit] = useState(false);
  const usedRows = Math.max(
    1,
    items.reduce((m, i) => Math.max(m, i.y + i.h), 0),
  );
  const fullH = usedRows * (DASH_ROW_HEIGHT + GAP);
  const scale = fit && cw && aw ? Math.min(1, aw / cw, Math.max(0.2, (ah - 160) / fullH)) : 1;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
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
    if (drag.mode === 'move')
      return placeDashItem(items, orig, {
        x: Math.max(0, Math.min(DASH_COLS - orig.w, Math.round(orig.x + dx / cx))),
        y: Math.max(0, Math.round(orig.y + dy / cy)),
      });
    const resized = {
      ...orig,
      w: Math.max(2, Math.min(DASH_COLS - orig.x, Math.round(orig.w + dx / cx))),
      h: Math.max(2, Math.min(12, Math.round(orig.h + dy / cy))),
    };
    return placeDashItem(items, resized, orig);
  }, [drag, items, colW]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) =>
      setDrag((d) =>
        d
          ? {
              ...d,
              dx: (e.clientX - d.sx) / scaleRef.current,
              dy: (e.clientY - d.sy) / scaleRef.current,
            }
          : d,
      );
    const up = () => {
      // 누르기만 하고 거의 안 움직였으면(위젯 고르기) 배치는 그대로
      const moved = Math.abs(drag.dx) > 3 || Math.abs(drag.dy) > 3;
      if (moved && preview) set(preview);
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
    setMenu(null);
    setDrag({ mode, id: it.id, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, orig: it });
  };

  // ── 목록에서 끌어다 놓기 ──
  const [ghost, setGhost] = useState<DashItem | null>(null);
  const dropPreview = useMemo(
    () => (ghost ? placeDashItem(items, ghost, ghost) : null),
    [ghost, items],
  );
  const cellAt = (e: DragEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - r.left) / scale / (colW + GAP)),
      y: Math.max(0, Math.floor((e.clientY - r.top) / scale / (DASH_ROW_HEIGHT + GAP))),
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
    const it = makeDashItem(def);
    set(flowDashLayout([...dashFlowOrder(items), it]));
    setSelectedId(it.id);
    requestAnimationFrame(() =>
      canvasRef.current
        ?.querySelector(`[data-id="${it.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    );
  };

  const update = (id: string, patch: Partial<DashItem>) => {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    // 크기가 바뀌면 뒤 위젯들을 다시 흘려 정렬
    set(
      patch.w !== undefined || patch.h !== undefined ? flowDashLayout(dashFlowOrder(next)) : next,
    );
  };
  const remove = (id: string) => {
    set(flowDashLayout(dashFlowOrder(items.filter((i) => i.id !== id))));
    setSelectedId(null);
    setMenu(null);
  };
  const duplicate = (it: DashItem) => {
    const order = dashFlowOrder(items);
    const copy = { ...it, id: newDashItemId() };
    order.splice(order.findIndex((i) => i.id === it.id) + 1, 0, copy);
    set(flowDashLayout(order));
    setSelectedId(copy.id);
    setMenu(null);
  };

  // ── 우클릭 설정 메뉴 ──
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuItem = menu ? (items.find((i) => i.id === menu.id) ?? null) : null;

  // 키보드: 고른 위젯을 화살표로 옮기기, Delete로 빼기
  useEffect(() => {
    if (!selected) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        e.key
      ];
      if (e.key === 'Escape') {
        if (menu) setMenu(null);
        else setSelectedId(null);
        return;
      }
      if (menu) return;
      if (d) {
        e.preventDefault();
        if (d[0]) {
          // 좌우: 순서에서 앞·뒤 위젯과 자리 바꾸기
          const order = dashFlowOrder(items);
          const at = order.findIndex((i) => i.id === selected.id);
          const to = at + d[0];
          if (to < 0 || to >= order.length) return;
          [order[at], order[to]] = [order[to], order[at]];
          set(flowDashLayout(order));
        } else {
          set(placeDashItem(items, selected, { x: selected.x, y: Math.max(0, selected.y + d[1]) }));
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(selected.id);
      }
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
  const used = view.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  const rows = Math.max(8, used + 3);

  return (
    <div className={styles.studio}>
      {/* 사이드바 자리: 위젯 목록 */}
      <aside className={styles.studioSide}>
        <div className={styles.studioSideHead}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onBack}
            aria-label="나가기"
            title="나가기"
          >
            <ArrowLeft size={16} />
          </button>
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

      {/* 상단 바: 경로 · 보기 크기 · 저장 */}
      <header className={styles.studioBar}>
        <div className={styles.crumbs}>{crumbs}</div>
        <span className={styles.spacer} />
        <span className={`${styles.meta} ${styles.studioWidth}`}>
          실제 화면 폭 {cw.toLocaleString()}px
          {scale < 0.995 ? ` · ${Math.round(scale * 100)}%` : ''}
        </span>
        <span className={styles.zoomToggle} role="group" aria-label="보기 크기">
          <button
            type="button"
            aria-pressed={!fit}
            className={!fit ? styles.zoomOn : undefined}
            onClick={() => setFit(false)}
          >
            실제 크기
          </button>
          <button
            type="button"
            aria-pressed={fit}
            className={fit ? styles.zoomOn : undefined}
            onClick={() => setFit(true)}
          >
            화면 맞춤
          </button>
        </span>
        {actions}
      </header>

      {/* 콘텐츠 자리: 실제 대시보드와 같은 여백·머리·폭 */}
      <main
        ref={scrollRef}
        className={styles.studioMain}
        onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}
      >
        <div className={styles.studioInner}>
          {heading}
          <div
            className={styles.canvasFrame}
            style={{
              width: cw * scale,
              height: rows * (DASH_ROW_HEIGHT + GAP) * scale,
            }}
          >
            <div
              ref={canvasRef}
              className={`${styles.canvas} ${drag || ghost ? styles.canvasActive : ''}`}
              style={{
                width: cw,
                transform: scale < 0.995 ? `scale(${scale})` : undefined,
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
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedId(it.id);
                          setMenu({ id: it.id, x: e.clientX, y: e.clientY });
                        }}
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
          {items.length > 0 && (
            <div className={styles.studioHint}>
              위젯 제목줄을 끌어 순서를 바꾸고, 모서리로 크기를 바꾸고, 우클릭으로 설정합니다.
            </div>
          )}
        </div>
      </main>

      {/* 우클릭한 자리에 뜨는 설정 메뉴 */}
      {menu && menuItem && (
        <WidgetMenu
          key={menuItem.id}
          at={menu}
          item={menuItem}
          onChange={(patch) => update(menuItem.id, patch)}
          onRemove={() => remove(menuItem.id)}
          onDuplicate={() => duplicate(menuItem)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** 위젯 우클릭 메뉴 — 누른 자리에 뜨고, 화면 밖으로 나가지 않게 자리를 맞춘다. 바깥을 누르거나 Esc로 닫는다. */
function WidgetMenu({
  at,
  item,
  onChange,
  onRemove,
  onDuplicate,
  onClose,
}: {
  at: { x: number; y: number };
  item: DashItem;
  onChange: (p: Partial<DashItem>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const def = DASH_WIDGET_MAP.get(item.widget)!;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(m, Math.min(at.x, window.innerWidth - width - m)),
      top: Math.max(m, Math.min(at.y, window.innerHeight - height - m)),
    });
  }, [at.x, at.y]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const scroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="위젯 설정"
      className={styles.ctxMenu}
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
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
                max={DASH_COLS}
                value={item.w}
                onChange={(e) =>
                  onChange({ w: Math.max(2, Math.min(DASH_COLS, Number(e.target.value) || 2)) })
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
        <span className={styles.meta}>
          위젯을 고른 뒤 화살표 키로 순서를 바꾸고 Delete로 뺄 수 있습니다.
        </span>
      </div>
    </div>,
    document.body,
  );
}
