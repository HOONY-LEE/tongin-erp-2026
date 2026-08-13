import 'pretendard/dist/web/static/pretendard-dynamic-subset.css';
import '@sunghoon_lee/akron-ui/tokens';
import '@sunghoon_lee/akron-ui/styles';
import './styles/base.css';
import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 현장에서 신호가 끊겨도 받아둔 작업지시서를 열 수 있도록.
// 개발 중에는 HMR과 충돌하므로 빌드된 앱에서만 등록한다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
