import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FIELD_ROLES } from '@tongin/shared';
import { ApiError, api, getToken, setToken } from '../lib/api';

// 마지막으로 확인된 로그인 정보 — 신호 없는 현장에서 앱을 열어도 로그인 화면으로 튕기지 않도록
const CACHED_ME = 'tongin_me';

export interface Principal {
  userId: string;
  loginId: string;
  /** 직원 계정이면 연결된 직원 id (현장 배정 조회 기준) */
  employeeId: string | null;
  /** 외부 전속/제휴 소속 (있으면 현장 화면으로 진입) */
  partnerId: string | null;
  permissions: string[];
  scopes: { roleCode: string; dataScope: 'OWN' | 'ORG' | 'ALL'; orgScopeId: string | null }[];
}

/**
 * 로그인 후 현장 화면(/field)으로 들어갈 주체인지.
 * 전속업체 사용자와 현장 작업팀 역할은 관리자 ERP를 쓸 일이 없다.
 */
export function isFieldUser(user: Principal | null): boolean {
  if (!user) return false;
  if (user.partnerId) return true;
  return user.scopes.some((s) => FIELD_ROLES.includes(s.roleCode));
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

/** 마지막으로 확인된 로그인 정보. 형식이 깨졌으면 없는 것으로 본다. */
function readCachedMe(): Principal | null {
  try {
    const raw = localStorage.getItem(CACHED_ME);
    return raw ? (JSON.parse(raw) as Principal) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    try {
      const me = await api<Principal>('/auth/me');
      setUser(me);
      localStorage.setItem(CACHED_ME, JSON.stringify(me));
    } catch (e) {
      // 서버가 "너 아니다"라고 한 경우에만 로그아웃. 네트워크가 안 닿는 것과는 다르다.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        localStorage.removeItem(CACHED_ME);
        setUser(null);
      } else {
        // 오프라인·서버 장애 — 마지막으로 확인된 사용자로 화면을 열어준다.
        // 토큰은 그대로 두므로 실제 권한 판정은 온라인 복귀 시 서버가 다시 한다.
        setUser(readCachedMe());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getToken()) {
      // 캐시된 정보로 먼저 그려 두고, /auth/me 응답이 오면 갱신한다
      const cached = readCachedMe();
      if (cached) setUser(cached);
      void loadMe();
    } else setLoading(false);
    const onUnauth = () => {
      localStorage.removeItem(CACHED_ME);
      setUser(null);
    };
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
    localStorage.removeItem(CACHED_ME);
    setUser(null);
  };

  const can = (permission: string) =>
    !!user && (user.permissions.includes('*') || user.permissions.includes(permission));

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}
