import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, PageHeader, PageSkeleton, useToast } from '../components/ui';
import styles from '../components/dashboard/builder/builder.module.css';
import { DashboardEditor } from '../components/dashboard/builder/DashboardEditor';
import type { MyDashboard } from './Dashboard';

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
          toast({ type: 'warning', title: '관리자가 정한 대시보드라 고칠 수 없습니다' });
          navigate('/dashboard', { replace: true });
          return;
        }
        setMe(m);
        setLayout(m.layout);
      })
      .catch((e) =>
        toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' }),
      );
  }, [navigate, toast]);

  const save = async () => {
    if (!layout) return;
    setSaving(true);
    try {
      await api('/dashboards/me', { method: 'PUT', body: JSON.stringify({ layout }) });
      toast({ type: 'success', title: '내 대시보드를 저장했습니다' });
      setDirty(false);
      navigate('/dashboard');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const leave = () =>
    (!dirty || window.confirm('저장하지 않은 변경을 버릴까요?')) && navigate('/dashboard');

  if (!me || !layout) return <PageSkeleton cards={2} />;
  return (
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
          <b>내 대시보드 편집</b>
          <span>{dirty ? ' · 저장 안 됨' : ' · 저장하면 나에게만 적용'}</span>
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
            기본 구성 불러오기
          </Button>
          <Button variant="outline" size="sm" onClick={leave}>
            취소
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            leftIcon={<Save size={14} />}
            onClick={() => void save()}
          >
            저장
          </Button>
        </>
      }
      heading={
        <PageHeader
          title={t('dashboard.title')}
          // 실제 화면의 버튼 줄과 높이를 맞춘다(위젯이 같은 높이에서 시작하도록)
          actions={<span style={{ display: 'block', height: 32 }} />}
          tags={
            <Badge variant="subtle" color="primary">
              내가 꾸민 대시보드
            </Badge>
          }
        />
      }
    />
  );
}
