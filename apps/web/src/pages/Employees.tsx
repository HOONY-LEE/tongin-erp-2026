import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmployeeChip, type EmployeeBrief } from '../components/ui/EmployeeChip';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useDetailParam } from '../lib/useDetailParam';
import { isHqUnit, useOrgUnits } from '../lib/orgUnits';
import { OrgChart, type OrgChartEmployee } from '../components/OrgChart';
import { EmployeeHrDetail, type HrRecord } from '../components/employee/EmployeeHrDetail';
import { EMPLOYMENT_TYPES } from '@tongin/shared';
import {
  Button,
  DataTable,
  FilterButton,
  filterRows,
  FormModal,
  PageCard,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type FormField,
  type Row,
} from '../components/ui';
import { formatPhone } from '../lib/phone';
import { EMPLOYMENT_TYPE_LABEL } from '../i18n/codes';

const ACTIVE_FIELD: FormField = {
  name: 'isActive',
  label: i18n.t('employees.active'),
  type: 'boolean',
  alwaysShow: true,
};

interface Props {
  /** 'chart'면 본사 조직도 위에 직원을 나열한다(본사 범위에서만) */
  view?: 'list' | 'chart';
  /**
   * 주면 그 지점의 직원만 — 지점관리 > 지점 상세의 '소속 직원'.
   * 없으면 본사 직원(지점이 아닌 조직 소속)만 — 조직관리 > 직원.
   */
  branch?: { id: string; name: string };
}

