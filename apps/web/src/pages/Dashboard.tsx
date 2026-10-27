import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutTemplate, Pencil, RotateCcw } from 'lucide-react';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { openDashboardEditor, useDashEditorMessages } from '../lib/dashboardWindow';
import { useAuth } from '../auth/AuthContext';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { Badge, Button, PageHeader, PageSkeleton, useToast } from '../components/ui';
import { DashboardView } from '../components/dashboard/builder/DashboardView';

export interface MyDashboard {
  source: 'PERSONAL' | 'USER' | 'ROLE' | 'DEFAULT' | 'BUILTIN';
  name: string;
  templateName: string | null;
  canCustomize: boolean;
  hasPersonal: boolean;
  layout: DashLayout;
  baseLayout: DashLayout;
}

const SOURCE_LABEL: Record<MyDashboard['source'], string> = {
  PERSONAL: '내가 꾸민 대시보드',
  USER: '나에게 지정된 대시보드',
  ROLE: '권한 그룹에 지정된 대시보드',
  DEFAULT: '기본 대시보드',
  BUILTIN: '기본 구성',
};

/**
 * 대시보드 — 나에게 보이는 위젯(내가 꾸민 것 → 관리자가 지정한 것 → 기본 구성 순).
 * 위젯마다 내 권한·데이터 범위 안의 숫자만 보인다.
 */
export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [me, setMe] = useState<MyDashboard | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    try {
      setMe(await api<MyDashboard>('/dashboards/me'));
      setRefreshKey((k) => k + 1);
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    }
  }, [toast, touch]);

  useEffect(() => {
    void load();
  }, [load]);

  // 편집 창에서 저장하면 바로 반영
  useDashEditorMessages((m) => {
    if (m.type === 'saved' && m.scope === 'mine') void load();
  });

  const reset = async () => {
    if (!window.confirm('내가 꾸민 대시보드를 지우고 기본으로 되돌릴까요?')) return;
    try {
      setMe(await api<MyDashboard>('/dashboards/me', { method: 'DELETE' }));
      toast({ type: 'success', title: '기본 대시보드로 되돌렸습니다' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '되돌리지 못했습니다' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('dashboard.title')}
        tags={
          me ? (
            <Badge variant="subtle" color={me.source === 'PERSONAL' ? 'primary' : 'neutral'}>
              {SOURCE_LABEL[me.source]}
              {me.source !== 'PERSONAL' && me.templateName ? ` · ${me.templateName}` : ''}
            </Badge>
          ) : undefined
        }
        onRefresh={load}
        updatedAt={updatedAt}
        actions={
          me && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {can('DASHBOARD.READ') && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<LayoutTemplate size={14} />}
                  onClick={() => navigate('/dashboard-admin')}
                >
                  대시보드 관리
                </Button>
              )}
              {me.hasPersonal && me.canCustomize && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<RotateCcw size={14} />}
                  onClick={() => void reset()}
                >
                  기본으로
                </Button>
              )}
              {me.canCustomize ? (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Pencil size={14} />}
                  onClick={() =>
                    openDashboardEditor('/dashboard/edit', 'mine') || navigate('/dashboard/edit')
                  }
                >
                  편집
                </Button>
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--ark-color-text-tertiary)',
                    alignSelf: 'center',
                  }}
                >
                  관리자가 정한 대시보드입니다
                </span>
              )}
            </div>
          )
        }
      />
      {me ? (
        <DashboardView layout={me.layout} refreshKey={refreshKey} />
      ) : (
        <PageSkeleton cards={3} />
      )}
    </div>
  );
}
