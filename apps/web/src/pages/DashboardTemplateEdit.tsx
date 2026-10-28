import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Save, Settings2, Trash2 } from 'lucide-react';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { leaveDashboardEditor, postDashEditorMessage } from '../lib/dashboardWindow';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, PageHeader, PageSkeleton, useToast } from '../components/ui';
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
        toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
        toast({ type: 'success', title: '위젯 배치를 저장했습니다' });
      }
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const leave = () =>
    (!dirty || window.confirm('저장하지 않은 변경을 버릴까요?')) &&
    leaveDashboardEditor(() => navigate('/dashboard-admin'));

  // 목록 행 끝에 있던 설정·삭제 — 행을 누르면 이 화면이 열리므로 여기 머리글에 둔다
  const openSettings = () => {
    if (dirty && !window.confirm('저장하지 않은 변경을 버리고 설정으로 갈까요?')) return;
    // 편집 창이면 원래 창이 설정 단계로 넘어가고 이 창은 닫힌다
    postDashEditorMessage({ type: 'next', id });
    leaveDashboardEditor(() => navigate(`/dashboard-admin/${id}/settings`));
  };

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
      setDirty(false);
      // 원래 창의 목록을 새로 불러오게 알린다
      postDashEditorMessage({ type: 'saved', scope: 'template', id });
      leaveDashboardEditor(() => navigate('/dashboard-admin'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
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
              대시보드 관리
            </button>
            <span className={styles.crumbSep}>/</span>
            <input
              className={styles.crumbInput}
              value={tpl.name}
              maxLength={60}
              aria-label="템플릿 이름"
              size={Math.max(8, tpl.name.length + 2)}
              onChange={(e) => {
                setTpl({ ...tpl, name: e.target.value });
                setDirty(true);
              }}
            />
            <span className={styles.crumbSep}>/</span>
            <span>1단계 위젯 배치{dirty ? ' · 저장 안 됨' : ''}</span>
          </>
        }
        actions={
          (editable || canDelete) && (
            <>
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
              {editable && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Settings2 size={14} />}
                  onClick={openSettings}
                >
                  설정
                </Button>
              )}
              {editable && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={saving}
                  leftIcon={<Save size={14} />}
                  onClick={() => void save(false)}
                >
                  저장
                </Button>
              )}
              {editable && (
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  rightIcon={<ArrowRight size={14} />}
                  onClick={() => void save(true)}
                >
                  저장하고 다음
                </Button>
              )}
            </>
          )
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
