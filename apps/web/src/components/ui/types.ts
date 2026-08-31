import type { ReactNode } from 'react';

export type Row = Record<string, unknown>;

export interface Column {
  title: ReactNode;
  dataIndex?: string;
  numeric?: boolean;
  render?: (row: Row) => ReactNode;
  /** 고정 픽셀 너비. 미지정 시 테이블이 자동 배분. */
  width?: number;
  /** 최소 너비(px). flex와 함께 쓰면 유용. */
  minWidth?: number;
  /** 남는 가로 공간을 이 비율로 흡수(0/미지정 = 고정폭). */
  flex?: number;
}

export interface FormField {
  name: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'select' | 'address' | 'date' | 'tel';
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** type='address'일 때 저장 키 접두('' | 'from' | 'to'). 미지정 시 ''. */
  addrPrefix?: string;
  /** true면 입력 불가(값은 유지). 예: 일반 직원의 담당 지점 자동고정. */
  disabled?: boolean;
  /** 필수는 아니지만 "더보기" 뒤로 숨기지 않고 항상 노출. */
  alwaysShow?: boolean;
  /** true면 이 필드와 바로 다음 필드를 한 줄에 절반씩 배치. */
  pairWithNext?: boolean;
}

export type BadgeColor = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
