import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

const columns: Column[] = [
  { title: '분류', dataIndex: 'category' },
  { title: '품목명', dataIndex: 'name', flex: 1, minWidth: 160 },
  { title: 'CBM(부피)', dataIndex: 'cbm', numeric: true },
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
  { name: 'category', label: '분류', required: true, placeholder: '거실 / 주방 / 안방 …' },
  { name: 'name', label: '품목명', required: true },
  { name: 'cbm', label: 'CBM(부피)', required: true, type: 'number' },
  { name: 'isActive', label: '사용 여부', type: 'boolean' },
];

/** 품목사전 — 분류 안에서 같은 이름은 하나만(서버가 중복을 막는다) */
export default function CbmItems() {
  return (
    <CrudTable
      title="품목사전"
      path="/cbm-items"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
