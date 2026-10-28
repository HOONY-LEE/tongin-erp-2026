import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Search, Trash2 } from 'lucide-react';
import { DASH_COLORS, dashColorVars } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthContext';
import { Button, Checkbox, PageHeader, PageSkeleton, useToast } from '../components/ui';
import { LayoutThumb } from '../components/dashboard/builder/LayoutThumb';
import type { TemplateRow } from './DashboardAdmin';
import styles from '../components/dashboard/builder/builder.module.css';

interface Template {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  allowPersonal: boolean;
  /** 차트 색 — tongin(통인 테마색) 또는 애플 색 */
  color: string;
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
 * 대시보드 템플릿 — 2단계: 이름·설명, 기본 템플릿, 개인 수정 허용, 누구에게 보일지(권한 그룹·사용자).
 * 한 사람에게는 템플릿 하나 — 다른 템플릿에 지정돼 있던 대상을 고르면 이 템플릿으로 옮겨 온다.
 */
export default function DashboardTemplateSettings() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [tpl, setTpl] = useState<Template | null>(null);
  const dark = useTheme().resolved === 'dark';
  const [targets, setTargets] = useState<Targets | null>(null);
  const [all, setAll] = useState<TemplateRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const editable = can('DASHBOARD.UPDATE');
  const canDelete = can('DASHBOARD.DELETE');

  useEffect(() => {
    Promise.all([
      api<Template>(`/dashboards/templates/${id}`),
      api<Targets>('/dashboards/targets'),
      api<TemplateRow[]>('/dashboards/templates'),
    ])
      .then(([t, tg, rows]) => {
        setTpl(t);
        setTargets(tg);
        setAll(rows);
      })
      .catch((e) => {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
        navigate('/dashboard-admin');
      });
  }, [id, navigate, toast]);

  const elsewhere = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of all) {
      if (o.id === id) continue;
      o.roles.forEach((r) => m.set(r.id, o.name));
      o.users.forEach((u) => m.set(u.id, o.name));
    }
    return m;
  }, [all, id]);
  const preview = all.find((t) => t.id === id)?.preview ?? [];

  const patch = (p: Partial<Template>) => setTpl((t) => (t ? { ...t, ...p } : t));
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
          isDefault: tpl.isDefault,
          allowPersonal: tpl.allowPersonal,
          color: tpl.color,
        }),
      });
      await api(`/dashboards/templates/${id}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds: tpl.roleIds, userIds: tpl.userIds }),
      });
      toast({ type: 'success', title: '저장했습니다 — 지정된 사람들에게 바로 보입니다' });
      navigate('/dashboard-admin');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  // 목록 행 끝에 있던 삭제 — 템플릿 상세(위젯 배치·이 설정 화면) 머리글로 옮겼다
  const remove = async () => {
    if (
      !tpl ||
      !window.confirm(
        `'${tpl.name}' 템플릿을 지울까요? 지정된 사람들은 기본 대시보드를 보게 됩니다.`,
      )
    )
      return;
    try {
      await api(`/dashboards/templates/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '지웠습니다' });
      navigate('/dashboard-admin');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  if (!tpl || !targets) return <PageSkeleton cards={2} />;
  const colorLabel = DASH_COLORS.find((c) => c.key === tpl.color)?.label ?? '통인';
  const seriesPreview = Object.entries(dashColorVars(tpl.color, dark))
    .filter(([k]) => k.startsWith('--dash-series-'))
    .map(([, v]) => v);
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
        title={`${tpl.name} — 공개·지정 설정`}
        subtitle="2단계: 누구에게 이 대시보드를 보여 줄지 정합니다. 볼 수 없는 데이터의 위젯은 사람마다 자동으로 빠집니다."
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Trash2 size={14} />}
                onClick={() => void remove()}
              >
                삭제
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ArrowLeft size={14} />}
              onClick={() => navigate(`/dashboard-admin/${id}`)}
            >
              위젯 배치로
            </Button>
            {editable && (
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                leftIcon={<Check size={14} />}
                onClick={() => void save()}
              >
                저장하고 마치기
              </Button>
            )}
          </div>
        }
      />
      <div className={styles.settingsWrap}>
        <section className={styles.settingsCard}>
          <div className={styles.settingsPreview}>
            <LayoutThumb items={preview} />
          </div>
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
          <div className={styles.field}>
            <span>
              색상 <span className={styles.meta}>· {colorLabel}</span>
            </span>
            <div className={styles.swatches} role="radiogroup" aria-label="대시보드 색상">
              {DASH_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={tpl.color === c.key}
                  aria-label={c.label}
                  title={c.label}
                  className={`${styles.swatch} ${tpl.color === c.key ? styles.swatchOn : ''}`}
                  style={{ background: dark ? c.dark : c.light }}
                  onClick={() => patch({ color: c.key })}
                >
                  {tpl.color === c.key && <Check size={13} strokeWidth={3} />}
                </button>
              ))}
            </div>
            {/* 차트에 실제로 쓰일 색 순서(첫 색 = 고른 색) */}
            <div className={styles.seriesStrip} aria-hidden>
              {seriesPreview.map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </div>
          </div>
          <Checkbox
            checked={tpl.isDefault}
            onCheckedChange={(v) => patch({ isDefault: v === true })}
            label="기본 템플릿"
            description="지정된 템플릿이 없는 모든 사람에게 보여 줍니다(하나만 기본)."
          />
          <Checkbox
            checked={tpl.allowPersonal}
            onCheckedChange={(v) => patch({ allowPersonal: v === true })}
            label="개인 수정 허용"
            description="끄면 받은 사람이 자기 대시보드로 고칠 수 없고 이 화면 그대로 봅니다."
          />
        </section>
        <section className={styles.settingsCard}>
          <b>권한 그룹에 지정</b>
          <span className={styles.meta}>그룹에 속한 사람 모두에게 보입니다.</span>
          <div className={styles.checkList} style={{ maxHeight: 420 }}>
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
        </section>
        <section className={styles.settingsCard}>
          <b>사용자에게 직접 지정</b>
          <span className={styles.meta}>
            권한 그룹 지정보다 먼저 적용됩니다 · {tpl.userIds.length}명 선택
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
          <div className={styles.checkList} style={{ maxHeight: 380 }}>
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
        </section>
      </div>
    </div>
  );
}
