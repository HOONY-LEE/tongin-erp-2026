import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Button, PageHeader, PageSkeleton, useToast } from '../components/ui';
import { DashboardEditor } from '../components/dashboard/builder/DashboardEditor';
import type { MyDashboard } from './Dashboard';

/** 내 대시보드 꾸미기 — 저장하면 나에게만 적용된다(관리자 템플릿은 그대로) */
export default function DashboardEdit() {
  const navigate = useNavigate();
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

  if (!me || !layout) return <PageSkeleton cards={2} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="내 대시보드 편집"
        subtitle="왼쪽 위젯을 끌어다 놓고, 제목줄을 잡아 옮기고, 모서리로 크기를 바꾸세요. 저장하면 나에게만 적용됩니다."
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!dirty || window.confirm('저장하지 않은 변경을 버릴까요?'))
                  navigate('/dashboard');
              }}
            >
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
          </div>
        }
      />
      <DashboardEditor
        layout={layout}
        permissions={user?.permissions ?? []}
        onChange={(l) => {
          setLayout(l);
          setDirty(true);
        }}
      />
    </div>
  );
}
