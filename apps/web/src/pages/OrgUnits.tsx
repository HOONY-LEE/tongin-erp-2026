import { Badge } from '@sunghoon_lee/akron-ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';

const columns: Column[] = [
  { title: '코드', dataIndex: 'code' },
  { title: '이름', dataIndex: 'name' },
  { title: '유형', render: (r: Row) => <Badge variant="subtle">{String(r.type)}</Badge> },
];

export default function OrgUnits() {
  const parents = useOptions('/org-units', 'name');
  const fields: FormField[] = [
    {
      name: 'type',
      label: '유형',
      required: true,
      type: 'select',
      options: [
        { value: 'GROUP', label: '그룹사' },
        { value: 'COMPANY', label: '법인/브랜드' },
        { value: 'BRANCH', label: '지점' },
        { value: 'PARTNER', label: '외부업체' },
      ],
    },
    { name: 'code', label: '코드', required: true },
    { name: 'name', label: '이름', required: true },
    { name: 'parentId', label: '상위 조직', type: 'select', options: parents },
  ];
  return <CrudTable title="조직" path="/org-units" columns={columns} fields={fields} />;
}
