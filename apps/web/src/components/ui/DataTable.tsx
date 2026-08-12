import type { MouseEvent } from 'react';
import {
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sunghoon_lee/akron-ui';
import type { Column, Row } from './types';

interface Props {
  columns: Column[];
  rows: Row[];
  loading?: boolean;
  rowKey?: string;
  /** 지정 시 로우 클릭으로 상세 이동 등 처리 (로우 안의 버튼 클릭은 무시하고 버튼 자체 동작만 수행) */
  onRowClick?: (row: Row) => void;
}

/** 컬럼 정의로 렌더하는 공통 테이블. */
export function DataTable({ columns, rows, loading, rowKey = 'id', onRowClick }: Props) {
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c, i) => (
            <TableHead key={i} numeric={c.numeric}>
              {c.title}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow
            key={String(r[rowKey])}
            onClick={
              onRowClick
                ? (e: MouseEvent) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    onRowClick(r);
                  }
                : undefined
            }
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            {columns.map((c, i) => (
              <TableCell key={i} numeric={c.numeric}>
                {c.render ? c.render(r) : String(r[c.dataIndex ?? ''] ?? '')}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
