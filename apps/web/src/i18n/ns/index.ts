import account from './account';
import code from './code';
import employee from './employee';
import profile from './profile';
import settings from './settings';
import signin from './signin';
import ui from './ui';
import leads from './leads';
import employees from './employees';
import customers from './customers';
import cal from './cal';
import est from './est';
import deals from './deals';
import transcript from './transcript';

/** 네임스페이스 이름 → 번역 묶음. t('ui.copy')처럼 '이름.키'로 쓴다. 새 화면은 여기 등록. */
export const NAMESPACES = {
  transcript,
  deals,
  est,
  cal,
  customers,
  employees,
  leads,
  account,
  code,
  employee,
  profile,
  settings,
  signin,
  ui,
};

export function nsResources(lang: 'ko' | 'en' | 'zh') {
  return Object.fromEntries(Object.entries(NAMESPACES).map(([k, v]) => [k, v[lang]]));
}
