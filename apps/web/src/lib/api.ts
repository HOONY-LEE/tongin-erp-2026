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

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('tongin:unauthorized'));
    throw new ApiError(401, '인증이 필요합니다.');
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
  return res.json() as Promise<T>;
}

/** 인증 fetch로 HTML 문서를 받아 새 탭으로 연다(견적서 등 동적 문서 → 브라우저 인쇄로 PDF). */
export async function openDocument(path: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, '문서 생성에 실패했습니다');
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
  if (!res.ok) throw new ApiError(res.status, '파일 다운로드에 실패했습니다');
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
