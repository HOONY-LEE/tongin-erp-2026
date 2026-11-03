# 통인 AI-WORKS 데스크톱 앱 (Electron)

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
npm run build:mac                           # dist/ 에 .dmg (서명 없음 — 처음 열 때 우클릭 → 열기)
npm run build:win                           # Windows 설치 파일(.exe)
```

브라우저에서 데스크톱 화면을 미리 보려면(개발 서버만) 주소에 `?desktop=1`, 끄기는 `?desktop=0`.
