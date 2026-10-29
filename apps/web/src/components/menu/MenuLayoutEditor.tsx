import { useState, type DragEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { MENU_CATALOG, MENU_CATEGORIES, menuDef, type MenuGroup } from '@tongin/shared';
import { menuIcon, useMenuLabel } from '../../lib/menu';
import styles from './menuEditor.module.css';

interface Props {
  groups: MenuGroup[];
  onChange: (groups: MenuGroup[]) => void;
  /**
   * admin: 카탈로그 전체에서 메뉴를 넣고 빼고, 묶음을 만들고 지운다.
   * personal: 받은 메뉴 안에서 순서·묶음·숨김만 바꾼다.
   */
  mode: 'admin' | 'personal';
  /** personal — 숨긴 메뉴 */
  hidden?: string[];
  onHiddenChange?: (hidden: string[]) => void;
  /** 이 메뉴를 지금 사람이 볼 수 있나(권한) — 못 보는 메뉴는 흐리게 표시(관리자 미리보기용) */
  dim?: (key: string) => boolean;
}

type Drag = { kind: 'item'; key: string } | { kind: 'group'; index: number } | null;

/** 사이드바 메뉴 구성 편집 — 끌어 놓기 + 버튼(위/아래)으로 순서를 바꾼다 */
export function MenuLayoutEditor({
  groups,
  onChange,
  mode,
  hidden = [],
  onHiddenChange,
  dim,
}: Props) {
  const label = useMenuLabel();
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const [targetRaw, setTarget] = useState(Number.MAX_SAFE_INTEGER);
  // 메뉴를 넣을 묶음 — 고르지 않았으면 마지막 묶음
  const target = Math.max(0, Math.min(targetRaw, groups.length - 1));
  const used = new Set(groups.flatMap((g) => g.items));

  const set = (fn: (gs: MenuGroup[]) => MenuGroup[]) =>
    onChange(fn(groups.map((g) => ({ ...g, items: [...g.items] }))));

  const removeItem = (gs: MenuGroup[], key: string) =>
    gs.forEach((g) => (g.items = g.items.filter((k) => k !== key)));

  /** key를 groupIdx 묶음의 before 앞에(없으면 끝에) 놓는다 */
  const place = (key: string, groupIdx: number, before?: string) =>
    set((gs) => {
      removeItem(gs, key);
      const items = gs[groupIdx].items;
      const at = before ? items.indexOf(before) : -1;
      items.splice(at < 0 ? items.length : at, 0, key);
      return gs;
    });

  const moveItem = (gi: number, ii: number, dir: -1 | 1) =>
    set((gs) => {
      const items = gs[gi].items;
      const to = ii + dir;
      if (to >= 0 && to < items.length) {
        [items[ii], items[to]] = [items[to], items[ii]];
        return gs;
      }
      // 묶음 끝에서 더 가면 옆 묶음으로 넘어간다
      const ng = gi + dir;
      if (ng < 0 || ng >= gs.length) return gs;
      const [k] = items.splice(ii, 1);
      if (dir < 0) gs[ng].items.push(k);
      else gs[ng].items.unshift(k);
      return gs;
    });

  const moveGroup = (gi: number, dir: -1 | 1) =>
    set((gs) => {
      const to = gi + dir;
      if (to < 0 || to >= gs.length) return gs;
      [gs[gi], gs[to]] = [gs[to], gs[gi]];
      return gs;
    });

  const addGroup = () => {
    onChange([...groups, { label: '새 묶음', items: [] }]);
    setTarget(groups.length);
  };

  const removeGroup = (gi: number) => {
    const g = groups[gi];
    if (g.items.length && mode === 'personal') {
      // 개인 모드에선 메뉴를 잃지 않게 앞 묶음으로 옮긴다
      set((gs) => {
        const [removed] = gs.splice(gi, 1);
        (gs[Math.max(0, gi - 1)] ?? gs[0])?.items.push(...removed.items);
        return gs;
      });
    } else set((gs) => (gs.splice(gi, 1), gs));
    setTarget((t) => Math.max(0, Math.min(t, groups.length - 2)));
  };

  const hide = (key: string) => {
    set((gs) => (removeItem(gs, key), gs));
    onHiddenChange?.([...hidden, key]);
  };
  const unhide = (key: string) => {
    onHiddenChange?.(hidden.filter((k) => k !== key));
    const gi = target;
    if (gi >= 0) place(key, gi);
  };

  const toggleCatalog = (key: string) => {
    if (used.has(key)) set((gs) => (removeItem(gs, key), gs));
    else if (groups.length) place(key, target);
    else onChange([{ label: '메뉴', items: [key] }]);
  };

  // ── 끌어 놓기 ──
  const onDragStart = (e: DragEvent, d: Drag) => {
    setDrag(d);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(d));
  };
  const onDropItem = (e: DragEvent, gi: number, before?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (drag?.kind === 'item' && drag.key !== before) place(drag.key, gi, before);
    if (drag?.kind === 'group' && drag.index !== gi) {
      set((gs) => {
        const [g] = gs.splice(drag.index, 1);
        gs.splice(gi, 0, g);
        return gs;
      });
    }
    setDrag(null);
    setOver(null);
  };
  const allowDrop = (id: string) => (e: DragEvent) => {
    e.preventDefault();
    setOver(id);
  };

  return (
    <div className={`${styles.editor} ${mode === 'admin' ? styles.editorAdmin : ''}`}>
      <div className={styles.groups}>
        {groups.map((g, gi) => (
          <section
            key={gi}
            className={`${styles.group} ${target === gi ? styles.groupTarget : ''} ${over === `g${gi}` ? styles.over : ''}`}
            onDragOver={allowDrop(`g${gi}`)}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => onDropItem(e, gi)}
            onClick={() => setTarget(gi)}
          >
            <header className={styles.groupHead}>
              <span
                className={styles.grip}
                draggable
                onDragStart={(e) => onDragStart(e, { kind: 'group', index: gi })}
                onDragEnd={() => setDrag(null)}
                title="끌어서 묶음 순서 바꾸기"
              >
                <GripVertical size={14} />
              </span>
              <input
                className={styles.groupLabel}
                value={g.label}
                maxLength={30}
                aria-label="묶음 이름"
                onChange={(e) => set((gs) => ((gs[gi].label = e.target.value), gs))}
              />
              <button
                type="button"
                className={`${styles.iconBtn} ${g.collapsed ? styles.iconOn : ''}`}
                title={g.collapsed ? '처음엔 접어 둠(켜짐)' : '처음엔 접어 두기'}
                aria-pressed={!!g.collapsed}
                onClick={() => set((gs) => ((gs[gi].collapsed = !gs[gi].collapsed), gs))}
              >
                <ChevronsDownUp size={14} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="묶음 위로"
                disabled={gi === 0}
                onClick={() => moveGroup(gi, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="묶음 아래로"
                disabled={gi === groups.length - 1}
                onClick={() => moveGroup(gi, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title={
                  mode === 'personal' && g.items.length
                    ? '묶음 지우기(메뉴는 앞 묶음으로)'
                    : '묶음 지우기'
                }
                disabled={groups.length <= 1}
                onClick={() => removeGroup(gi)}
              >
                <Trash2 size={14} />
              </button>
            </header>
            <ul className={styles.items}>
              {g.items.map((key, ii) => {
                const Icon = menuIcon(menuDef(key));
                return (
                  <li
                    key={key}
                    className={`${styles.item} ${over === key ? styles.overItem : ''} ${dim?.(key) ? styles.dim : ''}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, { kind: 'item', key })}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={allowDrop(key)}
                    onDrop={(e) => onDropItem(e, gi, key)}
                    title={dim?.(key) ? '이 사람은 권한이 없어 안 보입니다' : undefined}
                  >
                    <GripVertical size={14} className={styles.gripIcon} />
                    <Icon size={15} />
                    <span className={styles.itemLabel}>{label(key)}</span>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="위로"
                      disabled={gi === 0 && ii === 0}
                      onClick={() => moveItem(gi, ii, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="아래로"
                      disabled={gi === groups.length - 1 && ii === g.items.length - 1}
                      onClick={() => moveItem(gi, ii, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                    {mode === 'personal' ? (
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="숨기기"
                        onClick={() => hide(key)}
                      >
                        <EyeOff size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="이 구성에서 빼기"
                        onClick={() => toggleCatalog(key)}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </li>
                );
              })}
              {!g.items.length && <li className={styles.empty}>메뉴를 여기로 끌어 놓으세요</li>}
            </ul>
          </section>
        ))}
        <button type="button" className={styles.addGroup} onClick={addGroup}>
          <Plus size={14} /> 묶음 추가
        </button>
      </div>

      {mode === 'admin' ? (
        <aside className={styles.side}>
          <div className={styles.sideHead}>
            메뉴 고르기
            <span className={styles.meta}>
              누르면 「{groups[target]?.label ?? '새 묶음'}」에 추가
            </span>
          </div>
          {MENU_CATEGORIES.map((cat) => (
            <div key={cat} className={styles.cat}>
              <div className={styles.catLabel}>{cat}</div>
              {MENU_CATALOG.filter((m) => m.category === cat).map((m) => {
                const Icon = menuIcon(m);
                const on = used.has(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    className={`${styles.pick} ${on ? styles.pickOn : ''}`}
                    aria-pressed={on}
                    onClick={() => toggleCatalog(m.key)}
                    title={m.desc}
                  >
                    <Icon size={14} />
                    <span>{label(m.key)}</span>
                    {m.desc && <span className={styles.pickDesc}>{m.desc}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>
      ) : (
        <aside className={styles.side}>
          <div className={styles.sideHead}>
            숨긴 메뉴
            <span className={styles.meta}>누르면 「{groups[target]?.label}」에 다시 보입니다</span>
          </div>
          {hidden.length ? (
            hidden.map((key) => {
              const Icon = menuIcon(menuDef(key));
              return (
                <button key={key} type="button" className={styles.pick} onClick={() => unhide(key)}>
                  <Icon size={14} />
                  <span>{label(key)}</span>
                  <Eye size={13} className={styles.pickEnd} />
                </button>
              );
            })
          ) : (
            <p className={styles.meta}>
              숨긴 메뉴가 없습니다. 메뉴 오른쪽 눈 아이콘으로 숨길 수 있어요.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
