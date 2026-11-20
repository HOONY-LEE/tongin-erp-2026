import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import { EditorTabs, type EditorTab } from '../components/ui';
import styles from './AppLayout.module.css';

const MORE_W = 76; // … N 버튼 + + 버튼(간격 포함)
const MIN_W = 88; // 더 줄일 수 없는 탭 폭(글자 몇 자 + 닫기)

const sum = (xs: number[]) => xs.reduce((m, x) => m + x, 0);

/**
 * 헤더 멀티탭 — 탭이 많아지면
 *  1) 아이콘·넓은 여백을 가진 채로 자리가 모자랄 때 비로소 아이콘을 빼고 여백을 줄이고,
 *  2) 그래도 모자라면 폭이 줄면서 글자는 말줄임,
 *  3) MIN_W로도 다 못 들어가면 들어가는 만큼만 보이고 나머지는 '…' 메뉴로 모은다(지금 탭은 항상 보인다).
 * 판단은 추정값이 아니라 화면 밖에 그려 둔 탭의 실제 폭으로 한다 — 자리가 남는데 접히는 일이 없게.
 */
export function HeaderTabs({
  tabs,
  activeId,
  onTabChange,
  onTabClose,
  onTabAdd,
  onReorder,
  keepIconId,
}: {
  tabs: EditorTab[];
  activeId: string;
  /** 좁아져도 아이콘을 남길 탭(AI 진행 중 표시처럼 상태를 알리는 아이콘) */
  keepIconId?: string;
  onTabChange: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabAdd: () => void;
  /** 끌어서 놓은 탭 순서 바꾸기 — from을 to의 앞(after=false)·뒤(after=true)로 */
  onReorder?: (from: string, to: string, after: boolean) => void;
}) {
  const { t: tr } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [sizes, setSizes] = useState<{ full: number[]; compact: number[]; add: number } | null>(
    null,
  );
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // 탭 끌어서 순서 바꾸기 — 끄는 탭, 놓일 자리(그 탭의 앞/뒤)와 표시선 위치
  const dragId = useRef<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean; x: number } | null>(null);
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

  const compactTabs = useMemo(
    () => tabs.map((t) => ({ ...t, icon: t.id === keepIconId ? t.icon : undefined })),
    [tabs, keepIconId],
  );

  // 화면 밖 측정용 탭들의 실제 폭(보통 모양 / 좁은 모양)과 + 버튼 폭
  const tabKey = compactTabs.map((t) => `${t.id}:${t.label}:${t.icon ? 1 : 0}`).join('|');
  useLayoutEffect(() => {
    const read = () => {
      const widths = (el: HTMLDivElement | null) =>
        Array.from(el?.querySelectorAll('[role=tab]') ?? []).map((t) =>
          Math.ceil(t.getBoundingClientRect().width),
        );
      const add = fullRef.current?.querySelector('[role=tablist] > button:not([role=tab])');
      setSizes({
        full: widths(fullRef.current),
        compact: widths(compactRef.current),
        add: Math.ceil(add?.getBoundingClientRect().width ?? 36),
      });
    };
    read();
    // 웹폰트가 늦게 들어오면 폭이 바뀐다
    void document.fonts?.ready.then(read);
  }, [tabKey]);

  const ready = width > 0 && sizes?.full.length === tabs.length;
  const full = ready ? sizes.full : [];
  const minW = ready ? sizes.compact.map((w) => Math.min(w, MIN_W)) : [];
  const avail = ready ? width - sizes.add : 0;

  // 1) 보통 모양으로 다 들어가면 그대로, 2) 아니면 좁은 모양(말줄임까지), 3) 그래도 넘치면 들어가는 만큼만
  const compact = ready && sum(full) > avail;
  const overflow = ready && sum(minW) > avail;
  let hidden: EditorTab[] = [];
  if (overflow) {
    // 앞에서부터 채운다 — 지금 탭 자리는 먼저 떼어 둔다. 남는 자리는 보이는 탭들이 늘어나 채운다
    const activeIdx = tabs.findIndex((t) => t.id === activeId);
    let room = width - MORE_W - (activeIdx >= 0 ? minW[activeIdx] : 0);
    const keep = new Set<number>(activeIdx >= 0 ? [activeIdx] : []);
    for (let i = 0; i < tabs.length; i++) {
      if (i === activeIdx) continue;
      if (minW[i] > room) break;
      room -= minW[i];
      keep.add(i);
    }
    hidden = tabs.filter((_, i) => !keep.has(i));
  }
  // 좁을 땐 아이콘을 뺀다
  const view = (compact ? compactTabs : tabs).filter((t) => !hidden.some((h) => h.id === t.id));

  const openMenu = () => {
    if (menu) return setMenu(null);
    const r = moreRef.current?.getBoundingClientRect();
    if (r) setMenu({ x: Math.max(8, r.right - 220), y: r.bottom + 4 });
  };

  return (
    <>
      <div
        ref={boxRef}
        className={`${styles.headerTabs} ${compact ? styles.headerTabsCompact : ''}`}
        onDragOver={(e) => {
          if (!dragId.current || !onReorder) return;
          e.preventDefault();
          const box = boxRef.current!.getBoundingClientRect();
          // 보이는 탭 줄(첫 번째 EditorTabs)만 — 아래 측정용 탭은 빼고
          const els = [
            ...(boxRef.current!.firstElementChild?.querySelectorAll<HTMLElement>('[role="tab"]') ??
              []),
          ];
          for (let i = 0; i < els.length && i < view.length; i++) {
            const r = els[i].getBoundingClientRect();
            if (e.clientX >= r.left && e.clientX <= r.right) {
              const after = e.clientX > r.left + r.width / 2;
              setDrop({ id: view[i].id, after, x: (after ? r.right : r.left) - box.left });
              return;
            }
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const from = dragId.current;
          if (from && drop && from !== drop.id) onReorder?.(from, drop.id, drop.after);
          dragId.current = null;
          setDrop(null);
        }}
      >
        <EditorTabs
          tabs={view}
          activeId={activeId}
          onTabChange={onTabChange}
          onTabClose={onTabClose}
          onTabAdd={hidden.length ? undefined : onTabAdd}
          size="sm"
          draggable={!!onReorder}
          onTabDragStart={(id, e) => {
            dragId.current = id;
            e.dataTransfer.effectAllowed = 'move';
          }}
          onTabDragEnd={() => {
            dragId.current = null;
            setDrop(null);
          }}
        />
        {drop && <span className={styles.tabDropLine} style={{ left: drop.x - 1 }} />}
        {hidden.length > 0 && (
          <>
            <button
              ref={moreRef}
              type="button"
              className={`${styles.moreTabs} ${menu ? styles.moreTabsOn : ''}`}
              onClick={openMenu}
              aria-label={tr('shell.moreTabs', { n: hidden.length })}
              aria-expanded={!!menu}
              title={tr('shell.moreTabsShort', { n: hidden.length })}
              data-tabs-more
            >
              <MoreHorizontal size={16} />
              <span className={styles.moreCount}>{hidden.length}</span>
            </button>
            <button
              type="button"
              className={styles.moreTabs}
              onClick={onTabAdd}
              aria-label={tr('shell.newTab')}
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
      {/* 폭 측정용 — visibility:hidden이라 보이지도, 포커스·클릭되지도 않는다 */}
      <div ref={fullRef} className={`${styles.headerTabs} ${styles.tabsMeasure}`} aria-hidden>
        <EditorTabs
          tabs={tabs}
          activeId={activeId}
          onTabChange={noop}
          onTabClose={noop}
          onTabAdd={noop}
          size="sm"
        />
      </div>
      <div
        ref={compactRef}
        className={`${styles.headerTabs} ${styles.headerTabsCompact} ${styles.tabsMeasure}`}
        aria-hidden
      >
        <EditorTabs
          tabs={compactTabs}
          activeId={activeId}
          onTabChange={noop}
          onTabClose={noop}
          size="sm"
        />
      </div>
    </>
  );
}

const noop = () => {};

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
  const { t: tr } = useTranslation();
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
              aria-label={tr('shell.closeTab', { label: t.label })}
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
