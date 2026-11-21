import type { DashWidgetDef } from '@tongin/shared';
import { tDyn } from './index';

/**
 * 대시보드 위젯 목록(@tongin/shared)의 화면 글자를 지금 언어로 — 번역(dashw.*)이 없으면 한국어 그대로.
 * 목록 값(group 등)은 한국어 원본 그대로 두고, 보여 줄 때만 이 함수를 거친다.
 */
const wk = (key: string) => `dashw.w.${key.replace(/\./g, '_')}`;

export const widgetTitle = (def: Pick<DashWidgetDef, 'key' | 'title'>) =>
  tDyn(`${wk(def.key)}.t`, def.title);

export const widgetDesc = (def: Pick<DashWidgetDef, 'key' | 'description'>) =>
  tDyn(`${wk(def.key)}.d`, def.description);

/** 위젯 칸 제목 — 직접 붙인 제목은 그대로, 기본 제목(한국어 그대로 저장된 것 포함)은 번역 */
export const itemTitle = (title: string | undefined, def: Pick<DashWidgetDef, 'key' | 'title'>) =>
  !title || title === def.title ? widgetTitle(def) : title;

export const groupLabel = (g: string) => tDyn(`dashw.g.${g}`, g);

export const colorLabel = (c: { key: string; label: string }) => tDyn(`dashw.c.${c.key}`, c.label);
