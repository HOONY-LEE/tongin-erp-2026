import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Select } from '@sunghoon_lee/akron-ui';
import {
  STUDIO_COLS,
  STUDIO_DATASET_MAP,
  compactStudioRows,
  studioElementIds,
  studioLayout,
  type DashItem,
  type StudioBox,
  type StudioControl,
  type StudioParams,
  type StudioResult,
  type StudioSpec,
} from '@tongin/shared';
import { ApiError } from '../../../lib/api';
import { FilterButton, SegmentedControl, Skeleton, type FilterField } from '../../ui';
import { VizBody } from '../viz/Charts';
import { ctrlLabel, optLabel } from './studioLabels';
import styles from './studio.module.css';

const ALIGN: Record<string, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
};

/**
 * 만든 위젯 한 칸의 본문 — 제목·부제·보기 옵션(세그먼트 탭·드롭다운·필터)·차트를 12칸 격자에 놓는다.
 * 데이터는 load(params)로 받는다(스튜디오 미리보기는 설계서로, 대시보드는 저장된 위젯 id로).
 */
export function StudioWidget({
  spec,
  load,
  title,
  onTitleClick,
  titleHint,
  chartOnly = false,
  selected,
  onSelect,
  onLayout,
}: {
  spec: StudioSpec;
  load: (params: StudioParams) => Promise<StudioResult>;
  /** 제목 글(없으면 설계서 제목) — false면 제목을 그리지 않는다(대시보드 편집 화면은 틀 머리에 따로) */
  title?: string | false;
  /** 제목을 누르면(대시보드 보기 — 목록으로) */
  onTitleClick?: () => void;
  titleHint?: string;
  /** 차트만(목록 카드의 작은 미리보기) — 탭·드롭다운·필터는 그리지 않는다 */
  chartOnly?: boolean;
  /** 스튜디오 편집 — 고른 요소에 테두리, 누르면 그 요소를 고른다 */
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** 스튜디오 편집 — 끌어 옮기거나 폭을 바꾸면 새 배치 */
  onLayout?: (layout: Record<string, StudioBox>) => void;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useState<StudioParams>({});
  const [res, setRes] = useState<StudioResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const specKey = JSON.stringify(spec);
  // 설계서가 바뀌면(스튜디오에서 고칠 때) 조작 값을 처음으로
  useEffect(() => setParams({}), [specKey]);

  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const paramKey = JSON.stringify(params);
  useEffect(() => {
    const my = ++seq.current;
    setBusy(true);
    const h = setTimeout(() => {
      loadRef
        .current(params)
        .then((r) => {
          if (my !== seq.current) return;
          setRes(r);
          setErr('');
        })
        .catch((e) => {
          if (my !== seq.current) return;
          setErr(e instanceof ApiError ? e.message : t('studio.loadFailed'));
        })
        .finally(() => my === seq.current && setBusy(false));
    }, 120);
    return () => clearTimeout(h);
  }, [specKey, paramKey]);

  const ds = STUDIO_DATASET_MAP.get(spec.dataset);
  const multiOrg = res?.multiOrg ?? true;
  /** 한 지점만 보는 사람에게 '지점별'은 숨긴다 */
  const visibleOptions = (c: Extract<StudioControl, { kind: 'segment' | 'dropdown' }>) =>
    c.target === 'dimension' && !multiOrg ? c.options.filter((o) => o !== 'org') : c.options;
  const current = (c: Extract<StudioControl, { kind: 'segment' | 'dropdown' }>): string => {
    const v =
      c.target === 'grain'
        ? (params.grain ?? spec.grain)
        : c.target === 'dimension'
          ? params.dimension !== undefined
            ? params.dimension
            : spec.dimension
          : c.target === 'measure'
            ? (params.measure ?? spec.measure)
            : c.target === 'period'
              ? (params.period ?? spec.period)
              : (params.viz ?? spec.viz);
    return String(v ?? '');
  };
  const setCtl = (target: string, v: string) =>
    setParams((p) => ({ ...p, [target]: v }) as StudioParams);

  const curDim = params.dimension !== undefined ? params.dimension : spec.dimension;
  const timeDim = !!ds?.dimensions.find((d) => d.key === curDim && d.kind === 'time');
  const controls = chartOnly ? [] : (spec.controls ?? []);
  const filterCtl = controls.filter(
    (c): c is Extract<StudioControl, { kind: 'filter' }> => c.kind === 'filter',
  );
  const filterFields: FilterField[] = filterCtl.map((c) => ({
    key: c.dim,
    label: c.label || ctrlLabel(spec.dataset, c.dim),
    type: 'multi',
    options: res?.options[c.dim] ?? [],
  }));

  const viz = params.viz ?? spec.viz;
  const fakeItem = useMemo<DashItem>(
    () => ({ id: 'studio', widget: 'studio', viz, x: 0, y: 0, w: 6, h: 4 }),
    [viz],
  );

  const chart = (
    <div className={`${styles.chart} ${busy && res ? styles.dim : ''}`}>
      {err ? (
        <div className={styles.error}>{err}</div>
      ) : !res ? (
        <Skeleton height="100%" radius={8} />
      ) : (
        <VizBody viz={viz} data={res.data} item={fakeItem} />
      )}
    </div>
  );
  const editing = !!onSelect;
  const layout = useMemo(() => studioLayout(spec), [specKey]);

  // ── 요소별 내용 ──
  const nodes: Record<string, ReactNode> = {};
  if (!chartOnly) {
    const look = spec.look ?? {};
    const text = title === false ? null : title || spec.title || t('studio.newWidget');
    const tStyle: CSSProperties = {
      fontSize: `calc(${look.titleSize ?? 14}px * var(--font-scale, 1))`,
      fontWeight: look.titleBold === false ? 400 : 600,
    };
    if (text !== null)
      nodes.title =
        onTitleClick && !editing ? (
          <button
            type="button"
            className={`${styles.title} ${styles.titleLink}`}
            style={tStyle}
            title={titleHint}
            onClick={onTitleClick}
          >
            <span>{text}</span>
            <ChevronRight size={14} aria-hidden />
          </button>
        ) : (
          <span className={styles.title} style={tStyle} title={titleHint}>
            {text}
          </span>
        );
    if (spec.subtitle)
      nodes.subtitle = (
        <p
          className={styles.subtitle}
          style={{ fontSize: `calc(${look.subtitleSize ?? 12}px * var(--font-scale, 1))` }}
        >
          {spec.subtitle}
        </p>
      );
    controls.forEach((c, i) => {
      if (c.kind === 'filter') return;
      const opts = visibleOptions(c);
      if (opts.length < 2) return;
      // 시간 단위 탭은 날짜로 묶을 때만(지점별·상품별로 바꾸면 숨긴다)
      if (c.target === 'grain' && !timeDim) return;
      const options = opts.map((o) => ({ value: o, label: optLabel(spec.dataset, c.target, o) }));
      nodes[`ctl:${i}`] =
        c.kind === 'segment' ? (
          <SegmentedControl
            size="sm"
            value={current(c)}
            onChange={(v) => setCtl(c.target, v)}
            options={options}
          />
        ) : (
          <div className={styles.select}>
            <Select
              size="sm"
              value={current(c)}
              onValueChange={(v) => setCtl(c.target, v)}
              options={options}
              aria-label={c.label || t(`studio.target.${c.target}`)}
            />
          </div>
        );
    });
    if (filterCtl.length)
      nodes[`ctl:${controls.indexOf(filterCtl[0])}`] = (
        <FilterButton
          fields={filterFields}
          value={params.filters ?? {}}
          onChange={(f) =>
            setParams((p) => ({
              ...p,
              filters: Object.fromEntries(
                Object.entries(f).filter(([, v]) => Array.isArray(v) && v.length),
              ) as Record<string, string[]>,
            }))
          }
        />
      );
  }
  nodes.chart = chart;
  const visible = studioElementIds(spec).filter((id) => nodes[id] != null && layout[id]);
  const rowYs = [...new Set(visible.map((id) => layout[id].y))].sort((a, b) => a - b);
  const rowOf = new Map(rowYs.map((y, i) => [y, i]));
  const chartRow = rowOf.get(layout.chart?.y ?? -1);

  // ── 편집: 끌어 옮기기·폭 바꾸기(칸에 맞춰 붙는다) ──
  const gridRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<CSSProperties | null>(null);
  const [dragging, setDragging] = useState(false);
  const metrics = () => {
    const g = gridRef.current!;
    const rect = g.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(g).columnGap) || 8;
    const colW = (rect.width - gap * (STUDIO_COLS - 1)) / STUDIO_COLS;
    const rows = rowYs.map((y, r) => {
      const els = [...g.querySelectorAll<HTMLElement>(`[data-row="${r}"]`)];
      const rs = els.map((e) => e.getBoundingClientRect());
      return {
        y,
        top: Math.min(...rs.map((x) => x.top)) - rect.top,
        bottom: Math.max(...rs.map((x) => x.bottom)) - rect.top,
      };
    });
    return { rect, gap, colW, rows };
  };
  const span = (m: ReturnType<typeof metrics>, x: number, w: number) => ({
    left: x * (m.colW + m.gap),
    width: w * m.colW + (w - 1) * m.gap,
  });
  const othersIn = (id: string, y: number) =>
    visible.filter((o) => o !== id && layout[o].y === y).map((o) => layout[o]);

  /** 끌던 자리 → 새 자리(같은 줄 빈칸이나 줄 사이 새 줄) */
  const moveTarget = (id: string, cx: number, cy: number, grabCol: number) => {
    const m = metrics();
    const b = layout[id];
    const col = Math.max(
      0,
      Math.min(11, Math.floor((cx - m.rect.left + m.gap / 2) / (m.colW + m.gap))),
    );
    const x = Math.max(0, Math.min(STUDIO_COLS - b.w, col - grabCol));
    const yy = cy - m.rect.top;
    const line = (y: number, top: number) => ({
      box: { ...b, x, y },
      style: { ...span(m, x, b.w), top: top - 2, height: 4 } as CSSProperties,
      line: true,
    });
    if (!m.rows.length) return null;
    for (let r = 0; r < m.rows.length; r++) {
      const row = m.rows[r];
      if (yy > row.bottom && r < m.rows.length - 1) continue;
      const edge = Math.min(12, (row.bottom - row.top) * 0.3);
      if (yy < row.top + edge) return line(row.y - 0.5, row.top - m.gap / 2);
      if (yy > row.bottom - edge) return line(row.y + 0.5, row.bottom + m.gap / 2);
      // 같은 줄 — 빈칸에 맞추고, 자리가 없으면 아래 새 줄
      const others = othersIn(id, row.y);
      let nx = x;
      let nw = b.w;
      const free = (a: number, w: number) => others.every((o) => a + w <= o.x || a >= o.x + o.w);
      if (!free(nx, nw)) {
        const cuts = [0, 12, ...others.flatMap((o) => [o.x, o.x + o.w])].sort((p, q) => p - q);
        let best: [number, number] | null = null;
        for (let k = 0; k < cuts.length - 1; k++) {
          const s0 = cuts[k];
          const e0 = cuts[k + 1];
          if (e0 - s0 < 2 || !free(s0, e0 - s0)) continue;
          const d = Math.abs(Math.max(s0, Math.min(x, e0 - 1)) - x);
          if (!best || d < Math.abs(Math.max(best[0], Math.min(x, best[1] - 1)) - x))
            best = [s0, e0];
        }
        if (!best) return line(row.y + 0.5, row.bottom + m.gap / 2);
        nw = Math.min(b.w, best[1] - best[0]);
        nx = Math.max(best[0], Math.min(x, best[1] - nw));
      }
      return {
        box: { ...b, x: nx, w: nw, y: row.y },
        style: { ...span(m, nx, nw), top: row.top, height: row.bottom - row.top } as CSSProperties,
        line: false,
      };
    }
    return null;
  };
  const resizeTarget = (id: string, cx: number) => {
    const m = metrics();
    const b = layout[id];
    const limit = Math.min(
      STUDIO_COLS,
      ...othersIn(id, b.y)
        .filter((o) => o.x >= b.x + 1)
        .map((o) => o.x),
    );
    const end = Math.max(
      b.x + 1,
      Math.min(limit, Math.round((cx - m.rect.left + m.gap / 2) / (m.colW + m.gap))),
    );
    const row = m.rows[rowOf.get(b.y) ?? 0];
    return {
      box: { ...b, w: end - b.x },
      style: { ...span(m, b.x, end - b.x), top: row.top, height: row.bottom - row.top },
      line: false,
    };
  };
  const startDrag = (e: ReactPointerEvent, id: string, mode: 'move' | 'resize') => {
    if (!onLayout || e.button !== 0) return;
    onSelect?.(id);
    const m = metrics();
    const b = layout[id];
    const col = Math.floor((e.clientX - m.rect.left + m.gap / 2) / (m.colW + m.gap));
    const grabCol = Math.max(0, Math.min(b.w - 1, col - b.x));
    const sx = e.clientX;
    const sy = e.clientY;
    let active = mode === 'resize';
    let target: { box: StudioBox } | null = null;
    if (active) setDragging(true);
    const onMove = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!active) {
        active = true;
        setDragging(true);
      }
      ev.preventDefault();
      const tg =
        mode === 'move'
          ? moveTarget(id, ev.clientX, ev.clientY, grabCol)
          : resizeTarget(id, ev.clientX);
      target = tg;
      setGhost(tg ? { ...tg.style, ...(tg.line ? {} : {}) } : null);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setGhost(null);
      setDragging(false);
      if (active && target) onLayout(compactStudioRows({ ...layout, [id]: target.box }));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // 고른 요소를 ←·→로 한 칸씩
  useEffect(() => {
    if (!onLayout || !selected || !layout[selected]) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const b = layout[selected];
      const x = b.x + (e.key === 'ArrowLeft' ? -1 : 1);
      if (x < 0 || x + b.w > STUDIO_COLS) return;
      const others = othersIn(selected, b.y);
      if (!others.every((o) => x + b.w <= o.x || x >= o.x + o.w)) return;
      e.preventDefault();
      onLayout({ ...layout, [selected]: { ...b, x } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (chartOnly) return <div className={styles.widget}>{chart}</div>;

  return (
    <div
      ref={gridRef}
      className={`${styles.grid} ${editing ? styles.editing : ''}`}
      style={{
        gridTemplateRows: rowYs
          .map((_, r) => (r === chartRow ? 'minmax(0, 1fr)' : 'auto'))
          .join(' '),
      }}
    >
      {editing && dragging && (
        <div className={styles.guides} aria-hidden>
          {Array.from({ length: STUDIO_COLS }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      )}
      {visible.map((id) => {
        const b = layout[id];
        const r = rowOf.get(b.y)!;
        return (
          <div
            key={id}
            data-cell={id}
            data-row={r}
            className={`${styles.cell} ${id === 'chart' ? styles.chartCell : ''} ${
              r === chartRow && id !== 'chart' ? styles.cellTop : ''
            } ${editing ? styles.cellEdit : ''} ${editing && selected === id ? styles.picked : ''}`}
            style={{
              gridColumn: `${b.x + 1} / span ${b.w}`,
              gridRow: r + 1,
              justifyContent: ALIGN[b.align ?? 'start'],
            }}
            // 편집 중엔 안의 탭·드롭다운이 눌리지 않게 — 누르면 고르고, 끌면 옮긴다(삐져나온 부분도)
            onPointerDownCapture={
              editing
                ? (e) => {
                    if ((e.target as HTMLElement).dataset.resize) return;
                    e.stopPropagation();
                    if (onLayout) startDrag(e, id, 'move');
                    else onSelect?.(id);
                  }
                : undefined
            }
            onClickCapture={
              editing
                ? (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                : undefined
            }
          >
            {nodes[id]}
            {editing && onLayout && selected === id && (
              <span
                className={styles.resize}
                data-resize="1"
                aria-hidden
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startDrag(e, id, 'resize');
                }}
              />
            )}
          </div>
        );
      })}
      {ghost && <div className={styles.ghost} style={ghost} aria-hidden />}
      {!ds && <div className={styles.error}>{t('studio.badDataset')}</div>}
    </div>
  );
}