/** 직원 목록·등록·상세. 본사 직원은 조직관리에서, 지점 직원은 지점관리 > 지점 상세에서 다룬다. */
export default function Employees({ view = 'list', branch }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  // null=닫힘, 'new'=등록, 행=수정(상세의 인사기록 카드에서 열면 인사 칸까지 채워진다)
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  // 수정 창에서 저장하면 상세(인사기록 카드)를 다시 읽게
  const [detailReload, setDetailReload] = useState(0);
  // 지점 상세 안에서는 ?detail= 이 지점 자리라, 직원 상세는 ?emp= 로 연다
  const {
    id: detailId,
    open: openDetail,
    close: closeDetail,
  } = useDetailParam(branch ? 'emp' : 'detail');
  const { units } = useOrgUnits();
  const positions = useOptions('/positions', 'name', 'id', (r) => r.isActive !== false);
  const orgName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);
  // 소속 선택지 — 본사 화면은 본사 조직, 지점 화면은 지점(다른 지점으로 옮길 수 있게)
  const orgs = useMemo(
    () =>
      units
        .filter((u) => (branch ? u.type === 'BRANCH' : isHqUnit(u)))
        .filter((u) => u.isActive || u.id === branch?.id)
        .map((u) => ({ value: u.id, label: u.name })),
    [units, branch],
  );
  const orgLabel = branch ? t('employees.branch') : t('employees.org');
  /** 검색 옆 필터 — 입사일·소속·직책·고용형태·재직 */
  const [flt, setFlt] = useState<FilterValues>({});

  // 본사 화면이면 지점 소속 직원을 뺀다(조직 목록을 받기 전엔 판단할 수 없어 기다린다)
  const shown = useMemo(() => {
    if (branch) return rows;
    if (units.length === 0) return [];
    const hqIds = new Set(units.filter(isHqUnit).map((u) => u.id));
    return rows.filter((r) => hqIds.has(String(r.orgUnitId)));
  }, [rows, units, branch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await api<Row[]>(
          branch ? `/employees?orgUnitId=${encodeURIComponent(branch.id)}` : '/employees',
        ),
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t, branch]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (input: Record<string, unknown>) => {
    // 주소 칸은 시·도·좌표까지 보내는데 직원에는 우편번호·주소·상세만 둔다(서버가 모르는 칸은 거부)
    const values = Object.fromEntries(
      Object.entries(input).filter(([k]) => !['sido', 'sigungu', 'lat', 'lng'].includes(k)),
    );
    if (values.employmentType === '') delete values.employmentType;
    try {
      if (editing && editing !== 'new') {
        await api(`/employees/${String(editing.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(values),
        });
        toast({ type: 'success', title: t('common.saved') });
      } else {
        await api('/employees', { method: 'POST', body: JSON.stringify(values) });
        toast({ type: 'success', title: t('common.created') });
      }
      await load();
      setDetailReload((k) => k + 1);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const fields: FormField[] = [
    { name: 'orgUnitId', label: orgLabel, required: true, type: 'select', options: orgs },
    { name: 'name', label: t('employees.name'), required: true },
    {
      name: 'positionId',
      label: t('employees.position'),
      type: 'select',
      alwaysShow: true,
      options: positions,
    },
    { name: 'hireDate', label: t('employees.hireDate'), type: 'date', alwaysShow: true },
    { name: 'empNo', label: t('employees.empNo'), placeholder: t('employees.empNoPh') },
    { name: 'phone', label: t('employees.phone'), type: 'tel' },
    // ── 인사기록 ──
    {
      name: 'employmentType',
      label: t('employees.employmentType'),
      type: 'select',
      options: EMPLOYMENT_TYPES.map((v) => ({ value: v, label: EMPLOYMENT_TYPE_LABEL[v] })),
      pairWithNext: true,
    },
    { name: 'birthDate', label: t('employees.birthDate'), type: 'date' },
    { name: 'email', label: t('employees.email') },
    { name: 'address', label: t('employees.address'), type: 'address' },
    { name: 'emergencyName', label: t('employees.emergencyName'), pairWithNext: true },
    { name: 'emergencyRelation', label: t('employees.relation') },
    { name: 'emergencyPhone', label: t('employees.emergencyPhone'), type: 'tel' },
    { name: 'memo', label: t('employees.memo') },
  ];

  const filterFields: FilterField[] = [
    { key: 'hireDate', label: t('employees.flt.hireDate'), type: 'date' },
    // 지점 상세 안에선 모두 같은 지점이라 뺀다
    ...(branch
      ? []
      : [
          {
            key: 'orgUnitId',
            label: t('employees.flt.org'),
            type: 'multi',
            options: orgs,
          } as FilterField,
        ]),
    { key: 'positionId', label: t('employees.flt.position'), type: 'multi', options: positions },
    {
      key: 'employmentType',
      label: t('employees.flt.type'),
      type: 'multi',
      options: EMPLOYMENT_TYPES.map((v) => ({ value: v, label: EMPLOYMENT_TYPE_LABEL[v] })),
    },
    {
      key: 'isActive',
      label: t('employees.flt.status'),
      type: 'single',
      options: [
        { value: 'true', label: t('employees.flt.active') },
        { value: 'false', label: t('employees.flt.inactive') },
      ],
    },
  ];
  const listed = filterRows(shown, filterFields, flt, (r, key) =>
    key === 'isActive' ? String(!!r.isActive) : r[key],
  );
  const filterButton = <FilterButton fields={filterFields} value={flt} onChange={setFlt} />;

  const columns: Column[] = [
    {
      title: t('employees.name'),
      dataIndex: 'name',
      // 다른 표의 담당자와 같은 직원 칩 — 누르면 프로필 카드
      render: (r) => <EmployeeChip emp={r as unknown as EmployeeBrief} />,
      exportValue: (r) => String(r.name ?? ''),
    },
    {
      title: t('employees.position'),
      render: (r) => (r.position as { name: string } | null)?.name ?? '-',
    },
    { title: t('employees.empNo'), render: (r) => String(r.empNo ?? '-') },
    {
      title: t('employees.hireDate'),
      render: (r) => (r.hireDate ? String(r.hireDate).slice(0, 10) : '-'),
    },
    { title: t('employees.phone'), render: (r) => (r.phone ? formatPhone(String(r.phone)) : '-') },
    // 지점 상세 안에선 모두 같은 지점이라 칸을 뺀다
    ...(branch
      ? []
      : [
          { title: orgLabel, render: (r: Row) => orgName.get(String(r.orgUnitId)) ?? '-' },
          {
            title: t('employees.concurrent'),
            render: (r: Row) =>
              ((r.concurrentOrgs as { orgUnitId: string }[] | undefined) ?? [])
                .map((c) => orgName.get(c.orgUnitId))
                .filter(Boolean)
                .join(', ') || '-',
          },
        ]),
    {
      title: t('employees.status'),
      render: (r) => (r.isActive ? t('employees.active') : t('employees.inactive')),
    },
  ];

  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? t('employees.create') : t('employees.edit')}
      size="md"
      fields={editing === 'new' ? fields : [...fields, ACTIVE_FIELD]}
      initialValues={
        editing === 'new'
          ? branch
            ? { orgUnitId: branch.id }
            : undefined
          : editing
            ? Object.fromEntries(
                Object.entries({
                  orgUnitId: editing.orgUnitId,
                  name: editing.name,
                  positionId: editing.positionId,
                  empNo: editing.empNo,
                  hireDate: editing.hireDate ? String(editing.hireDate).slice(0, 10) : '',
                  phone: editing.phone,
                  isActive: editing.isActive,
                  employmentType: editing.employmentType,
                  birthDate: editing.birthDate ? String(editing.birthDate).slice(0, 10) : '',
                  email: editing.email,
                  zipcode: editing.zipcode,
                  addr: editing.addr,
                  addrDetail: editing.addrDetail,
                  emergencyName: editing.emergencyName,
                  emergencyRelation: editing.emergencyRelation,
                  emergencyPhone: editing.emergencyPhone,
                  memo: editing.memo,
                }).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]),
              )
            : undefined
      }
      onSubmit={onSubmit}
    />
  );

  // 행을 누르면 상세(인사기록 카드) — 수정·퇴사 처리는 상세 머리글에서
  if (detailId) {
    return (
      <>
        <EmployeeHrDetail
          id={detailId}
          backLabel={branch ? branch.name : t('nav.employees')}
          onBack={closeDetail}
          onEdit={(rec: HrRecord) => setEditing(rec as unknown as Row)}
          reloadKey={detailReload}
        />
        {modal}
      </>
    );
  }

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
      {t('employees.createBtn')}
    </Button>
  );

  // 지점 상세 안에선 '소속 직원 (N)' 제목이 달린 카드로 — 상세 화면의 한 구획이라
  if (branch) {
    return (
      <PageCard title={t('employees.members')} count={listed.length} actions={addButton}>
        <DataTable
          filters={filterButton}
          columns={columns}
          rows={listed}
          loading={loading}
          onRowClick={(r) => openDetail(String(r.id))}
        />
        {modal}
      </PageCard>
    );
  }

  // 조직관리 > 직원 — 조직 탭과 같은 모양: 제목 줄 없이 검색창 옆에 등록 버튼
  return (
    <>
      {view === 'chart' ? (
        <OrgChart
          units={units}
          employees={shown as unknown as OrgChartEmployee[]}
          onEmployeeClick={openDetail}
          onBranchesClick={() => navigate('/branches')}
        />
      ) : (
        <DataTable
          filters={filterButton}
          columns={columns}
          rows={listed}
          loading={loading || units.length === 0}
          onRowClick={(r) => openDetail(String(r.id))}
          toolbarActions={addButton}
        />
      )}
      {modal}
    </>
  );
}
