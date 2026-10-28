import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import { useDetailParam } from '../lib/useDetailParam';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  PageCard,
  RecordDetail,
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

export default function Employees() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  // null=닫힘, 'new'=등록, 행=수정
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();
  const orgs = useOptions('/org-units', 'name');
  const positions = useOptions('/positions', 'name', 'id', (r) => r.isActive !== false);
  const orgName = useMemo(() => new Map(orgs.map((o) => [o.value, o.label])), [orgs]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/employees'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (values: Record<string, unknown>) => {
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
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const fields: FormField[] = [
    { name: 'orgUnitId', label: '소속 지점', required: true, type: 'select', options: orgs },
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
    { title: '소속 지점', render: (r) => orgName.get(String(r.orgUnitId)) ?? '-' },
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
        editing && editing !== 'new'
          ? {
              orgUnitId: String(editing.orgUnitId),
              name: String(editing.name),
              positionId: String(editing.positionId ?? ''),
              empNo: String(editing.empNo ?? ''),
              hireDate: editing.hireDate ? String(editing.hireDate).slice(0, 10) : '',
              phone: String(editing.phone ?? ''),
              isActive: String(editing.isActive),
            }
          : undefined
      }
      onSubmit={onSubmit}
    />
  );

  // 행을 누르면 상세 — 수정은 상세 머리글에서
  if (detailId) {
    const detail = rows.find((r) => String(r.id) === detailId);
    return (
      <>
        <RecordDetail
          loading={!detail && loading}
          title={detail ? String(detail.name) : '직원을 찾을 수 없습니다'}
          backLabel={t('nav.employees')}
          onBack={closeDetail}
          actions={
            detail ? (
              <Button variant="primary" size="sm" onClick={() => setEditing(detail)}>
                수정
              </Button>
            ) : undefined
          }
          sections={
            detail
              ? [
                  {
                    title: '직원 정보',
                    items: [
                      { label: '직원명', value: String(detail.name) },
                      {
                        label: '직책',
                        value: (detail.position as { name: string } | null)?.name,
                      },
                      { label: '사번', value: detail.empNo ? String(detail.empNo) : null },
                      {
                        label: '입사일',
                        value: detail.hireDate ? String(detail.hireDate).slice(0, 10) : null,
                      },
                      { label: '연락처', value: detail.phone ? String(detail.phone) : null },
                      { label: '소속 지점', value: orgName.get(String(detail.orgUnitId)) },
                      {
                        label: '상태',
                        value: (
                          <Badge variant="subtle" color={detail.isActive ? 'success' : 'neutral'}>
                            {detail.isActive ? '재직' : '비활성'}
                          </Badge>
                        ),
                      },
                    ],
                  },
                ]
              : []
          }
        />
        {modal}
      </>
    );
  }

  return (
    <PageCard
      title={t('nav.employees')}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + 직원 등록
        </Button>
      }
      plain
    >
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => openDetail(String(r.id))}
      />
      {modal}
    </PageCard>
  );
}
