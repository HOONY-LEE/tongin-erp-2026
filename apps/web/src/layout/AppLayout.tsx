import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Inbox,
  Banknote,
  LifeBuoy,
  Megaphone,
  Package,
  ShoppingCart,
  UserRound,
  Tag,
  Building2,
  Store,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import {
  LayoutSidebar,
  SidebarGroup,
  SidebarItem,
  EditorTabs,
  ThemeToggle,
  NotificationBell,
  type EditorTab,
  type NotificationBellItem,
} from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { api } from '../lib/api';
import styles from './AppLayout.module.css';

type NavItem = { to: string; label: string; icon: LucideIcon; perm?: string };
type NavGroup = { label?: string; items: NavItem[] };

const COLLAPSE_KEY = 'tongin_sidebar_collapsed';

interface NotiRow {
  id: string;
  eventType: string;
  message: string;
  sentAt: string;
}

export default function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();
  const { resolved, setMode } = useTheme();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  const setCol = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  };

  const groups: NavGroup[] = [
    {
      label: t('navGroup.ops'),
      items: [
        { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, perm: 'STATS.READ' },
        { to: '/leads', label: t('nav.leads'), icon: Inbox, perm: 'LEAD.READ' },
        {
          to: '/payments-confirm',
          label: t('nav.paymentsConfirm'),
          icon: Banknote,
          perm: 'PAYMENT.READ',
        },
        { to: '/support', label: t('nav.support'), icon: LifeBuoy, perm: 'SUPPORT.READ' },
        { to: '/campaigns', label: t('nav.campaigns'), icon: Megaphone, perm: 'MARKETING.READ' },
      ],
    },
    {
      label: t('navGroup.materials'),
      items: [
        { to: '/materials', label: t('nav.materials'), icon: Package, perm: 'MATERIAL.READ' },
        {
          to: '/material-orders',
          label: t('nav.materialOrders'),
          icon: ShoppingCart,
          perm: 'MATERIAL_ORDER.READ',
        },
      ],
    },
    {
      label: t('navGroup.admin'),
      items: [
        { to: '/customers', label: t('nav.customers'), icon: UserRound, perm: 'CUSTOMER.READ' },
        { to: '/product-mgmt', label: t('nav.productMgmt'), icon: Tag, perm: 'PRODUCT.READ' },
        { to: '/org-mgmt', label: t('nav.orgMgmt'), icon: Building2, perm: 'ORG_UNIT.READ' },
        { to: '/branches', label: t('nav.branches'), icon: Store, perm: 'ORG_UNIT.READ' },
        { to: '/accounts', label: t('nav.accounts'), icon: ShieldCheck, perm: 'USER.READ' },
      ],
    },
  ];

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || can(it.perm)) }))
    .filter((g) => g.items.length > 0);
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  // ── 헤더 멀티탭 ──
  const allItems = visibleGroups.flatMap((g) => g.items);
  const matched = allItems
    .filter((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const activeHref = matched?.to ?? '/';

  const [openTabs, setOpenTabs] = useState<string[]>([activeHref]);
  useEffect(() => {
    setOpenTabs((prev) => (prev.includes(activeHref) ? prev : [...prev, activeHref]));
  }, [activeHref]);

  const editorTabs: EditorTab[] = openTabs
    .map((href) => {
      const it = allItems.find((i) => i.to === href);
      return it
        ? { id: href, label: it.label, icon: <it.icon size={14} />, closable: openTabs.length > 1 }
        : null;
    })
    .filter(Boolean) as EditorTab[];

  const closeTab = (id: string) => {
    const next = openTabs.filter((t2) => t2 !== id);
    if (next.length === 0) return;
    setOpenTabs(next);
    if (activeHref === id) navigate(next[next.length - 1]);
  };
  const addTab = () => {
    const closed = allItems.filter((i) => !openTabs.includes(i.to));
    if (closed.length === 0) return;
    setOpenTabs((prev) => [...prev, closed[0].to]);
    navigate(closed[0].to);
  };

  // ── 알림 벨 (notification 기록 표시) ──
  const [notis, setNotis] = useState<NotificationBellItem[]>([]);
  const loadNotis = useCallback(async () => {
    if (!can('NOTIFICATION.READ')) return;
    try {
      const rows = await api<NotiRow[]>('/notifications');
      setNotis(
        rows.slice(0, 20).map((n) => ({
          id: n.id,
          title: n.eventType,
          message: n.message,
          timestamp: n.sentAt,
          read: false,
          type: 'info' as const,
        })),
      );
    } catch {
      /* 권한/네트워크 실패 시 무시 */
    }
  }, [can]);
  useEffect(() => {
    void loadNotis();
  }, [loadNotis]);
  const unread = notis.filter((n) => !n.read).length;

  return (
    <div className={`${styles.desktopLayout} ${collapsed ? styles.collapsed : ''}`}>
      {/* 상단 풀폭 헤더 */}
      <header className={styles.topHeader}>
        <div className={styles.headerLeft} />
        <div className={styles.headerCenter}>
          <EditorTabs
            tabs={editorTabs}
            activeId={activeHref}
            onTabChange={(id) => navigate(id)}
            onTabClose={closeTab}
            onTabAdd={addTab}
            size="sm"
          />
        </div>
        <div className={styles.headerRight}>
          <ThemeToggle theme={resolved} size="sm" onChange={(th) => setMode(th)} />
          <NotificationBell
            count={unread}
            notifications={notis}
            size="sm"
            emptyMessage={t('noti.empty')}
            onMarkAllRead={() => setNotis((prev) => prev.map((n) => ({ ...n, read: true })))}
            onClear={() => setNotis([])}
          />
        </div>
      </header>

      {/* 메인: 고정 사이드바 + 콘텐츠 */}
      <div className={styles.mainArea}>
        <aside className={styles.sidebarWrap}>
          <LayoutSidebar
            collapsed={collapsed}
            onCollapse={() => setCol(true)}
            onExpand={() => setCol(false)}
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'var(--ark-color-primary-500)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  통
                </div>
                {!collapsed && <span style={{ fontWeight: 700, fontSize: 15 }}>통인 ERP</span>}
              </div>
            }
            footer={
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                onClick={logout}
                title={t('common.logout')}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    background: 'var(--ark-color-gray-200)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UserRound size={16} />
                </div>
                {!collapsed && (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.loginId}</div>
                      <div style={{ fontSize: 11, color: 'var(--ark-color-text-secondary)' }}>
                        {t('common.logout')}
                      </div>
                    </div>
                    <LogOut size={14} style={{ color: 'var(--ark-color-text-disabled)' }} />
                  </>
                )}
              </div>
            }
          >
            {visibleGroups.map((g, gi) => (
              <SidebarGroup
                key={g.label ?? `g${gi}`}
                label={collapsed ? undefined : g.label}
                collapsible={!collapsed}
                defaultOpen
              >
                {g.items.map((it) => (
                  <SidebarItem
                    key={it.to}
                    icon={<it.icon size={16} />}
                    active={isActive(it.to)}
                    tooltip={collapsed ? it.label : undefined}
                    onClick={() => navigate(it.to)}
                  >
                    {it.label}
                  </SidebarItem>
                ))}
              </SidebarGroup>
            ))}
          </LayoutSidebar>
        </aside>

        <main className={styles.contentArea}>
          <div style={{ padding: 24 }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
