import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko';
import en from './locales/en';
import zh from './locales/zh';

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
    ko: { translation: ko },
    en: { translation: en },
    zh: { translation: zh },
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
