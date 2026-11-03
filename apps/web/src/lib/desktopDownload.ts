/**
 * 데스크톱 앱 설치 파일 — GitHub Releases(공개 저장소)의 최신 릴리스에서 받는다.
 * 파일 이름은 desktop/package.json build.*.artifactName, 올리는 일은 .github/workflows/desktop-release.yml.
 */
const RELEASE = 'https://github.com/HOONY-LEE/tongin-erp-2026/releases/latest/download';

export type DesktopTarget = 'mac-arm64' | 'mac-x64' | 'win-x64';

export const DESKTOP_TARGETS: Record<
  DesktopTarget,
  { label: string; hint: string; file: string; os: 'mac' | 'win' }
> = {
  'mac-arm64': {
    label: 'macOS (Apple 실리콘)',
    hint: 'M1·M2·M3·M4 칩 맥',
    file: 'TonginAIWorks-mac-arm64.dmg',
    os: 'mac',
  },
  'mac-x64': {
    label: 'macOS (인텔)',
    hint: '2020년 이전 인텔 칩 맥',
    file: 'TonginAIWorks-mac-x64.dmg',
    os: 'mac',
  },
  'win-x64': {
    label: 'Windows',
    hint: 'Windows 10·11 (64비트)',
    file: 'TonginAIWorks-win-x64.exe',
    os: 'win',
  },
};

export const downloadUrl = (t: DesktopTarget) => `${RELEASE}/${DESKTOP_TARGETS[t].file}`;

interface UAData {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; platform?: string }>;
}

/**
 * 지금 쓰는 컴퓨터에 맞는 설치 파일.
 *  - 크롬·엣지: userAgentData로 OS·칩(arm/x86)을 정확히 안다
 *  - 사파리 등: 맥이면 칩을 알 수 없어 요즘 맥(애플 실리콘)으로 본다(인텔 맥은 아래 목록에서 고른다)
 *  - 휴대폰·태블릿·리눅스는 null(데스크톱 앱 없음)
 */
export async function detectDesktopTarget(): Promise<{
  target: DesktopTarget | null;
  sure: boolean;
}> {
  const ua = navigator.userAgent;
  const uad = (navigator as { userAgentData?: UAData }).userAgentData;
  const platform = (uad?.platform || navigator.platform || '').toLowerCase();
  const mobile =
    /iphone|ipad|ipod|android/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (mobile) return { target: null, sure: true };
  const isWin = platform.includes('win') || /windows/i.test(ua);
  const isMac = platform.includes('mac') || /macintosh|mac os x/i.test(ua);
  if (isWin) return { target: 'win-x64', sure: true };
  if (!isMac) return { target: null, sure: true };
  try {
    const hi = await uad?.getHighEntropyValues?.(['architecture']);
    if (hi?.architecture)
      return { target: hi.architecture === 'arm' ? 'mac-arm64' : 'mac-x64', sure: true };
  } catch {
    /* 알 수 없으면 아래로 */
  }
  return { target: 'mac-arm64', sure: false };
}

/** 링크로 바로 받기 */
export function startDownload(t: DesktopTarget) {
  const a = document.createElement('a');
  a.href = downloadUrl(t);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
