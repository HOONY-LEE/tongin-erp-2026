const TOKEN_KEY = 'tongin_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 서버 오류(5xx)·연결 실패·알 수 없는 응답일 때 사용자에게 보여 줄 문구.
 * 내부 오류 내용은 화면에 내보내지 않고 콘솔에만 남긴다(입력 검증 같은 4xx 안내는 그대로 보여 준다).
 */
export const SERVICE_UNAVAILABLE = '서비스 준비 중입니다. 잠시 후 다시 시도해 주세요.';

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
    // 네트워크 끊김·서버 기동 중(콜드 스타트) 등
    console.error(`[api] ${path} 연결 실패`, e);
    throw new ApiError(0, SERVICE_UNAVAILABLE);
  }

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('tongin:unauthorized'));
    throw new ApiError(401, '인증이 필요합니다.');
  }
  if (res.status >= 500) {
    console.error(`[api] ${path} 서버 오류 ${res.status}`, await res.text().catch(() => ''));
    throw new ApiError(res.status, SERVICE_UNAVAILABLE);
  }
  if (!res.ok) {
    let msg = `오류 ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? msg);
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch (e) {
    // JSON이 아닌 응답(배포 중 HTML 등)
    console.error(`[api] ${path} 응답 해석 실패`, e);
    throw new ApiError(res.status, SERVICE_UNAVAILABLE);
  }
}

/** 인증 fetch로 HTML 문서를 받아 새 탭으로 연다(견적서 등 동적 문서 → 브라우저 인쇄로 PDF). */
export async function openDocument(path: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok)
    throw new ApiError(
      res.status,
      res.status >= 500 ? SERVICE_UNAVAILABLE : '문서 생성에 실패했습니다',
    );
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
  if (!res.ok)
    throw new ApiError(
      res.status,
      res.status >= 500 ? SERVICE_UNAVAILABLE : '파일 다운로드에 실패했습니다',
    );
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
