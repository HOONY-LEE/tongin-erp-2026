import { AppShell, Button } from '../components/ui';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { LangSwitch, ThemeSwitch } from '../components/Switchers';

function Sidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const items = [
    { to: '/', label: t('nav.dashboard') },
    { to: '/leads', label: t('nav.leads') },
    { to: '/estimates', label: t('nav.estimates') },
    { to: '/customers', label: t('nav.customers') },
    { to: '/products', label: t('nav.products') },
    { to: '/cbm-items', label: t('nav.cbmItems') },
    { to: '/org-units', label: t('nav.orgUnits') },
  ];
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <nav style={{ padding: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 16, padding: '8px 12px 16px' }}>통인 ERP</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              fontWeight: active(it.to) ? 600 : 400,
              background: active(it.to) ? 'var(--ark-color-primary-50)' : 'transparent',
              color: active(it.to) ? 'var(--ark-color-primary-600)' : 'var(--ark-color-text)',
            }}
          >
            {it.label}
          </Link>
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
