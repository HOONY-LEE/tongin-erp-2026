import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { ESTIMATE_OPTION_GROUPS, type EstimateOptionGroup } from '@tongin/shared';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { ESTIMATE_OPTION_GROUP_LABEL } from '../i18n/codes';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');
const UNIT: Record<string, string> = { EA: i18n.t('prod.unit.EA'), FLAT: i18n.t('prod.unit.FLAT') };

const columns: Column[] = [
  {
    title: i18n.t('prod.group'),
    minWidth: 130,
    render: (r: Row) => (
      <Badge variant="subtle" color="primary">
        {ESTIMATE_OPTION_GROUP_LABEL[r.groupCode as EstimateOptionGroup] ?? String(r.groupCode)}
      </Badge>
    ),
  },
  {
    title: i18n.t('prod.productName'),
    dataIndex: 'name',
    flex: 1,
    minWidth: 160,
    render: (r: Row) => (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {String(r.name)}
        {r.kind === 'VOLUME' && (
          <Badge variant="subtle" color="info">
            {i18n.t('prod.byItems')}
          </Badge>
        )}
      </span>
    ),
  },
  { title: i18n.t('prod.kind'), render: (r: Row) => String(r.variantText || '-') },
  {
    title: i18n.t('prod.input'),
    render: (r: Row) =>
      [r.hasDate ? i18n.t('prod.reqDate') : '', r.hasNote ? i18n.t('prod.content') : '']
        .filter(Boolean)
        .join(' · ') || '-',
  },
  { title: i18n.t('prod.unitLabel'), render: (r: Row) => UNIT[r.unit as string] ?? String(r.unit) },
  { title: i18n.t('prod.col.basePrice'), numeric: true, render: (r: Row) => won(r.price) },
  {
    title: i18n.t('prod.status'),
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? i18n.t('prod.on') : i18n.t('prod.off')}
      </Badge>
    ),
  },
];

const fields: FormField[] = [
  {
    name: 'name',
    label: i18n.t('prod.productName'),
    required: true,
    placeholder: i18n.t('prod.addonPh'),
  },
  {
    name: 'groupCode',
    label: i18n.t('prod.estimateGroup'),
    required: true,
    type: 'select',
    options: ESTIMATE_OPTION_GROUPS.map((g) => ({
      value: g,
      label: ESTIMATE_OPTION_GROUP_LABEL[g],
    })),
  },
  {
    name: 'unit',
    label: i18n.t('prod.unitLabel'),
    required: true,
    type: 'select',
    options: [
      { value: 'EA', label: i18n.t('prod.unit.EA') },
      { value: 'FLAT', label: i18n.t('prod.unit.FLAT') },
    ],
  },
  {
    name: 'variantText',
    label: i18n.t('prod.variants'),
    placeholder: i18n.t('prod.variantsPh'),
    alwaysShow: true,
  },
  {
    name: 'price',
    label: i18n.t('prod.refPrice'),
    type: 'number',
    placeholder: i18n.t('prod.refPriceHint'),
  },
  { name: 'hasDate', label: i18n.t('prod.askDate'), type: 'boolean' },
  { name: 'hasNote', label: i18n.t('prod.askNote'), type: 'boolean' },
  { name: 'sortOrder', label: i18n.t('prod.sortOrder'), type: 'number' },
  { name: 'isActive', label: i18n.t('prod.activeLabel'), type: 'boolean' },
];

/**
 * 상품 — 실제로 파는 것(이사물량·사다리차·입주청소 …). 상품구성에 넣으면 그 구성의 견적 3단계에 나오고,
 * 구성 밖이어도 견적에서 '추가 상품'으로 고를 수 있다. 코드는 서버 발급(OPT-0001).
 * 이사물량은 물품정보(방·물품·처리방법)로 물량을 잡는 특별한 상품이다.
 */
export default function Addons() {
  const { t } = useTranslation();
  return (
    <CrudTable
      title={t('prod.col.product')}
      path="/addon-services"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
