import type { ColumnsType } from 'antd/es/table';
import CrudTable, { type FormField } from '../components/CrudTable';

type Row = Record<string, unknown>;

const columns: ColumnsType<Row> = [
  { title: '분류', dataIndex: 'category' },
  { title: '품목명', dataIndex: 'name' },
  { title: 'CBM(부피)', dataIndex: 'cbm', align: 'right' },
];

const fields: FormField[] = [
  { name: 'category', label: '분류', required: true },
  { name: 'name', label: '품목명', required: true },
  { name: 'cbm', label: 'CBM(부피)', required: true, type: 'number' },
];

export default function CbmItems() {
  return <CrudTable title="품목사전" path="/cbm-items" columns={columns} fields={fields} />;
}
