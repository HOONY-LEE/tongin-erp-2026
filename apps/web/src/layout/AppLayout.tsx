import { AppShell, Button } from '../components/ui';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { LangSwitch, ThemeSwitch } from '../components/Switchers';

interface NavItem {
  to: string;
  label: string;
  perm?: string;
}
interface NavGroup {
  label?: string; // 없으면 헤더 없는 단독 그룹(대시보드)
  items: NavItem[];
}

function Sidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { can } = useAuth();

  const groups: NavGroup[] = [
    { items: [{ to: '/', label: t('nav.dashboard'), perm: 'STATS.READ' }] },
    {
      label: t('navGroup.sales'),
      items: [
        { to: '/leads', label: t('nav.leads'), perm: 'LEAD.READ' },
        { to: '/estimates', label: t('nav.estimates'), perm: 'ESTIMATE.READ' },
        { to: '/contracts', label: t('nav.contracts'), perm: 'CONTRACT.READ' },
        { to: '/work-orders', label: t('nav.workOrders'), perm: 'WORK_ORDER.READ' },
      ],
    },
    {
      label: t('navGroup.service'),
      items: [
        { to: '/service-orders', label: t('nav.serviceOrders'), perm: 'SERVICE_ORDER.READ' },
        { to: '/support', label: t('nav.support'), perm: 'SUPPORT.READ' },
      ],
    },
    {
      label: t('navGroup.finance'),
      items: [
        { to: '/settlements', label: t('nav.settlement'), perm: 'SETTLEMENT.READ' },
        { to: '/billing', label: t('nav.billing'), perm: 'BILLING.READ' },
      ],
    },
    {
      label: t('navGroup.materials'),
      items: [
        { to: '/materials', label: t('nav.materials'), perm: 'MATERIAL.READ' },
        { to: '/material-orders', label: t('nav.materialOrders'), perm: 'MATERIAL_ORDER.READ' },
      ],
    },
    {
      label: t('navGroup.master'),
      items: [
        { to: '/customers', label: t('nav.customers'), perm: 'CUSTOMER.READ' },
        { to: '/products', label: t('nav.products'), perm: 'PRODUCT.READ' },
        { to: '/cbm-items', label: t('nav.cbmItems'), perm: 'CBM_ITEM.READ' },
        { to: '/org-units', label: t('nav.orgUnits'), perm: 'ORG_UNIT.READ' },
      ],
    },
  ];

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || can(it.perm)) }))
    .filter((g) => g.items.length > 0);
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <nav style={{ padding: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 16, padding: '8px 12px 16px' }}>통인 ERP</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleGroups.map((g, gi) => (
          <div
            key={g.label ?? `g${gi}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {g.label && (
              <div
                style={{
                  padding: '12px 12px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--ark-color-text-tertiary)',
                }}
              >
                {g.label}
              </div>
            )}
            {g.items.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: active(it.to) ? 600 : 400,
                  background: active(it.to) ? 'var(--ark-color-primary-50)' : 'transparent',
                  color: active(it.to) ? 'var(--ark-color-primary-600)' : 'var(--ark-color-text)',
                }}
              >
                {it.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <AppShell sidebar={<Sidebar />} sidebarWidth={220}>
      <header
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          padding: '0 20px',
          borderBottom: '1px solid var(--ark-color-gray-200)',
          background: 'var(--ark-color-bg)',
        }}
      >
        <LangSwitch />
        <ThemeSwitch />
        <span style={{ color: 'var(--ark-color-text-secondary)' }}>{user?.loginId}</span>
        <Button variant="outline" size="sm" onClick={logout}>
          {t('common.logout')}
        </Button>
      </header>
      <main style={{ padding: 24 }}>
        <Outlet />
      </main>
    </AppShell>
  );
}
