import type { CSSProperties, ReactNode } from 'react';
import { dashColorVars } from '@tongin/shared';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * 대시보드 색을 차트에 입힌다 — 안쪽 차트들이 --dash-* 변수(계열색·연속값 단계)를 물려받는다.
 * 레이아웃에 끼어들지 않게 display: contents.
 */
export function DashColorScope({
  color,
  children,
}: {
  color?: string | null;
  children: ReactNode;
}) {
  const { resolved } = useTheme();
  const style = {
    display: 'contents',
    ...dashColorVars(color, resolved === 'dark'),
  } as CSSProperties;
  return <div style={style}>{children}</div>;
}
