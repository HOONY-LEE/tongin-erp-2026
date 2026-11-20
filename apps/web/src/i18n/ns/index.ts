import account from './account';
import code from './code';
import employee from './employee';
import profile from './profile';
import ui from './ui';

/** 네임스페이스 이름 → 번역 묶음. t('ui.copy')처럼 '이름.키'로 쓴다. 새 화면은 여기 등록. */
export const NAMESPACES = {
  account,
  code,
  employee,
  profile,
  ui,
};

export function nsResources(lang: 'ko' | 'en' | 'zh') {
  return Object.fromEntries(Object.entries(NAMESPACES).map(([k, v]) => [k, v[lang]]));
}
