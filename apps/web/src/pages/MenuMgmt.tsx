import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Eye, Trash2, X } from 'lucide-react';
import {
  MENU_TARGET_LABEL,
  filterLayout,
  menuDef,
  normalizeLayout,
  type MenuGroup,
  type MenuLayout,
  type MenuTargetKind,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  FormModal,
  ListPage,
  PageHeader,
  PageSkeleton,
  useToast,
} from '../components/ui';
import type { Column, FormField, Row } from '../components/ui';
import { useDetailParam } from '../lib/useDetailParam';
import { menuIcon, notifyMenuChanged, useMenuLabel } from '../lib/menu';
import { MenuLayoutEditor } from '../components/menu/MenuLayoutEditor';
import styles from './menuMgmt.module.css';

interface Target {
  kind: MenuTargetKind;
  targetId: string;
  name: string;
}
interface Profile {
  id: string;
  name: string;
  description: string | null;
  layout: MenuLayout;
  menuCount: number;
  priority: number;
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
  targets: Target[];
  userCount?: number;
}
type Option = { id: string; name: string; sub?: string };

const KINDS: MenuTargetKind[] = ['ORG', 'ROLE', 'POSITION', 'USER'];
const KIND_HINT: Record<MenuTargetKind, string> = {
  ORG: i18n.t('menu.target.ORG'),
  ROLE: i18n.t('menu.target.ROLE'),
  POSITION: i18n.t('menu.target.POSITION'),
  USER: i18n.t('menu.target.USER'),
};

/** 메뉴 관리 — 팀(소속)·권한 그룹·직책·개인별 사이드바 메뉴 구성 */
export default function MenuMgmt() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const { id: detailId, open: openDetail, close } = useDetailParam();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<Profile[]>('/menus/profiles'));
    } catch (e) {
      setRows([]);
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('menu.listFailed'),
      });
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  if (detailId) {
    return (
      <ProfileDetail
        id={detailId}
        onBack={() => {
          close();
          void load();
        }}
      />
    );
  }

  const columns: Column[] = [
    {
      title: t('menu.name'),
      dataIndex: 'name',
      minWidth: 160,
      render: (r) => (
        <span className={styles.nameCell}>
          {String(r.name)}
          {r.isDefault ? (
            <Badge variant="subtle" color="primary" size="sm">
              {t('menu.default')}
            </Badge>
          ) : null}
        </span>
      ),
    },
    { title: t('menu.targets'), dataIndex: 'targetText', minWidth: 220, flex: 1 },
    {
      title: t('menu.menus'),
      dataIndex: 'menuCount',
      width: 80,
      numeric: true,
      render: (r) => t('menu.countN', { v0: String(r.menuCount) }),
    },
    { title: t('menu.groups'), dataIndex: 'groupText', minWidth: 220, flex: 1 },
    { title: t('menu.priority'), dataIndex: 'priority', width: 90, numeric: true },
    {
      title: t('menu.status'),
      width: 80,
      render: (r) =>
        r.isActive ? (
          <Badge variant="subtle" color="success" size="sm">
            {t('menu.on')}
          </Badge>
        ) : (
          <Badge variant="subtle" color="neutral" size="sm">
            {t('menu.off')}
          </Badge>
        ),
      exportValue: (r) => (r.isActive ? t('menu.on') : t('menu.off')),
    },
  ];
  const tableRows = (rows ?? []).map((p) => ({
    ...p,
    targetText:
      p.isDefault && !p.targets.length
        ? t('menu.unmatched')
        : p.targets.map((tg) => `${MENU_TARGET_LABEL[tg.kind]}: ${tg.name}`).join(', ') ||
          t('menu.noTargets'),
    groupText: p.layout.groups.map((g) => g.label).join(' · '),
  }));

  const createFields: FormField[] = [
    { name: 'name', label: t('menu.name'), required: true, placeholder: t('menu.namePh') },
    { name: 'description', label: t('menu.desc'), placeholder: t('menu.descPh') },
  ];
  const onCreate = async (v: Record<string, unknown>) => {
    const p = await api<Profile>('/menus/profiles', {
      method: 'POST',
      body: JSON.stringify({
        name: v.name,
        description: v.description || null,
        layout: { groups: [{ label: t('menu.home'), items: ['dashboard', 'notices', 'tasks'] }] },
      }),
    });
    setCreateOpen(false);
    openDetail(p.id);
  };

  return (
    <ListPage title={t('menu.title')} subtitle={t('menu.subtitle')}>
      <DataTable
        columns={columns}
        rows={tableRows as unknown as Row[]}
        loading={rows === null}
        onRowClick={(r) => openDetail(String(r.id))}
        toolbarActions={
          can('MENU.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              {t('menu.newBtn')}
            </Button>
          ) : undefined
        }
      />
      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('menu.newTitle')}
        size="md"
        fields={createFields}
        onSubmit={onCreate}
      />
    </ListPage>
  );
}

function ProfileDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const label = useMenuLabel();
  const [p, setP] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [opts, setOpts] = useState<Record<MenuTargetKind, Option[]>>({
    ORG: [],
    ROLE: [],
    POSITION: [],
    USER: [],
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewUser, setPreviewUser] = useState('');
  const [preview, setPreview] = useState<{
    layout: MenuLayout;
    permissions: string[];
    profiles: { name: string }[];
  } | null>(null);
  const editable = can('MENU.UPDATE');

  useEffect(() => {
    void (async () => {
      try {
        const row = await api<Profile>(`/menus/profiles/${id}`);
        setP(row);
        setGroups(normalizeLayout(row.layout).groups);
        setTargets(row.targets);
      } catch (e) {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('menu.loadFailed') });
      }
    })();
    // 대상 고르기 목록 — 권한이 없는 목록은 비워 둔다
    void Promise.allSettled([
      api<{ id: string; name: string; type: string; parentId?: string | null }[]>('/org-units'),
      api<{ id: string; name: string }[]>('/roles'),
      api<{ id: string; name: string }[]>('/positions'),
      api<
        { id: string; loginId: string; employeeName: string | null; orgUnitName?: string | null }[]
      >('/accounts'),
    ]).then(([o, r, ps, u]) => {
      const ORDER: Record<string, number> = { GROUP: 0, COMPANY: 1, DEPT: 2, TF: 3, BRANCH: 4 };
      setOpts({
        ORG:
          o.status === 'fulfilled'
            ? [...o.value]
                .sort(
                  (a, b) =>
                    (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9) || a.name.localeCompare(b.name),
                )
                .map((x) => ({
                  id: x.id,
                  name: x.name,
                  sub:
                    x.type === 'BRANCH'
                      ? t('menu.org.BRANCH')
                      : x.type === 'DEPT'
                        ? t('menu.org.DEPT')
                        : x.type === 'TF'
                          ? t('menu.org.TF')
                          : t('menu.org.COMPANY'),
                }))
            : [],
        ROLE: r.status === 'fulfilled' ? r.value.map((x) => ({ id: x.id, name: x.name })) : [],
        POSITION:
          ps.status === 'fulfilled' ? ps.value.map((x) => ({ id: x.id, name: x.name })) : [],
        USER:
          u.status === 'fulfilled'
            ? u.value.map((x) => ({ id: x.id, name: x.employeeName ?? x.loginId, sub: x.loginId }))
            : [],
      });
    });
  }, [id, toast]);

  const patch = (fn: (x: Profile) => Profile) => {
    setP((x) => (x ? fn(x) : x));
    setDirty(true);
  };

  const save = async () => {
    if (!p) return;
    setSaving(true);
    try {
      const row = await api<Profile>(`/menus/profiles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: p.name,
          description: p.description,
          priority: p.priority,
          isDefault: p.isDefault,
          isActive: p.isActive,
          layout: { groups },
          targets: targets.map(({ kind, targetId }) => ({ kind, targetId })),
        }),
      });
      setP(row);
      setTargets(row.targets);
      setDirty(false);
      notifyMenuChanged();
      toast({
        type: 'success',
        title: t('menu.saved', { v0: row.userCount ?? 0 }),
      });
      if (previewUser) void loadPreview(previewUser);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('menu.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!p || !window.confirm(t('menu.deleteQ', { v0: p.name }))) return;
    try {
      await api(`/menus/profiles/${id}`, { method: 'DELETE' });
      notifyMenuChanged();
      toast({ type: 'success', title: t('menu.deleted') });
      onBack();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('menu.deleteFailed') });
    }
  };

  const loadPreview = async (userId: string) => {
    setPreviewUser(userId);
    if (!userId) return setPreview(null);
    try {
      setPreview(await api(`/menus/preview/${userId}`));
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('menu.previewFailed'),
      });
    }
  };

  const previewLayout = useMemo(() => {
    if (!preview) return null;
    const perms = new Set(preview.permissions);
    const canP = (code: string) => perms.has('*') || perms.has(code);
    return filterLayout(preview.layout, canP, true);
  }, [preview]);

  if (!p) return <PageSkeleton cards={2} />;
  const nameMissing = !p.name.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={p.name || t('menu.noName')}
        breadcrumbs={[{ label: t('menu.title'), onClick: onBack }]}
        actions={
          editable ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {can('MENU.DELETE') && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 size={14} />}
                  disabled={p.isDefault}
                  title={p.isDefault ? t('menu.defaultNoDelete') : undefined}
                  onClick={() => void remove()}
                >
                  {t('menu.delete')}
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Check size={14} />}
                loading={saving}
                disabled={nameMissing || !dirty}
                onClick={() => void save()}
              >
                {t('menu.save')}
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>{t('menu.basic')}</h3>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>
                  {t('menu.name')} <b className={styles.req}>*</b>
                </span>
                <input
                  className={styles.input}
                  value={p.name}
                  maxLength={40}
                  disabled={!editable}
                  onChange={(e) => patch((x) => ({ ...x, name: e.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>{t('menu.priority')}</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={9999}
                  value={p.priority}
                  disabled={!editable}
                  onChange={(e) => patch((x) => ({ ...x, priority: Number(e.target.value) || 0 }))}
                />
              </label>
              <label className={`${styles.field} ${styles.wide}`}>
                <span>{t('menu.desc')}</span>
                <input
                  className={styles.input}
                  value={p.description ?? ''}
                  maxLength={200}
                  disabled={!editable}
                  onChange={(e) => patch((x) => ({ ...x, description: e.target.value }))}
                />
              </label>
            </div>
            <p className={styles.hint}>
              {t('menu.priorityHelp1')}
              {t('menu.priorityHelp2')}
            </p>
            <div className={styles.checks}>
              <Checkbox
                checked={p.isActive}
                disabled={!editable}
                onCheckedChange={(v) => patch((x) => ({ ...x, isActive: v === true }))}
                label={t('menu.on')}
                description={t('menu.offHelp')}
              />
              <Checkbox
                checked={p.isDefault}
                disabled={!editable}
                onCheckedChange={(v) => patch((x) => ({ ...x, isDefault: v === true }))}
                label={t('menu.defaultLayout')}
                description={t('menu.defaultHelp')}
              />
            </div>
          </section>

          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              {t('menu.targets')}
              {p.userCount !== undefined && (
                <span className={styles.meta}>
                  {t('menu.savedAccounts')} {p.userCount}
                  {t('menu.peopleSuffix')}
                </span>
              )}
            </h3>
            <div className={styles.targets}>
              {KINDS.map((kind) => {
                const mine = targets.filter((t) => t.kind === kind);
                const left = opts[kind].filter((o) => !mine.some((t) => t.targetId === o.id));
                return (
                  <div key={kind} className={styles.targetRow}>
                    <div className={styles.targetKind}>
                      {MENU_TARGET_LABEL[kind]}
                      <span className={styles.meta}>{KIND_HINT[kind]}</span>
                    </div>
                    <div className={styles.chips}>
                      {mine.map((tg) => (
                        <span key={tg.targetId} className={styles.chip}>
                          {tg.name}
                          {editable && (
                            <button
                              type="button"
                              aria-label={t('menu.removeOf', { v0: tg.name })}
                              onClick={() => {
                                setTargets((ts) =>
                                  ts.filter(
                                    (x) => !(x.kind === kind && x.targetId === tg.targetId),
                                  ),
                                );
                                setDirty(true);
                              }}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                      {editable && (
                        <select
                          className={styles.addSelect}
                          value=""
                          aria-label={t('menu.addOf', { v0: MENU_TARGET_LABEL[kind] })}
                          onChange={(e) => {
                            const o = opts[kind].find((x) => x.id === e.target.value);
                            if (!o) return;
                            setTargets((ts) => [...ts, { kind, targetId: o.id, name: o.name }]);
                            setDirty(true);
                          }}
                        >
                          <option value="">{t('menu.addOpt')}</option>
                          {left.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.sub ? `${o.name} (${o.sub})` : o.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              {t('menu.layout')}
              <span className={styles.meta}>{t('menu.layoutHint')}</span>
            </h3>
            {editable ? (
              <MenuLayoutEditor
                mode="admin"
                groups={groups}
                onChange={(g) => {
                  setGroups(g);
                  setDirty(true);
                }}
              />
            ) : (
              <SidebarPreview layout={{ groups }} label={label} />
            )}
          </section>
        </div>

        <aside className={styles.previewCol}>
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              <Eye size={15} /> {t('menu.forPerson')}
            </h3>
            <select
              className={styles.input}
              value={previewUser}
              onChange={(e) => void loadPreview(e.target.value)}
              aria-label={t('menu.previewAccount')}
            >
              <option value="">{t('menu.pickAccount')}</option>
              {opts.USER.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.sub})
                </option>
              ))}
            </select>
            {previewLayout ? (
              <>
                <p className={styles.meta}>
                  {preview?.profiles.length
                    ? t('menu.receives', { v0: preview.profiles.map((x) => x.name).join(' + ') })
                    : t('menu.superAll')}
                  {dirty && t('menu.saveToApply')}
                </p>
                <SidebarPreview layout={previewLayout} label={label} />
              </>
            ) : (
              <p className={styles.meta}>
                {t('menu.previewHelp1')}
                {t('menu.previewHelp2')}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SidebarPreview({ layout, label }: { layout: MenuLayout; label: (k: string) => string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.sidebar}>
      {layout.groups.map((g, i) => (
        <div key={i} className={styles.sbGroup}>
          <div className={styles.sbLabel}>{g.label}</div>
          {g.items.map((k) => {
            const Icon = menuIcon(menuDef(k));
            return (
              <div key={k} className={styles.sbItem}>
                <Icon size={14} />
                {label(k)}
              </div>
            );
          })}
        </div>
      ))}
      {!layout.groups.length && <p className={styles.meta}>{t('menu.noMenus')}</p>}
    </div>
  );
}
