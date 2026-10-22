import { useNavigate } from 'react-router-dom';
import {
  PRICING_METHODS,
  PRICING_METHOD_LABEL,
  SERVICE_LINES,
  SERVICE_LINE_LABEL,
  type PricingMethod,
  type ServiceLine,
} from '@tongin/shared';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const columns: Column[] = [
  { title: '상품구성', dataIndex: 'name', flex: 1, minWidth: 160 },
  { title: '카테고리', render: (r: Row) => String(r.category ?? '-') },
  {
    title: '서비스라인',
    render: (r: Row) => (
      <Badge variant="subtle" color="primary">
        {SERVICE_LINE_LABEL[r.serviceLine as ServiceLine] ?? String(r.serviceLine)}
      </Badge>
    ),
  },
  {
    title: '산정방식',
    render: (r: Row) => (
      <Badge variant="subtle">
        {PRICING_METHOD_LABEL[r.pricingMethod as PricingMethod] ?? String(r.pricingMethod)}
      </Badge>
    ),
  },
  { title: '기본가격', numeric: true, render: (r: Row) => won(r.basePrice) },
  {
    title: '상태',
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? '사용' : '사용 안 함'}
      </Badge>
    ),
  },
];

/**
 * 상품구성 — 가정이사·기업이전처럼 견적서·CS에 대표로 보이는 묶음. 실제로 파는 건 그 안의 상품들이다.
 * 구성(필수·기본선택·선택, 구성별 단가)은 상세에서 정한다. 코드는 서버 발급(PRD-0001).
 */
export default function Products() {
  const navigate = useNavigate();
  const orgs = useOptions('/org-units', 'name');
  const fields: FormField[] = [
    { name: 'name', label: '상품구성 이름', required: true, placeholder: '예: 포장이사' },
    {
      name: 'serviceLine',
      label: '서비스라인',
      required: true,
      type: 'select',
      options: SERVICE_LINES.map((v) => ({ value: v, label: SERVICE_LINE_LABEL[v] })),
    },
    {
      name: 'pricingMethod',
      label: '산정방식',
      required: true,
      type: 'select',
      options: PRICING_METHODS.map((v) => ({ value: v, label: PRICING_METHOD_LABEL[v] })),
    },
    { name: 'basePrice', label: '기본가격', type: 'number', placeholder: '예: 500000' },
    { name: 'category', label: '카테고리', placeholder: '가정이사 / 사무실이사 / 보관 …' },
    { name: 'brandOrgId', label: '브랜드(조직)', type: 'select', options: orgs },
    { name: 'isActive', label: '사용 여부', type: 'boolean' },
  ];
  return (
    <CrudTable
      title="상품구성"
      path="/products"
      columns={columns}
      fields={fields}
      editable
      deletable
      onDetail={(r) => navigate(`/products/${r.id as string}`)}
      hideHeader
    />
  );
}
