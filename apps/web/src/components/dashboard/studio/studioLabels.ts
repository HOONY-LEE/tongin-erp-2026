import {
  STUDIO_DATASET_GROUPS,
  STUDIO_DATASET_MAP,
  type DashPeriod,
  type DashViz,
} from '@tongin/shared';
import { tDyn } from '../../../i18n';
import { DASH_PERIOD_LABEL, DASH_VIZ_LABEL } from '../../../i18n/codes';

/**
 * 위젯 스튜디오 화면 글자 — 데이터 카탈로그(@tongin/shared, 한국어 원본)를 지금 언어로.
 * 번역(studio.cat.*)이 없으면 한국어 그대로.
 */
export const dsLabel = (ds: string) =>
  tDyn(`studio.cat.${ds}._`, STUDIO_DATASET_MAP.get(ds)?.label ?? ds);
/** 데이터 묶음 이름(영업·운영·인사…) */
export const dsGroupLabel = (g: string) =>
  tDyn(`studio.dsGroup.${g}`, STUDIO_DATASET_GROUPS.find((x) => x.key === g)?.label ?? g);
export const dimLabel = (ds: string, key: string) =>
  tDyn(
    `studio.cat.${ds}.${key}`,
    STUDIO_DATASET_MAP.get(ds)?.dimensions.find((d) => d.key === key)?.label ?? key,
  );
export const measureLabel = (ds: string, key: string) =>
  tDyn(
    `studio.cat.${ds}.m_${key}`,
    STUDIO_DATASET_MAP.get(ds)?.measures.find((m) => m.key === key)?.label ?? key,
  );
export const fieldLabel = (ds: string, key: string) =>
  tDyn(
    `studio.cat.${ds}.f_${key}`,
    STUDIO_DATASET_MAP.get(ds)?.fields.find((f) => f.key === key)?.label ?? key,
  );
export const grainLabel = (g: string) => tDyn(`studio.grain.${g}`, g);
export const ctrlLabel = dimLabel;

/** 조작 요소 선택지 이름 */
export function optLabel(ds: string, target: string, v: string): string {
  if (target === 'grain') return grainLabel(v);
  if (target === 'dimension') return dimLabel(ds, v);
  if (target === 'measure') return measureLabel(ds, v);
  if (target === 'period') return DASH_PERIOD_LABEL[v as DashPeriod] ?? v;
  if (target === 'viz') return DASH_VIZ_LABEL[v as DashViz] ?? v;
  return v;
}
