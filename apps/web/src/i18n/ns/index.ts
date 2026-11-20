import transcript from './transcript';
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
import att from './att';
import leave from './leave';
import appr from './appr';
import duty from './duty';
import task from './task';
import hrp from './hrp';
import acc from './acc';
import menu from './menu';
import logs from './logs';
import drive from './drive';
import space from './space';
import notice from './notice';
import crm from './crm';
import ally from './ally';
import aiadm from './aiadm';
import agent from './agent';
import ai from './ai';
import dash from './dash';
import perf from './perf';
import camp from './camp';
import know from './know';
import fran from './fran';
import asset from './asset';
import biz from './biz';
import pay from './pay';
import sign from './sign';
import prod from './prod';
import misc from './misc';

/** 네임스페이스 이름 → 번역 묶음. t('ui.copy')처럼 '이름.키'로 쓴다. 새 화면은 여기 등록. */
export const NAMESPACES = {
  misc,
  prod,
  sign,
  pay,
  biz,
  asset,
  fran,
  know,
  camp,
  perf,
  dash,
  transcript,
  ai,
  agent,
  aiadm,
  ally,
  crm,
  notice,
  space,
  drive,
  logs,
  menu,
  acc,
  hrp,
  task,
  duty,
  appr,
  leave,
  att,
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
