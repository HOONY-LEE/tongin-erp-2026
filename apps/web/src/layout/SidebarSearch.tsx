import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, type LucideIcon } from 'lucide-react';
import styles from './AppLayout.module.css';

export interface SearchMenu {
  to: string;
  label: string;
  desc?: string;
  group?: string;
  icon: LucideIcon;
}

/** 한글 초성 — '상담 콘솔' → 'ㅅㄷ ㅋㅅ' (초성으로도 찾게) */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const chosung = (s: string) =>
  [...s]
    .map((c) => {
      const n = c.charCodeAt(0) - 0xac00;
      return n >= 0 && n < 11172 ? CHO[Math.floor(n / 588)] : c;
    })
    .join('');
const isCho = (s: string) => /^[ㄱ-ㅎ\s]+$/.test(s);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** 검색어에 맞는 메뉴 — 이름이 먼저(앞부분이 맞으면 더 위), 그다음 설명 */
function rank(items: SearchMenu[], q: string) {
  const k = norm(q);
  if (!k) return [];
  const cho = isCho(q);
  return items
    .map((m) => {
      const name = norm(m.label);
      const nameCho = norm(chosung(m.label));
      let score = -1;
      if (name.startsWith(k)) score = 0;
      else if (name.includes(k)) score = 1;
      else if (cho && nameCho.startsWith(k)) score = 2;
      else if (cho && nameCho.includes(k)) score = 3;
      else if (m.desc && norm(m.desc).includes(k)) score = 4;
      else if (m.group && norm(m.group).includes(k)) score = 5;
      return { m, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.m);
}

/**
 * 사이드바 메뉴 검색 — 이름·설명·초성으로 찾고 Enter(또는 클릭)로 연다.
 * ⌘K / Ctrl+K로 어디서든 검색칸으로. 사이드바가 접혀 있으면 돋보기를 누르면 펴고 검색칸으로.
 * 사이드바에서 숨긴 메뉴도 권한만 있으면 찾는다.
 */
export function SidebarSearch({
  items,
  collapsed,
  onExpand,
  onOpen,
}: {
  items: SearchMenu[];
  collapsed: boolean;
  onExpand: () => void;
  onOpen: (to: string) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => rank(items, q).slice(0, 8), [items, q]);

  useEffect(() => setSel(0), [q]);
  // ⌘K / Ctrl+K — 검색칸으로(접혀 있으면 펴고)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (collapsed) onExpand();
        setTimeout(() => input.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [collapsed, onExpand]);

  const open = (m: SearchMenu) => {
    onOpen(m.to);
    setQ('');
    input.current?.blur();
  };

  if (collapsed)
    return (
      <button
        type="button"
        className={styles.sideSearchIcon}
        title="메뉴 검색 (⌘K)"
        aria-label="메뉴 검색"
        onClick={() => {
          onExpand();
          setTimeout(() => input.current?.focus(), 0);
        }}
      >
        <Search size={16} />
      </button>
    );

  const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  return (
    <div className={styles.sideSearch}>
      <div className={styles.sideSearchBox}>
        <Search size={14} aria-hidden />
        <input
          ref={input}
          value={q}
          placeholder="메뉴 검색"
          aria-label="메뉴 검색"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="side-search-results"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && results[sel]) {
              e.preventDefault();
              open(results[sel]);
            } else if (e.key === 'Escape') {
              setQ('');
              input.current?.blur();
            }
          }}
        />
        {q ? (
          <button type="button" aria-label="검색어 지우기" onClick={() => setQ('')}>
            <X size={13} />
          </button>
        ) : (
          <kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
        )}
      </div>
      {q.trim() && (
        <ul id="side-search-results" className={styles.sideSearchList} role="listbox">
          {results.length === 0 && <li className={styles.sideSearchNone}>찾는 메뉴가 없습니다</li>}
          {results.map((m, i) => (
            <li key={m.to} role="option" aria-selected={i === sel}>
              <button
                type="button"
                className={i === sel ? styles.sideSearchOn : undefined}
                onMouseEnter={() => setSel(i)}
                onClick={() => open(m)}
              >
                <m.icon size={15} />
                <span>
                  <b>{m.label}</b>
                  {m.desc && <small>{m.desc}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
