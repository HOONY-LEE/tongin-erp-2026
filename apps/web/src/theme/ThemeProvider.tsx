import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
type Resolved = 'light' | 'dark';

interface ThemeCtx {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx | undefined>(undefined);
const KEY = 'tongin_theme';

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

  const setMode = (m: ThemeMode) => {
    localStorage.setItem(KEY, m);
    setModeState(m);
  };

  return <Ctx.Provider value={{ mode, resolved, setMode }}>{children}</Ctx.Provider>;
}
