import type { ReactNode } from 'react';

export type Row = Record<string, unknown>;

export interface Column {
  title: ReactNode;
  dataIndex?: string;
  numeric?: boolean;
  render?: (row: Row) => ReactNode;
}

export interface FormField {
  name: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'select' | 'address';
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** type='address'일 때 저장 키 접두('' | 'from' | 'to'). 미지정 시 ''. */
  addrPrefix?: string;
}

export type BadgeColor = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
