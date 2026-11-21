import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { PARTNER_TYPES } from '@tongin/shared';
import { Badge } from '../components/ui';
import { formatPhone } from '../lib/phone';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { PARTNER_TYPE_LABEL } from '../i18n/codes';

const TYPE: Record<string, string> = PARTNER_TYPE_LABEL;
const TYPE_COLOR: Record<string, 'primary' | 'info' | 'warning' | 'success'> = {
  AFFILIATE: 'primary',
  EXCLUSIVE: 'success',
  OUTSOURCE: 'info',
  B2B_CLIENT: 'warning',
};

const columns: Column[] = [
  { title: i18n.t('misc.partnerName'), dataIndex: 'name', flex: 1, minWidth: 160 },
  { title: i18n.t('misc.phone'), render: (r) => formatPhone(String(r.phone ?? '')) || '-' },
  {
    title: i18n.t('misc.type'),
    render: (r: Row) => (
      <Badge variant="subtle" color={TYPE_COLOR[r.type as string] ?? 'neutral'}>
        {TYPE[r.type as string] ?? String(r.type)}
      </Badge>
    ),
  },
  {
    title: i18n.t('misc.status'),
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? i18n.t('misc.on') : i18n.t('misc.off')}
      </Badge>
    ),
  },
];

const fields: FormField[] = [
  {
    name: 'type',
    label: i18n.t('misc.type'),
    required: true,
    type: 'select',
    options: PARTNER_TYPES.map((v) => ({ value: v, label: PARTNER_TYPE_LABEL[v] })),
  },
  {
    name: 'name',
    label: i18n.t('misc.partnerName'),
    required: true,
    placeholder: i18n.t('misc.partnerPh'),
  },
  // 외주 작업 배정 알림톡 수신처
  { name: 'phone', label: i18n.t('misc.contactPhone'), alwaysShow: true, type: 'tel' },
  { name: 'isActive', label: i18n.t('misc.activeLabel'), type: 'boolean' },
];

/** 거래처 — 코드는 서버 발급(PTN-0001), 같은 유형 안에서 이름 중복 불가. 제휴·전속 내용은 제휴·전속 메뉴에서 */
export default function Partners() {
  const { t } = useTranslation();
  return (
    <CrudTable
      title={t('misc.partners')}
      path="/partners"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
