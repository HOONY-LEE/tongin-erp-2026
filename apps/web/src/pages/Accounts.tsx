import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  PageCard,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';

interface RoleRow {
  id: string;
  code: string;
  name: string;
}
interface AccountRole {
  roleName: string;
  dataScope: string;
  orgScope: string | null;
}

const SCOPE_LABEL: Record<string, string> = { OWN: '본인', ORG: '조직', ALL: '전체' };

export default function Accounts() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const orgs = useOptions('/org-units', 'name');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, rls] = await Promise.all([
        api<Row[]>('/accounts'),
        api<RoleRow[]>('/accounts/roles'),
      ]);
      setRows(accs);
      setRoles(rls);
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
      await api('/accounts', { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const toggleActive = async (r: Row) => {
    try {
      await api(`/accounts/${String(r.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      toast({ type: 'success', title: r.isActive ? '비활성화되었습니다' : '활성화되었습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const fields: FormField[] = useMemo(
    () => [
      { name: 'loginId', label: '아이디', required: true, placeholder: 'user1' },
      { name: 'password', label: '비밀번호(6자+)', required: true, placeholder: '••••••' },
      {
        name: 'roleId',
        label: '역할',
        required: true,
        type: 'select',
        options: roles.map((r) => ({ value: r.id, label: `${r.name} (${r.code})` })),
      },
      {
        name: 'dataScope',
        label: '데이터범위',
        type: 'select',
        options: [
          { value: 'OWN', label: '본인' },
          { value: 'ORG', label: '조직(+하위)' },
          { value: 'ALL', label: '전체' },
        ],
      },
      { name: 'orgScopeId', label: '적용 조직(범위=조직일 때)', type: 'select', options: orgs },
    ],
    [roles, orgs],
  );

  const columns: Column[] = [
    { title: '아이디', dataIndex: 'loginId' },
    { title: '직원', render: (r) => String(r.employeeName ?? '-') },
    {
      title: '역할/범위',
      render: (r) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(r.roles as AccountRole[]).map((role, i) => (
            <Badge key={i} variant="subtle" color="info">
              {role.roleName} · {SCOPE_LABEL[role.dataScope] ?? role.dataScope}
              {role.orgScope ? `(${role.orgScope})` : ''}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      title: '상태',
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? '활성' : '비활성'}
        </Badge>
      ),
    },
    {
      title: '관리',
      render: (r) => (
        <Button variant="outline" size="sm" onClick={() => toggleActive(r)}>
          {r.isActive ? '비활성화' : '활성화'}
        </Button>
      ),
    },
  ];

  return (
    <PageCard
      title={t('nav.accounts')}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          + 계정 생성
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} loading={loading} />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title="계정 생성"
        size="md"
        fields={fields}
        onSubmit={onCreate}
      />
    </PageCard>
  );
}
