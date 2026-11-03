# 통인 AI Works 데스크톱 앱 (Electron)

웹 앱을 창 하나로 감싼 데스크톱 앱입니다. 화면은 서버(운영: https://tongin-erp.vercel.app)에서 받으므로
**웹을 배포하면 데스크톱도 바로 새 화면**이 됩니다. 앱을 다시 깔아야 하는 건 이 폴더(main.js·preload.js)를 바꿨을 때뿐입니다.

- 로그인 전: 600×860 고정 창 + 데스크톱 전용 로그인 화면(`apps/web/src/pages/DesktopLogin.tsx`)
- 로그인 뒤: 1440×900(최소 1024×700) 창. 맥은 창 버튼이 화면 헤더 안에 들어간다(`AppLayout` `.native`)
- 바깥 링크는 기본 브라우저로, 구글 계정 연결(드라이브·캘린더) 동의 화면은 창 안에서
- ⌘/Ctrl +·−·0 확대·축소

이 폴더는 pnpm 작업공간 밖입니다(Vercel·Render 빌드가 Electron을 받지 않게). npm으로 따로 설치합니다.

```bash
cd desktop && npm install
npm start                                   # 개발: http://localhost:3002 (웹 dev 서버를 먼저 켠다)
TONGIN_APP_URL=https://tongin-erp.vercel.app npm start   # 운영 화면으로
npm run build:mac                           # dist/ 에 .dmg (ad-hoc 서명 — 처음 열 때 시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기)
npm run build:win                           # Windows 설치 파일(.exe)
```

브라우저에서 데스크톱 화면을 미리 보려면(개발 서버만) 주소에 `?desktop=1`, 끄기는 `?desktop=0`.

## 설치 파일 배포(GitHub Releases)

웹 사이드바 아래 다운로드 아이콘(데스크톱 앱 설치)은 공개 저장소의 최신 릴리스에서 OS에 맞는 파일을 받는다.

- 맥 애플 실리콘 `TonginAIWorks-mac-arm64.dmg` · 맥 인텔 `TonginAIWorks-mac-x64.dmg` · 윈도우 `TonginAIWorks-win-x64.exe`
- 만들고 올리기: `.github/workflows/desktop-release.yml` — `desktop/package.json` version을 올리고 `git tag desktop-vX.Y.Z && git push origin desktop-vX.Y.Z`
- 서명하지 않은 설치 파일(맥: 처음 한 번 우클릭 → 열기, 윈도우: 추가 정보 → 실행). 정식 배포 전에는 애플 개발자 서명·공증, 윈도우 코드 서명을 권한다.

## 이름은 영문으로(중요)
앱·실행 파일 이름(build.productName)은 영문 `TonginAIWorks`로 둔다. 한글(`통인 AI Works`)로 두거나 Info.plist의
CFBundleName을 한글로 하면 패키지된 Electron이 시작하자마자 SIGTRAP으로 죽는다(macOS 26에서 확인).
화면에 보이는 이름만 CFBundleDisplayName(mac.extendInfo)·nsis.shortcutName으로 한글을 쓴다.
