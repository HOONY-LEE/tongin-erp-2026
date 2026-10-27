import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../../components/ui';
import styles from './access.module.css';

interface PositionRow {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  defaultRoleId: string | null;
  defaultRoleName: string | null;
  employeeCount: number;
}

/**
 * 직책·직급 — 회장·대표·이사·부장처럼 조직에서의 위치. 권한은 주지 않는다.
 * '추천 권한 그룹'을 정해 두면 이 직책의 직원으로 계정을 만들 때 그 그룹이 미리 골라진다.
 */
export default function Positions() {
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [roles, setRoles] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<PositionRow | 'new' | null>(null);
  const canCreate = can('ROLE.CREATE');
  const canUpdate = can('ROLE.UPDATE');
  const canDelete = can('ROLE.DELETE');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<PositionRow[]>('/positions'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    api<{ id: string; name: string; isSuperAdmin: boolean }[]>('/roles')
      .then((rs) =>
        setRoles(rs.filter((r) => !r.isSuperAdmin).map((r) => ({ value: r.id, label: r.name }))),
      )
      .catch(() => setRoles([]));
  }, [load]);

  const fail = (e: unknown, fallback: string) =>
    toast({ type: 'error', title: e instanceof ApiError ? e.message : fallback });

  const onSubmit = async (values: Record<string, unknown>) => {
    const body = {
      name: values.name,
      defaultRoleId: (values.defaultRoleId as string | null | undefined) ?? null,
      ...(editing !== 'new' && values.isActive !== undefined
        ? { isActive: values.isActive === true }
        : {}),
    };
    try {
      if (editing === 'new') {
        await api('/positions', { method: 'POST', body: JSON.stringify(body) });
      } else if (editing) {
        await api(`/positions/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      toast({ type: 'success', title: '저장했습니다' });
      await load();
    } catch (e) {
      fail(e, '저장하지 못했습니다');
      throw e;
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...rows];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    try {
      setRows(
        await api<PositionRow[]>('/positions/order', {
          method: 'PUT',
          body: JSON.stringify({ ids: next.map((r) => r.id) }),
        }),
      );
    } catch (e) {
      fail(e, '순서를 바꾸지 못했습니다');
      await load();
    }
  };

  const remove = async (p: PositionRow) => {
    const msg =
      p.employeeCount > 0
        ? `'${p.name}' 직책인 직원이 ${p.employeeCount}명 있습니다. 지우면 그 직원들은 '직책 없음'이 됩니다. 지울까요?`
        : `'${p.name}' 직책을 지울까요?`;
    if (!window.confirm(msg)) return;
    try {
      await api(`/positions/${p.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '지웠습니다' });
      await load();
    } catch (e) {
      fail(e, '지우지 못했습니다');
    }
  };

  const fields: FormField[] = useMemo(
    () => [
      { name: 'name', label: '직책 이름', required: true, placeholder: '예: 이사' },
      {
        name: 'defaultRoleId',
        label: '추천 권한 그룹(계정 만들 때 미리 골라짐)',
        type: 'select',
        alwaysShow: true,
        options: roles,
      },
      ...(editing !== 'new'
        ? [{ name: 'isActive', label: '사용', type: 'boolean' as const, alwaysShow: true }]
        : []),
    ],
    [roles, editing],
  );

  const columns: Column[] = [
    {
      title: '순서',
      width: 90,
      render: (r) => {
        const idx = rows.findIndex((x) => x.id === r.id);
        return canUpdate ? (
          <span style={{ display: 'inline-flex', gap: 2 }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={idx === 0}
              aria-label="위로"
              onClick={(e) => {
                e.stopPropagation();
                void move(idx, -1);
              }}
            >
              <ArrowUp size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={idx === rows.length - 1}
              aria-label="아래로"
              onClick={(e) => {
                e.stopPropagation();
                void move(idx, 1);
              }}
            >
              <ArrowDown size={14} />
            </Button>
          </span>
        ) : (
          idx + 1
        );
      },
    },
    { title: '직책', dataIndex: 'name', flex: 1 },
    {
      title: '추천 권한 그룹',
      flex: 1,
      render: (r) =>
        r.defaultRoleName ? (
          <Badge variant="subtle" color="info">
            {String(r.defaultRoleName)}
          </Badge>
        ) : (
          <span className={styles.muted}>없음</span>
        ),
    },
    { title: '직원 수', width: 90, render: (r) => `${Number(r.employeeCount)}명` },
    {
      title: '상태',
      width: 80,
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? '사용' : '안 씀'}
        </Badge>
      ),
    },
    ...(canUpdate || canDelete
      ? [
          {
            title: '',
            width: 130,
            render: (r: Row) => (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {canUpdate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(r as unknown as PositionRow)}
                  >
                    고치기
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(r as unknown as PositionRow)}
                  >
                    삭제
                  </Button>
                )}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.section}>
      <div className={styles.notice} style={{ margin: 0 }}>
        직책은 조직에서의 위치(표시·인사용)이고 <b>권한을 주지 않습니다</b>. 무엇을 할 수 있는지는
        권한 그룹이 정합니다. 같은 부장이라도 하는 일이 다르면 다른 권한 그룹을 줄 수 있습니다.
      </div>
      <DataTable
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        toolbarActions={
          canCreate ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              + 직책 추가
            </Button>
          ) : undefined
        }
      />
      <FormModal
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? '직책 추가' : '직책 고치기'}
        size="md"
        fields={fields}
        initialValues={
          editing && editing !== 'new'
            ? {
                name: editing.name,
                defaultRoleId: editing.defaultRoleId ?? '',
                isActive: String(editing.isActive),
              }
            : undefined
        }
        onSubmit={onSubmit}
      />
    </div>
  );
}
