import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { useDetailParam } from '../../lib/useDetailParam';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  RecordDetail,
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
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [roles, setRoles] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<PositionRow | 'new' | null>(null);
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();
  const canCreate = can('ROLE.CREATE');
  const canUpdate = can('ROLE.UPDATE');
  const canDelete = can('ROLE.DELETE');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<PositionRow[]>('/positions'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.loadFailed') });
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
      toast({ type: 'success', title: t('acc.saved') });
      await load();
    } catch (e) {
      fail(e, t('acc.saveFailed'));
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
      fail(e, t('acc.reorderFailed'));
      await load();
    }
  };

  const remove = async (p: PositionRow) => {
    const msg =
      p.employeeCount > 0
        ? t('acc.posDeleteInUse', { v0: p.name, v1: p.employeeCount })
        : t('acc.posDeleteQ', { v0: p.name });
    if (!window.confirm(msg)) return;
    try {
      await api(`/positions/${p.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('acc.deleted') });
      closeDetail();
      await load();
    } catch (e) {
      fail(e, t('acc.deleteFailed'));
    }
  };

  const fields: FormField[] = useMemo(
    () => [
      { name: 'name', label: t('acc.posName'), required: true, placeholder: t('acc.posNamePh') },
      {
        name: 'defaultRoleId',
        label: t('acc.recGroups'),
        type: 'select',
        alwaysShow: true,
        options: roles,
      },
      ...(editing !== 'new'
        ? [{ name: 'isActive', label: t('acc.use'), type: 'boolean' as const, alwaysShow: true }]
        : []),
    ],
    [roles, editing],
  );

  const columns: Column[] = [
    {
      title: t('acc.order'),
      width: 90,
      render: (r) => {
        const idx = rows.findIndex((x) => x.id === r.id);
        return canUpdate ? (
          <span style={{ display: 'inline-flex', gap: 2 }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={idx === 0}
              aria-label={t('acc.up')}
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
              aria-label={t('acc.down')}
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
    { title: t('acc.position'), dataIndex: 'name', flex: 1 },
    {
      title: t('acc.recGroupsCol'),
      flex: 1,
      render: (r) =>
        r.defaultRoleName ? (
          <Badge variant="subtle" color="info">
            {String(r.defaultRoleName)}
          </Badge>
        ) : (
          <span className={styles.muted}>{t('acc.none')}</span>
        ),
    },
    {
      title: t('acc.headcount'),
      width: 90,
      render: (r) => t('acc.peopleN', { v0: Number(r.employeeCount) }),
    },
    {
      title: t('acc.col.status'),
      width: 80,
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? t('acc.use') : t('acc.unused')}
        </Badge>
      ),
    },
  ];

  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? t('acc.posAdd') : t('acc.posEdit')}
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
  );

  // 행을 누르면 상세 — 고치기·삭제는 상세 머리글에서
  if (detailId) {
    const detail = rows.find((r) => r.id === detailId);
    return (
      <>
        <RecordDetail
          loading={!detail && loading}
          title={detail ? detail.name : t('acc.posNotFound')}
          backLabel={t('acc.position')}
          onBack={closeDetail}
          actions={
            detail && (canUpdate || canDelete) ? (
              <>
                {canDelete && (
                  <Button variant="outline" size="sm" onClick={() => void remove(detail)}>
                    {t('acc.delete')}
                  </Button>
                )}
                {canUpdate && (
                  <Button variant="primary" size="sm" onClick={() => setEditing(detail)}>
                    {t('acc.editBtn')}
                  </Button>
                )}
              </>
            ) : undefined
          }
          sections={
            detail
              ? [
                  {
                    title: t('acc.posInfo'),
                    items: [
                      { label: t('acc.position'), value: detail.name },
                      {
                        label: t('acc.order'),
                        value: t('acc.nth', { v0: rows.findIndex((x) => x.id === detail.id) + 1 }),
                      },
                      {
                        label: t('acc.recGroupsCol'),
                        value: detail.defaultRoleName ? (
                          <Badge variant="subtle" color="info">
                            {detail.defaultRoleName}
                          </Badge>
                        ) : (
                          <span className={styles.muted}>{t('acc.none')}</span>
                        ),
                      },
                      {
                        label: t('acc.headcount'),
                        value: t('acc.peopleN', { v0: detail.employeeCount }),
                      },
                      {
                        label: t('acc.col.status'),
                        value: (
                          <Badge variant="subtle" color={detail.isActive ? 'success' : 'neutral'}>
                            {detail.isActive ? t('acc.use') : t('acc.unused')}
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
    <div className={styles.section}>
      <div className={styles.notice} style={{ margin: 0 }}>
        {t('acc.posHelp1')} <b>{t('acc.posHelp2')}</b>
        {t('acc.posHelp3')}
        {t('acc.posHelp4')}
      </div>
      <DataTable
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => openDetail(String(r.id))}
        toolbarActions={
          canCreate ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              {t('acc.posAddBtn')}
            </Button>
          ) : undefined
        }
      />
      {modal}
    </div>
  );
}
