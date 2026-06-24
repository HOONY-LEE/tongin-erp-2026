import { useEffect, useState } from 'react';
import { Card } from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

const CARDS: { key: string; path: string; labelKey: string; fallback: string }[] = [
  { key: 'leads', path: '/leads', labelKey: 'nav.leads', fallback: '리드(접수)' },
  { key: 'customers', path: '/customers', labelKey: 'nav.customers', fallback: '고객' },
  { key: 'products', path: '/products', labelKey: 'nav.products', fallback: '상품' },
  { key: 'cbmItems', path: '/cbm-items', labelKey: 'nav.cbmItems', fallback: '품목사전' },
  { key: 'contracts', path: '/contracts', labelKey: 'dashboard.contracts', fallback: '계약' },
  {
    key: 'workOrders',
    path: '/work-orders',
    labelKey: 'dashboard.workOrders',
    fallback: '작업오더',
  },
];

export default function Dashboard() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all(
      CARDS.map((c) =>
        api<unknown[]>(c.path)
          .then((rows) => [c.key, rows.length] as const)
          .catch(() => [c.key, 0] as const),
      ),
    ).then((pairs) => setCounts(Object.fromEntries(pairs)));
  }, []);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{t('dashboard.title')}</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 16,
        }}
      >
        {CARDS.map((c) => (
          <Card key={c.key} style={{ padding: 20 }}>
            <div style={{ color: 'var(--ark-color-text-secondary)', fontSize: 13 }}>
              {t(c.labelKey, c.fallback)}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{counts[c.key] ?? 0}</div>
          </Card>
        ))}
      </div>
      <p style={{ color: 'var(--ark-color-text-secondary)', marginTop: 24 }}>
        {t('dashboard.tagline')}
      </p>
    </div>
  );
}
