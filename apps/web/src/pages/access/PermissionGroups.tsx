import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Smartphone } from 'lucide-react';
import {
  CRUD_ACTIONS,
  CRUD_ACTION_LABEL,
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
      toast({ type: 'success', title: `'${selected.name}' 권한을 저장했습니다` });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 버리고 목록으로 갈까요?')) return;
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
      toast({ type: 'success', title: `'${created.name}' 그룹을 만들었습니다` });
      await load();
      openDetail(created.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
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
      toast({ type: 'success', title: '저장했습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
      throw e;
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`'${selected.name}' 그룹을 지울까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/roles/${selected.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '지웠습니다' });
      closeDetail();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  const createFields: FormField[] = useMemo(
    () => [
      { name: 'name', label: '그룹 이름', required: true, placeholder: '예: 정산 담당' },
      { name: 'description', label: '설명', alwaysShow: true, placeholder: '이 그룹이 하는 일' },
      {
        name: 'copyFrom',
        label: '권한 복사해 오기',
        type: 'select',
        alwaysShow: true,
        options: (roles ?? [])
          .filter((r) => !r.isSuperAdmin)
          .map((r) => ({ value: r.id, label: r.name })),
      },
      {
        name: 'fieldApp',
        label: '로그인하면 현장앱으로 들어가기',
        type: 'boolean',
        alwaysShow: true,
      },
    ],
    [roles],
  );
  const editFields: FormField[] = [
    { name: 'name', label: '그룹 이름', required: true },
    { name: 'description', label: '설명', alwaysShow: true },
    {
      name: 'fieldApp',
      label: '로그인하면 현장앱으로 들어가기',
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
        title: '그룹 이름',
        dataIndex: 'name',
        minWidth: 160,
        render: (r) => (
          <span className={styles.groupName}>
            {r.isSuperAdmin ? <Lock size={13} aria-label="고정" /> : null}
            {String(r.name)}
          </span>
        ),
      },
      { title: '설명', dataIndex: 'description', minWidth: 200, flex: 1 },
      { title: '계정', dataIndex: 'userCount', width: 80, numeric: true },
      {
        title: '권한',
        dataIndex: 'permCount',
        width: 100,
        render: (r) => (r.isSuperAdmin ? '전체 권한' : `${String(r.permCount)}개`),
      },
      { title: '추천 직책', dataIndex: 'positionNames', minWidth: 120 },
      {
        title: '구분',
        width: 150,
        render: (r) => (
          <span className={styles.badges}>
            {r.isSystem ? (
              <Badge variant="subtle" color="neutral" size="sm">
                기본 그룹
              </Badge>
            ) : null}
            {r.fieldApp ? (
              <Badge variant="subtle" color="info" size="sm">
                현장앱
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
                + 새 그룹
              </Button>
            ) : undefined
          }
        />
        <FormModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="새 권한 그룹"
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
        title={selected?.name ?? '권한 그룹을 찾을 수 없습니다'}
        breadcrumbs={[{ label: '권한 그룹', onClick: back }]}
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
                      ? '기본 그룹은 지울 수 없습니다'
                      : selected.userCount > 0
                        ? '이 그룹을 쓰는 계정이 있어 지울 수 없습니다'
                        : undefined
                  }
                >
                  그룹 삭제
                </Button>
              )}
              {canUpdate && (
                <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>
                  이름·설명 고치기
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
              <span className={styles.sub}>{selected.description || '설명 없음'}</span>
              <span className={styles.badges}>
                {selected.isSystem && (
                  <Badge variant="subtle" color="neutral" size="sm">
                    기본 그룹
                  </Badge>
                )}
                {selected.fieldApp && (
                  <Badge variant="subtle" color="info" size="sm">
                    <Smartphone size={11} /> 현장앱으로 로그인
                  </Badge>
                )}
                <Badge variant="subtle" color="primary" size="sm">
                  계정 {selected.userCount}개
                </Badge>
                {selected.positions.length > 0 && (
                  <Badge variant="subtle" color="neutral" size="sm">
                    추천 직책: {selected.positions.join(', ')}
                  </Badge>
                )}
              </span>
            </div>
          </div>

          {selected.isSuperAdmin ? (
            <div className={styles.notice}>
              슈퍼관리자는 <b>전체 권한</b>으로 고정되어 있습니다. 새 메뉴가 생겨도 자동으로
              포함되며, 이 그룹의 권한은 고칠 수 없습니다.
            </div>
          ) : !canUpdate ? (
            <div className={styles.notice}>
              권한을 볼 수만 있습니다(권한 그룹 · 수정 권한 필요).
            </div>
          ) : !isWildcard ? (
            <div className={styles.notice}>
              내게 있는 권한까지만 넣고 뺄 수 있습니다. 흐린 칸은 내게 없는 권한입니다.
            </div>
          ) : null}

          {editable && (
            <div className={styles.toolbar}>
              <span className={styles.sub}>한 번에:</span>
              <Button variant="outline" size="sm" onClick={() => setMany(ALL_CODES, true)}>
                모두 켜기
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMany(ALL_CODES, false);
                  setMany(READ_CODES, true);
                }}
              >
                조회만
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMany(ALL_CODES, false)}>
                모두 끄기
              </Button>
            </div>
          )}

          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>메뉴</th>
                  {CRUD_ACTIONS.map((a) => (
                    <th key={a} style={{ width: '9%' }}>
                      {CRUD_ACTION_LABEL[a]}
                    </th>
                  ))}
                  <th>특수 권한</th>
                  <th style={{ width: '8%' }}>전체</th>
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
              <span className={styles.sub}>저장하지 않은 변경 {changedCount}개</span>
              <span className={styles.spacer} />
              <Button variant="ghost" size="sm" onClick={() => setDraft(new Set(saved))}>
                되돌리기
              </Button>
              <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
                저장
              </Button>
            </div>
          )}

          {history.length > 0 && (
            <div className={styles.history}>
              <span className={styles.panelTitle}>변경 이력</span>
              {history.slice(0, 10).map((h, i) => {
                const prev = history[i + 1]?.after?.permissions;
                const cur = h.after?.permissions;
                const added = cur && prev ? cur.filter((c) => !prev.includes(c)) : [];
                const removed = cur && prev ? prev.filter((c) => !cur.includes(c)) : [];
                const who = h.actorUserId ? (actors.get(h.actorUserId) ?? '알 수 없음') : '시스템';
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
                        ? '그룹을 만들었습니다'
                        : h.path.endsWith('/permissions')
                          ? [
                              added.length ? `켬: ${added.map(permissionLabel).join(', ')}` : '',
                              removed.length
                                ? `끔: ${removed.map(permissionLabel).join(', ')}`
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' / ') || '권한을 저장했습니다'
                          : '이름·설명을 고쳤습니다'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.panel}>
          <div className={styles.notice}>
            이 그룹을 찾을 수 없습니다. 목록에서 다시 골라 주세요.
          </div>
        </div>
      )}
      {selected && (
        <FormModal
          open={editOpen}
          onOpenChange={setEditOpen}
          title="권한 그룹 고치기"
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
