import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import styles from './AppLayout.module.css';

export type PickerOption = { value: string; label: string; icon?: ReactNode };

/** 헤더 오른쪽 작은 선택 버튼 — 누르면 목록이 펼쳐지고, 고르면 바뀐다(언어·테마) */
export function HeaderPicker({
  trigger,
  title,
  value,
  options,
  onChange,
}: {
  trigger: ReactNode;
  title: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setPos(null);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null);
    const close = () => setPos(null);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 4 });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.pickerBtn} ${pos ? styles.pickerBtnOn : ''}`}
        onClick={toggle}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={!!pos}
      >
        {trigger}
      </button>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            className={`${styles.tabsMenu} ${styles.pickerMenu}`}
            style={{ right: pos.right, top: pos.top }}
            role="menu"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                className={`${styles.tabsMenuPick} ${styles.pickerItem}`}
                onClick={() => {
                  setPos(null);
                  if (o.value !== value) onChange(o.value);
                }}
              >
                {o.icon && <span className={styles.tabsMenuIcon}>{o.icon}</span>}
                <span className={styles.tabsMenuLabel}>{o.label}</span>
                {o.value === value && <Check size={14} className={styles.pickerCheck} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
