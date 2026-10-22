import {
  ESTIMATE_OPTION_GROUPS,
  ESTIMATE_OPTION_GROUP_LABEL,
  type EstimateOptionGroup,
} from '@tongin/shared';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '-');
const UNIT: Record<string, string> = { EA: '개당', FLAT: '정액' };

const columns: Column[] = [
  {
    title: '묶음',
    minWidth: 130,
    render: (r: Row) => (
      <Badge variant="subtle" color="primary">
        {ESTIMATE_OPTION_GROUP_LABEL[r.groupCode as EstimateOptionGroup] ?? String(r.groupCode)}
      </Badge>
    ),
  },
  { title: '옵션명', dataIndex: 'name', flex: 1, minWidth: 160 },
  { title: '종류', render: (r: Row) => String(r.variantText || '-') },
  {
    title: '입력',
    render: (r: Row) =>
      [r.hasDate ? '요청일' : '', r.hasNote ? '내용' : ''].filter(Boolean).join(' · ') || '-',
  },
  { title: '단위', render: (r: Row) => UNIT[r.unit as string] ?? String(r.unit) },
  { title: '기본가', numeric: true, render: (r: Row) => won(r.price) },
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
  { name: 'name', label: '옵션명', required: true, placeholder: '에어컨 분리·설치' },
  {
    name: 'groupCode',
    label: '견적 화면 묶음',
    required: true,
    type: 'select',
    options: ESTIMATE_OPTION_GROUPS.map((g) => ({
      value: g,
      label: ESTIMATE_OPTION_GROUP_LABEL[g],
    })),
  },
  {
    name: 'unit',
    label: '단위',
    required: true,
    type: 'select',
    options: [
      { value: 'EA', label: '개당' },
      { value: 'FLAT', label: '정액' },
    ],
  },
  {
    name: 'variantText',
    label: '종류(쉼표로 구분)',
    placeholder: '예: 일반, 프리미엄 — 없으면 비워 두세요',
    alwaysShow: true,
  },
  { name: 'price', label: '참고 기본가', type: 'number', placeholder: '견적마다 금액은 따로 입력' },
  { name: 'hasDate', label: '서비스 요청일 받기', type: 'boolean' },
  { name: 'hasNote', label: '내용 적기(기타·보관 등)', type: 'boolean' },
  { name: 'sortOrder', label: '표시 순서(작을수록 위)', type: 'number' },
  { name: 'isActive', label: '사용 여부', type: 'boolean' },
];

/**
 * 옵션 — 견적 3단계(옵션선택)에 나오는 목록의 원본. 여기서 추가·수정하면 견적 화면에 바로 반영된다.
 * 코드는 서버 발급(OPT-0001). 견적에 쓰인 옵션은 삭제 대신 '사용 안 함'.
 */
export default function Addons() {
  return (
    <CrudTable
      title="옵션"
      path="/addon-services"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
