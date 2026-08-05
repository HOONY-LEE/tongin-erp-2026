import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
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

export default function Employees() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const orgs = useOptions('/org-units', 'name');
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

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api('/employees', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const fields: FormField[] = [
    { name: 'orgUnitId', label: '소속 지점', required: true, type: 'select', options: orgs },
    { name: 'name', label: '직원명', required: true },
    { name: 'empNo', label: '사번' },
    { name: 'phone', label: '연락처', type: 'tel' },
  ];

  const columns: Column[] = [
    { title: '직원명', dataIndex: 'name' },
    { title: '사번', render: (r) => String(r.empNo ?? '-') },
    { title: '연락처', render: (r) => String(r.phone ?? '-') },
    { title: '소속 지점', render: (r) => orgName.get(String(r.orgUnitId)) ?? '-' },
    { title: '상태', render: (r) => (r.isActive ? '재직' : '비활성') },
  ];

  return (
    <PageCard
      title={t('nav.employees')}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          + 직원 등록
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} loading={loading} />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title="직원 등록"
        size="md"
        fields={fields}
        onSubmit={onCreate}
      />
    </PageCard>
  );
}
