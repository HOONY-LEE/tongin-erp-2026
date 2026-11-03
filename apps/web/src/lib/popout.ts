import { isDashboardEditorWindow } from './dashboardWindow';

/**
 * 작업 화면(에이전트 편집·드라이브·AI 비서·대시보드 편집)을 새 창으로 띄운다.
 * 새 창은 window.name으로 알아본다 — 창 안에서 다른 화면으로 옮겨 가도 그대로 남는다.
 * 새 창에서는 사이드바·헤더 없이 화면만 꽉 채운다(AppLayout).
 * 데스크톱 앱(Electron)도 window.open을 받아 앱 창을 하나 더 띄운다(desktop/main.js).
 */
const NAME_PREFIX = 'tongin-popout';

/** 지금 창이 새 창으로 띄운 창인지 */
export const isPopoutWindow = () => window.name.startsWith(NAME_PREFIX);

/** 새 창 열기 버튼을 보여 줄지 — 이미 따로 띄운 창(대시보드 편집 창 포함)에선 숨긴다 */
export const canPopout = () => !isPopoutWindow() && !isDashboardEditorWindow();

/** 지금 화면 주소를 새 창으로 연다. 팝업이 막혔으면 false */
export function openPopout(path = window.location.pathname + window.location.search): boolean {
  const width = Math.min(1440, screen.availWidth);
  const height = Math.min(900, screen.availHeight);
  const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
  const w = window.open(
    path,
    `${NAME_PREFIX}-${Date.now()}`,
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );
  if (!w) return false;
  w.focus();
  return true;
}
