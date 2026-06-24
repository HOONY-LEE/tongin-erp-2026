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
