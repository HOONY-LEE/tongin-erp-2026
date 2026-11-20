import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { leaveDashboardEditor, postDashEditorMessage } from '../lib/dashboardWindow';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, PageHeader, PageSkeleton, PopoutButton, useToast } from '../components/ui';
import styles from '../components/dashboard/builder/builder.module.css';
import { DashboardEditor } from '../components/dashboard/builder/DashboardEditor';
import type { MyDashboard } from './Dashboard';
import { DashColorScope } from '../components/dashboard/DashColorScope';

/** 내 대시보드 꾸미기 — 저장하면 나에게만 적용된다(관리자 템플릿은 그대로) */
export default function DashboardEdit() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [me, setMe] = useState<MyDashboard | null>(null);
  const [layout, setLayout] = useState<DashLayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api<MyDashboard>('/dashboards/me')
      .then((m) => {
        if (!m.canCustomize) {
          toast({ type: 'warning', title: t('dash.lockedByAdmin') });
          navigate('/dashboard', { replace: true });
          return;
        }
        setMe(m);
        setLayout(m.layout);
      })
      .catch((e) =>
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.loadFailed') }),
      );
  }, [navigate, toast]);

  const save = async () => {
    if (!layout) return;
    setSaving(true);
    try {
      await api('/dashboards/me', { method: 'PUT', body: JSON.stringify({ layout }) });
      toast({ type: 'success', title: t('dash.mySaved') });
      setDirty(false);
      postDashEditorMessage({ type: 'saved', scope: 'mine' });
      leaveDashboardEditor(() => navigate('/dashboard'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const leave = () =>
    (!dirty || window.confirm(t('dash.discardQ'))) &&
    leaveDashboardEditor(() => navigate('/dashboard'));

  if (!me || !layout) return <PageSkeleton cards={2} />;
  return (
    <DashColorScope color={me?.color}>
      <DashboardEditor
        layout={layout}
        permissions={user?.permissions ?? []}
        onChange={(l) => {
          setLayout(l);
          setDirty(true);
        }}
        onBack={leave}
        crumbs={
          <>
            <button type="button" onClick={leave}>
              {t('dashboard.title')}
            </button>
            <span className={styles.crumbSep}>/</span>
            <b>{t('dash.editMine')}</b>
            <span>{dirty ? t('dash.unsaved') : t('dash.onlyMe')}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLayout(me.baseLayout);
                setDirty(true);
              }}
            >
              {t('dash.loadPreset')}
            </Button>
            <Button variant="outline" size="sm" onClick={leave}>
              {t('dash.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              leftIcon={<Save size={14} />}
              onClick={() => void save()}
            >
              {t('dash.save')}
            </Button>
            <PopoutButton />
          </>
        }
        heading={
          <PageHeader
            title={t('dashboard.title')}
            // 실제 화면의 버튼 줄과 높이를 맞춘다(위젯이 같은 높이에서 시작하도록)
            actions={<span style={{ display: 'block', height: 32 }} />}
            tags={
              <Badge variant="subtle" color="primary">
                {t('dash.src.mine')}
              </Badge>
            }
          />
        }
      />
    </DashColorScope>
  );
}
