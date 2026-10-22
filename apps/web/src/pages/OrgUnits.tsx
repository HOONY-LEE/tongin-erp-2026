import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';

const TYPE_LABEL: Record<string, string> = {
  GROUP: '그룹사',
  COMPANY: '법인/브랜드',
  BRANCH: '지점',
  PARTNER: '외부업체',
};

const columns: Column[] = [
  { title: '이름', dataIndex: 'name', flex: 1, minWidth: 160 },
  {
    title: '유형',
    render: (r: Row) => (
      <Badge variant="subtle">{TYPE_LABEL[r.type as string] ?? String(r.type)}</Badge>
    ),
  },
  {
    title: '상태',
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? '사용' : '사용 안 함'}
      </Badge>
    ),
  },
];

export default function OrgUnits() {
  const parents = useOptions('/org-units', 'name');
  const fields: FormField[] = [
    {
      name: 'type',
      label: '유형',
      required: true,
      type: 'select',
      options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
    },
    { name: 'name', label: '이름', required: true },
    { name: 'parentId', label: '상위 조직', type: 'select', options: parents },
    { name: 'isActive', label: '사용 여부', type: 'boolean' },
  ];
  // 코드는 서버 발급(ORG-0001), 이름 중복 불가
  return (
    <CrudTable
      title="조직"
      path="/org-units"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
