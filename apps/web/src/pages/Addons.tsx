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
  {
    title: '상품명',
    dataIndex: 'name',
    flex: 1,
    minWidth: 160,
    render: (r: Row) => (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {String(r.name)}
        {r.kind === 'VOLUME' && (
          <Badge variant="subtle" color="info">
            물품정보로 견적
          </Badge>
        )}
      </span>
    ),
  },
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
  { name: 'name', label: '상품명', required: true, placeholder: '에어컨 분리·설치' },
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
 * 상품 — 실제로 파는 것(이사물량·사다리차·입주청소 …). 상품구성에 넣으면 그 구성의 견적 3단계에 나오고,
 * 구성 밖이어도 견적에서 '추가 상품'으로 고를 수 있다. 코드는 서버 발급(OPT-0001).
 * 이사물량은 물품정보(방·물품·처리방법)로 물량을 잡는 특별한 상품이다.
 */
export default function Addons() {
  return (
    <CrudTable
      title="상품"
      path="/addon-services"
      columns={columns}
      fields={fields}
      editable
      deletable
      hideHeader
    />
  );
}
