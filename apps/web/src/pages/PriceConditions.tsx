import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const DISCOUNT: Record<string, string> = {
  RATE: '할인율(%)',
  AMOUNT: '정액할인',
  FIXED_PRICE: '고정가',
};

const columns: Column[] = [
  { title: '조건명', dataIndex: 'name' },
  {
    title: '할인유형',
    render: (r: Row) => (
      <Badge variant="subtle">{DISCOUNT[r.discountType as string] ?? String(r.discountType)}</Badge>
    ),
  },
  {
    title: '할인값',
    numeric: true,
    render: (r: Row) =>
      r.discountType === 'RATE' ? `${String(r.discountValue)}%` : won(r.discountValue),
  },
  { title: '유효 시작', render: (r: Row) => String(r.validFrom ?? '-') },
  { title: '유효 종료', render: (r: Row) => String(r.validTo ?? '-') },
  {
    title: '상태',
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? '활성' : '비활성'}
      </Badge>
    ),
  },
];

/** 가격조건(할인·특가) CRUD. */
export default function PriceConditions() {
  const partners = useOptions('/partners', 'name');

  const fields: FormField[] = [
    { name: 'partnerId', label: '거래처', type: 'select', options: partners },
    { name: 'name', label: '조건명', required: true, placeholder: '예: VIP 10% 할인' },
    {
      name: 'discountType',
      label: '할인유형',
      required: true,
      type: 'select',
      options: [
        { value: 'RATE', label: '할인율(%)' },
        { value: 'AMOUNT', label: '정액할인' },
        { value: 'FIXED_PRICE', label: '고정가' },
      ],
    },
    { name: 'discountValue', label: '할인값', required: true, type: 'number', placeholder: '10' },
    { name: 'validFrom', label: '유효 시작일', type: 'date' },
    { name: 'validTo', label: '유효 종료일', type: 'date' },
  ];

  return (
    <CrudTable
      title="가격 조건"
      path="/price-conditions"
      columns={columns}
      fields={fields}
    />
  );
}
