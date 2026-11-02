import { api, ApiError, getToken } from './api';

/** 한 화면(탭)에서 1분에 보내는 최대 수 — 같은 오류가 되풀이돼도 서버가 차지 않게 */
const MAX_PER_MINUTE = 5;
let windowStart = 0;
let sent = 0;
const seen = new Set<string>();

/**
 * 화면에서 난 오류를 시스템 로그로 보낸다(관리자 '시스템 로그'의 출처 '화면').
 * 로그인 전이거나, 서버가 이미 남긴 API 오류(ApiError)면 보내지 않는다.
 */
export function reportClientError(
  error: unknown,
  extra?: { ref?: string; componentStack?: string },
) {
  if (!getToken() || error instanceof ApiError) return;
  const e = error instanceof Error ? error : null;
  const message = (e?.message ?? String(error)).slice(0, 2000);
  if (!message) return;
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    sent = 0;
    seen.clear();
  }
  if (sent >= MAX_PER_MINUTE || seen.has(message)) return;
  sent++;
  seen.add(message);
  const detail = [e?.stack, extra?.componentStack].filter(Boolean).join('\n\n— 화면 위치 —\n');
  void api('/system-logs/client', {
    method: 'POST',
    body: JSON.stringify({
      message,
      detail: detail.slice(0, 8000) || undefined,
      path: `${location.pathname}${location.search}`.slice(0, 500),
      ref: extra?.ref,
    }),
  }).catch(() => undefined);
}

/** 그리기 밖에서 난 오류(이벤트 처리·비동기)도 잡는다 — main.tsx에서 한 번 부른다 */
export function installErrorReporter() {
  window.addEventListener('error', (ev) => reportClientError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => reportClientError(ev.reason));
}
