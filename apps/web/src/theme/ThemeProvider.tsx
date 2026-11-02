import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
/** 글자 크기 — 중간(md)이 기본(지금 크기). html[data-font-size]로 --font-scale을 바꾼다(base.css) */
export type FontSize = 'sm' | 'md' | 'lg';
export const FONT_SIZES: FontSize[] = ['sm', 'md', 'lg'];
type Resolved = 'light' | 'dark';

interface ThemeCtx {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
  fontSize: FontSize;
  setFontSize: (f: FontSize) => void;
}

const Ctx = createContext<ThemeCtx | undefined>(undefined);
const KEY = 'tongin_theme';
const FONT_KEY = 'tongin_font_size';

const readFont = (): FontSize => {
  try {
    const v = localStorage.getItem(FONT_KEY);
    return v === 'sm' || v === 'lg' ? v : 'md';
  } catch {
    return 'md';
  }
};

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

const systemDark = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolve = (mode: ThemeMode): Resolved =>
  mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem(KEY) as ThemeMode) ?? 'system',
  );
  const [resolved, setResolved] = useState<Resolved>(() => resolve(mode));

  useEffect(() => {
    const apply = () => {
      const r = resolve(mode);
      setResolved(r);
      document.documentElement.setAttribute('data-theme', r);
    };
    apply();
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  const [fontSize, setFontState] = useState<FontSize>(readFont);
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSize);
  }, [fontSize]);
  const setFontSize = (f: FontSize) => {
    try {
      localStorage.setItem(FONT_KEY, f);
    } catch {
      /* 저장 못 해도 이번 화면엔 적용 */
    }
    setFontState(f);
  };

  const setMode = (m: ThemeMode) => {
    localStorage.setItem(KEY, m);
    setModeState(m);
  };

  return (
    <Ctx.Provider value={{ mode, resolved, setMode, fontSize, setFontSize }}>
      {children}
    </Ctx.Provider>
  );
}
