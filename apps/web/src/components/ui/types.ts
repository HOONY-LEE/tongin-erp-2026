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
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export type BadgeColor = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
