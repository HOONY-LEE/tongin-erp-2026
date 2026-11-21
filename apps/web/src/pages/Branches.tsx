import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import { isHqUnit, useOrgUnits } from '../lib/orgUnits';
import {
  AddressView,
  Badge,
  Button,
  DataTable,
  FilterButton,
  filterRows,
  FormModal,
  PageHeader,
  RecordDetail,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type FormField,
  type Row,
} from '../components/ui';
import { ADDRESS_PARTS, addrKey } from '../components/ui/address';
import Employees from './Employees';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '0');

const ACTIVE_FIELD: FormField = {
  name: 'isActive',
  label: i18n.t('biz.active'),
  type: 'boolean',
  alwaysShow: true,
};

/**
 * 지점관리 — 지점별 실적 목록 + 지점 등록·수정·삭제 + 지점 상세(정보·실적·소속 직원).
 * 지점 자체는 조직(org_unit, type=BRANCH)이라 등록·수정은 /org-units 로 보낸다.
 */
export default function Branches() {
  const { t } = useTranslation();
  const toast = useToast();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  // null=닫힘, 'new'=등록, 행=수정할 지점 id
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  /** 검색 옆 필터 — 지역·상태·진행 중 작업 */
  const [flt, setFlt] = useState<FilterValues>({});
  const { updatedAt, touch } = useUpdatedAt();
  const detail = useDetailParam();
  const { units, reload: reloadUnits } = useOrgUnits();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/branches/overview'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u as unknown as Row])), [units]);
  // 상위 조직은 본사 쪽(그룹·법인·부서)에서 고른다. 새 지점의 기본값은 지점이 가장 많이 달린 법인
  const parentOptions = useMemo(
    () =>
      units.filter((u) => isHqUnit(u) && u.isActive).map((u) => ({ value: u.id, label: u.name })),
    [units],
  );
  const defaultParentId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of units)
      if (u.type === 'BRANCH' && u.parentId)
        counts.set(u.parentId, (counts.get(u.parentId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [units]);

  const fields: FormField[] = [
    { name: 'name', label: t('biz.branchName'), required: true },
    {
      name: 'parentId',
      label: t('biz.parent'),
      required: true,
      type: 'select',
      options: parentOptions,
    },
    // 넣어 두면 대시보드 지도에 점으로 찍힌다(주소 검색으로 좌표까지)
    { name: 'address', label: t('biz.location'), type: 'address', alwaysShow: true },
  ];

  const editInitial = (id: string): Record<string, string> => {
    const u = unitById.get(id);
    if (!u) return {};
    const keys = ['name', 'parentId', 'isActive', ...ADDRESS_PARTS.map((p) => addrKey('', p))];
    return Object.fromEntries(
      keys.filter((k) => u[k] !== null && u[k] !== undefined).map((k) => [k, String(u[k])]),
    );
  };

  const afterChange = async () => {
    await Promise.all([load(), reloadUnits()]);
  };

  const onSubmit = async (values: Record<string, unknown>) => {
    try {
      if (editing && editing !== 'new') {
        await api(`/org-units/${editing}`, { method: 'PATCH', body: JSON.stringify(values) });
        toast({ type: 'success', title: t('common.saved') });
      } else {
        await api('/org-units', {
          method: 'POST',
          body: JSON.stringify({ ...values, type: 'BRANCH' }),
        });
        toast({ type: 'success', title: t('common.created') });
      }
      await afterChange();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(t('biz.branchDeleteQ', { v0: name }))) return;
    try {
      await api(`/org-units/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('biz.deleted') });
      detail.close();
      await afterChange();
    } catch (e) {
      // 직원·접수 등이 걸려 있으면 서버가 409로 막는다 — 그땐 '사용 안 함'으로 돌리면 된다
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('biz.deleteFailed') });
    }
  };

  const columns: Column[] = [
    { title: t('biz.branch'), dataIndex: 'name' },
    {
      title: t('biz.region'),
      render: (r) => [r.sido, r.sigungu].filter(Boolean).join(' ') || '-',
    },
    { title: t('biz.contracts'), numeric: true, render: (r) => String(r.contractCount ?? 0) },
    {
      title: t('biz.revenue'),
      numeric: true,
      render: (r) => <b>{won(r.revenue)}</b>,
    },
    {
      title: t('biz.workInProgress'),
      numeric: true,
      render: (r) =>
        Number(r.workActive) > 0 ? (
          <Badge variant="subtle" color="info">
            {String(r.workActive)}
          </Badge>
        ) : (
          '0'
        ),
    },
    { title: t('biz.workDone'), numeric: true, render: (r) => String(r.workDone ?? 0) },
    {
      title: t('biz.employees'),
      numeric: true,
      render: (r) => t('biz.peopleN', { v0: String(r.employeeCount ?? 0) }),
    },
    {
      title: t('biz.status'),
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? t('biz.on') : t('biz.off')}
        </Badge>
      ),
    },
  ];

  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? t('biz.branchCreate') : t('biz.branchEdit')}
      size="md"
      fields={editing === 'new' ? fields : [...fields, ACTIVE_FIELD]}
      initialValues={
        editing === 'new'
          ? defaultParentId
            ? { parentId: defaultParentId }
            : undefined
          : editing
            ? editInitial(editing)
            : undefined
      }
      onSubmit={onSubmit}
    />
  );

  if (detail.id) {
    const perf = rows.find((r) => String(r.orgUnitId) === detail.id);
    const unit = unitById.get(detail.id);
    const name = String(unit?.name ?? perf?.name ?? '');
    const branch = { id: detail.id, name };

    // 지점 상세 안에서 직원을 누르면(?emp=) 직원 상세만 보인다 — 돌아가기는 이 지점으로
    if (params.get('emp')) return <Employees branch={branch} />;

    const parentName = unit?.parentId ? unitById.get(String(unit.parentId))?.name : null;
    return (
      <>
        <RecordDetail
          loading={!unit && (loading || units.length === 0)}
          title={unit ? name : t('biz.branchNotFound')}
          backLabel={t('nav.branches')}
          onBack={detail.close}
          actions={
            unit ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void onDelete(branch.id, name)}>
                  {t('biz.delete')}
                </Button>
                <Button variant="primary" size="sm" onClick={() => setEditing(branch.id)}>
                  {t('biz.edit')}
                </Button>
              </>
            ) : undefined
          }
          sections={
            unit
              ? [
                  {
                    title: t('biz.branchInfo'),
                    items: [
                      { label: t('biz.branchName'), value: name },
                      { label: t('biz.parent'), value: parentName ? String(parentName) : null },
                      { label: t('biz.code'), value: unit.code ? String(unit.code) : null },
                      {
                        label: t('biz.status'),
                        value: (
                          <Badge variant="subtle" color={unit.isActive ? 'success' : 'neutral'}>
                            {unit.isActive ? t('biz.on') : t('biz.off')}
                          </Badge>
                        ),
                      },
                      {
                        label: t('biz.locationShort'),
                        wide: true,
                        value: unit.addr ? (
                          <AddressView
                            zipcode={unit.zipcode as string}
                            addr={unit.addr as string}
                            addrDetail={unit.addrDetail as string}
                            lat={unit.lat as number}
                            lng={unit.lng as number}
                          />
                        ) : null,
                      },
                    ],
                  },
                  {
                    title: t('biz.perf'),
                    items: [
                      { label: t('biz.contracts'), value: String(perf?.contractCount ?? 0) },
                      { label: t('biz.revenue'), value: t('biz.won', { v0: won(perf?.revenue) }) },
                      { label: t('biz.workInProgress'), value: String(perf?.workActive ?? 0) },
                      { label: t('biz.workDone'), value: String(perf?.workDone ?? 0) },
                      {
                        label: t('biz.activeEmployees'),
                        value: t('biz.peopleN', { v0: String(perf?.employeeCount ?? 0) }),
                      },
                    ],
                  },
                ]
              : []
          }
        >
          {unit && <Employees branch={branch} />}
        </RecordDetail>
        {modal}
      </>
    );
  }

  const regions = [...new Set(rows.map((r) => r.sido as string).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );
  const filterFields: FilterField[] = [
    ...(regions.length
      ? [
          {
            key: 'sido',
            label: t('biz.flt.region'),
            type: 'multi',
            options: regions.map((x) => ({ value: x, label: x })),
          } as FilterField,
        ]
      : []),
    {
      key: 'active',
      label: t('biz.flt.status'),
      type: 'single',
      options: [
        { value: 'on', label: t('biz.flt.on') },
        { value: 'off', label: t('biz.flt.off') },
      ],
    },
    {
      key: 'work',
      label: t('biz.flt.work'),
      type: 'single',
      options: [
        { value: 'yes', label: t('biz.flt.has') },
        { value: 'no', label: t('biz.flt.none') },
      ],
    },
  ];
  const shown = filterRows(rows, filterFields, flt, (r, key) =>
    key === 'active'
      ? r.isActive
        ? 'on'
        : 'off'
      : key === 'work'
        ? Number(r.workActive) > 0
          ? 'yes'
          : 'no'
        : r[key],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('nav.branches')}
        subtitle={t('biz.branchesSub')}
        onRefresh={afterChange}
        updatedAt={updatedAt}
      />
      <DataTable
        filters={<FilterButton fields={filterFields} value={flt} onChange={setFlt} />}
        columns={columns}
        rows={shown}
        loading={loading}
        rowKey="orgUnitId"
        onRowClick={(r) => detail.open(String(r.orgUnitId))}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            {t('biz.branchCreateBtn')}
          </Button>
        }
      />
      {modal}
    </div>
  );
}
