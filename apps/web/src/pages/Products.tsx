import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  PRICING_METHODS,
  SERVICE_LINES,
  type PricingMethod,
  type ServiceLine,
} from '@tongin/shared';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';
import { PRICING_METHOD_LABEL, SERVICE_LINE_LABEL } from '../i18n/codes';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const columns: Column[] = [
  { title: i18n.t('prod.bundle'), dataIndex: 'name', flex: 1, minWidth: 160 },
  { title: i18n.t('prod.productCategory'), render: (r: Row) => String(r.category ?? '-') },
  {
    title: i18n.t('prod.serviceLine'),
    render: (r: Row) => (
      <Badge variant="subtle" color="primary">
        {SERVICE_LINE_LABEL[r.serviceLine as ServiceLine] ?? String(r.serviceLine)}
      </Badge>
    ),
  },
  {
    title: i18n.t('prod.pricing'),
    render: (r: Row) => (
      <Badge variant="subtle">
        {PRICING_METHOD_LABEL[r.pricingMethod as PricingMethod] ?? String(r.pricingMethod)}
      </Badge>
    ),
  },
  { title: i18n.t('prod.basePrice'), numeric: true, render: (r: Row) => won(r.basePrice) },
  {
    title: i18n.t('prod.status'),
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? i18n.t('prod.on') : i18n.t('prod.off')}
      </Badge>
    ),
  },
];

/**
 * 상품구성 — 가정이사·기업이전처럼 견적서·CS에 대표로 보이는 묶음. 실제로 파는 건 그 안의 상품들이다.
 * 구성(필수·기본선택·선택, 구성별 단가)은 상세에서 정한다. 코드는 서버 발급(PRD-0001).
 */
export default function Products() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const orgs = useOptions('/org-units', 'name');
  const fields: FormField[] = [
    {
      name: 'name',
      label: t('prod.bundleName'),
      required: true,
      placeholder: t('prod.bundleNamePh'),
    },
    {
      name: 'serviceLine',
      label: t('prod.serviceLine'),
      required: true,
      type: 'select',
      options: SERVICE_LINES.map((v) => ({ value: v, label: SERVICE_LINE_LABEL[v] })),
    },
    {
      name: 'pricingMethod',
      label: t('prod.pricing'),
      required: true,
      type: 'select',
      options: PRICING_METHODS.map((v) => ({ value: v, label: PRICING_METHOD_LABEL[v] })),
    },
    {
      name: 'basePrice',
      label: t('prod.basePrice'),
      type: 'number',
      placeholder: t('prod.pricePh'),
    },
    {
      name: 'category',
      label: t('prod.productCategory'),
      placeholder: t('prod.productCategoryPh'),
    },
    { name: 'brandOrgId', label: t('prod.brand'), type: 'select', options: orgs },
    { name: 'isActive', label: t('prod.activeLabel'), type: 'boolean' },
  ];
  return (
    <CrudTable
      title={t('prod.bundle')}
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
