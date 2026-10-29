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
  ORG: '그 조직과 하위 조직 직원 모두',
  ROLE: '그 권한 그룹을 가진 계정',
  POSITION: '그 직책의 직원(예: 대표이사)',
  USER: '특정 계정 한 명',
};

/** 메뉴 관리 — 팀(소속)·권한 그룹·직책·개인별 사이드바 메뉴 구성 */
export default function MenuMgmt() {
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
        title: e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다',
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
      title: '구성 이름',
      dataIndex: 'name',
      minWidth: 160,
      render: (r) => (
        <span className={styles.nameCell}>
          {String(r.name)}
          {r.isDefault ? (
            <Badge variant="subtle" color="primary" size="sm">
              기본
            </Badge>
          ) : null}
        </span>
      ),
    },
    { title: '적용 대상', dataIndex: 'targetText', minWidth: 220, flex: 1 },
    {
      title: '메뉴',
      dataIndex: 'menuCount',
      width: 80,
      numeric: true,
      render: (r) => `${String(r.menuCount)}개`,
    },
    { title: '묶음', dataIndex: 'groupText', minWidth: 220, flex: 1 },
    { title: '우선순위', dataIndex: 'priority', width: 90, numeric: true },
    {
      title: '상태',
      width: 80,
      render: (r) =>
        r.isActive ? (
          <Badge variant="subtle" color="success" size="sm">
            사용
          </Badge>
        ) : (
          <Badge variant="subtle" color="neutral" size="sm">
            중지
          </Badge>
        ),
      exportValue: (r) => (r.isActive ? '사용' : '중지'),
    },
  ];
  const tableRows = (rows ?? []).map((p) => ({
    ...p,
    targetText:
      p.isDefault && !p.targets.length
        ? '어느 구성에도 걸리지 않는 계정'
        : p.targets.map((t) => `${MENU_TARGET_LABEL[t.kind]}: ${t.name}`).join(', ') || '대상 없음',
    groupText: p.layout.groups.map((g) => g.label).join(' · '),
  }));

  const createFields: FormField[] = [
    { name: 'name', label: '구성 이름', required: true, placeholder: '예: 고객관리팀' },
    { name: 'description', label: '설명', placeholder: '이 팀이 주로 하는 일' },
  ];
  const onCreate = async (v: Record<string, unknown>) => {
    const p = await api<Profile>('/menus/profiles', {
      method: 'POST',
      body: JSON.stringify({
        name: v.name,
        description: v.description || null,
        layout: { groups: [{ label: '홈', items: ['dashboard', 'notices', 'tasks'] }] },
      }),
    });
    setCreateOpen(false);
    openDetail(p.id);
  };

  return (
    <ListPage
      title="메뉴 관리"
      subtitle="팀(소속)·권한 그룹·직책별로 사이드바에 보일 메뉴와 순서를 정합니다. 권한이 없는 메뉴는 구성에 있어도 보이지 않습니다."
    >
      <DataTable
        columns={columns}
        rows={tableRows as unknown as Row[]}
        loading={rows === null}
        onRowClick={(r) => openDetail(String(r.id))}
        toolbarActions={
          can('MENU.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              + 새 메뉴 구성
            </Button>
          ) : undefined
        }
      />
      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="새 메뉴 구성"
        size="md"
        fields={createFields}
        onSubmit={onCreate}
      />
    </ListPage>
  );
}

