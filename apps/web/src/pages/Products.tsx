import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';

const columns: Column[] = [
  { title: '코드', dataIndex: 'code' },
  { title: '상품명', dataIndex: 'name' },
  {
    title: '서비스라인',
    render: (r: Row) => (
      <Badge variant="subtle" color="primary">
        {String(r.serviceLine)}
      </Badge>
    ),
  },
  {
    title: '산정방식',
    render: (r: Row) => <Badge variant="subtle">{String(r.pricingMethod)}</Badge>,
  },
];

export default function Products() {
  const orgs = useOptions('/org-units', 'name');
  const fields: FormField[] = [
    { name: 'code', label: '코드', required: true },
    { name: 'name', label: '상품명', required: true },
    {
      name: 'serviceLine',
      label: '서비스라인',
      required: true,
      type: 'select',
      options: [
        { value: 'MOVING', label: '이사(무빙)' },
        { value: 'LIVING', label: '리빙' },
        { value: 'CARE', label: '케어' },
        { value: 'B2B_MOVING', label: '기업이전' },
        { value: 'GENERAL', label: '일반' },
      ],
    },
    {
      name: 'pricingMethod',
      label: '산정방식',
      required: true,
      type: 'select',
      options: [
        { value: 'CBM', label: 'CBM 기반' },
        { value: 'COST_PLUS', label: '원가적상식' },
        { value: 'FLAT', label: '정액' },
        { value: 'PYEONG', label: '평수' },
      ],
    },
    { name: 'brandOrgId', label: '브랜드(조직)', type: 'select', options: orgs },
  ];
  return <CrudTable title="상품" path="/products" columns={columns} fields={fields} />;
}
