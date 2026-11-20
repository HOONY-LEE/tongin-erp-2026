import 'i18next';
import type ko from './locales/ko';
import type { NAMESPACES } from './ns';

type NsKo = { [K in keyof typeof NAMESPACES]: (typeof NAMESPACES)[K]['ko'] };

/** t('키')를 타입으로 검사 — 없는 키를 쓰면 타입 오류 */
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof ko & NsKo };
  }
}
