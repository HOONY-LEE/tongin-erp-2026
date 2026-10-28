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
  FormModal,
  PageHeader,
  RecordDetail,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';
import { ADDRESS_PARTS, addrKey } from '../components/ui/address';
import Employees from './Employees';

const won = (v: unknown) => (v != null ? Number(v).toLocaleString() : '0');

const ACTIVE_FIELD: FormField = {
  name: 'isActive',
  label: '사용 여부',
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
    { name: 'name', label: '지점명', required: true },
    {
      name: 'parentId',
      label: '상위 조직',
      required: true,
      type: 'select',
      options: parentOptions,
    },
    // 넣어 두면 대시보드 지도에 점으로 찍힌다(주소 검색으로 좌표까지)
    { name: 'address', label: '위치(주소)', type: 'address', alwaysShow: true },
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
    if (!window.confirm(`'${name}' 지점을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/org-units/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '삭제했습니다' });
      detail.close();
      await afterChange();
    } catch (e) {
      // 직원·접수 등이 걸려 있으면 서버가 409로 막는다 — 그땐 '사용 안 함'으로 돌리면 된다
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  const columns: Column[] = [
    { title: '지점', dataIndex: 'name' },
    {
      title: '지역',
      render: (r) => [r.sido, r.sigungu].filter(Boolean).join(' ') || '-',
    },
    { title: '계약 건수', numeric: true, render: (r) => String(r.contractCount ?? 0) },
    {
      title: '매출(계약)',
      numeric: true,
      render: (r) => <b>{won(r.revenue)}</b>,
    },
    {
      title: '작업 진행',
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
    { title: '작업 완료', numeric: true, render: (r) => String(r.workDone ?? 0) },
    {
      title: '직원',
      numeric: true,
      render: (r) => `${String(r.employeeCount ?? 0)}명`,
    },
    {
      title: '상태',
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? '사용' : '사용 안 함'}
        </Badge>
      ),
    },
  ];

  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? '지점 등록' : '지점 수정'}
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
          title={unit ? name : '지점을 찾을 수 없습니다'}
          backLabel={t('nav.branches')}
          onBack={detail.close}
          actions={
            unit ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void onDelete(branch.id, name)}>
                  삭제
                </Button>
                <Button variant="primary" size="sm" onClick={() => setEditing(branch.id)}>
                  수정
                </Button>
              </>
            ) : undefined
          }
          sections={
            unit
              ? [
                  {
                    title: '지점 정보',
                    items: [
                      { label: '지점명', value: name },
                      { label: '상위 조직', value: parentName ? String(parentName) : null },
                      { label: '코드', value: unit.code ? String(unit.code) : null },
                      {
                        label: '상태',
                        value: (
                          <Badge variant="subtle" color={unit.isActive ? 'success' : 'neutral'}>
                            {unit.isActive ? '사용' : '사용 안 함'}
                          </Badge>
                        ),
                      },
                      {
                        label: '위치',
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
                    title: '실적',
                    items: [
                      { label: '계약 건수', value: String(perf?.contractCount ?? 0) },
                      { label: '매출(계약)', value: `${won(perf?.revenue)}원` },
                      { label: '작업 진행', value: String(perf?.workActive ?? 0) },
                      { label: '작업 완료', value: String(perf?.workDone ?? 0) },
                      { label: '재직 직원', value: `${String(perf?.employeeCount ?? 0)}명` },
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('nav.branches')}
        subtitle="지점 등록·수정과 지점별 매출·작업·직원 현황 (직영/가맹점) — 지점을 누르면 소속 직원을 관리합니다"
        onRefresh={afterChange}
        updatedAt={updatedAt}
      />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey="orgUnitId"
        onRowClick={(r) => detail.open(String(r.orgUnitId))}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            + 지점 등록
          </Button>
        }
      />
      {modal}
    </div>
  );
}
