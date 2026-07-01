import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

const TYPE: Record<string, string> = {
  AFFILIATE: '제휴',
  OUTSOURCE: '전속외주',
  B2B_CLIENT: 'B2B고객',
};
const TYPE_COLOR: Record<string, 'primary' | 'info' | 'warning'> = {
  AFFILIATE: 'primary',
  OUTSOURCE: 'info',
  B2B_CLIENT: 'warning',
};

const columns: Column[] = [
  { title: '코드', dataIndex: 'code' },
  { title: '거래처명', dataIndex: 'name' },
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
        {r.isActive ? '활성' : '비활성'}
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
    options: [
      { value: 'AFFILIATE', label: '제휴' },
      { value: 'OUTSOURCE', label: '전속외주' },
      { value: 'B2B_CLIENT', label: 'B2B고객' },
    ],
  },
  { name: 'code', label: '코드', required: true, placeholder: 'P-001' },
  { name: 'name', label: '거래처명', required: true, placeholder: '예: 홈케어파트너스' },
];

/** 거래처 CRUD 목록. */
export default function Partners() {
  return <CrudTable title="거래처" path="/partners" columns={columns} fields={fields} />;
}
