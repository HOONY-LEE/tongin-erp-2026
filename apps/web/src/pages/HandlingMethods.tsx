import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { HANDLING_BUCKETS, type HandlingBucket } from '@tongin/shared';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { HANDLING_BUCKET_LABEL } from '../i18n/codes';

const BUCKET_COLOR: Record<HandlingBucket, 'primary' | 'info' | 'warning' | 'neutral'> = {
  MOVING: 'primary',
  TRANSIT: 'info',
  DISCARD: 'warning',
  EXCLUDED: 'neutral',
};

const columns: Column[] = [
  { title: i18n.t('prod.handling'), dataIndex: 'name', flex: 1, minWidth: 140 },
  {
    title: i18n.t('prod.volumeKind'),
    render: (r: Row) => (
      <Badge variant="subtle" color={BUCKET_COLOR[r.bucket as HandlingBucket] ?? 'neutral'}>
        {HANDLING_BUCKET_LABEL[r.bucket as HandlingBucket] ?? String(r.bucket)}
      </Badge>
    ),
  },
  { title: i18n.t('prod.col.order'), numeric: true, render: (r: Row) => String(r.sortOrder) },
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
    label: i18n.t('prod.handling'),
    required: true,
    placeholder: i18n.t('prod.handlingPh'),
  },
  {
    name: 'bucket',
    label: i18n.t('prod.volumeKind'),
    required: true,
    type: 'select',
    options: HANDLING_BUCKETS.map((b) => ({ value: b, label: HANDLING_BUCKET_LABEL[b] })),
  },
  { name: 'sortOrder', label: i18n.t('prod.sortOrder'), type: 'number' },
  { name: 'isActive', label: i18n.t('prod.activeLabel'), type: 'boolean' },
];

/** 처리방법 — 물품마다 고르는 처리(운반·폐기·경유 …)와 그 물품이 들어갈 물량 칸 */
export default function HandlingMethods() {
  const { t } = useTranslation();
  return (
    <CrudTable
      title={t('prod.handling')}
      path="/handling-methods"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
