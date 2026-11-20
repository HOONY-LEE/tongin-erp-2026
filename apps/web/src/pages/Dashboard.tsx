import i18n from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, LayoutTemplate, Pencil, RotateCcw, Settings } from 'lucide-react';
import { Menu } from '@sunghoon_lee/akron-ui';
import type { DashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { openDashboardEditor, useDashEditorMessages } from '../lib/dashboardWindow';
import { useAuth } from '../auth/AuthContext';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { downloadDashboardPdf } from '../lib/dashboardPdf';
import { Badge, PageHeader, PageSkeleton, useToast } from '../components/ui';
import { DashboardView } from '../components/dashboard/builder/DashboardView';
import { DashColorScope } from '../components/dashboard/DashColorScope';

export interface MyDashboard {
  source: 'PERSONAL' | 'USER' | 'ROLE' | 'DEFAULT' | 'BUILTIN';
  name: string;
  templateName: string | null;
  canCustomize: boolean;
  hasPersonal: boolean;
  layout: DashLayout;
  baseLayout: DashLayout;
  /** 차트 색(템플릿 색) */
  color?: string;
}

const SOURCE_LABEL: Record<MyDashboard['source'], string> = {
  PERSONAL: i18n.t('dash.src.mine'),
  USER: i18n.t('dash.src.user'),
  ROLE: i18n.t('dash.src.role'),
  DEFAULT: i18n.t('dash.src.default'),
  BUILTIN: i18n.t('dash.src.preset'),
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.loadFailed') });
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
    if (!window.confirm(t('dash.resetQ'))) return;
    try {
      setMe(await api<MyDashboard>('/dashboards/me', { method: 'DELETE' }));
      toast({ type: 'success', title: t('dash.resetDone') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.resetFailed') });
    }
  };

  // PDF로 받기 — 화면 그대로(버튼 빼고) A4 가로에 넣어 내려받는다. 받은 파일을 열어 인쇄
  const pageRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const savePdf = async () => {
    if (!pageRef.current || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadDashboardPdf(pageRef.current, t('dashboard.title'));
    } catch {
      toast({ type: 'error', title: t('dash.pdfFailed') });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div ref={pageRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
        trailing={
          me && (
            <span data-pdf-skip style={{ display: 'contents' }}>
              <button
                type="button"
                className="header-icon-btn"
                aria-label={t('dash.pdf')}
                title={t('dash.pdfTip')}
                disabled={pdfBusy}
                onClick={() => void savePdf()}
              >
                <Download size={14} className={pdfBusy ? 'ark-spin' : undefined} />
              </button>
              <Menu
                placement="bottom-end"
                items={[
                  ...(can('DASHBOARD.READ')
                    ? [
                        {
                          label: t('dash.manage'),
                          icon: <LayoutTemplate size={15} />,
                          onClick: () => navigate('/dashboard-admin'),
                        },
                      ]
                    : []),
                  {
                    label: me.canCustomize ? t('dash.edit') : t('dash.editLocked'),
                    icon: <Pencil size={15} />,
                    disabled: !me.canCustomize,
                    onClick: () =>
                      openDashboardEditor('/dashboard/edit', 'mine') || navigate('/dashboard/edit'),
                  },
                  ...(me.hasPersonal && me.canCustomize
                    ? [
                        { type: 'separator' as const },
                        {
                          label: t('dash.reset'),
                          icon: <RotateCcw size={15} />,
                          onClick: () => void reset(),
                        },
                      ]
                    : []),
                ]}
                trigger={
                  <button
                    type="button"
                    className="header-icon-btn"
                    aria-label={t('dash.settings')}
                    title={t('dash.settings')}
                  >
                    <Settings size={14} />
                  </button>
                }
              />
            </span>
          )
        }
      />
      {me ? (
        <DashColorScope color={me.color}>
          <DashboardView layout={me.layout} refreshKey={refreshKey} />
        </DashColorScope>
      ) : (
        <PageSkeleton cards={3} />
      )}
    </div>
  );
}
