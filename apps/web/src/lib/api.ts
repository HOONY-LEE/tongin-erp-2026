import i18n from '../i18n';
const TOKEN_KEY = 'tongin_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  // 사람이 바뀌면 볼 수 있는 목록도 달라진다 — 선택지 캐시를 비운다
  getCache.clear();
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

// ── 선택지용 GET 캐시 ──
// 조직·거래처·직원 같은 선택지 목록은 화면마다 다시 부를 필요가 없다.
// 같은 주소는 60초 동안 한 번만 묻고(동시에 여러 화면이 열려도 요청 하나), 그 자원을 바꾸는 요청
// (POST·PATCH·PUT·DELETE)이 성공하면 같은 자원(첫 경로 조각, 예: /org-units) 캐시를 바로 버린다.
const GET_CACHE_TTL = 60_000;
const getCache = new Map<string, { at: number; promise: Promise<unknown> }>();
/** '/org-units/abc?x=1' → '/org-units' */
const resourceOf = (path: string) => '/' + (path.split('?')[0].split('/')[1] ?? '');

/** 짧게 캐시하는 GET — 선택지(Select 옵션) 목록용. 실패한 응답은 캐시하지 않는다. */
export function cachedApi<T = unknown>(path: string): Promise<T> {
  const hit = getCache.get(path);
  if (hit && Date.now() - hit.at < GET_CACHE_TTL) return hit.promise as Promise<T>;
  const promise = api<T>(path);
  getCache.set(path, { at: Date.now(), promise });
  promise.catch(() => {
    if (getCache.get(path)?.promise === promise) getCache.delete(path);
  });
  return promise;
}

/** 자원이 바뀌었다 — 그 자원의 선택지 캐시를 버린다 */
function invalidateCache(path: string) {
  const res = resourceOf(path);
  for (const key of getCache.keys()) if (resourceOf(key) === res) getCache.delete(key);
}

/** 서버 오류 코드(apps/api/src/common/http-exception.filter.ts) + 화면에서만 생기는 경우 */
export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ROUTE_NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_LARGE'
  | 'RATE_LIMIT'
  | 'NOT_IMPLEMENTED'
  | 'UPSTREAM'
  | 'UNAVAILABLE'
  | 'INTERNAL'
  | 'OFFLINE' // 인터넷 끊김
  | 'NETWORK' // 서버에 닿지 않음(서버 재시작·배포 중)
  | 'BAD_RESPONSE'; // 응답을 읽지 못함(배포 중 HTML 등)

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: ApiErrorCode = 'INTERNAL',
    /** 예상 못 한 서버 오류의 번호 — 서버 로그에서 같은 번호로 찾는다 */
    public ref?: string,
  ) {
    super(message);
  }
}

/** 서버가 응답하지 않을 때(콜드 스타트·배포 중) */
export const SERVICE_UNAVAILABLE = i18n.t('misc2.api.noResponse');

/** 상태 코드만 있고 서버 안내 문장이 없을 때(게이트웨이가 HTML을 돌려준 경우 등) 쓰는 기본 안내 */
const FALLBACK: Record<number, [ApiErrorCode, string]> = {
  400: ['VALIDATION', i18n.t('misc2.api.400')],
  403: ['FORBIDDEN', i18n.t('misc2.api.403')],
  404: ['NOT_FOUND', i18n.t('misc2.api.404')],
  409: ['CONFLICT', i18n.t('misc2.api.409')],
  413: ['TOO_LARGE', i18n.t('misc2.api.413')],
  429: ['RATE_LIMIT', i18n.t('misc2.api.429')],
  500: ['INTERNAL', i18n.t('misc2.api.500')],
  501: ['NOT_IMPLEMENTED', i18n.t('misc2.api.501')],
  502: ['NETWORK', SERVICE_UNAVAILABLE],
  503: ['NETWORK', SERVICE_UNAVAILABLE],
  504: ['NETWORK', i18n.t('misc2.api.timeout')],
};

/** 오류 응답 → ApiError. 서버가 준 code·message를 쓰고, 없으면 상태 코드로 안내한다 */
export async function toApiError(res: Response, path: string): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  type Body = { code?: ApiErrorCode; message?: string | string[]; ref?: string };
  let body: Body | null;
  try {
    body = JSON.parse(text) as Body;
  } catch {
    body = null; // HTML(게이트웨이·배포 중 화면) 등
  }
  if (res.status >= 500)
    console.error(`[api] ${path} 서버 오류 ${res.status}`, body ?? text.slice(0, 300));
  const [fallbackCode, fallbackMsg] =
    FALLBACK[res.status] ??
    (res.status >= 500
      ? (['INTERNAL', FALLBACK[500][1]] as const)
      : (['VALIDATION', i18n.t('misc2.api.failedN', { v0: res.status })] as const));
  // 우리 서버는 오류에 늘 JSON(code·message)을 붙인다 — 5xx인데 본문이 없으면 서버까지 닿지 못한 것
  // (개발 프록시·게이트웨이가 대신 응답: 서버 재시작·배포·콜드 스타트)
  if (res.status >= 500 && !body?.code)
    return new ApiError(res.status, SERVICE_UNAVAILABLE, 'NETWORK');
  const raw = body?.message;
  const message = (Array.isArray(raw) ? raw.join(', ') : raw) || fallbackMsg;
  return new ApiError(res.status, message, body?.code ?? fallbackCode, body?.ref);
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers ?? {}),
      },
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    console.error(`[api] ${path} 연결 실패`, e);
    throw navigator.onLine === false
      ? new ApiError(0, i18n.t('misc2.api.offline'), 'OFFLINE')
      : new ApiError(0, SERVICE_UNAVAILABLE, 'NETWORK');
  }

  if (res.status === 401) {
    const err = await toApiError(res, path);
    // 로그인 화면의 '비밀번호 틀림'은 그대로 보여 주고, 그 밖의 401은 로그인이 끝난 것이다
    if (path.startsWith('/auth/login')) throw err;
    setToken(null);
    window.dispatchEvent(new Event('tongin:unauthorized'));
    throw new ApiError(401, i18n.t('misc2.sessionExpired'), 'UNAUTHORIZED');
  }
  if (!res.ok) throw await toApiError(res, path);
  if ((opts.method ?? 'GET').toUpperCase() !== 'GET') invalidateCache(path);
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch (e) {
    // JSON이 아닌 응답(배포 중 HTML 등)
    console.error(`[api] ${path} 응답 해석 실패`, e);
    throw new ApiError(res.status, i18n.t('misc2.api.parse'), 'BAD_RESPONSE');
  }
}

/** 화면에 띄울 오류 문장 — ApiError면 상황별 안내, 아니면 fallback */
export function errorMessage(e: unknown, fallback = i18n.t('misc2.api.generic')) {
  return e instanceof ApiError ? e.message : fallback;
}

/** 인증 fetch로 HTML 문서를 받아 새 탭으로 연다(견적서 등 동적 문서 → 브라우저 인쇄로 PDF). */
export async function openDocument(path: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw await toApiError(res, path);
  const html = await res.text();
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 인증 fetch로 파일을 받아 다운로드 트리거(.ics 등). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw await toApiError(res, path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
