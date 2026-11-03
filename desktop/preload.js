// 화면(웹)에 꼭 필요한 것만 넘긴다 — 데스크톱인지, 운영체제, 창 크기 바꾸기
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tonginDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '',
  setWindowMode: (mode) => ipcRenderer.send('window-mode', mode),
});
