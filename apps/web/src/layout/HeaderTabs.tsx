import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import { EditorTabs, type EditorTab } from '../components/ui';
import styles from './AppLayout.module.css';

const ADD_W = 36; // + 버튼
const MORE_W = 56; // … N 버튼
const MIN_W = 88; // 더 줄일 수 없는 탭 폭(글자 몇 자 + 닫기)
const MAX_LABEL_W = 200; // 탭 최대 폭(260)에서 여백을 뺀 글자 폭
// 탭 여백: 보통 24+24 + 아이콘 14+간격 6 + 닫기 자리 22, 좁을 때 12+8 + 닫기 자리 22
const FULL_EXTRA = 48 + 20 + 22;
const COMPACT_EXTRA = 20 + 22;

let canvas: HTMLCanvasElement | null = null;
/** 글자 폭(px) — 탭과 같은 글꼴로 잰다 */
function textWidth(text: string, font: string) {
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 13;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * 헤더 멀티탭 — 탭이 많아지면
 *  1) 폭이 줄면서 글자는 말줄임,
 *  2) 한 탭이 COMFORT_W보다 좁아지면 아이콘을 빼고 여백을 줄이고,
 *  3) MIN_W로도 다 못 들어가면 들어가는 만큼만 보이고 나머지는 '…' 메뉴로 모은다(지금 탭은 항상 보인다).
 */
export function HeaderTabs({
  tabs,
  activeId,
  onTabChange,
  onTabClose,
  onTabAdd,
  keepIconId,
}: {
  tabs: EditorTab[];
  activeId: string;
  /** 좁아져도 아이콘을 남길 탭(AI 진행 중 표시처럼 상태를 알리는 아이콘) */
  keepIconId?: string;
  onTabChange: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabAdd: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const font = useMemo(() => {
    const el = boxRef.current?.querySelector('[role=tab]');
    return el ? getComputedStyle(el).font : '500 13px sans-serif';
  }, [width]);
  const labelW = tabs.map((t) => Math.min(MAX_LABEL_W, Math.ceil(textWidth(t.label, font))));
  const avail = Math.max(0, width - ADD_W);
  const sum = (extra: number, idx: number[]) =>
    idx.reduce((m, i) => m + Math.max(MIN_W, labelW[i] + extra), 0);
  const all = tabs.map((_, i) => i);

  // 1) 아이콘·여백을 다 가진 채로 들어가면 그대로, 2) 아니면 좁은 모양, 3) 그래도 넘치면 들어가는 만큼만
  const compact = width > 0 && sum(FULL_EXTRA, all) > avail;
  // 좁은 모양에선 글자를 말줄임해 MIN_W까지 줄일 수 있다
  const overflow = width > 0 && tabs.length * MIN_W > avail;
  let shown = tabs;
  let hidden: EditorTab[] = [];
  if (overflow) {
    // 앞에서부터 실제 폭(좁은 모양)으로 채운다 — 지금 탭 자리는 먼저 떼어 둔다
    const activeIdx = tabs.findIndex((t) => t.id === activeId);
    let room = avail - MORE_W - (activeIdx >= 0 ? sum(COMPACT_EXTRA, [activeIdx]) : 0);
    const keep = new Set<number>(activeIdx >= 0 ? [activeIdx] : []);
    for (const i of all) {
      if (i === activeIdx) continue;
      const w = sum(COMPACT_EXTRA, [i]);
      if (w > room) break;
      room -= w;
      keep.add(i);
    }
    shown = tabs.filter((_, i) => keep.has(i));
    hidden = tabs.filter((_, i) => !keep.has(i));
  }
  // 좁을 땐 아이콘을 뺀다
  const view = compact
    ? shown.map((t) => ({ ...t, icon: t.id === keepIconId ? t.icon : undefined }))
    : shown;

  const openMenu = () => {
    if (menu) return setMenu(null);
    const r = moreRef.current?.getBoundingClientRect();
    if (r) setMenu({ x: Math.max(8, r.right - 220), y: r.bottom + 4 });
  };

  return (
    <div ref={boxRef} className={`${styles.headerTabs} ${compact ? styles.headerTabsCompact : ''}`}>
      <EditorTabs
        tabs={view}
        activeId={activeId}
        onTabChange={onTabChange}
        onTabClose={onTabClose}
        onTabAdd={hidden.length ? undefined : onTabAdd}
        size="sm"
      />
      {hidden.length > 0 && (
        <>
          <button
            ref={moreRef}
            type="button"
            className={`${styles.moreTabs} ${menu ? styles.moreTabsOn : ''}`}
            onClick={openMenu}
            aria-label={`탭 ${hidden.length}개 더 보기`}
            aria-expanded={!!menu}
            title={`탭 ${hidden.length}개 더`}
            data-tabs-more
          >
            <MoreHorizontal size={16} />
            <span className={styles.moreCount}>{hidden.length}</span>
          </button>
          <button
            type="button"
            className={styles.moreTabs}
            onClick={onTabAdd}
            aria-label="새 탭 추가"
          >
            <Plus size={14} />
          </button>
        </>
      )}
      {menu && hidden.length > 0 && (
        <TabsMenu
          x={menu.x}
          y={menu.y}
          tabs={hidden}
          onPick={(id) => {
            setMenu(null);
            onTabChange(id);
          }}
          onClose={(id) => onTabClose(id)}
          onDismiss={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function TabsMenu({
  x,
  y,
  tabs,
  onPick,
  onClose,
  onDismiss,
}: {
  x: number;
  y: number;
  tabs: EditorTab[];
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (ref.current?.contains(t) || t.closest('[data-tabs-more]')) return;
      onDismiss();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss();
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', onDismiss);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', onDismiss);
    };
  }, [onDismiss]);

  return createPortal(
    <div ref={ref} className={styles.tabsMenu} style={{ left: x, top: y }} role="menu">
      {tabs.map((t) => (
        <div key={t.id} className={styles.tabsMenuItem}>
          <button
            type="button"
            role="menuitem"
            className={styles.tabsMenuPick}
            onClick={() => onPick(t.id)}
          >
            {t.icon && <span className={styles.tabsMenuIcon}>{t.icon}</span>}
            <span className={styles.tabsMenuLabel}>{t.label}</span>
          </button>
          {t.closable && (
            <button
              type="button"
              className={styles.tabsMenuClose}
              aria-label={`${t.label} 닫기`}
              onClick={() => onClose(t.id)}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
