import { useEffect, useRef } from 'react';

/**
 * 대시보드 편집기는 새 창(전체 화면)으로 연다 — 원래 창은 목록·대시보드를 그대로 두고,
 * 편집 창에서 저장하면 알림을 보내 원래 창이 새로 불러오거나 다음 단계로 넘어간다.
 */
const CHANNEL = 'tongin-dashboard-editor';
const NAME_PREFIX = 'tongin-dash-edit';

export type DashEditorMessage =
  | { type: 'saved'; scope: 'template'; id: string }
  | { type: 'saved'; scope: 'mine' }
  /** 템플릿 1단계 저장 후 2단계(설정)로 — 원래 창이 넘어간다 */
  | { type: 'next'; id: string };

/** 새 창으로 연다. 팝업이 막혔으면 false(그때는 이 창에서 이동) */
export function openDashboardEditor(path: string, key: string): boolean {
  const w = window.open(
    path,
    `${NAME_PREFIX}-${key}`,
    `popup=yes,left=0,top=0,width=${screen.availWidth},height=${screen.availHeight}`,
  );
  if (!w) return false;
  w.focus();
  return true;
}

/** 지금 창이 편집용으로 열린 창인지 */
export function isDashboardEditorWindow() {
  return window.name.startsWith(NAME_PREFIX) && !!window.opener;
}

/** 편집 창이면 닫고, 아니면(주소로 바로 연 경우) fallback으로 이동 */
export function leaveDashboardEditor(fallback: () => void) {
  if (isDashboardEditorWindow()) window.close();
  else fallback();
}

export function postDashEditorMessage(msg: DashEditorMessage) {
  try {
    const c = new BroadcastChannel(CHANNEL);
    c.postMessage(msg);
    c.close();
  } catch {
    // BroadcastChannel이 없는 브라우저 — 원래 창은 직접 새로고침해야 한다
  }
}

export function useDashEditorMessages(onMessage: (msg: DashEditorMessage) => void) {
  const ref = useRef(onMessage);
  ref.current = onMessage;
  useEffect(() => {
    let c: BroadcastChannel;
    try {
      c = new BroadcastChannel(CHANNEL);
    } catch {
      return;
    }
    c.onmessage = (e: MessageEvent<DashEditorMessage>) => ref.current(e.data);
    return () => c.close();
  }, []);
}
