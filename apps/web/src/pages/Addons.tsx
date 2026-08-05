import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');
const UNIT: Record<string, string> = { EA: '개당', FLAT: '정액' };

const columns: Column[] = [
  { title: '코드', dataIndex: 'code' },
  { title: '옵션명', dataIndex: 'name' },
  { title: '단위', render: (r: Row) => UNIT[r.unit as string] ?? String(r.unit) },
  { title: '가격', numeric: true, render: (r: Row) => won(r.price) },
];

const fields: FormField[] = [
  { name: 'code', label: '코드', required: true, placeholder: 'AC-DETACH' },
  { name: 'name', label: '옵션명', required: true, placeholder: '에어컨 분리·설치' },
  {
    name: 'unit',
    label: '단위',
    required: true,
    type: 'select',
    options: [
      { value: 'EA', label: '개당' },
      { value: 'FLAT', label: '정액' },
    ],
  },
  { name: 'price', label: '가격', type: 'number', placeholder: '예: 50000' },
];

/** 옵션(AddonService) — 부가서비스(사다리차·에어컨 분리 등). */
export default function Addons() {
  return (
    <CrudTable
      title="옵션(부가서비스)"
      path="/addon-services"
      columns={columns}
      fields={fields}
      hideHeader
    />
  );
}
