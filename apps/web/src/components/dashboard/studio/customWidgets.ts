import { useEffect, useState } from 'react';
import {
  CUSTOM_WIDGET_PREFIX,
  DASH_WIDGET_MAP,
  isCustomWidgetKey,
  studioDefaultSize,
  type CustomWidgetRow,
  type DashWidgetDef,
} from '@tongin/shared';
import { cachedApi } from '../../../lib/api';

/** 대시보드 편집기 위젯 목록에서 만든 위젯 묶음 이름 */
export const CUSTOM_GROUP = '만든 위젯';

/**
 * 만든 위젯 → 위젯 정의 모양(편집기가 기본 위젯과 똑같이 다루게). 데이터는 위젯이 스스로 부른다.
 * 목록에 없는(지웠거나 못 불러온) 위젯도 칸은 그릴 수 있게 기본값으로.
 */
export function customDef(key: string, row?: CustomWidgetRow): DashWidgetDef {
  return {
    key,
    title: row?.title ?? '',
    group: CUSTOM_GROUP,
    description: row?.subtitle ?? '',
    shape: 'embed',
    viz: [row?.spec.viz ?? 'bar'],
    perms: [],
    size: row ? studioDefaultSize(row.spec) : { w: 6, h: 4 },
  };
}

/** 내가 놓을 수 있는 만든 위젯(그 데이터를 볼 수 있는 것만) */
export function useAvailableCustomWidgets() {
  const [rows, setRows] = useState<CustomWidgetRow[]>([]);
  useEffect(() => {
    let alive = true;
    cachedApi<CustomWidgetRow[]>('/custom-widgets/available')
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, []);
  return rows;
}

/** 위젯 key → 정의(기본 위젯 또는 만든 위젯) */
export function defOf(
  key: string,
  custom: Map<string, CustomWidgetRow>,
): DashWidgetDef | undefined {
  if (isCustomWidgetKey(key)) return customDef(key, custom.get(key));
  return DASH_WIDGET_MAP.get(key);
}

export const customKey = (id: string) => `${CUSTOM_WIDGET_PREFIX}${id}`;
