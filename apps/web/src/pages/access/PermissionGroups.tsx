import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Smartphone } from 'lucide-react';
import {
  CRUD_ACTIONS,
  PERMISSION_CATALOG,
  permissionLabel,
  type PermissionResource,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  FormModal,
  PageHeader,
  TableSkeleton,
  useToast,
} from '../../components/ui';
import type { Column, FormField, Row } from '../../components/ui';
import { useDetailParam } from '../../lib/useDetailParam';
import styles from './access.module.css';
import { CRUD_ACTION_LABEL } from '../../i18n/codes';

export interface RoleView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isSuperAdmin: boolean;
  fieldApp: boolean;
  sortOrder: number;
  permissions: string[];
  userCount: number;
  positions: string[];
}

interface AuditRow {
  id: string;
  entityId: string | null;
  action: string;
  actorUserId: string | null;
  path: string;
  createdAt: string;
  after: { permissions?: string[]; name?: string } | null;
}

const GROUPS = [...new Set(PERMISSION_CATALOG.map((r) => r.group))];
const codesOf = (r: PermissionResource) => [
  ...r.actions.map((a) => `${r.key}.${a}`),
  ...(r.specials ?? []).map((s) => `${r.key}.${s.action}`),
];
const ALL_CODES = PERMISSION_CATALOG.flatMap(codesOf);
const READ_CODES = PERMISSION_CATALOG.filter((r) => r.actions.includes('READ')).map(
  (r) => `${r.key}.READ`,
);

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

/**
 * 권한 그룹 — 왼쪽에서 그룹을 고르고, 오른쪽 표에서 메뉴마다 조회·등록·수정·삭제·특수 권한을 켠다.
 * 등록·수정·삭제를 켜면 조회도 함께 켜진다(볼 수 없는 걸 고칠 수는 없으니까).
 * 슈퍼관리자가 아닌 관리자는 자기에게 없는 권한 칸을 건드릴 수 없다(서버도 같은 규칙).
 */
