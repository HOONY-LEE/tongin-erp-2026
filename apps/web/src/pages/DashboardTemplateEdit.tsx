import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Search } from 'lucide-react';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Button, Checkbox, PageHeader, PageSkeleton, useToast } from '../components/ui';
import { DashboardEditor } from '../components/dashboard/builder/DashboardEditor';
import type { TemplateRow } from './DashboardAdmin';
import styles from '../components/dashboard/builder/builder.module.css';

interface Template {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  allowPersonal: boolean;
  layout: DashLayout;
  roleIds: string[];
  userIds: string[];
}
interface Targets {
  roles: { id: string; name: string }[];
  users: {
    id: string;
    loginId: string;
    name: string;
    orgUnitName: string | null;
    positionName: string | null;
  }[];
}

/**
 * 대시보드 템플릿 편집 — 위젯 배치(WYSIWYG) + 이름·기본 여부·개인 수정 허용 + 누구에게 보일지(권한 그룹·사용자).
 * 한 사람에게는 템플릿 하나만 — 다른 템플릿에 지정돼 있던 대상을 고르면 이 템플릿으로 옮겨진다.
 */
export default function DashboardTemplateEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, can } = useAuth();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [others, setOthers] = useState<TemplateRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');
  const editable = can('DASHBOARD.UPDATE');

  useEffect(() => {
    Promise.all([
      api<Template>(`/dashboards/templates/${id}`),
      api<Targets>('/dashboards/targets'),
      api<TemplateRow[]>('/dashboards/templates'),
    ])
      .then(([t, tg, all]) => {
        setTpl(t);
        setTargets(tg);
        setOthers(all.filter((x) => x.id !== id));
      })
      .catch((e) => {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
        navigate('/dashboard-admin');
      });
  }, [id, navigate, toast]);

  // 다른 템플릿에 지정된 대상 — 고르면 옮겨 온다는 걸 미리 보여 준다
  const elsewhere = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of others) {
      o.roles.forEach((r) => m.set(r.id, o.name));
      o.users.forEach((u) => m.set(u.id, o.name));
    }
    return m;
  }, [others]);

  const patch = (p: Partial<Template>) => {
    setTpl((t) => (t ? { ...t, ...p } : t));
    setDirty(true);
  };
  const toggle = (field: 'roleIds' | 'userIds', tid: string, on: boolean) => {
    if (!tpl) return;
    const set = new Set(tpl[field]);
    if (on) set.add(tid);
    else set.delete(tid);
    patch({ [field]: [...set] } as Partial<Template>);
  };

  const save = async () => {
    if (!tpl) return;
    setSaving(true);
    try {
      await api(`/dashboards/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: tpl.name,
          description: tpl.description,
          layout: tpl.layout,
          isDefault: tpl.isDefault,
          allowPersonal: tpl.allowPersonal,
        }),
      });
      await api(`/dashboards/templates/${id}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds: tpl.roleIds, userIds: tpl.userIds }),
      });
      toast({ type: 'success', title: '템플릿을 저장했습니다 — 지정된 사람들에게 바로 보입니다' });
      setDirty(false);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  if (!tpl || !targets) return <PageSkeleton cards={2} />;
  const users = targets.users.filter((u) => {
    const k = q.trim();
    return (
      !k ||
      [u.name, u.loginId, u.orgUnitName ?? '', u.positionName ?? ''].some((s) => s.includes(k))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={tpl.name || '이름 없는 대시보드'}
        subtitle="대시보드 템플릿 편집"
        icon={
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() =>
              (!dirty || window.confirm('저장하지 않은 변경을 버릴까요?')) &&
              navigate('/dashboard-admin')
            }
            aria-label="목록으로"
          >
            <ArrowLeft size={16} />
          </button>
        }
        actions={
          editable ? (
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              leftIcon={<Save size={14} />}
              onClick={() => void save()}
            >
              저장{dirty ? ' *' : ''}
            </Button>
          ) : undefined
        }
      />

      <div className={styles.settings}>
        <div className={styles.settingsCol}>
          <label className={styles.field}>
            이름
            <input
              className={styles.input}
              value={tpl.name}
              maxLength={60}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            설명
            <input
              className={styles.input}
              value={tpl.description}
              maxLength={300}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
          <Checkbox
            checked={tpl.isDefault}
            onCheckedChange={(v) => patch({ isDefault: v === true })}
            label="기본 템플릿"
            description="지정된 템플릿이 없는 모든 사람에게 이 대시보드를 보여 줍니다(하나만 기본)."
          />
          <Checkbox
            checked={tpl.allowPersonal}
            onCheckedChange={(v) => patch({ allowPersonal: v === true })}
            label="개인 수정 허용"
            description="끄면 받은 사람이 자기 대시보드로 고칠 수 없고 이 화면 그대로 봅니다."
          />
        </div>
        <div className={styles.settingsCol}>
          <div className={styles.field}>
            권한 그룹에 지정
            <div className={styles.checkList}>
              {targets.roles.map((r) => (
                <label key={r.id} className={styles.checkRow}>
                  <Checkbox
                    checked={tpl.roleIds.includes(r.id)}
                    onCheckedChange={(v) => toggle('roleIds', r.id, v === true)}
                  />
                  <span>{r.name}</span>
                  {elsewhere.get(r.id) && !tpl.roleIds.includes(r.id) && (
                    <span className={styles.meta}>현재: {elsewhere.get(r.id)}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.settingsCol}>
          <div className={styles.field}>
            사용자에게 직접 지정{' '}
            <span className={styles.meta}>
              (권한 그룹 지정보다 먼저 적용 · {tpl.userIds.length}명)
            </span>
            <label className={styles.searchBox} style={{ margin: 0 }}>
              <Search size={14} aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="이름·아이디·지점·직책"
                aria-label="사용자 찾기"
              />
            </label>
            <div className={styles.checkList}>
              {users.map((u) => (
                <label key={u.id} className={styles.checkRow}>
                  <Checkbox
                    checked={tpl.userIds.includes(u.id)}
                    onCheckedChange={(v) => toggle('userIds', u.id, v === true)}
                  />
                  <span>{u.name}</span>
                  <span className={styles.meta}>
                    {[u.positionName, u.orgUnitName].filter(Boolean).join(' · ') || u.loginId}
                    {elsewhere.get(u.id) && !tpl.userIds.includes(u.id)
                      ? ` · 현재: ${elsewhere.get(u.id)}`
                      : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DashboardEditor
        layout={tpl.layout}
        permissions={user?.permissions ?? []}
        onChange={(l) => patch({ layout: l })}
      />
    </div>
  );
}
