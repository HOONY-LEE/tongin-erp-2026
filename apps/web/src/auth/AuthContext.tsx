import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FIELD_ROLES } from '@tongin/shared';
import { ApiError, api, getToken, setToken } from '../lib/api';
import { resetAiActivity } from '../lib/aiActivity';

// 마지막으로 확인된 로그인 정보 — 신호 없는 현장에서 앱을 열어도 로그인 화면으로 튕기지 않도록
const CACHED_ME = 'tongin_me';

export interface Principal {
  userId: string;
  loginId: string;
  /** 직원 계정이면 연결된 직원 id (현장 배정 조회 기준) */
  employeeId: string | null;
  /** 연결된 직원 이름 — 담당자 기본값을 이름으로 보여줄 때 쓴다(직원 목록 권한 없어도 자기 이름은 안다) */
  employeeName: string | null;
  /** 연결된 직원의 소속 조직 — 접수 지점 기본값 */
  employeeOrgUnitId?: string | null;
  /** 외부 전속/제휴 소속 (있으면 현장 화면으로 진입) */
  partnerId: string | null;
  /** 직책·직급(표시용) */
  positionName?: string | null;
  permissions: string[];
  scopes: {
    roleCode: string;
    dataScope: 'OWN' | 'ORG' | 'ALL';
    orgScopeId: string | null;
    /** 이 권한 그룹은 현장앱으로 들어간다 */
    fieldApp?: boolean;
  }[];
}

/**
 * 로그인 후 현장 화면(/field)으로 들어갈 주체인지.
 * 전속업체 사용자와 현장 작업팀 역할은 관리자 ERP를 쓸 일이 없다.
 */
export function isFieldUser(user: Principal | null): boolean {
  if (!user) return false;
  if (user.partnerId) return true;
  // 권한 그룹이 여럿이면 ERP 그룹이 하나라도 있을 때 ERP로 들어간다(현장 전용 그룹만 있을 때 현장앱)
  const isField = (s: Principal['scopes'][number]) =>
    s.fieldApp ?? FIELD_ROLES.includes(s.roleCode);
  return user.scopes.length > 0 && user.scopes.every(isField);
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

/**
 * 로그아웃·로그인 만료 때 이 사람의 흔적을 지운다 — 같은 PC에서 다음 사람이 로그인해도
 * 앞사람이 보던 메뉴·AI 대화·캐시가 남지 않게(주소는 App의 Shell이 처음(/)으로 돌린다).
 * 화면 설정(테마·언어·사이드바 접힘·아이디 기억)은 사람과 상관없어 남긴다.
 */
function clearSession() {
  setToken(null); // 선택지 캐시도 함께 비운다
  try {
    localStorage.removeItem(CACHED_ME);
    for (const k of Object.keys(localStorage)) {
      if (SESSION_KEYS.some((p) => k === p || k.startsWith(`${p}.`))) localStorage.removeItem(k);
    }
    sessionStorage.clear();
  } catch {
    // 저장소가 막힌 브라우저 — 지울 것도 없다
  }
  resetAiActivity();
}

/** 사람마다 다른 브라우저 저장값 — 로그아웃 때 지운다(접두어.사용자id 형식 포함) */
const SESSION_KEYS = ['tongin_menu', 'ai.lastView'];

export function AuthProvider({ children }: { children: ReactNode }) {
  // 캐시된 로그인 정보가 있으면 /auth/me를 기다리지 않고 바로 화면을 그린다(콜드 스타트에도 즉시 열림).
  // /auth/me는 뒤에서 확인하고, 401이면 아래 로그아웃 흐름이 로그인 화면으로 돌려보낸다.
  const [user, setUser] = useState<Principal | null>(() => (getToken() ? readCachedMe() : null));
  const [loading, setLoading] = useState(() => !!getToken() && !readCachedMe());

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
      // 캐시된 정보로 이미 그려 두었다 — /auth/me 응답이 오면 갱신한다
      void loadMe();
    } else setLoading(false);
    // 로그인이 끝났을 때(만료)도 로그아웃과 똑같이 비운다 — 다음에 누가 로그인할지 모른다
    const onUnauth = () => {
      clearSession();
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
    clearSession();
    setUser(null);
  };

  const can = (permission: string) =>
    !!user && (user.permissions.includes('*') || user.permissions.includes(permission));

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}
