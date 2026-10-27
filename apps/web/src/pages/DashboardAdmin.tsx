import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  PageHeader,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';

export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  allowPersonal: boolean;
  widgetCount: number;
  roles: { id: string; name: string }[];
  users: { id: string; name: string }[];
  updatedAt: string;
}

/**
 * 대시보드 관리 — 템플릿을 만들고 권한 그룹·사용자에게 기본으로 지정한다.
 * 지정이 없는 사람에게는 '기본' 템플릿이, 그것도 없으면 권한에 맞춘 기본 구성이 보인다.
 */
export default function DashboardAdmin() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<TemplateRow[]>('/dashboards/templates'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [toast, touch]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (v: Record<string, unknown>) => {
    try {
      const from = rows.find((r) => r.id === v.copyFrom);
      const layout = from
        ? (await api<{ layout: unknown }>(`/dashboards/templates/${from.id}`)).layout
        : v.start === 'blank'
          ? { version: 1, items: [] }
          : undefined;
      const d = await api<{ id: string }>('/dashboards/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: v.name,
          description: v.description ?? '',
          ...(layout ? { layout } : {}),
          isDefault: rows.length === 0,
        }),
      });
      navigate(`/dashboard-admin/${d.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
      throw e;
    }
  };

  const remove = async (r: TemplateRow) => {
    if (
      !window.confirm(`'${r.name}' 템플릿을 지울까요? 지정된 사람들은 기본 대시보드를 보게 됩니다.`)
    )
      return;
    try {
      await api(`/dashboards/templates/${r.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '지웠습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  const fields: FormField[] = useMemo(
    () => [
      { name: 'name', label: '이름', required: true, placeholder: '예: 지점장용 대시보드' },
      { name: 'description', label: '설명', alwaysShow: true },
      {
        name: 'start',
        label: '시작 구성',
        type: 'select',
        alwaysShow: true,
        options: [
          { value: 'default', label: '기본 구성으로 시작' },
          { value: 'blank', label: '빈 화면에서 시작' },
        ],
      },
      {
        name: 'copyFrom',
        label: '다른 템플릿 복사(고르면 시작 구성 대신)',
        type: 'select',
        alwaysShow: true,
        options: rows.map((r) => ({ value: r.id, label: r.name })),
      },
    ],
    [rows],
  );

  const columns: Column[] = [
    {
      title: '템플릿',
      flex: 1,
      minWidth: 220,
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <b>{String(r.name)}</b>
            {r.isDefault ? (
              <Badge variant="subtle" color="primary" size="sm">
                기본
              </Badge>
            ) : null}
          </span>
          {r.description ? (
            <span style={{ fontSize: 12, color: 'var(--ark-color-text-tertiary)' }}>
              {String(r.description)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: '지정 대상',
      flex: 1,
      render: (r) => {
        const t = r as unknown as TemplateRow;
        if (!t.roles.length && !t.users.length)
          return (
            <span style={{ color: 'var(--ark-color-text-tertiary)' }}>
              {t.isDefault ? '지정 없는 모든 사람' : '없음'}
            </span>
          );
        return (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {t.roles.map((x) => (
              <Badge key={x.id} variant="subtle" color="info" size="sm">
                {x.name}
              </Badge>
            ))}
            {t.users.map((x) => (
              <Badge key={x.id} variant="subtle" color="neutral" size="sm">
                {x.name}
              </Badge>
            ))}
          </div>
        );
      },
    },
    { title: '위젯', width: 70, render: (r) => `${Number(r.widgetCount)}개` },
    { title: '개인 수정', width: 90, render: (r) => (r.allowPersonal ? '허용' : '잠금') },
    {
      title: '수정일',
      width: 110,
      render: (r) => new Date(String(r.updatedAt)).toLocaleDateString('ko-KR'),
    },
    ...(can('DASHBOARD.DELETE')
      ? [
          {
            title: '',
            width: 70,
            render: (r: Row) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(r as unknown as TemplateRow)}
                >
                  삭제
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="대시보드 관리"
        subtitle="대시보드 템플릿을 만들어 권한 그룹이나 사용자에게 기본으로 보여 줍니다. 사람마다 볼 수 없는 데이터의 위젯은 자동으로 빠집니다."
        onRefresh={load}
        updatedAt={updatedAt}
      />
      <DataTable
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => navigate(`/dashboard-admin/${String(r.id)}`)}
        toolbarActions={
          can('DASHBOARD.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
              + 새 템플릿
            </Button>
          ) : undefined
        }
      />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title="새 대시보드 템플릿"
        size="md"
        fields={fields}
        onSubmit={onCreate}
      />
    </div>
  );
}
