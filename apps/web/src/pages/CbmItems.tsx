import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

const num = (v: unknown) => (v == null || v === '' ? '-' : String(Number(v)));

const columns: Column[] = [
  { title: '분류', dataIndex: 'category' },
  {
    title: '물품명',
    dataIndex: 'name',
    flex: 1,
    minWidth: 160,
  },
  // 영문명은 이름 옆에 작게 붙이던 것을 자기 칸으로 — 한 칸에 한 정보
  {
    title: '영문명',
    dataIndex: 'nameEng',
    minWidth: 120,
    render: (r: Row) => (r.nameEng ? String(r.nameEng) : '-'),
  },
  { title: '기본 CBM', numeric: true, render: (r: Row) => num(r.cbm) },
  { title: '기본 톤', numeric: true, render: (r: Row) => num(r.ton) },
  {
    title: '들어 있는 방',
    minWidth: 140,
    render: (r: Row) => ((r.roomNames as string[]) ?? []).join(', ') || '-',
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
  { name: 'name', label: '물품명', required: true, placeholder: '예: 컴퓨터' },
  { name: 'category', label: '분류', required: true, placeholder: '침실 / 거실 / 주방 / 가전 …' },
  { name: 'cbm', label: '기본 부피(CBM)', type: 'number', alwaysShow: true, pairWithNext: true },
  { name: 'ton', label: '기본 무게(톤)', type: 'number', alwaysShow: true },
  { name: 'nameEng', label: '영문명(견적서 병기)', placeholder: 'Computer' },
  { name: 'sortOrder', label: '표시 순서(작을수록 위)', type: 'number' },
  { name: 'isActive', label: '사용 여부', type: 'boolean' },
];

/**
 * 이사물품 — 견적 물품정보에서 고르는 물품 사전. 물품은 이름으로 하나뿐이고,
 * 방 틀은 이 물품을 가리키기만 한다. 기본 부피·무게는 비워 둬도 된다(견적 때 입력).
 */
export default function CbmItems() {
  return (
    <CrudTable
      title="이사물품"
      path="/cbm-items"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
