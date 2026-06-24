import CrudTable, { type Column, type FormField } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';

const columns: Column[] = [
  { title: '고객명', dataIndex: 'name' },
  { title: '연락처', dataIndex: 'phonePrimary' },
  { title: '등급', dataIndex: 'grade' },
  { title: '상태', dataIndex: 'status' },
];

export default function Customers() {
  const orgs = useOptions('/org-units', 'name');
  const fields: FormField[] = [
    { name: 'name', label: '고객명', required: true },
    { name: 'phonePrimary', label: '연락처' },
    { name: 'grade', label: '등급' },
    { name: 'ownerOrgId', label: '담당 조직', type: 'select', options: orgs },
  ];
  return <CrudTable title="고객" path="/customers" columns={columns} fields={fields} />;
}
