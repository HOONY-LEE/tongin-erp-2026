import { PARTNER_TYPES, PARTNER_TYPE_LABEL } from '@tongin/shared';
import { Badge } from '../components/ui';
import { formatPhone } from '../lib/phone';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

const TYPE: Record<string, string> = PARTNER_TYPE_LABEL;
const TYPE_COLOR: Record<string, 'primary' | 'info' | 'warning' | 'success'> = {
  AFFILIATE: 'primary',
  EXCLUSIVE: 'success',
  OUTSOURCE: 'info',
  B2B_CLIENT: 'warning',
};

const columns: Column[] = [
  { title: '거래처명', dataIndex: 'name', flex: 1, minWidth: 160 },
  { title: '연락처', render: (r) => formatPhone(String(r.phone ?? '')) || '-' },
  {
    title: '유형',
    render: (r: Row) => (
      <Badge variant="subtle" color={TYPE_COLOR[r.type as string] ?? 'neutral'}>
        {TYPE[r.type as string] ?? String(r.type)}
      </Badge>
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

const fields: FormField[] = [
  {
    name: 'type',
    label: '유형',
    required: true,
    type: 'select',
    options: PARTNER_TYPES.map((v) => ({ value: v, label: PARTNER_TYPE_LABEL[v] })),
  },
  { name: 'name', label: '거래처명', required: true, placeholder: '예: 홈케어파트너스' },
  // 외주 작업 배정 알림톡 수신처
  { name: 'phone', label: '담당자 연락처', alwaysShow: true, type: 'tel' },
  { name: 'isActive', label: '사용 여부', type: 'boolean' },
];

/** 거래처 — 코드는 서버 발급(PTN-0001), 같은 유형 안에서 이름 중복 불가. 제휴·전속 내용은 제휴·전속 메뉴에서 */
export default function Partners() {
  return (
    <CrudTable
      title="거래처"
      path="/partners"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
