import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko';
import en from './locales/en';
import zh from './locales/zh';
import { nsResources } from './ns';

// 지원 언어 (한국어 기본). 추후 언어 추가 시 locales에 파일 + 여기 등록만 하면 됨.
export const SUPPORTED_LANGS = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
] as const;

const LANG_KEY = 'tongin_lang';
const saved = localStorage.getItem(LANG_KEY);

void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: { ...ko, ...nsResources('ko') } },
    en: { translation: { ...en, ...nsResources('en') } },
    zh: { translation: { ...zh, ...nsResources('zh') } },
  },
  lng: saved ?? 'ko',
  fallbackLng: 'ko',
  interpolation: { escapeValue: false },
});

export function setLang(code: string) {
  localStorage.setItem(LANG_KEY, code);
  void i18n.changeLanguage(code);
}

export default i18n;

/**
 * 값에 따라 정해지는 키(서버 코드값 → 이름 등) — 타입 검사 밖이라 키가 없으면 fallback(없으면 키 마지막 조각).
 * 화면 글자는 되도록 t('정해진.키')로 쓰고, 코드값 매핑에만 쓴다.
 */
export function tDyn(key: string, fallback?: string, opts?: Record<string, unknown>): string {
  const t = i18n.t as unknown as (k: string, o?: Record<string, unknown>) => string;
  return i18n.exists(key) ? t(key, opts) : (fallback ?? key.split('.').pop() ?? key);
}

/** 서버 코드값 이름 — code.<그룹>.<값> 번역이 있으면 그것, 없으면 한국어표(서버 이름) */
export function codeLabel(group: string, value: string, ko?: Record<string, string>): string {
  return tDyn(`code.${group}.${value}`, ko?.[value] ?? value);
}
