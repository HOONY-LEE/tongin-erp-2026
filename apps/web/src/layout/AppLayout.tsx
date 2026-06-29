import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  TrendingUp,
  Sparkles,
  LifeBuoy,
  Megaphone,
  Wallet,
  Receipt,
  Users,
  Package,
  ShoppingCart,
  UserRound,
  Tag,
  BookOpen,
  Building2,
  LogOut,
} from 'lucide-react';
import {
  LayoutSidebar,
  SidebarGroup,
  SidebarItem,
  EditorTabs,
  Button,
  type EditorTab,
} from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { LangSwitch, ThemeSwitch } from '../components/Switchers';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: string;
}
interface NavGroup {
  label?: string;
  items: NavItem[];
}

const COLLAPSE_KEY = 'tongin_sidebar_collapsed';

export default function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  const setCol = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  };

  const groups: NavGroup[] = [
    {
      items: [
        { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, perm: 'STATS.READ' },
        { to: '/leads', label: t('nav.leads'), icon: TrendingUp, perm: 'LEAD.READ' },
      ],
    },
    {
      label: t('navGroup.service'),
      items: [
        {
          to: '/service-orders',
          label: t('nav.serviceOrders'),
          icon: Sparkles,
          perm: 'SERVICE_ORDER.READ',
        },
        { to: '/support', label: t('nav.support'), icon: LifeBuoy, perm: 'SUPPORT.READ' },
        { to: '/campaigns', label: t('nav.campaigns'), icon: Megaphone, perm: 'MARKETING.READ' },
      ],
    },
    {
      label: t('navGroup.finance'),
      items: [
        { to: '/settlements', label: t('nav.settlement'), icon: Wallet, perm: 'SETTLEMENT.READ' },
        { to: '/billing', label: t('nav.billing'), icon: Receipt, perm: 'BILLING.READ' },
        { to: '/hr', label: t('nav.hr'), icon: Users, perm: 'HR.READ' },
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
      label: t('navGroup.master'),
      items: [
        { to: '/customers', label: t('nav.customers'), icon: UserRound, perm: 'CUSTOMER.READ' },
        { to: '/products', label: t('nav.products'), icon: Tag, perm: 'PRODUCT.READ' },
        { to: '/cbm-items', label: t('nav.cbmItems'), icon: BookOpen, perm: 'CBM_ITEM.READ' },
        { to: '/org-units', label: t('nav.orgUnits'), icon: Building2, perm: 'ORG_UNIT.READ' },
      ],
    },
  ];

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || can(it.perm)) }))
    .filter((g) => g.items.length > 0);
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  // ── 헤더 멀티탭 (workone EditorTabs) — 방문한 메뉴를 탭으로 누적 ──
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
    const next = openTabs.filter((t) => t !== id);
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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <LayoutSidebar
        collapsed={collapsed}
        onCollapse={() => setCol(true)}
        onExpand={() => setCol(false)}
        style={{
          position: 'relative',
          zIndex: 2,
          boxShadow: '4px 0 24px rgba(15, 23, 42, 0.06), 1px 0 0 rgba(15, 23, 42, 0.04)',
        }}
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
                width: 28,
                height: 28,
                borderRadius: 8,
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
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
                  {user?.loginId}
                </span>
                <LogOut size={14} style={{ color: 'var(--ark-color-text-disabled)' }} />
              </>
            )}
          </div>
        }
      >
        {visibleGroups.map((g, gi) => (
          <SidebarGroup key={g.label ?? `g${gi}`} label={collapsed ? undefined : g.label}>
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px',
            borderBottom: '1px solid var(--ark-color-gray-200)',
            background: 'var(--ark-color-bg)',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <EditorTabs
              tabs={editorTabs}
              activeId={activeHref}
              onTabChange={(id) => navigate(id)}
              onTabClose={closeTab}
              onTabAdd={addTab}
              size="sm"
            />
          </div>
          <div style={{ flexShrink: 0, width: 140 }}>
            <LangSwitch />
          </div>
          <div style={{ flexShrink: 0, width: 120 }}>
            <ThemeSwitch />
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            {t('common.logout')}
          </Button>
        </header>
        <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
