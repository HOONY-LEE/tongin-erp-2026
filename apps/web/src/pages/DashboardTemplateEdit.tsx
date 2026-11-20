import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Save, Settings2, Trash2 } from 'lucide-react';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { leaveDashboardEditor, postDashEditorMessage } from '../lib/dashboardWindow';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, PageHeader, PageSkeleton, PopoutButton, useToast } from '../components/ui';
import { DashboardEditor } from '../components/dashboard/builder/DashboardEditor';
import styles from '../components/dashboard/builder/builder.module.css';
import { DashColorScope } from '../components/dashboard/DashColorScope';

interface Template {
  id: string;
  name: string;
  layout: DashLayout;
  color?: string;
}

/**
 * 대시보드 템플릿 — 1단계: 위젯과 실제 화면만(전체 화면 편집, 이름은 상단 경로에서 바로 고친다).
 * 누구에게 보일지·기본 여부·개인 수정은 '저장하고 다음'에서(2단계 설정 화면).
 */
export default function DashboardTemplateEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const { user, can } = useAuth();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editable = can('DASHBOARD.UPDATE');
  const canDelete = can('DASHBOARD.DELETE');

  useEffect(() => {
    api<Template>(`/dashboards/templates/${id}`)
      .then(setTpl)
      .catch((e) => {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.loadFailed') });
        navigate('/dashboard-admin');
      });
  }, [id, navigate, toast]);

  const save = async (next: boolean) => {
    if (!tpl) return;
    setSaving(true);
    try {
      await api(`/dashboards/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: tpl.name, layout: tpl.layout }),
      });
      setDirty(false);
      if (next) {
        // 편집 창이면 원래 창이 설정 단계로 넘어가고 이 창은 닫힌다
        postDashEditorMessage({ type: 'next', id });
        leaveDashboardEditor(() => navigate(`/dashboard-admin/${id}/settings`));
      } else {
        postDashEditorMessage({ type: 'saved', scope: 'template', id });
        toast({ type: 'success', title: t('dash.layoutSaved') });
      }
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const leave = () =>
    (!dirty || window.confirm(t('dash.discardQ'))) &&
    leaveDashboardEditor(() => navigate('/dashboard-admin'));

  // 목록 행 끝에 있던 설정·삭제 — 행을 누르면 이 화면이 열리므로 여기 머리글에 둔다
  const openSettings = () => {
    if (dirty && !window.confirm(t('dash.discardToSettings'))) return;
    // 편집 창이면 원래 창이 설정 단계로 넘어가고 이 창은 닫힌다
    postDashEditorMessage({ type: 'next', id });
    leaveDashboardEditor(() => navigate(`/dashboard-admin/${id}/settings`));
  };

  const remove = async () => {
    if (!tpl || !window.confirm(t('dash.deleteQ', { v0: tpl.name }))) return;
    try {
      await api(`/dashboards/templates/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('dash.deleted') });
      setDirty(false);
      // 원래 창의 목록을 새로 불러오게 알린다
      postDashEditorMessage({ type: 'saved', scope: 'template', id });
      leaveDashboardEditor(() => navigate('/dashboard-admin'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.deleteFailed') });
    }
  };

  if (!tpl) return <PageSkeleton cards={2} />;
  return (
    <DashColorScope color={tpl.color}>
      <DashboardEditor
        layout={tpl.layout}
        permissions={user?.permissions ?? []}
        onChange={(l) => {
          setTpl({ ...tpl, layout: l });
          setDirty(true);
        }}
        onBack={leave}
        crumbs={
          <>
            <button type="button" onClick={leave}>
              {t('dash.manage')}
            </button>
            <span className={styles.crumbSep}>/</span>
            <input
              className={styles.crumbInput}
              value={tpl.name}
              maxLength={60}
              aria-label={t('dash.templateName')}
              size={Math.max(8, tpl.name.length + 2)}
              onChange={(e) => {
                setTpl({ ...tpl, name: e.target.value });
                setDirty(true);
              }}
            />
            <span className={styles.crumbSep}>/</span>
            <span>
              {t('dash.step1')}
              {dirty ? t('dash.unsaved') : ''}
            </span>
          </>
        }
        actions={
          <>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Trash2 size={14} />}
                onClick={() => void remove()}
              >
                {t('dash.delete')}
              </Button>
            )}
            {editable && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Settings2 size={14} />}
                onClick={openSettings}
              >
                {t('dash.settingsBtn')}
              </Button>
            )}
            {editable && (
              <Button
                variant="outline"
                size="sm"
                loading={saving}
                disabled={!tpl.name.trim() || saving}
                leftIcon={<Save size={14} />}
                onClick={() => void save(false)}
              >
                {t('dash.save')}
              </Button>
            )}
            {editable && (
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                disabled={!tpl.name.trim() || saving}
                rightIcon={<ArrowRight size={14} />}
                onClick={() => void save(true)}
              >
                {t('dash.saveNext')}
              </Button>
            )}
            <PopoutButton />
          </>
        }
        heading={
          <PageHeader
            title={t('dashboard.title')}
            // 실제 화면의 버튼 줄과 높이를 맞춘다(위젯이 같은 높이에서 시작하도록)
            actions={<span style={{ display: 'block', height: 32 }} />}
            tags={
              <Badge variant="subtle" color="neutral">
                {tpl.name}
              </Badge>
            }
          />
        }
      />
    </DashColorScope>
  );
}
