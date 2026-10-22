import { HANDLING_BUCKETS, HANDLING_BUCKET_LABEL, type HandlingBucket } from '@tongin/shared';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

const BUCKET_COLOR: Record<HandlingBucket, 'primary' | 'info' | 'warning' | 'neutral'> = {
  MOVING: 'primary',
  TRANSIT: 'info',
  DISCARD: 'warning',
  EXCLUDED: 'neutral',
};

const columns: Column[] = [
  { title: '처리방법', dataIndex: 'name', flex: 1, minWidth: 140 },
  {
    title: '물량 집계',
    render: (r: Row) => (
      <Badge variant="subtle" color={BUCKET_COLOR[r.bucket as HandlingBucket] ?? 'neutral'}>
        {HANDLING_BUCKET_LABEL[r.bucket as HandlingBucket] ?? String(r.bucket)}
      </Badge>
    ),
  },
  { title: '순서', numeric: true, render: (r: Row) => String(r.sortOrder) },
  {
    title: '상태',
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? '사용' : '사용 안 함'}
      </Badge>
    ),
  },
];

const fields: FormField[] = [
  { name: 'name', label: '처리방법', required: true, placeholder: '예: 보관' },
  {
    name: 'bucket',
    label: '물량 집계',
    required: true,
    type: 'select',
    options: HANDLING_BUCKETS.map((b) => ({ value: b, label: HANDLING_BUCKET_LABEL[b] })),
  },
  { name: 'sortOrder', label: '표시 순서(작을수록 위)', type: 'number' },
  { name: 'isActive', label: '사용 여부', type: 'boolean' },
];

/** 처리방법 — 물품마다 고르는 처리(운반·폐기·경유 …)와 그 물품이 들어갈 물량 칸 */
export default function HandlingMethods() {
  return (
    <CrudTable
      title="처리방법"
      path="/handling-methods"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
