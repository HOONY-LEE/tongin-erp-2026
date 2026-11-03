// 통인 AI Works 데스크톱 앱 — 웹 앱(운영: Vercel)을 창 하나로 감싼다.
// 화면 코드는 서버에서 받으므로 배포하면 데스크톱도 바로 새 버전이 된다(앱을 다시 깔 필요 없음).
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

// 열 주소 — TONGIN_APP_URL로 바꿀 수 있다(개발: 로컬 웹 3002)
const APP_URL =
  process.env.TONGIN_APP_URL || (isDev ? 'http://localhost:3002' : 'https://tongin-erp.vercel.app');
const APP_ORIGIN = new URL(APP_URL).origin;
// 구글 계정 연결(드라이브·캘린더) 동의 화면은 창 안에서 연다 — 끝나면 앱 주소로 돌아온다
const ALLOWED_ORIGINS = new Set([APP_ORIGIN, 'https://accounts.google.com']);

app.setName('통인 AI Works');

/* 창 크기 — 로그인은 좁은 고정 창, 로그인 뒤에는 넓은 창 */
const LOGIN_SIZE = { width: 600, height: 860 };
const APP_SIZE = { width: 1440, height: 900, minWidth: 1024, minHeight: 700 };

let win = null;
let mode = 'login';

function applyMode(next) {
  if (!win || mode === next) return;
  mode = next;
  if (next === 'app') {
    win.setResizable(true);
    win.setMaximizable(true);
    win.setFullScreenable(true);
    win.setMinimumSize(APP_SIZE.minWidth, APP_SIZE.minHeight);
    win.setSize(APP_SIZE.width, APP_SIZE.height, true);
  } else {
    if (win.isFullScreen()) win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();
    win.setMinimumSize(LOGIN_SIZE.width, LOGIN_SIZE.height);
    win.setSize(LOGIN_SIZE.width, LOGIN_SIZE.height, true);
    win.setResizable(false);
    win.setMaximizable(false);
    win.setFullScreenable(false);
  }
  win.center();
}

const isAllowed = (url) => {
  try {
    return ALLOWED_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
};

function createWindow() {
  win = new BrowserWindow({
    width: LOGIN_SIZE.width,
    height: LOGIN_SIZE.height,
    minWidth: LOGIN_SIZE.width,
    minHeight: LOGIN_SIZE.height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '통인 AI Works',
    // 맥: 창 버튼(빨강·노랑·초록)을 화면 헤더 안에 — 웹이 그 자리를 비워 둔다(AppLayout .native)
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 12 } : undefined,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // 새 창 — blob(미리보기·문서)은 앱 안 새 창, 그 밖의 바깥 주소는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith(APP_ORIGIN)) return { action: 'allow' };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 창 자체가 모르는 곳으로 가지 않게 — 앱·구글 로그인 밖은 브라우저로
  win.webContents.on('will-navigate', (e, url) => {
    if (isAllowed(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // 브라우저처럼 확대·축소(⌘/Ctrl +, -, 0)
  const wc = win.webContents;
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(isMac ? input.meta : input.control)) return;
    const z = wc.getZoomLevel();
    if (input.key === '=' || input.key === '+') wc.setZoomLevel(Math.min(5, z + 0.5));
    else if (input.key === '-' || input.key === '_') wc.setZoomLevel(Math.max(-3, z - 0.5));
    else if (input.key === '0') wc.setZoomLevel(0);
    else return;
    event.preventDefault();
  });

  win.loadURL(APP_URL);
  win.on('closed', () => {
    win = null;
    mode = 'login';
  });
}

// 화면(로그인 여부)이 창 크기를 정한다 — preload의 setWindowMode
ipcMain.on('window-mode', (event, next) => {
  if (event.sender !== win?.webContents) return;
  if (next === 'app' || next === 'login') applyMode(next);
});

// 맥 메뉴 — 기본 편집(복사·붙여넣기 단축키)이 되게
function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: '보기',
      submenu: [
        { role: 'reload', label: '새로고침' },
        ...(isDev ? [{ role: 'toggleDevTools', label: '개발자 도구' }] : []),
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
