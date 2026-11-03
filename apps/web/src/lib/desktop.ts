/**
 * 데스크톱 앱(Electron, 저장소 /desktop) 안에서 열렸는지 — preload가 window.tonginDesktop을 넣는다.
 * 브라우저에는 없다(userAgent로 판단하지 않는다).
 * 개발 중 브라우저에서 데스크톱 화면을 보려면 주소에 ?desktop=1 (끄기 ?desktop=0).
 */
interface DesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  /** 로그인 화면(작은 창) ↔ 앱 화면(큰 창) */
  setWindowMode: (mode: 'login' | 'app') => void;
}

const FAKE_KEY = 'tongin.fakeDesktop';

function devFlag(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const q = new URLSearchParams(window.location.search).get('desktop');
    if (q === '1') localStorage.setItem(FAKE_KEY, '1');
    if (q === '0') localStorage.removeItem(FAKE_KEY);
    return localStorage.getItem(FAKE_KEY) === '1';
  } catch {
    return false;
  }
}

const bridge = (window as { tonginDesktop?: DesktopBridge }).tonginDesktop ?? null;

export const isDesktop = !!bridge || devFlag();
/** 맥 데스크톱 앱 — 창 버튼이 헤더 안에 들어가는 모양 */
export const isMacDesktop = isDesktop && (bridge?.platform ?? 'darwin') === 'darwin';

export function setWindowMode(mode: 'login' | 'app') {
  bridge?.setWindowMode(mode);
}

if (isDesktop) document.documentElement.setAttribute('data-desktop', bridge?.platform ?? 'dev');
