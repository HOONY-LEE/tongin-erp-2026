import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useDetailParam } from '../lib/useDetailParam';
import { isHqUnit, useOrgUnits } from '../lib/orgUnits';
import { OrgChart, type OrgChartEmployee } from '../components/OrgChart';
import { EmployeeHrDetail, type HrRecord } from '../components/employee/EmployeeHrDetail';
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL } from '@tongin/shared';
import {
  Button,
  DataTable,
  FormModal,
  PageCard,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';

const ACTIVE_FIELD: FormField = {
  name: 'isActive',
  label: '재직',
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
  const orgLabel = branch ? '소속 지점' : '소속 조직';

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
    { name: 'name', label: '직원명', required: true },
    {
      name: 'positionId',
      label: '직책',
      type: 'select',
      alwaysShow: true,
      options: positions,
    },
    { name: 'hireDate', label: '입사일', type: 'date', alwaysShow: true },
    { name: 'empNo', label: '사번', placeholder: '비우면 자동 — 입사연도+일련번호(예: 20260001)' },
    { name: 'phone', label: '연락처', type: 'tel' },
    // ── 인사기록 ──
    {
      name: 'employmentType',
      label: '고용 형태',
      type: 'select',
      options: EMPLOYMENT_TYPES.map((v) => ({ value: v, label: EMPLOYMENT_TYPE_LABEL[v] })),
      pairWithNext: true,
    },
    { name: 'birthDate', label: '생년월일', type: 'date' },
    { name: 'email', label: '이메일' },
    { name: 'address', label: '주소', type: 'address' },
    { name: 'emergencyName', label: '비상 연락처 이름', pairWithNext: true },
    { name: 'emergencyRelation', label: '관계' },
    { name: 'emergencyPhone', label: '비상 연락처 번호', type: 'tel' },
    { name: 'memo', label: '메모' },
  ];

  const columns: Column[] = [
    { title: '직원명', dataIndex: 'name' },
    {
      title: '직책',
      render: (r) => (r.position as { name: string } | null)?.name ?? '-',
    },
    { title: '사번', render: (r) => String(r.empNo ?? '-') },
    { title: '입사일', render: (r) => (r.hireDate ? String(r.hireDate).slice(0, 10) : '-') },
    { title: '연락처', render: (r) => String(r.phone ?? '-') },
    // 지점 상세 안에선 모두 같은 지점이라 칸을 뺀다
    ...(branch
      ? []
      : [
          { title: orgLabel, render: (r: Row) => orgName.get(String(r.orgUnitId)) ?? '-' },
          {
            title: '겸직',
            render: (r: Row) =>
              ((r.concurrentOrgs as { orgUnitId: string }[] | undefined) ?? [])
                .map((c) => orgName.get(c.orgUnitId))
                .filter(Boolean)
                .join(', ') || '-',
          },
        ]),
    { title: '상태', render: (r) => (r.isActive ? '재직' : '비활성') },
  ];

  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? '직원 등록' : '직원 수정'}
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
      + 직원 등록
    </Button>
  );

  // 지점 상세 안에선 '소속 직원 (N)' 제목이 달린 카드로 — 상세 화면의 한 구획이라
  if (branch) {
    return (
      <PageCard title="소속 직원" count={shown.length} actions={addButton}>
        <DataTable
          columns={columns}
          rows={shown}
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
          columns={columns}
          rows={shown}
          loading={loading || units.length === 0}
          onRowClick={(r) => openDetail(String(r.id))}
          toolbarActions={addButton}
        />
      )}
      {modal}
    </>
  );
}
