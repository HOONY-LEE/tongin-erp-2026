import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../lib/api';

export interface Principal {
  userId: string;
  loginId: string;
  permissions: string[];
  scopes: { roleCode: string; dataScope: 'OWN' | 'ORG' | 'ALL'; orgScopeId: string | null }[];
}

interface AuthCtx {
  user: Principal | null;
  loading: boolean;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    try {
      setUser(await api<Principal>('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getToken()) void loadMe();
    else setLoading(false);
    const onUnauth = () => setUser(null);
    window.addEventListener('tongin:unauthorized', onUnauth);
    return () => window.removeEventListener('tongin:unauthorized', onUnauth);
  }, []);

  const login = async (loginId: string, password: string) => {
    const r = await api<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ loginId, password }),
    });
    setToken(r.accessToken);
    await loadMe();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const can = (permission: string) =>
    !!user && (user.permissions.includes('*') || user.permissions.includes(permission));

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}
