import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { OrgChart } from '../components/OrgChart';
import { OrgGoalsPanel } from '../components/performance/OrgGoalsPanel';
import { useOptions } from '../lib/useOptions';
import { useDetailParam } from '../lib/useDetailParam';
import { isHqUnit, useOrgUnits } from '../lib/orgUnits';
import { ORG_UNIT_TYPE_LABEL } from '../i18n/codes';

// 지점(BRANCH)은 지점관리에서 등록하므로 여기 유형 선택지에서 뺀다
const HQ_TYPES = Object.entries(ORG_UNIT_TYPE_LABEL as Record<string, string>).filter(
  ([value]) => value !== 'BRANCH',
);
const TYPE_LABEL: Record<string, string> = ORG_UNIT_TYPE_LABEL;

const columns: Column[] = [
  { title: i18n.t('misc.name'), dataIndex: 'name', flex: 1, minWidth: 160 },
  {
    title: i18n.t('misc.type'),
    render: (r: Row) => (
      <Badge variant="subtle">{TYPE_LABEL[r.type as string] ?? String(r.type)}</Badge>
    ),
  },
  { title: i18n.t('misc.location'), minWidth: 140, render: (r: Row) => String(r.addr ?? '-') },
  {
    title: i18n.t('misc.status'),
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? i18n.t('misc.on') : i18n.t('misc.off')}
      </Badge>
    ),
  },
];

/** 조직관리 > 조직 — 본사 조직(그룹·법인·부서)만. 지점은 지점관리에서 다룬다. */
export default function OrgUnits({ view = 'list' }: { view?: 'list' | 'chart' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const detail = useDetailParam();
  const { units } = useOrgUnits();
  // 상위 조직으로도 본사 조직만 고를 수 있다(부서를 지점 밑에 두지 않는다)
  const parents = useOptions('/org-units', 'name', 'id', isHqUnit);
  const fields: FormField[] = [
    {
      name: 'type',
      label: t('misc.type'),
      required: true,
      type: 'select',
      options: HQ_TYPES.map(([value, label]) => ({ value, label })),
    },
    { name: 'name', label: t('misc.name'), required: true },
    { name: 'parentId', label: t('misc.parent'), type: 'select', options: parents },
    { name: 'address', label: t('misc.locationAddr'), type: 'address', alwaysShow: true },
    { name: 'isActive', label: t('misc.activeLabel'), type: 'boolean' },
  ];

  // 조직도 모드여도 상세가 열리면 목록 쪽(CrudTable)이 상세·수정·삭제를 그린다
  if (view === 'chart' && !detail.id) {
    return (
      <OrgChart
        units={units}
        onUnitClick={(id) => detail.open(id)}
        onBranchesClick={() => navigate('/branches')}
      />
    );
  }

  // 코드는 서버 발급(ORG-0001), 이름 중복 불가
  return (
    <CrudTable
      title={t('misc.orgs')}
      path="/org-units"
      columns={columns}
      fields={fields}
      rowFilter={isHqUnit}
      // 조직 상세 아래 — 역할·이번 분기 목표·업무분장(업무분장·성과 평가로 이어짐)
      detailExtra={(row) => <OrgGoalsPanel orgId={String(row.id)} />}
      editable
      deletable
      hideHeader
    />
  );
}
