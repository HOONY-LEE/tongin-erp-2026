import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');

const DISCOUNT: Record<string, string> = {
  RATE: i18n.t('prod.disc.RATE'),
  AMOUNT: i18n.t('prod.disc.AMOUNT'),
  FIXED_PRICE: i18n.t('prod.disc.FIXED'),
};

const columns: Column[] = [
  { title: i18n.t('prod.condName'), dataIndex: 'name' },
  {
    title: i18n.t('prod.discType'),
    render: (r: Row) => (
      <Badge variant="subtle">{DISCOUNT[r.discountType as string] ?? String(r.discountType)}</Badge>
    ),
  },
  {
    title: i18n.t('prod.discValue'),
    numeric: true,
    render: (r: Row) =>
      r.discountType === 'RATE' ? `${String(r.discountValue)}%` : won(r.discountValue),
  },
  { title: i18n.t('prod.validFrom'), render: (r: Row) => String(r.validFrom ?? '-') },
  { title: i18n.t('prod.validTo'), render: (r: Row) => String(r.validTo ?? '-') },
  {
    title: i18n.t('prod.status'),
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? i18n.t('prod.activeOn') : i18n.t('prod.activeOff')}
      </Badge>
    ),
  },
];

/** 가격조건(할인·특가) CRUD. */
export default function PriceConditions() {
  const { t } = useTranslation();
  const partners = useOptions('/partners', 'name');

  const fields: FormField[] = [
    { name: 'partnerId', label: t('prod.partner'), type: 'select', options: partners },
    { name: 'name', label: t('prod.condName'), required: true, placeholder: t('prod.condPh') },
    {
      name: 'discountType',
      label: t('prod.discType'),
      required: true,
      type: 'select',
      options: [
        { value: 'RATE', label: t('prod.disc.RATE') },
        { value: 'AMOUNT', label: t('prod.disc.AMOUNT') },
        { value: 'FIXED_PRICE', label: t('prod.disc.FIXED') },
      ],
    },
    {
      name: 'discountValue',
      label: t('prod.discValue'),
      required: true,
      type: 'number',
      placeholder: '10',
    },
    { name: 'validFrom', label: t('prod.validFromDate'), type: 'date' },
    { name: 'validTo', label: t('prod.validToDate'), type: 'date' },
  ];

  return (
    <CrudTable
      title={t('prod.priceTitle')}
      path="/price-conditions"
      columns={columns}
      fields={fields}
      hideHeader
    />
  );
}
