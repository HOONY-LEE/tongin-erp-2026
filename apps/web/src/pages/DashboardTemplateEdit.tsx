import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Button, PageSkeleton, useToast } from '../components/ui';
import { DashboardEditor } from '../components/dashboard/builder/DashboardEditor';
import styles from '../components/dashboard/builder/builder.module.css';

interface Template {
  id: string;
  name: string;
  layout: DashLayout;
}

/**
 * 대시보드 템플릿 — 1단계: 위젯과 실제 화면만(이름은 위에서 바로 고친다).
 * 누구에게 보일지·기본 여부·개인 수정은 '저장하고 다음'에서(2단계 설정 화면).
 */
export default function DashboardTemplateEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, can } = useAuth();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editable = can('DASHBOARD.UPDATE');

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
      if (next) navigate(`/dashboard-admin/${id}/settings`);
      else toast({ type: 'success', title: '위젯 배치를 저장했습니다' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  if (!tpl) return <PageSkeleton cards={2} />;
  return (
    <div className={styles.editPage}>
      <div className={styles.editHead}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() =>
            (!dirty || window.confirm('저장하지 않은 변경을 버릴까요?')) &&
            navigate('/dashboard-admin')
          }
          aria-label="목록으로"
          title="목록으로"
        >
          <ArrowLeft size={16} />
        </button>
        <div className={styles.editTitle}>
          <input
            className={styles.nameInput}
            value={tpl.name}
            maxLength={60}
            aria-label="템플릿 이름"
            onChange={(e) => {
              setTpl({ ...tpl, name: e.target.value });
              setDirty(true);
            }}
          />
          <span className={styles.meta}>
            1단계 위젯 배치 · 2단계 공개·지정 설정{dirty ? ' · 저장 안 됨' : ''}
          </span>
        </div>
        <span className={styles.spacer} />
        {editable && (
          <>
            <Button
              variant="outline"
              size="sm"
              loading={saving}
              leftIcon={<Save size={14} />}
              onClick={() => void save(false)}
            >
              저장
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              rightIcon={<ArrowRight size={14} />}
              onClick={() => void save(true)}
            >
              저장하고 다음
            </Button>
          </>
        )}
      </div>
      <DashboardEditor
        layout={tpl.layout}
        permissions={user?.permissions ?? []}
        onChange={(l) => {
          setTpl({ ...tpl, layout: l });
          setDirty(true);
        }}
      />
    </div>
  );
}
