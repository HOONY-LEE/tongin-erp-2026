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
}

/** 컬럼 정의로 렌더하는 공통 테이블. */
export function DataTable({ columns, rows, loading, rowKey = 'id' }: Props) {
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
          <TableRow key={String(r[rowKey])}>
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