function ProfileDetail({ id, onBack }: { id: string; onBack: () => void }) {
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
        toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
      const ORDER: Record<string, number> = { GROUP: 0, COMPANY: 1, DEPT: 2, BRANCH: 3 };
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
                  sub: x.type === 'BRANCH' ? '지점' : x.type === 'DEPT' ? '부서' : '회사·그룹',
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
        title: `저장했습니다 — 적용 계정 ${row.userCount ?? 0}명의 메뉴가 바로 바뀝니다`,
      });
      if (previewUser) void loadPreview(previewUser);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (
      !p ||
      !window.confirm(
        `'${p.name}' 구성을 지울까요? 적용 대상은 다른 구성(없으면 기본 구성)의 메뉴를 보게 됩니다.`,
      )
    )
      return;
    try {
      await api(`/menus/profiles/${id}`, { method: 'DELETE' });
      notifyMenuChanged();
      toast({ type: 'success', title: '지웠습니다' });
      onBack();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
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
        title: e instanceof ApiError ? e.message : '미리보기를 불러오지 못했습니다',
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
        title={p.name || '이름 없음'}
        breadcrumbs={[{ label: '메뉴 관리', onClick: onBack }]}
        actions={
          editable ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {can('MENU.DELETE') && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 size={14} />}
                  disabled={p.isDefault}
                  title={p.isDefault ? '기본 구성은 지울 수 없습니다' : undefined}
                  onClick={() => void remove()}
                >
                  삭제
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
                저장
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>기본 정보</h3>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>
                  구성 이름 <b className={styles.req}>*</b>
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
                <span>우선순위</span>
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
                <span>설명</span>
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
              한 사람에게 구성이 여러 개 걸리면 우선순위 숫자가 작은 구성의 묶음·순서를 먼저 따르고,
              나머지 구성의 메뉴를 뒤에 붙입니다.
            </p>
            <div className={styles.checks}>
              <Checkbox
                checked={p.isActive}
                disabled={!editable}
                onCheckedChange={(v) => patch((x) => ({ ...x, isActive: v === true }))}
                label="사용"
                description="끄면 이 구성은 아무에게도 적용되지 않습니다."
              />
              <Checkbox
                checked={p.isDefault}
                disabled={!editable}
                onCheckedChange={(v) => patch((x) => ({ ...x, isDefault: v === true }))}
                label="기본 구성"
                description="어느 구성에도 걸리지 않는 계정이 이 메뉴를 봅니다(하나만)."
              />
            </div>
          </section>

          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              적용 대상
              {p.userCount !== undefined && (
                <span className={styles.meta}>저장 기준 계정 {p.userCount}명</span>
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
                      {mine.map((t) => (
                        <span key={t.targetId} className={styles.chip}>
                          {t.name}
                          {editable && (
                            <button
                              type="button"
                              aria-label={`${t.name} 빼기`}
                              onClick={() => {
                                setTargets((ts) =>
                                  ts.filter((x) => !(x.kind === kind && x.targetId === t.targetId)),
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
                          aria-label={`${MENU_TARGET_LABEL[kind]} 추가`}
                          onChange={(e) => {
                            const o = opts[kind].find((x) => x.id === e.target.value);
                            if (!o) return;
                            setTargets((ts) => [...ts, { kind, targetId: o.id, name: o.name }]);
                            setDirty(true);
                          }}
                        >
                          <option value="">+ 추가</option>
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
              메뉴 구성
              <span className={styles.meta}>
                끌어서 순서를 바꾸고, 오른쪽에서 메뉴를 넣고 뺍니다
              </span>
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
              <Eye size={15} /> 이 사람에게는 이렇게
            </h3>
            <select
              className={styles.input}
              value={previewUser}
              onChange={(e) => void loadPreview(e.target.value)}
              aria-label="미리 볼 계정"
            >
              <option value="">계정 고르기</option>
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
                    ? `받는 구성: ${preview.profiles.map((x) => x.name).join(' + ')}`
                    : '슈퍼관리자 — 전체 메뉴'}
                  {dirty && ' · 저장해야 반영됩니다'}
                </p>
                <SidebarPreview layout={previewLayout} label={label} />
              </>
            ) : (
              <p className={styles.meta}>
                계정을 고르면 그 사람의 권한·소속·직책·개인 설정까지 반영한 실제 사이드바를 보여
                줍니다.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SidebarPreview({ layout, label }: { layout: MenuLayout; label: (k: string) => string }) {
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
      {!layout.groups.length && <p className={styles.meta}>보이는 메뉴가 없습니다</p>}
    </div>
  );
}
