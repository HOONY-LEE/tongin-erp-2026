import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

const num = (v: unknown) => (v == null || v === '' ? '-' : String(Number(v)));

const columns: Column[] = [
  { title: i18n.t('prod.category'), dataIndex: 'category' },
  {
    title: i18n.t('prod.itemName'),
    dataIndex: 'name',
    flex: 1,
    minWidth: 160,
  },
  // 영문명은 이름 옆에 작게 붙이던 것을 자기 칸으로 — 한 칸에 한 정보
  {
    title: i18n.t('prod.nameEn'),
    dataIndex: 'nameEng',
    minWidth: 120,
    render: (r: Row) => (r.nameEng ? String(r.nameEng) : '-'),
  },
  { title: i18n.t('prod.baseCbm'), numeric: true, render: (r: Row) => num(r.cbm) },
  { title: i18n.t('prod.baseTon'), numeric: true, render: (r: Row) => num(r.ton) },
  {
    title: i18n.t('prod.inRooms'),
    minWidth: 140,
    render: (r: Row) => ((r.roomNames as string[]) ?? []).join(', ') || '-',
  },
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
    label: i18n.t('prod.itemName'),
    required: true,
    placeholder: i18n.t('prod.itemPh'),
  },
  {
    name: 'category',
    label: i18n.t('prod.category'),
    required: true,
    placeholder: i18n.t('prod.categoryPh'),
  },
  {
    name: 'cbm',
    label: i18n.t('prod.baseCbmLabel'),
    type: 'number',
    alwaysShow: true,
    pairWithNext: true,
  },
  { name: 'ton', label: i18n.t('prod.baseTonLabel'), type: 'number', alwaysShow: true },
  { name: 'nameEng', label: i18n.t('prod.nameEnLabel'), placeholder: 'Computer' },
  { name: 'sortOrder', label: i18n.t('prod.sortOrder'), type: 'number' },
  { name: 'isActive', label: i18n.t('prod.activeLabel'), type: 'boolean' },
];

/**
 * 이사물품 — 견적 물품정보에서 고르는 물품 사전. 물품은 이름으로 하나뿐이고,
 * 방 틀은 이 물품을 가리키기만 한다. 기본 부피·무게는 비워 둬도 된다(견적 때 입력).
 */
export default function CbmItems() {
  const { t } = useTranslation();
  return (
    <CrudTable
      title={t('prod.movingItems')}
      path="/cbm-items"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