export default function PermissionGroups() {
  const { t } = useTranslation();
  const { can, user } = useAuth();
  const toast = useToast();
  const [roles, setRoles] = useState<RoleView[] | null>(null);
  // 목록 → 그룹 상세(?detail=<그룹 id>) — 권한 표는 상세 화면에서만 다룬다
  const { id: selectedId, open: openDetail, close: closeDetail } = useDetailParam();
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<Map<string, string>>(new Map());

  const isWildcard = user?.permissions.includes('*') ?? false;
  const canCreate = can('ROLE.CREATE');
  const canUpdate = can('ROLE.UPDATE');
  const canDelete = can('ROLE.DELETE');

  const load = useCallback(async () => {
    try {
      const rows = await api<RoleView[]>('/roles');
      setRoles(rows);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.loadFailed') });
      setRoles([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = roles?.find((r) => r.id === selectedId) ?? null;
  const saved = useMemo(() => new Set(selected?.permissions ?? []), [selected]);
  const dirty = selected ? !sameSet(saved, draft) : false;
  const editable = !!selected && !selected.isSuperAdmin && canUpdate;

  // 그룹을 바꾸면 초안을 저장된 값으로
  useEffect(() => {
    setDraft(new Set(selected?.permissions ?? []));
  }, [selected]);

  // 변경 이력(감사 로그) — 이 그룹의 권한·이름이 언제 어떻게 바뀌었는지
  useEffect(() => {
    if (!selected || !can('AUDIT.READ')) {
      setHistory([]);
      return;
    }
    let alive = true;
    api<AuditRow[]>('/audit-logs?entityType=roles')
      .then(
        (rows) =>
          alive &&
          setHistory(
            rows.filter((r) => r.entityId === selected.id || r.path.includes(selected.id)),
          ),
      )
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [selected, can]);

  useEffect(() => {
    if (!can('USER.READ')) return;
    api<{ id: string; loginId: string; employeeName: string | null }[]>('/accounts')
      .then((rows) => setActors(new Map(rows.map((r) => [r.id, r.employeeName ?? r.loginId]))))
      .catch(() => undefined);
  }, [can]);

  const locked = (code: string) => !editable || (!isWildcard && !can(code));

  const toggle = (code: string, on: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev);
      const [key, action] = code.split('.');
      if (on) {
        next.add(code);
        // 등록·수정·삭제는 조회가 있어야 의미가 있다
        if (action !== 'READ' && (CRUD_ACTIONS as readonly string[]).includes(action)) {
          if (!locked(`${key}.READ`)) next.add(`${key}.READ`);
        }
      } else {
        next.delete(code);
        if (action === 'READ') {
          for (const a of ['CREATE', 'UPDATE', 'DELETE']) {
            if (!locked(`${key}.${a}`)) next.delete(`${key}.${a}`);
          }
        }
      }
      return next;
    });
  };

  const setMany = (codes: string[], on: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const c of codes) {
        if (locked(c)) continue;
        if (on) next.add(c);
        else next.delete(c);
      }
      return next;
    });
  };

  const stateOf = (codes: string[]): boolean | 'indeterminate' => {
    const on = codes.filter((c) => draft.has(c)).length;
    return on === 0 ? false : on === codes.length ? true : 'indeterminate';
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/roles/${selected.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: [...draft] }),
      });
      toast({ type: 'success', title: t('acc.permsSaved', { v0: selected.name }) });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (dirty && !window.confirm(t('acc.discardQ'))) return;
    closeDetail();
  };

  const onCreate = async (values: Record<string, unknown>) => {
    const from = roles?.find((r) => r.id === values.copyFrom);
    try {
      const created = await api<RoleView>('/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          description: values.description ?? undefined,
          fieldApp: values.fieldApp === true,
          // 슈퍼관리자의 '*'는 복사하지 않는다 — 다른 그룹은 메뉴별로 정한다
          permissions: (from?.permissions ?? []).filter((c) => c !== '*'),
        }),
      });
      toast({ type: 'success', title: t('acc.groupCreated', { v0: created.name }) });
      await load();
      openDetail(created.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.createFailed') });
      throw e;
    }
  };

  const onEdit = async (values: Record<string, unknown>) => {
    if (!selected) return;
    try {
      await api(`/roles/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: values.name,
          description: (values.description as string | null) ?? '',
          fieldApp: values.fieldApp === true,
        }),
      });
      toast({ type: 'success', title: t('acc.saved') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.saveFailed') });
      throw e;
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    if (!window.confirm(t('acc.groupDeleteQ', { v0: selected.name }))) return;
    try {
      await api(`/roles/${selected.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('acc.deleted') });
      closeDetail();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.deleteFailed') });
    }
  };

  const createFields: FormField[] = useMemo(
    () => [
      {
        name: 'name',
        label: t('acc.groupName'),
        required: true,
        placeholder: t('acc.groupNamePh'),
      },
      { name: 'description', label: t('acc.desc'), alwaysShow: true, placeholder: t('acc.descPh') },
      {
        name: 'copyFrom',
        label: t('acc.copyFrom'),
        type: 'select',
        alwaysShow: true,
        options: (roles ?? [])
          .filter((r) => !r.isSuperAdmin)
          .map((r) => ({ value: r.id, label: r.name })),
      },
      {
        name: 'fieldApp',
        label: t('acc.fieldApp'),
        type: 'boolean',
        alwaysShow: true,
      },
    ],
    [roles],
  );
  const editFields: FormField[] = [
    { name: 'name', label: t('acc.groupName'), required: true },
    { name: 'description', label: t('acc.desc'), alwaysShow: true },
    {
      name: 'fieldApp',
      label: t('acc.fieldApp'),
      type: 'boolean',
      alwaysShow: true,
    },
  ];

  if (!roles) return <TableSkeleton rows={8} cols={4} />;

  const changedCount = selected
    ? [...draft].filter((c) => !saved.has(c)).length +
      [...saved].filter((c) => !draft.has(c)).length
    : 0;

  // ── 목록: 그룹만 ──
  if (!selectedId) {
    const columns: Column[] = [
      {
        title: t('acc.groupName'),
        dataIndex: 'name',
        minWidth: 160,
        render: (r) => (
          <span className={styles.groupName}>
            {r.isSuperAdmin ? <Lock size={13} aria-label={t('acc.locked')} /> : null}
            {String(r.name)}
          </span>
        ),
      },
      { title: t('acc.desc'), dataIndex: 'description', minWidth: 200, flex: 1 },
      { title: t('acc.accounts'), dataIndex: 'userCount', width: 80, numeric: true },
      {
        title: t('acc.perms'),
        dataIndex: 'permCount',
        width: 100,
        render: (r) =>
          r.isSuperAdmin ? t('acc.allPerms') : t('acc.countN', { v0: String(r.permCount) }),
      },
      { title: t('acc.recPositions'), dataIndex: 'positionNames', minWidth: 120 },
      {
        title: t('acc.kind'),
        width: 150,
        render: (r) => (
          <span className={styles.badges}>
            {r.isSystem ? (
              <Badge variant="subtle" color="neutral" size="sm">
                {t('acc.builtIn')}
              </Badge>
            ) : null}
            {r.fieldApp ? (
              <Badge variant="subtle" color="info" size="sm">
                {t('acc.fieldAppShort')}
              </Badge>
            ) : null}
          </span>
        ),
      },
    ];
    const rows = roles.map((r) => ({
      ...r,
      permCount: r.permissions.length,
      positionNames: r.positions.join(', '),
    }));
    return (
      <>
        <DataTable
          columns={columns}
          rows={rows as unknown as Row[]}
          onRowClick={(r) => openDetail(String(r.id))}
          toolbarActions={
            canCreate ? (
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                {t('acc.newGroupBtn')}
              </Button>
            ) : undefined
          }
        />
        <FormModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          title={t('acc.newGroup')}
          size="md"
          fields={createFields}
          onSubmit={onCreate}
        />
      </>
    );
  }

  // ── 상세: 그룹 하나의 권한 표 ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={selected?.name ?? t('acc.groupNotFound')}
        breadcrumbs={[{ label: t('acc.groups'), onClick: back }]}
        actions={
          selected && !selected.isSuperAdmin ? (
            <>
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onDelete()}
                  disabled={selected.isSystem || selected.userCount > 0}
                  title={
                    selected.isSystem
                      ? t('acc.builtInNoDelete')
                      : selected.userCount > 0
                        ? t('acc.inUse')
                        : undefined
                  }
                >
                  {t('acc.deleteGroup')}
                </Button>
              )}
              {canUpdate && (
                <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>
                  {t('acc.editNameDesc')}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      {selected ? (
        <div className={styles.panel}>
          <div className={styles.detailHead}>
            <div className={styles.detailTitle}>
              <span className={styles.sub}>{selected.description || t('acc.noDesc')}</span>
              <span className={styles.badges}>
                {selected.isSystem && (
                  <Badge variant="subtle" color="neutral" size="sm">
                    {t('acc.builtIn')}
                  </Badge>
                )}
                {selected.fieldApp && (
                  <Badge variant="subtle" color="info" size="sm">
                    <Smartphone size={11} /> {t('acc.fieldLogin')}
                  </Badge>
                )}
                <Badge variant="subtle" color="primary" size="sm">
                  {t('acc.accounts')} {selected.userCount}
                  {t('acc.countSuffix')}
                </Badge>
                {selected.positions.length > 0 && (
                  <Badge variant="subtle" color="neutral" size="sm">
                    {t('acc.recPositionsColon')} {selected.positions.join(', ')}
                  </Badge>
                )}
              </span>
            </div>
          </div>

          {selected.isSuperAdmin ? (
            <div className={styles.notice}>
              {t('acc.superHelp1')} <b>{t('acc.allPerms')}</b>
              {t('acc.superHelp2')}
              {t('acc.superHelp3')}
            </div>
          ) : !canUpdate ? (
            <div className={styles.notice}>{t('acc.viewOnly')}</div>
          ) : !isWildcard ? (
            <div className={styles.notice}>{t('acc.ownOnly')}</div>
          ) : null}

          {editable && (
            <div className={styles.toolbar}>
              <span className={styles.sub}>{t('acc.bulk')}</span>
              <Button variant="outline" size="sm" onClick={() => setMany(ALL_CODES, true)}>
                {t('acc.allOn')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMany(ALL_CODES, false);
                  setMany(READ_CODES, true);
                }}
              >
                {t('acc.readOnly')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMany(ALL_CODES, false)}>
                {t('acc.allOff')}
              </Button>
            </div>
          )}

          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>{t('acc.menu')}</th>
                  {CRUD_ACTIONS.map((a) => (
                    <th key={a} style={{ width: '9%' }}>
                      {CRUD_ACTION_LABEL[a]}
                    </th>
                  ))}
                  <th>{t('acc.special')}</th>
                  <th style={{ width: '8%' }}>{t('acc.scope.ALL')}</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => {
                  const resources = PERMISSION_CATALOG.filter((r) => r.group === g);
                  const groupCodes = resources.flatMap(codesOf);
                  return [
                    <tr key={`g-${g}`} className={styles.groupRow}>
                      <td colSpan={CRUD_ACTIONS.length + 2}>{g}</td>
                      <td>
                        <span className={styles.cellCenter}>
                          <Checkbox
                            checked={selected.isSuperAdmin ? true : stateOf(groupCodes)}
                            disabled={!editable}
                            onCheckedChange={(v) => setMany(groupCodes, v === true)}
                          />
                        </span>
                      </td>
                    </tr>,
                    ...resources.map((r) => {
                      const rowCodes = codesOf(r);
                      const rowChanged = rowCodes.some((c) => draft.has(c) !== saved.has(c));
                      return (
                        <tr key={r.key} className={rowChanged ? styles.changed : undefined}>
                          <td>
                            <span className={styles.menuCell}>
                              <span>{r.label}</span>
                              {r.hint && <span className={styles.muted}>{r.hint}</span>}
                            </span>
                          </td>
                          {CRUD_ACTIONS.map((a) => {
                            const code = `${r.key}.${a}`;
                            return (
                              <td key={a}>
                                {r.actions.includes(a) ? (
                                  <span className={styles.cellCenter}>
                                    <Checkbox
                                      checked={selected.isSuperAdmin || draft.has(code)}
                                      disabled={locked(code)}
                                      onCheckedChange={(v) => toggle(code, v === true)}
                                    />
                                  </span>
                                ) : (
                                  <span className={styles.none}>–</span>
                                )}
                              </td>
                            );
                          })}
                          <td>
                            {r.specials?.length ? (
                              <span className={styles.specials}>
                                {r.specials.map((s) => {
                                  const code = `${r.key}.${s.action}`;
                                  return (
                                    <Checkbox
                                      key={s.action}
                                      size="sm"
                                      label={s.label}
                                      checked={selected.isSuperAdmin || draft.has(code)}
                                      disabled={locked(code)}
                                      onCheckedChange={(v) => toggle(code, v === true)}
                                    />
                                  );
                                })}
                              </span>
                            ) : (
                              <span className={styles.none}>–</span>
                            )}
                          </td>
                          <td>
                            <span className={styles.cellCenter}>
                              <Checkbox
                                checked={selected.isSuperAdmin ? true : stateOf(rowCodes)}
                                disabled={!editable}
                                onCheckedChange={(v) => setMany(rowCodes, v === true)}
                              />
                            </span>
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>

          {editable && dirty && (
            <div className={styles.saveBar}>
              <span className={styles.sub}>
                {t('acc.unsaved')} {changedCount}
                {t('acc.countSuffix')}
              </span>
              <span className={styles.spacer} />
              <Button variant="ghost" size="sm" onClick={() => setDraft(new Set(saved))}>
                {t('acc.revert')}
              </Button>
              <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
                {t('acc.save')}
              </Button>
            </div>
          )}

          {history.length > 0 && (
            <div className={styles.history}>
              <span className={styles.panelTitle}>{t('acc.history')}</span>
              {history.slice(0, 10).map((h, i) => {
                const prev = history[i + 1]?.after?.permissions;
                const cur = h.after?.permissions;
                const added = cur && prev ? cur.filter((c) => !prev.includes(c)) : [];
                const removed = cur && prev ? prev.filter((c) => !cur.includes(c)) : [];
                const who = h.actorUserId
                  ? (actors.get(h.actorUserId) ?? t('acc.unknown'))
                  : t('acc.system');
                return (
                  <div key={h.id} className={styles.historyItem}>
                    <span>
                      <b>{who}</b>{' '}
                      <span className={styles.muted}>
                        {new Date(h.createdAt).toLocaleString('ko-KR')}
                      </span>
                    </span>
                    <span className={styles.sub}>
                      {h.action === 'CREATE'
                        ? t('acc.h.created')
                        : h.path.endsWith('/permissions')
                          ? [
                              added.length
                                ? t('acc.h.on', { v0: added.map(permissionLabel).join(', ') })
                                : '',
                              removed.length
                                ? t('acc.h.off', { v0: removed.map(permissionLabel).join(', ') })
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' / ') || t('acc.h.saved')
                          : t('acc.h.renamed')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.panel}>
          <div className={styles.notice}>{t('acc.groupGone')}</div>
        </div>
      )}
      {selected && (
        <FormModal
          open={editOpen}
          onOpenChange={setEditOpen}
          title={t('acc.editGroup')}
          size="md"
          fields={editFields}
          initialValues={{
            name: selected.name,
            description: selected.description ?? '',
            fieldApp: String(selected.fieldApp),
          }}
          onSubmit={onEdit}
        />
      )}
    </div>
  );
}
